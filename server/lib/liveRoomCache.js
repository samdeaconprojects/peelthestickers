// In-memory cache of live room state, plus the trimmed leaderboard view sent
// to spectators. Every spectator polls the room every few seconds, so without
// this each poll re-reads the whole member list and the load grows with
// viewers². With it, DynamoDB sees about one read per room per TTL however many
// people are watching. Kept free of DynamoDB so it can be unit tested.

const DEFAULT_TTL_MS = 1000;
const DEFAULT_LEADERBOARD_LIMIT = 50;

// Single-flight TTL cache: concurrent misses for the same key share one load.
function createTtlCache({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const entries = new Map();

  async function get(key, load) {
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.promise;

    const entry = { at: now(), promise: null };
    entry.promise = Promise.resolve()
      .then(load)
      .catch((err) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw err;
      });
    entries.set(key, entry);
    return entry.promise;
  }

  function invalidate(key) {
    entries.delete(key);
  }

  // Drop expired entries so rooms that went quiet don't stay in memory.
  function prune() {
    const t = now();
    for (const [key, entry] of entries) {
      if (t - entry.at >= ttlMs) entries.delete(key);
    }
  }

  return { get, invalidate, prune, size: () => entries.size };
}

function toLeaderboardRow(member) {
  return {
    userID: member.UserID,
    name: member.Name,
    color: member.Color,
    role: member.Role,
    currentIndex: member.CurrentIndex,
    lastTime: member.LastTime,
    updatedAt: member.UpdatedAt,
  };
}

// Furthest along first; ties go to whoever got there first.
function sortLeaderboardRows(rows) {
  return [...rows].sort((a, b) => {
    const ai = Number.isFinite(Number(a.currentIndex)) ? Number(a.currentIndex) : -1;
    const bi = Number.isFinite(Number(b.currentIndex)) ? Number(b.currentIndex) : -1;
    if (bi !== ai) return bi - ai;
    return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
  });
}

// Top `limit` rows, plus the viewer's own row and the host's row if they fell
// outside it, so everyone can always see themselves and the host.
function buildLeaderboardView(sortedRows, { viewerID = "", limit = DEFAULT_LEADERBOARD_LIMIT } = {}) {
  const rows = Array.isArray(sortedRows) ? sortedRows : [];
  const top = rows.slice(0, Math.max(0, limit));
  const included = new Set(top.map((row) => row.userID));
  const extras = rows.filter(
    (row) =>
      !included.has(row.userID) &&
      ((viewerID && row.userID === viewerID) || row.role === "HOST")
  );
  return {
    leaderboard: [...top, ...extras],
    memberCount: rows.length,
  };
}

// Spectator poll interval by room size. Scrambles are pushed over the
// notification stream, so the poll is a backstop plus the leaderboard, and
// it can slow down as a room grows. Keeps total load near the ~650 polls/s
// that one process served at p95 43ms in docs/SHARED_AVERAGES_LOADTEST.md
// (5,000 viewers / 8s = 625/s).
function spectatorPollMs(memberCount) {
  const n = Number(memberCount) || 0;
  if (n <= 200) return 2500;
  if (n <= 1000) return 4000;
  if (n <= 2500) return 6000;
  return 8000;
}

module.exports = {
  spectatorPollMs,
  DEFAULT_TTL_MS,
  DEFAULT_LEADERBOARD_LIMIT,
  createTtlCache,
  toLeaderboardRow,
  sortLeaderboardRows,
  buildLeaderboardView,
};
