// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");

const {
  getSharedMessageActorID,
  isConditionalCheckFailed,
  retryOnConditionalFailure,
} = require("./sharedMessages");

const conditionalError = () => Object.assign(new Error("cond"), { name: "ConditionalCheckFailedException" });

test("actor: reads the userID out of shared update and join messages", () => {
  assert.strictEqual(
    getSharedMessageActorID("[sharedUpdate]SHARED#GROUP#g1#333#17|3|9120|alice"),
    "alice"
  );
  assert.strictEqual(getSharedMessageActorID("[sharedJoin]SHARED#GROUP#g1#333#17|bob"), "bob");
});

test("actor: malformed updates still report whatever names the player", () => {
  // Clients only need the 4th field to attribute a time, so the check must too.
  assert.strictEqual(getSharedMessageActorID("[sharedUpdate]sid|x|y|carol"), "carol");
  assert.strictEqual(getSharedMessageActorID("[sharedUpdate]sid|1|2"), null);
});

test("actor: other messages have no embedded actor", () => {
  assert.strictEqual(getSharedMessageActorID("hello"), null);
  assert.strictEqual(getSharedMessageActorID('[sharedAoN]{"sharedID":"x"}'), null);
  assert.strictEqual(getSharedMessageActorID(""), null);
  assert.strictEqual(getSharedMessageActorID(undefined), null);
});

test("isConditionalCheckFailed only matches condition failures", () => {
  assert.ok(isConditionalCheckFailed(conditionalError()));
  assert.ok(!isConditionalCheckFailed(new Error("boom")));
  assert.ok(!isConditionalCheckFailed(null));
});

test("retry: retries condition failures until an attempt succeeds", async () => {
  let calls = 0;
  const out = await retryOnConditionalFailure(
    async (i) => {
      calls += 1;
      if (i < 3) throw conditionalError();
      return "ok";
    },
    { sleep: async () => {} }
  );
  assert.strictEqual(out, "ok");
  assert.strictEqual(calls, 4);
});

test("retry: other errors are thrown immediately", async () => {
  let calls = 0;
  await assert.rejects(
    retryOnConditionalFailure(
      async () => {
        calls += 1;
        throw new Error("network");
      },
      { sleep: async () => {} }
    ),
    /network/
  );
  assert.strictEqual(calls, 1);
});

test("retry: gives up after the attempt limit", async () => {
  let calls = 0;
  await assert.rejects(
    retryOnConditionalFailure(
      async () => {
        calls += 1;
        throw conditionalError();
      },
      { attempts: 5, sleep: async () => {} }
    ),
    (err) => isConditionalCheckFailed(err)
  );
  assert.strictEqual(calls, 5);
});

// ---------------------------------------------------------------------------
// Shared-run storage (format 2)

const {
  sharedCellKey,
  sharedCellPrefix,
  sharedRoundKey,
  roundTimeAttribute,
  roundTimesFromItem,
  roundWinner,
  buildRoundTransitionDelta,
  summarizeRoundTimes,
  isStatsDeltaEmpty,
  isInvalidDocumentPath,
  buildStatsDeltaUpdates,
  buildStatsEnsureSteps,
} = require("./sharedMessages");

test("keys: cells sort by round and never match a longer shared ID", () => {
  const sid = "SHARED#GROUP#g1#333#17";
  assert.strictEqual(sharedCellKey(sid, 3, "alice"), "SHAREDRUN#SHARED#GROUP#g1#333#17#CELL#000003#alice");
  assert.ok(sharedCellKey(sid, 3, "a") < sharedCellKey(sid, 12, "a"));
  assert.ok(!sharedCellKey(`${sid}0`, 0, "a").startsWith(sharedCellPrefix(sid)));
  assert.ok(!sharedRoundKey(sid, 0).startsWith(sharedCellPrefix(sid)));
});

test("round: times come from T# attributes only", () => {
  const item = { PK: "x", SK: "y", [roundTimeAttribute("a")]: 9000, [roundTimeAttribute("b")]: "8000", SolveIndex: 2 };
  assert.deepStrictEqual(roundTimesFromItem(item), { a: 9000, b: 8000 });
  assert.deepStrictEqual(roundTimesFromItem(undefined), {});
});

