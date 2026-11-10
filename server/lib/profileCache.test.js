const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileCache, profileIDsFromWrite } = require("./profileCache");

test("serves repeat reads from cache until the TTL passes", async () => {
  let t = 0;
  let loads = 0;
  const cache = createProfileCache({ ttlMs: 100, now: () => t });
  const loader = async (id) => ({ UserID: id, n: ++loads });

  assert.equal((await cache.get("a", loader)).n, 1);
  assert.equal((await cache.get("a", loader)).n, 1);
  t = 150;
  assert.equal((await cache.get("a", loader)).n, 2);
});

test("concurrent misses share one load", async () => {
  let loads = 0;
  const cache = createProfileCache();
  const loader = async (id) => {
    loads += 1;
    await new Promise((r) => setTimeout(r, 5));
    return { UserID: id };
  };
  await Promise.all([cache.get("a", loader), cache.get("a", loader), cache.get("a", loader)]);
  assert.equal(loads, 1);
});

test("invalidate during a load keeps the stale value out of the cache", async () => {
  let loads = 0;
  const cache = createProfileCache();
  let release;
  const slow = () =>
    new Promise((r) => {
      loads += 1;
      release = () => r({ v: "old" });
    });
  const first = cache.get("a", slow);
  await new Promise((r) => setImmediate(r));
  cache.invalidate("a");
  release();
  assert.equal((await first).v, "old");
  const fresh = await cache.get("a", async () => ({ v: "new" }));
  assert.equal(fresh.v, "new");
});

test("callers get copies, so mutating a result can't poison the cache", async () => {
  const cache = createProfileCache();
  const a = await cache.get("a", async () => ({ Friends: ["x"] }));
  a.Friends.push("y");
  const b = await cache.get("a", async () => ({ Friends: [] }));
  assert.deepEqual(b.Friends, ["x"]);
});

test("caches a missing profile as null", async () => {
  let loads = 0;
  const cache = createProfileCache();
  assert.equal(await cache.get("ghost", async () => (loads++, null)), null);
  assert.equal(await cache.get("ghost", async () => (loads++, null)), null);
  assert.equal(loads, 1);
});

test("finds PROFILE keys in every write shape", () => {
  const key = (id, sk = "PROFILE") => ({ PK: `USER#${id}`, SK: sk });
  assert.deepEqual(profileIDsFromWrite("Put", { Item: key("a") }), ["a"]);
  assert.deepEqual(profileIDsFromWrite("Update", { Key: key("b") }), ["b"]);
  assert.deepEqual(profileIDsFromWrite("Delete", { Key: key("c") }), ["c"]);
  assert.deepEqual(profileIDsFromWrite("Update", { Key: key("b", "AUTH") }), []);
  assert.deepEqual(
    profileIDsFromWrite("BatchWrite", {
      RequestItems: {
        T: [{ PutRequest: { Item: key("d") } }, { DeleteRequest: { Key: key("e") } }, { PutRequest: { Item: key("f", "SOLVE#1") } }],
      },
    }),
    ["d", "e"]
  );
  assert.deepEqual(
    profileIDsFromWrite("TransactWrite", { TransactItems: [{ Update: { Key: key("g") } }] }),
    ["g"]
  );
});
