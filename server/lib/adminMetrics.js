// Admin metrics: user count, solve counts, signups, activity and the accounts
// worth a second look (huge counts, bursts, absurd solve rates). Fast singles
// aren't flagged: mis-stops make sub-world-record times common and harmless.
//
// Users are listed from a small registry partition (PK "ADMIN#USERS", one
// item per account) so we never scan the whole table to count them. Signup
// and profile creation write to it; `rebuildUserRegistry` backfills it with a
// one-off scan for accounts made before the registry existed.
//
// Solve counts come from each user's EVENTSTATS items (one per event); a full
// refresh measured ~4 read units per user. Results are cached in memory for a
// few minutes.
//
// Recent activity: about once a day each user's registry item gets a snapshot
// of their solve and import counts (kept 10 days). "Added in 24h / 7d" is the
// difference from the snapshot at the start of the window, so it doesn't trust
// solve dates (which imports and fakes can set to anything) and adds nothing
// to the solve path. The server takes the snapshot itself once a day.

const { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGISTRY_PK = "ADMIN#USERS";
const CACHE_MS = 5 * 60 * 1000;
const CONCURRENCY = 32;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SNAPSHOT_EVERY_MS = 23 * HOUR_MS;
const SNAPSHOT_KEEP_MS = 10 * DAY_MS;
// Daily snapshots drift by an hour or so; accept a base this much inside the window.
const SNAPSHOT_SLACK_MS = 4 * HOUR_MS;

// Live (not imported) solves per day since signup above this is flagged.
const SUSPICIOUS_LIVE_SOLVES_PER_DAY = 1500;
const HUGE_ACCOUNT_SOLVES = 100000;
// Live (not imported) solves added in the window at or above these is flagged.
const BURST_LIVE_SOLVES_1D = 1500;
const BURST_LIVE_SOLVES_7D = 6000;

function registryKey(userID) {
  return { PK: REGISTRY_PK, SK: `USER#${userID}` };
}

// Idempotent: keeps the first CreatedAt it saw. CreatedAt is empty when the
// rebuild scan finds an old account with no date on it. The rebuild passes
// overwrite, since it reads the real dates from the table; it updates fields
// in place so the user's snapshots survive.
async function registerUser(ddb, table, userID, createdAt = new Date().toISOString(), { overwrite = false } = {}) {
  const id = String(userID || "").trim();
  if (!id) return;
  try {
    if (overwrite) {
      const values = { ":t": "ADMINUSER", ":u": id };
      let expr = "SET ItemType = :t, UserID = :u";
      if (createdAt) {
        expr += ", CreatedAt = :c";
        values[":c"] = createdAt;
      }
      await ddb.send(
        new UpdateCommand({
          TableName: table,
          Key: registryKey(id),
          UpdateExpression: expr,
          ExpressionAttributeValues: values,
        })
      );
      return;
    }
    const item = { ...registryKey(id), ItemType: "ADMINUSER", UserID: id };
    if (createdAt) item.CreatedAt = createdAt;
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
  } catch (e) {
    if (e?.name !== "ConditionalCheckFailedException") throw e;
  }
}

async function listRegisteredUsers(ddb, table) {
  const users = [];
  let cursor;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": REGISTRY_PK },
        ProjectionExpression: "UserID, CreatedAt, Snapshots",
        ExclusiveStartKey: cursor,
      })
    );
    users.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return users;
}