test("round: a winner needs two entrants and a unique fastest time", () => {
  assert.strictEqual(roundWinner({ a: 9 }), null);
  assert.strictEqual(roundWinner({ a: 9, b: 8 }), "b");
  assert.strictEqual(roundWinner({ a: 8, b: 8 }), null);
  assert.strictEqual(roundWinner({ a: 8, b: 8, c: 7 }), "c");
});

test("delta: first solve in a round adds a solve and no win", () => {
  const d = buildRoundTransitionDelta({ before: {}, userID: "a", time: 9, eventFor: () => "333" });
  assert.strictEqual(d.TotalSolves, 1);
  assert.strictEqual(d.TotalWins, 0);
  assert.deepStrictEqual(d.ByUser, { a: { Solves: 1 } });
});

test("delta: a faster time moves the win", () => {
  const d = buildRoundTransitionDelta({ before: { a: 9, b: 10 }, userID: "c", time: 8, eventFor: () => "333" });
  assert.strictEqual(d.TotalSolves, 1);
  assert.strictEqual(d.TotalWins, 0);
  assert.strictEqual(d.ByUser.a.Wins, -1);
  assert.strictEqual(d.ByUser.c.Wins, 1);
  assert.strictEqual(d.ByEvent["333"].ByUser.c.Wins, 1);
});

test("delta: a tie takes the win away; an edit adds no solve", () => {
  const tie = buildRoundTransitionDelta({ before: { a: 9, b: 10 }, userID: "b", time: 9, eventFor: () => "333" });
  assert.strictEqual(tie.TotalSolves, 0);
  assert.strictEqual(tie.TotalWins, -1);
  assert.strictEqual(tie.ByUser.a.Wins, -1);
  const same = buildRoundTransitionDelta({ before: { a: 9, b: 10 }, userID: "b", time: 11, eventFor: () => "333" });
  assert.ok(isStatsDeltaEmpty(same));
});

test("delta: wins are filed under each player's own event", () => {
  const eventFor = (uid) => (uid === "a" ? "444" : "333");
  const d = buildRoundTransitionDelta({ before: { a: 9 }, userID: "b", time: 10, eventFor });
  assert.strictEqual(d.ByEvent["333"].Solves, 1);
  assert.strictEqual(d.ByEvent["444"].Wins, 1);
  assert.strictEqual(d.ByEvent["444"].ByUser.a.Wins, 1);
});

test("delta: applying every transition in any order sums to the run summary", () => {
  // 6 players x 5 rounds, times with ties, some edits; posts from different
  // players are interleaved at random, each player's own edits stay in order.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const queues = [];
  for (let r = 0; r < 5; r += 1) {
    for (let p = 0; p < 6; p += 1) {
      const posts = [800 + Math.floor(rnd() * 6) * 10];
      if (rnd() < 0.3) posts.push(800 + Math.floor(rnd() * 6) * 10);
      queues.push({ r, uid: `u${p}`, posts });
    }
  }
  const rounds = {};
  const total = { TotalSolves: 0, TotalWins: 0, ByUser: {} };
  const pending = queues.map((q) => ({ ...q, posts: [...q.posts] }));
  while (pending.some((q) => q.posts.length)) {
    const live = pending.filter((q) => q.posts.length);
    const q = live[Math.floor(rnd() * live.length)];
    const t = q.posts.shift();
    const before = { ...(rounds[q.r] || {}) };
    if (before[q.uid] === t) continue;
    const d = buildRoundTransitionDelta({ before, userID: q.uid, time: t, eventFor: () => "333" });
    rounds[q.r] = { ...before, [q.uid]: t };
    total.TotalSolves += d.TotalSolves;
    total.TotalWins += d.TotalWins;
    Object.entries(d.ByUser).forEach(([uid, v]) => {
      total.ByUser[uid] = total.ByUser[uid] || { Solves: 0, Wins: 0 };
      total.ByUser[uid].Solves += v.Solves || 0;
      total.ByUser[uid].Wins += v.Wins || 0;
    });
  }
  const expected = summarizeRoundTimes(rounds, () => "333");
  assert.ok(expected.TotalWins > 0);
  assert.strictEqual(total.TotalSolves, 30);
  assert.strictEqual(total.TotalSolves, expected.TotalSolves);
  assert.strictEqual(total.TotalWins, expected.TotalWins);
  Object.entries(expected.ByUser).forEach(([uid, v]) => {
    assert.strictEqual(total.ByUser[uid].Solves, v.Solves || 0, `solves ${uid}`);
    assert.strictEqual(total.ByUser[uid].Wins, v.Wins || 0, `wins ${uid}`);
  });
});

