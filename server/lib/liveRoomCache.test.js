// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");

const {
  createTtlCache,
  sortLeaderboardRows,
  buildLeaderboardView,
} = require("./liveRoomCache");

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("cache: concurrent misses share a single load", async () => {
  const c = clock();
  const cache = createTtlCache({ ttlMs: 1000, now: c.now });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { n: loads };
  };
  const results = await Promise.all(Array.from({ length: 50 }, () => cache.get("room", load)));
  assert.strictEqual(loads, 1);
  assert.ok(results.every((r) => r.n === 1));
});

test("cache: reloads after the TTL and after invalidate", async () => {
  const c = clock();
  const cache = createTtlCache({ ttlMs: 1000, now: c.now });
  let loads = 0;
  const load = async () => (loads += 1);

  assert.strictEqual(await cache.get("room", load), 1);
  c.advance(999);
  assert.strictEqual(await cache.get("room", load), 1);
  c.advance(1);
  assert.strictEqual(await cache.get("room", load), 2);
  cache.invalidate("room");
  assert.strictEqual(await cache.get("room", load), 3);
});

test("cache: a failed load is not cached", async () => {
  const cache = createTtlCache({ ttlMs: 1000, now: () => 0 });
  await assert.rejects(cache.get("room", async () => { throw new Error("db down"); }), /db down/);
  assert.strictEqual(await cache.get("room", async () => "ok"), "ok");
});

test("cache: prune drops expired rooms", async () => {
  const c = clock();
  const cache = createTtlCache({ ttlMs: 1000, now: c.now });
  await cache.get("a", async () => 1);
  c.advance(500);
  await cache.get("b", async () => 2);
  c.advance(600);
  cache.prune();
  assert.strictEqual(cache.size(), 1);
});

test("sort: furthest along first, index 0 above not-started, ties by who got there first", () => {
  const rows = sortLeaderboardRows([
    { userID: "notStarted", currentIndex: -1 },
    { userID: "zero", currentIndex: 0 },
    { userID: "late", currentIndex: 3, updatedAt: "2026-10-30T10:00:05Z" },
    { userID: "early", currentIndex: 3, updatedAt: "2026-10-30T10:00:01Z" },
    { userID: "missing" },
  ]);
  assert.deepStrictEqual(
    rows.map((r) => r.userID),
    ["early", "late", "zero", "notStarted", "missing"]
  );
});

test("view: top rows plus the viewer and host, with the full count", () => {
  const sorted = Array.from({ length: 200 }, (_, i) => ({
    userID: `u${i}`,
    currentIndex: 200 - i,
    role: i === 150 ? "HOST" : "MEMBER",
  }));
  const view = buildLeaderboardView(sorted, { viewerID: "u180", limit: 50 });
  assert.strictEqual(view.memberCount, 200);
  assert.strictEqual(view.leaderboard.length, 52);
  assert.deepStrictEqual(view.leaderboard.slice(50).map((r) => r.userID), ["u150", "u180"]);
});

test("view: no duplicates when the viewer is already in the top rows", () => {
  const sorted = [{ userID: "host", role: "HOST" }, { userID: "me" }, { userID: "other" }];
  const view = buildLeaderboardView(sorted, { viewerID: "me", limit: 50 });
  assert.deepStrictEqual(view.leaderboard.map((r) => r.userID), ["host", "me", "other"]);
  assert.strictEqual(view.memberCount, 3);
});

test("spectator poll slows as rooms grow and stays near 650 polls/s at the cap", () => {
  const { spectatorPollMs } = require("./liveRoomCache");
  assert.equal(spectatorPollMs(10), 2500);
  assert.ok(spectatorPollMs(1500) > spectatorPollMs(500));
  const { MAX_ROOM_MEMBERS } = require("./memberCaps");
  const pollsPerSecond = MAX_ROOM_MEMBERS / (spectatorPollMs(MAX_ROOM_MEMBERS) / 1000);
  assert.ok(pollsPerSecond <= 700, `${pollsPerSecond}/s`);
});