// Full table scan for PROFILE and AUTH items. Expensive on a big table, so
// it only runs when asked for.
async function rebuildUserRegistry(ddb, table) {
  const found = new Map();
  let cursor;
  let scanned = 0;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: table,
        ProjectionExpression: "PK, SK, CreatedAt, DateFounded",
        FilterExpression: "SK = :profile OR SK = :auth",
        ExpressionAttributeValues: { ":profile": "PROFILE", ":auth": "AUTH" },
        ExclusiveStartKey: cursor,
      })
    );
    scanned += Number(out.ScannedCount || 0);
    for (const item of out.Items || []) {
      const pk = String(item.PK || "");
      if (!pk.startsWith("USER#")) continue;
      const id = pk.slice(5);
      const createdAt = String(item.CreatedAt || item.DateFounded || "");
      const prev = found.get(id);
      if (!prev || (createdAt && createdAt < prev)) found.set(id, createdAt);
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  for (const [id, createdAt] of found) {
    await registerUser(ddb, table, id, createdAt, { overwrite: true });
  }
  return { users: found.size, scannedItems: scanned };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function queryAllByPrefix(ddb, table, pk, prefix, projection) {
  const items = [];
  let cursor;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: { ":pk": pk, ":pfx": prefix },
        ProjectionExpression: projection,
        ExclusiveStartKey: cursor,
      })
    );
    items.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return items;
}

function normalizeSnapshots(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((s) => ({ at: String(s?.at || ""), solves: Number(s?.solves || 0), imported: Number(s?.imported || 0) }))
    .filter((s) => s.at && Number.isFinite(Date.parse(s.at)))
    .sort((a, b) => a.at.localeCompare(b.at));
}

// Solves added since the start of a window. Base is the newest snapshot from
// before the window started; an account created inside the window starts at 0;
// with only newer snapshots, the oldest one is used and `since` says so.
function recentAdds(snapshots, { now, windowMs, createdAt, solves, imported }) {
  const target = now - windowMs;
  let base = null;
  if (createdAt && Date.parse(createdAt) >= target) {
    base = { at: createdAt, solves: 0, imported: 0 };
  } else {
    for (const snap of snapshots) {
      if (Date.parse(snap.at) <= target + SNAPSHOT_SLACK_MS) base = snap;
    }
    if (!base && snapshots.length) base = snapshots[0];
  }
  if (!base) return null;
  const added = solves - base.solves;
  return { added, liveAdded: added - (imported - base.imported), since: base.at };
}

