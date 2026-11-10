// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");

const {
  parseScopedEvents,
  parseScopedPairs,
  buildScopedSolvesQuery,
  buildResumeKey,
} = require("./scopedSolvesQuery");

const START = "2026-10-01T04:00:00.000Z";
const END = "2026-10-08T04:00:00.000Z";

test("parse events and pairs", () => {
  assert.deepStrictEqual(parseScopedEvents("all"), { all: true, events: [] });
  assert.deepStrictEqual(parseScopedEvents(""), { all: true, events: [] });
  assert.deepStrictEqual(parseScopedEvents("333, 444,333"), { all: false, events: ["333", "444"] });

  const pairs = parseScopedPairs("333:main,333:abc,444:MAIN,bad,:x,555:a:b");
  assert.deepStrictEqual([...pairs.entries()], [
    ["333", ["main", "abc"]],
    ["444", ["main"]],
    ["555", ["a:b"]],
  ]);
});

test("single event, any session -> GSI2, no filter", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "333" });
  assert.strictEqual(q.indexName, "GSI2");
  assert.strictEqual(q.keyConditionExpression, "GSI2PK = :pk");
  assert.strictEqual(q.filterExpression, null);
  assert.deepStrictEqual(q.values, { ":pk": "EVENT#u1#333" });
  assert.deepStrictEqual(q.names, {});
});

test("single event, one session -> GSI1 partition", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "333", pairs: "333:abc" });
  assert.strictEqual(q.indexName, "GSI1");
  assert.strictEqual(q.values[":pk"], "SESSION#u1#333#abc");
  assert.strictEqual(q.filterExpression, null);

  const main = buildScopedSolvesQuery({ userID: "u1", events: "333", sessions: "main" });
  assert.strictEqual(main.indexName, "GSI1");
  assert.strictEqual(main.values[":pk"], "SESSION#u1#333#main");
});

test("single event, several sessions -> GSI2 with SessionID filter", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "333", pairs: "333:main,333:abc,444:x" });
  assert.strictEqual(q.indexName, "GSI2");
  assert.strictEqual(q.filterExpression, "#sid IN (:sid0, :sid1)");
  assert.strictEqual(q.values[":sid0"], "main");
  assert.strictEqual(q.values[":sid1"], "abc");
  assert.deepStrictEqual(q.names, { "#sid": "SessionID" });
});

test("single event date range uses GSI2SK bounds", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "333", startIso: START, endExclusiveIso: END });
  assert.strictEqual(q.keyConditionExpression, "GSI2PK = :pk AND GSI2SK BETWEEN :startSk AND :endSk");
  assert.strictEqual(q.values[":startSk"], START);
  assert.strictEqual(q.values[":endSk"], END);

  const open = buildScopedSolvesQuery({ userID: "u1", events: "333", startIso: START });
  assert.strictEqual(open.keyConditionExpression, "GSI2PK = :pk AND GSI2SK >= :startSk");
});

test("multiple events -> main table with Event IN filter", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "333,444" });
  assert.strictEqual(q.indexName, null);
  assert.strictEqual(q.keyConditionExpression, "PK = :pk AND begins_with(SK, :skPrefix)");
  assert.strictEqual(q.values[":pk"], "USER#u1");
  assert.strictEqual(q.values[":skPrefix"], "SOLVE#");
  assert.strictEqual(q.filterExpression, "#ev IN (:ev0, :ev1)");
  assert.deepStrictEqual(q.names, { "#ev": "Event" });
});

test("all events -> main table, no filter", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "all" });
  assert.strictEqual(q.indexName, null);
  assert.strictEqual(q.filterExpression, null);
  assert.deepStrictEqual(q.names, {});
});

test("main table date range stays inside SOLVE#", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "all", startIso: START, endExclusiveIso: END });
  assert.strictEqual(q.keyConditionExpression, "PK = :pk AND SK BETWEEN :startSk AND :endSk");
  assert.strictEqual(q.values[":startSk"], `SOLVE#${START}`);
  assert.strictEqual(q.values[":endSk"], `SOLVE#${END}`);

  const fromOnly = buildScopedSolvesQuery({ userID: "u1", events: "333,444", startIso: START });
  assert.strictEqual(fromOnly.values[":startSk"], `SOLVE#${START}`);
  assert.strictEqual(fromOnly.values[":endSk"], "SOLVE#￿");

  const toOnly = buildScopedSolvesQuery({ userID: "u1", events: "333,444", endExclusiveIso: END });
  assert.strictEqual(toOnly.values[":startSk"], "SOLVE#");
  assert.strictEqual(toOnly.values[":endSk"], `SOLVE#${END}`);
});

test("multiple events with session pairs", () => {
  const q = buildScopedSolvesQuery({
    userID: "u1",
    events: "333,444,555",
    pairs: "333:main,333:abc,444:x,666:y",
  });
  assert.strictEqual(
    q.filterExpression,
    "#ev = :ev0 OR (#ev = :pev0 AND #sid IN (:psid0_0, :psid0_1)) OR (#ev = :pev1 AND #sid = :psid1_0)"
  );
  assert.strictEqual(q.values[":ev0"], "555");
  assert.strictEqual(q.values[":pev0"], "333");
  assert.strictEqual(q.values[":pev1"], "444");
  assert.strictEqual(q.values[":psid1_0"], "x");
  // 666 is outside the chosen events, so its pair is ignored.
  assert.ok(!Object.values(q.values).includes("666"));
  assert.deepStrictEqual(q.names, { "#ev": "Event", "#sid": "SessionID" });
});

test("all events with pairs: unpaired events pass, paired ones are limited", () => {
  const q = buildScopedSolvesQuery({ userID: "u1", events: "all", pairs: "333:abc" });
  assert.strictEqual(q.filterExpression, "NOT (#ev = :rev0) OR (#ev = :pev0 AND #sid = :psid0_0)");
});

test("sessions=main limits every chosen event to main", () => {
  const all = buildScopedSolvesQuery({ userID: "u1", events: "all", sessions: "main" });
  assert.strictEqual(all.filterExpression, "#sid = :mainSid");
  assert.strictEqual(all.values[":mainSid"], "main");

  const two = buildScopedSolvesQuery({ userID: "u1", events: "333,444", sessions: "main" });
  assert.strictEqual(
    two.filterExpression,
    "(#ev = :pev0 AND #sid = :psid0_0) OR (#ev = :pev1 AND #sid = :psid1_0)"
  );
});

test("resume key carries index keys", () => {
  const item = { PK: "USER#u1", SK: "SOLVE#t#1", GSI2PK: "EVENT#u1#333", GSI2SK: "t#main#1", Event: "333" };
  assert.deepStrictEqual(buildResumeKey(item, null), { PK: "USER#u1", SK: "SOLVE#t#1" });
  assert.deepStrictEqual(buildResumeKey(item, "GSI2"), {
    PK: "USER#u1",
    SK: "SOLVE#t#1",
    GSI2PK: "EVENT#u1#333",
    GSI2SK: "t#main#1",
  });
  assert.strictEqual(buildResumeKey(null, null), null);
});

test("missing userID throws", () => {
  assert.throws(() => buildScopedSolvesQuery({ events: "333" }));
});
