const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminMetrics, recentAdds } = require("./adminMetrics");

function fakeDdb(items) {
  const store = new Map(items.map((it) => [`${it.PK}|${it.SK}`, it]));
  return {
    store,
    async send(cmd) {
      const name = cmd.constructor.name;
      const i = cmd.input;
      if (name === "GetCommand") return { Item: store.get(`${i.Key.PK}|${i.Key.SK}`) };
      if (name === "PutCommand") {
        const key = `${i.Item.PK}|${i.Item.SK}`;
        if (i.ConditionExpression && store.has(key)) {
          const err = new Error("exists");
          err.name = "ConditionalCheckFailedException";
          throw err;
        }
        store.set(key, i.Item);
        return {};
      }
      if (name === "UpdateCommand") {
        const key = `${i.Key.PK}|${i.Key.SK}`;
        const item = { ...(store.get(key) || i.Key) };
        const v = i.ExpressionAttributeValues;
        if (v[":s"]) item.Snapshots = v[":s"];
        if (v[":t"]) item.ItemType = v[":t"];
        if (v[":u"]) item.UserID = v[":u"];
        if (v[":c"]) item.CreatedAt = v[":c"];
        store.set(key, item);
        return {};
      }
      if (name === "QueryCommand") {
        const pk = i.ExpressionAttributeValues[":pk"];
        const pfx = i.ExpressionAttributeValues[":pfx"] || "";
        return { Items: [...store.values()].filter((it) => it.PK === pk && it.SK.startsWith(pfx)) };
      }
      if (name === "ScanCommand") {
        const all = [...store.values()];
        return { Items: all.filter((it) => it.SK === "PROFILE" || it.SK === "AUTH"), ScannedCount: all.length };
      }
      throw new Error(`unexpected ${name}`);
    },
  };
}

const recent = new Date(Date.now() - 2 * 86400000).toISOString();
const old = new Date(Date.now() - 100 * 86400000).toISOString();

test("rebuilds registry, counts solves, ranks and flags users", async () => {
  const ddb = fakeDdb([
    { PK: "USER#sam", SK: "PROFILE", Username: "sam", CreatedAt: old, ImportSolveCount: 900 },
    { PK: "USER#sam", SK: "AUTH", CreatedAt: old, EmailVerified: true },
    { PK: "USER#sam", SK: "EVENTSTATS#333", Event: "333", SolveCountTotal: 1000, BestSingleMs: 7000, LastSolveAt: recent },
    { PK: "USER#sam", SK: "EVENTSTATS#222", Event: "222", SolveCountTotal: 50, BestSingleMs: 1500 },
    { PK: "USER#cheat", SK: "PROFILE", Username: "cheat", CreatedAt: recent },
    { PK: "USER#cheat", SK: "AUTH", CreatedAt: recent, EmailVerified: false },
    { PK: "USER#cheat", SK: "EVENTSTATS#333", Event: "333", SolveCountTotal: 9000, BestSingleMs: 1200, LastSolveAt: recent },
    { PK: "USER#cheat", SK: "SOLVE#x", Event: "333" },
  ]);
  const metrics = createAdminMetrics({ ddb, table: "T" });

  assert.equal((await metrics.get()).registryEmpty, true);
  assert.deepEqual(await metrics.rebuildRegistry(), { users: 2, scannedItems: 8 });

  const out = await metrics.get({ refresh: true });
  assert.equal(out.summary.users, 2);
  assert.equal(out.summary.solves, 10050);
  assert.equal(out.summary.importedSolves, 900);
  assert.equal(out.summary.newUsers.d7, 1);
  assert.equal(out.summary.activeUsers.d7, 2);
  assert.equal(out.summary.solvesByEvent["333"], 10000);
  assert.deepEqual(out.users.map((u) => u.userID), ["cheat", "sam"]);

  const [cheat, sam] = out.users;
  assert.deepEqual(cheat.flags.map((f) => f.code).sort(), ["BURST", "RATE"]);
  assert.deepEqual(sam.flags, []);
  assert.equal(sam.liveSolves, 150);
  assert.equal(out.summary.flaggedUsers, 1);
});

test("registerUser keeps the first CreatedAt", async () => {
  const ddb = fakeDdb([]);
  const metrics = createAdminMetrics({ ddb, table: "T" });
  await metrics.registerUser("a", "2026-01-01T00:00:00.000Z");
  await metrics.registerUser("a", "2026-02-01T00:00:00.000Z");
  assert.equal(ddb.store.get("ADMIN#USERS|USER#a").CreatedAt, "2026-01-01T00:00:00.000Z");
});

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600000;

test("recentAdds uses the snapshot from before the window and subtracts imports", () => {
  const snaps = [
    { at: iso(8 * 24 * H), solves: 100, imported: 0 },
    { at: iso(25 * H), solves: 500, imported: 0 },
    { at: iso(2 * H), solves: 900, imported: 0 },
  ];
  const now = Date.now();
  const d1 = recentAdds(snaps, { now, windowMs: 24 * H, createdAt: iso(100 * 24 * H), solves: 10500, imported: 9000 });
  assert.equal(d1.added, 10000);
  assert.equal(d1.liveAdded, 1000);
  const d7 = recentAdds(snaps, { now, windowMs: 7 * 24 * H, createdAt: iso(100 * 24 * H), solves: 10500, imported: 9000 });
  assert.equal(d7.added, 10400);
  // New account: counted from zero.
  assert.equal(recentAdds([], { now, windowMs: 24 * H, createdAt: iso(H), solves: 50, imported: 0 }).added, 50);
  // Old account, no snapshots yet: unknown.
  assert.equal(recentAdds([], { now, windowMs: 24 * H, createdAt: iso(100 * 24 * H), solves: 50, imported: 0 }), null);
});

test("takes a daily snapshot, flags a live burst, and the rebuild keeps snapshots", async () => {
  const ddb = fakeDdb([
    { PK: "ADMIN#USERS", SK: "USER#old", UserID: "old", CreatedAt: iso(200 * 24 * H),
      Snapshots: [{ at: iso(26 * H), solves: 1000, imported: 0 }] },
    { PK: "USER#old", SK: "PROFILE", Username: "old", CreatedAt: iso(200 * 24 * H) },
    { PK: "USER#old", SK: "AUTH", CreatedAt: iso(200 * 24 * H) },
    { PK: "USER#old", SK: "EVENTSTATS#333", Event: "333", SolveCountTotal: 4000, BestSingleMs: 9000 },
  ]);
  const metrics = createAdminMetrics({ ddb, table: "T" });
  const out = await metrics.get();
  const [old] = out.users;
  assert.equal(old.added1d.liveAdded, 3000);
  assert.deepEqual(old.flags.map((f) => f.code), ["BURST"]);
  assert.equal(old.snapshotTaken, true);
  assert.equal(ddb.store.get("ADMIN#USERS|USER#old").Snapshots.length, 2);

  // A second refresh straight away doesn't snapshot again.
  const again = await metrics.get({ refresh: true });
  assert.equal(again.users[0].snapshotTaken, false);

  await metrics.rebuildRegistry();
  assert.equal(ddb.store.get("ADMIN#USERS|USER#old").Snapshots.length, 2);
});