async function loadUserRow(ddb, table, reg) {
  const userID = reg.UserID;
  const pk = `USER#${userID}`;
  const [profileOut, authOut, statsItems, importJobs] = await Promise.all([
    ddb.send(
      new GetCommand({
        TableName: table,
        Key: { PK: pk, SK: "PROFILE" },
        ProjectionExpression: "#n, Username, CreatedAt, DateFounded, ImportSolveCount, IsPaid, PrivateAccount, Followers",
        ExpressionAttributeNames: { "#n": "Name" },
      })
    ),
    ddb.send(
      new GetCommand({
        TableName: table,
        Key: { PK: pk, SK: "AUTH" },
        ProjectionExpression: "CreatedAt, EmailVerified",
      })
    ),
    queryAllByPrefix(ddb, table, pk, "EVENTSTATS#",
      "Event, SolveCountTotal, DNFCount, FirstSolveAt, LastSolveAt"),
    queryAllByPrefix(ddb, table, pk, "IMPORTJOB#", "ProcessedSolves, CreatedAt"),
  ]);

  const profile = profileOut.Item || null;
  const auth = authOut.Item || null;
  const events = {};
  let solves = 0;
  let dnfs = 0;
  let lastSolveAt = "";
  const flags = [];

  for (const s of statsItems) {
    const ev = String(s.Event || "").toUpperCase();
    const count = Number(s.SolveCountTotal || 0);
    if (!ev || count <= 0) continue;
    events[ev] = count;
    solves += count;
    dnfs += Number(s.DNFCount || 0);
    if (s.LastSolveAt && String(s.LastSolveAt) > lastSolveAt) lastSolveAt = String(s.LastSolveAt);
  }

  // The profile counter is the paywall allowance; import jobs record what
  // actually went in. Solves loaded by scripts show up as live.
  const jobSolves = importJobs.reduce((acc, j) => acc + Number(j.ProcessedSolves || 0), 0);
  const imported = Math.min(solves, Math.max(Number(profile?.ImportSolveCount || 0), jobSolves));
  const lastImportAt = importJobs.reduce((acc, j) => (String(j.CreatedAt || "") > acc ? String(j.CreatedAt) : acc), "");
  const live = solves - imported;
  const createdAt = String(auth?.CreatedAt || profile?.CreatedAt || profile?.DateFounded || reg.CreatedAt || "");
  // No known signup date: rate against the first solve instead.
  const firstSolveAt = statsItems.reduce(
    (acc, s) => (s.FirstSolveAt && (!acc || String(s.FirstSolveAt) < acc) ? String(s.FirstSolveAt) : acc),
    ""
  );
  const since = createdAt || firstSolveAt;
  const ageDays = since ? Math.max(1, (Date.now() - Date.parse(since)) / DAY_MS) : 1;
  const livePerDay = live / ageDays;

  if (solves >= HUGE_ACCOUNT_SOLVES) flags.push({ code: "HUGE", text: `${solves.toLocaleString()} solves` });
  if (livePerDay >= SUSPICIOUS_LIVE_SOLVES_PER_DAY) {
    flags.push({ code: "RATE", text: `${Math.round(livePerDay).toLocaleString()} live solves/day` });
  }
  if (!profile) flags.push({ code: "NO_PROFILE", text: "No profile" });

  const now = Date.now();
  const snapshots = normalizeSnapshots(reg.Snapshots);
  const recentArgs = { now, createdAt, solves, imported };
  const added1d = recentAdds(snapshots, { ...recentArgs, windowMs: DAY_MS });
  const added7d = recentAdds(snapshots, { ...recentArgs, windowMs: 7 * DAY_MS });
  if (added1d && added1d.liveAdded >= BURST_LIVE_SOLVES_1D) {
    flags.push({ code: "BURST", text: `+${added1d.liveAdded.toLocaleString()} live solves in 24h` });
  } else if (added7d && added7d.liveAdded >= BURST_LIVE_SOLVES_7D) {
    flags.push({ code: "BURST", text: `+${added7d.liveAdded.toLocaleString()} live solves in 7d` });
  }

  // Take today's snapshot if the last one is about a day old.
  const lastSnap = snapshots[snapshots.length - 1];
  let snapshotTaken = false;
  if (!lastSnap || now - Date.parse(lastSnap.at) >= SNAPSHOT_EVERY_MS) {
    const kept = snapshots.filter((snap) => now - Date.parse(snap.at) <= SNAPSHOT_KEEP_MS);
    kept.push({ at: new Date(now).toISOString(), solves, imported });
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: registryKey(userID),
        UpdateExpression: "SET Snapshots = :s",
        ExpressionAttributeValues: { ":s": kept },
      })
    );
    snapshotTaken = true;
  }

  return {
    userID,
    username: profile?.Username || userID,
    name: profile?.Name || "",
    createdAt: createdAt || null,
    emailVerified: auth ? auth.EmailVerified === true : null,
    hasPassword: !!auth,
    isPaid: profile?.IsPaid === true,
    privateAccount: profile?.PrivateAccount === true,
    followers: Array.isArray(profile?.Followers) ? profile.Followers.length : 0,
    solves,
    importedSolves: imported,
    liveSolves: live,
    livePerDay: Math.round(livePerDay * 10) / 10,
    dnfs,
    events,
    lastSolveAt: lastSolveAt || null,
    importJobs: importJobs.length,
    lastImportAt: lastImportAt || null,
    added1d,
    added7d,
    snapshotTaken,
    flags,
  };
}

function dayKey(iso) {
  return String(iso || "").slice(0, 10);
}