test("stats updates: atomic arithmetic, only the placeholders each chunk uses", () => {
  const d = buildRoundTransitionDelta({ before: { a: 9 }, userID: "b", time: 8, eventFor: () => "333" });
  const updates = buildStatsDeltaUpdates(d, { timestamp: "2026-11-08T00:00:00.000Z" });
  assert.strictEqual(updates.length, 1);
  const [u] = updates;
  assert.match(u.UpdateExpression, /^SET /);
  assert.match(u.UpdateExpression, /#ss\.#bu\.#u\d+\.#fs = if_not_exists\(#ss\.#bu\.#u\d+\.#fs, :zero\) \+ :v\d+/);
  const tokens = new Set(u.UpdateExpression.match(/[#:][A-Za-z0-9_]+/g));
  Object.keys(u.ExpressionAttributeNames).forEach((k) => assert.ok(tokens.has(k), `unused name ${k}`));
  Object.keys(u.ExpressionAttributeValues).forEach((k) => assert.ok(tokens.has(k), `unused value ${k}`));
  [...tokens].forEach((k) =>
    assert.ok(k in u.ExpressionAttributeNames || k in u.ExpressionAttributeValues, `undefined ${k}`)
  );
  assert.deepStrictEqual(buildStatsDeltaUpdates({ TotalSolves: 0, ByUser: {}, ByEvent: {} }), []);
});

test("stats updates: a 100-member session start is split under the 4 KB expression cap", () => {
  const delta = { TotalSessions: 1, ByUser: {}, ByEvent: { "333": { Sessions: 1, ByUser: {} } } };
  for (let i = 0; i < 100; i += 1) {
    delta.ByUser[`member_${i}`] = { Sessions: 1 };
    delta.ByEvent["333"].ByUser[`member_${i}`] = { Sessions: 1 };
  }
  const updates = buildStatsDeltaUpdates(delta, { timestamp: "t" });
  assert.ok(updates.length > 1);
  updates.forEach((u) => {
    assert.ok(u.UpdateExpression.length < 4096);
    const tokens = new Set(u.UpdateExpression.match(/[#:][A-Za-z0-9_]+/g));
    Object.keys(u.ExpressionAttributeNames).forEach((k) => assert.ok(tokens.has(k), `unused ${k}`));
  });
  const ensure = buildStatsEnsureSteps(Object.keys(delta.ByUser), ["333", "444"]);
  assert.strictEqual(ensure.length, 5);
  ensure.flat().forEach((u) => assert.ok(u.UpdateExpression.length < 4096));
});

test("invalid document path is recognised; other validation errors are not", () => {
  const bad = Object.assign(new Error("The document path provided in the update expression is invalid for update"), {
    name: "ValidationException",
  });
  assert.ok(isInvalidDocumentPath(bad));
  assert.ok(!isInvalidDocumentPath(Object.assign(new Error("Two document paths overlap"), { name: "ValidationException" })));
  assert.ok(!isInvalidDocumentPath(conditionalError()));
});

test("throttle retry: retries throttling only, then gives up", async () => {
  const { retryOnThrottle, isThrottlingError } = require("./sharedMessages");
  const throttled = () => Object.assign(new Error("slow down"), { name: "ProvisionedThroughputExceededException" });
  assert.ok(isThrottlingError(throttled()));
  assert.ok(!isThrottlingError(conditionalError()));
  let calls = 0;
  const out = await retryOnThrottle(
    async () => {
      calls += 1;
      if (calls < 3) throw throttled();
      return "ok";
    },
    { sleep: async () => {} }
  );
  assert.strictEqual(out, "ok");
  assert.strictEqual(calls, 3);
  calls = 0;
  await assert.rejects(
    retryOnThrottle(async () => { calls += 1; throw conditionalError(); }, { sleep: async () => {} }),
    /cond/
  );
  assert.strictEqual(calls, 1);
  calls = 0;
  await assert.rejects(
    retryOnThrottle(async () => { calls += 1; throw throttled(); }, { attempts: 4, sleep: async () => {} }),
    /slow down/
  );
  assert.strictEqual(calls, 4);
});