function summarize(rows) {
  const now = Date.now();
  const within = (iso, days) => iso && now - Date.parse(iso) <= days * DAY_MS;
  const solvesByEvent = {};
  for (const r of rows) {
    for (const [ev, n] of Object.entries(r.events)) solvesByEvent[ev] = (solvesByEvent[ev] || 0) + n;
  }

  const signupsByDay = {};
  for (let i = 29; i >= 0; i -= 1) signupsByDay[dayKey(new Date(now - i * DAY_MS).toISOString())] = 0;
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    if (k in signupsByDay) signupsByDay[k] += 1;
  }

  const sum = (f) => rows.reduce((acc, r) => acc + f(r), 0);
  return {
    users: rows.length,
    usersWithSolves: rows.filter((r) => r.solves > 0).length,
    verifiedUsers: rows.filter((r) => r.emailVerified === true).length,
    paidUsers: rows.filter((r) => r.isPaid).length,
    newUsers: { d1: rows.filter((r) => within(r.createdAt, 1)).length, d7: rows.filter((r) => within(r.createdAt, 7)).length, d30: rows.filter((r) => within(r.createdAt, 30)).length },
    activeUsers: { d1: rows.filter((r) => within(r.lastSolveAt, 1)).length, d7: rows.filter((r) => within(r.lastSolveAt, 7)).length, d30: rows.filter((r) => within(r.lastSolveAt, 30)).length },
    solves: sum((r) => r.solves),
    importedSolves: sum((r) => r.importedSolves),
    liveSolves: sum((r) => r.liveSolves),
    flaggedUsers: rows.filter((r) => r.flags.length).length,
    solvesAdded: {
      d1: sum((r) => Math.max(0, r.added1d?.added || 0)),
      d7: sum((r) => Math.max(0, r.added7d?.added || 0)),
      liveD1: sum((r) => Math.max(0, r.added1d?.liveAdded || 0)),
      liveD7: sum((r) => Math.max(0, r.added7d?.liveAdded || 0)),
    },
    // Users who have no snapshot from before the window yet (first days after deploy).
    partialRecent: rows.filter((r) => !r.added7d || Date.parse(r.added7d.since) > now - 7 * DAY_MS + SNAPSHOT_SLACK_MS).length,
    solvesByEvent,
    signupsByDay,
  };
}

function createAdminMetrics({ ddb, table }) {
  let cache = null;
  let inflight = null;
  let lastFullRunAt = 0;
  let timer = null;

  async function compute() {
    const started = Date.now();
    const registry = await listRegisteredUsers(ddb, table);
    const rows = await mapLimit(registry, CONCURRENCY, (reg) => loadUserRow(ddb, table, reg));
    rows.sort((a, b) => b.solves - a.solves);
    return {
      generatedAt: new Date().toISOString(),
      tookMs: Date.now() - started,
      registryEmpty: registry.length === 0,
      summary: summarize(rows),
      users: rows,
    };
  }

  async function get({ refresh = false } = {}) {
    if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
    if (!inflight) {
      inflight = compute()
        .then((value) => {
          cache = { at: Date.now(), value };
          lastFullRunAt = Date.now();
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  // Runs a full refresh about once a day so every user gets a snapshot even
  // when nobody opens the page. Checks hourly; a run that fails tries again
  // at the next check.
  function startDailySnapshots({ checkEveryMs = HOUR_MS, firstCheckMs = 2 * 60 * 1000 } = {}) {
    if (timer) return;
    const check = () => {
      if (Date.now() - lastFullRunAt < SNAPSHOT_EVERY_MS) return;
      get({ refresh: true }).catch((err) => console.warn("admin metrics daily snapshot failed:", err?.message || err));
    };
    const first = setTimeout(check, firstCheckMs);
    first.unref?.();
    timer = setInterval(check, checkEveryMs);
    timer.unref?.();
  }

  return {
    get,
    startDailySnapshots,
    registerUser: (userID, createdAt) => registerUser(ddb, table, userID, createdAt),
    rebuildRegistry: async () => {
      const result = await rebuildUserRegistry(ddb, table);
      cache = null;
      return result;
    },
  };
}

module.exports = {
  createAdminMetrics,
  registerUser,
  rebuildUserRegistry,
  summarize,
  recentAdds,
};
