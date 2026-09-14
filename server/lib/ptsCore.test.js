// Run with: npm test  (from server/)
//
// These guard the invariant that the incremental stats writer and the full
// recompute agree. They exist because Plus2BestMs / FirstSolveAt /
// WorstSingleMs were silently never maintained on the incremental path: the
// counters moved, the paired extremes did not, and the UI reacted by offering
// a full recompute on almost every visit.

const test = require("node:test");
const assert = require("node:assert");

const {
  buildStatsFromSolves,
  mergeIncrementalStats,
  minIsoTimestamp,
  planScopeExtremeReads,
  applyScopeExtremes,
} = require("./ptsCore");

function solve(id, rawTimeMs, penalty, createdAt) {
  return {
    SK: `SOLVE#${createdAt}#${id}`,
    SolveID: id,
    RawTimeMs: rawTimeMs,
    Penalty: penalty,
    CreatedAt: createdAt,
    Event: "333",
    SessionID: "main",
  };
}

function foldIncrementally(solves) {
  let acc = null;
  for (const s of solves) acc = mergeIncrementalStats(acc, s, [], 3);
  return acc;
}

// The fields the incremental path derives from the running scope rather than
// from a rescan. Window bests are excluded: they need the recentSolves
// neighbourhood, which this fold deliberately does not supply.
const SCOPE_EXTREMES = [
  "SolveCountTotal",
  "SolveCountIncluded",
  "DNFCount",
  "Plus2Count",
  "SumFinalTimeMs",
  "MeanMs",
  "BestSingleMs",
  "WorstSingleMs",
  "Plus2BestMs",
  "FirstSolveAt",
];

function assertMatchesFullRecompute(solves, label) {
  const incremental = foldIncrementally(solves);
  const full = buildStatsFromSolves(solves);

  for (const field of SCOPE_EXTREMES) {
    assert.deepStrictEqual(
      incremental[field] ?? null,
      full[field] ?? null,
      `${label}: ${field} drifted from the full recompute`
    );
  }
}

test("incremental stats match a full recompute for a plain session", () => {
  assertMatchesFullRecompute(
    [
      solve("a", 10000, null, "2026-01-01T10:00:00.000Z"),
      solve("b", 12000, null, "2026-01-01T10:01:00.000Z"),
      solve("c", 8000, null, "2026-01-01T10:02:00.000Z"),
    ],
    "plain session"
  );
});

test("Plus2BestMs is maintained, not left null beside a non-zero Plus2Count", () => {
  const solves = [
    solve("a", 10000, null, "2026-01-01T10:00:00.000Z"),
    solve("b", 12000, "+2", "2026-01-01T10:01:00.000Z"),
    solve("c", 9000, "+2", "2026-01-01T10:02:00.000Z"),
  ];

  const stats = foldIncrementally(solves);

  // This exact pair is what the Stats view used to treat as "cached stats are
  // broken, offer a recompute".
  assert.ok(stats.Plus2Count > 0, "expected the fixture to record +2 solves");
  assert.ok(
    Number.isFinite(stats.Plus2BestMs),
    "Plus2Count > 0 with a null Plus2BestMs is the state that triggered the recompute prompt"
  );

  // 9000ms raw + the 2000ms penalty beats 12000 + 2000.
  assert.strictEqual(stats.Plus2BestMs, 11000);
  assertMatchesFullRecompute(solves, "+2 session");
});

test("a DNF never becomes the worst single or the +2 best", () => {
  const solves = [
    solve("a", 10000, null, "2026-01-01T10:00:00.000Z"),
    solve("b", 99000, "DNF", "2026-01-01T10:01:00.000Z"),
  ];

  const stats = foldIncrementally(solves);

  assert.strictEqual(stats.DNFCount, 1);
  assert.strictEqual(stats.WorstSingleMs, 10000);
  assert.strictEqual(stats.Plus2BestMs, null);
  assertMatchesFullRecompute(solves, "dnf session");
});

test("a backdated solve pulls FirstSolveAt earlier", () => {
  // Arrival order deliberately disagrees with solve order, the way a WCA or
  // CSV import lands after solves have already been timed live.
  const solves = [
    solve("live", 10000, null, "2026-01-05T10:00:00.000Z"),
    solve("imported", 14000, null, "2019-07-04T10:00:00.000Z"),
  ];

  const stats = foldIncrementally(solves);

  assert.strictEqual(
    stats.FirstSolveAt,
    "2019-07-04T10:00:00.000Z",
    "FirstSolveAt must move backwards for backdated imports"
  );
  assertMatchesFullRecompute(solves, "backdated import");
});

test("an empty scope reports null extremes rather than zeroes", () => {
  const stats = buildStatsFromSolves([]);

  assert.strictEqual(stats.SolveCountTotal, 0);
  assert.strictEqual(stats.BestSingleMs, null);
  assert.strictEqual(stats.WorstSingleMs, null);
  assert.strictEqual(stats.Plus2BestMs, null);
  assert.strictEqual(stats.FirstSolveAt, null);
});

test("minIsoTimestamp takes the earlier value and ignores blanks", () => {
  assert.strictEqual(minIsoTimestamp("2026-01-02", "2026-01-01"), "2026-01-01");
  assert.strictEqual(minIsoTimestamp("2026-01-01", "2026-01-02"), "2026-01-01");
  assert.strictEqual(minIsoTimestamp(null, "2026-01-02"), "2026-01-02");
  assert.strictEqual(minIsoTimestamp("2026-01-02", ""), "2026-01-02");
  assert.strictEqual(minIsoTimestamp(null, undefined), null);
});

// ---------------------------------------------------------------------------
// Scope extremes: the halves that applyIncrementalStatsForScope actually runs.
// planScopeExtremeReads decides what has to be read back; applyScopeExtremes
// turns prev + the delta + those reads into the stored values.
// ---------------------------------------------------------------------------

// A healthy stats row: three solves, one of them a +2.
function baseScope(overrides = {}) {
  return {
    SolveCountTotal: 3,
    SolveCountIncluded: 3,
    Plus2Count: 1,
    FirstSolveAt: "2026-01-01T10:00:00.000Z",
    Plus2BestMs: 11000,
    Plus2BestSolveSK: "SOLVE#2026-01-01T10:01:00.000Z#p1",
    Plus2BestAt: "2026-01-01T10:01:00.000Z",
    Plus2BestResolvedForCount: 1,
    WorstSingleMs: 20000,
    WorstSingleSolveSK: "SOLVE#2026-01-01T10:02:00.000Z#w1",
    ...overrides,
  };
}

function core(prev, { total = 0, included = 0, plus2 = 0 } = {}) {
  return {
    SolveCountTotal: prev.SolveCountTotal + total,
    SolveCountIncluded: prev.SolveCountIncluded + included,
    Plus2Count: prev.Plus2Count + plus2,
  };
}

function derive({ prev, core: c, addSolve = null, removeSolve = null, reads = {} }) {
  const plan = planScopeExtremeReads({ prev, core: c, addSolve, removeSolve });
  const next = applyScopeExtremes({ ...prev }, { prev, core: c, addSolve, plan, reads });
  return { plan, next };
}

test("a plain add reads nothing back", () => {
  const prev = baseScope();
  const { plan } = derive({
    prev,
    core: core(prev, { total: 1, included: 1 }),
    addSolve: solve("new", 15000, null, "2026-01-01T10:05:00.000Z"),
  });

  assert.deepStrictEqual(plan, {
    needsFirstSolveAt: false,
    needsPlus2Best: false,
    needsWorstSingle: false,
  });
});

test("a faster +2 tightens Plus2BestMs without a read", () => {
  const prev = baseScope();
  const added = solve("fast2", 5000, "+2", "2026-01-01T10:05:00.000Z");
  const { plan, next } = derive({
    prev,
    core: core(prev, { total: 1, included: 1, plus2: 1 }),
    addSolve: added,
  });

  assert.strictEqual(plan.needsPlus2Best, false);
  assert.strictEqual(next.Plus2BestMs, 7000, "5000 raw + the 2000 penalty");
  assert.strictEqual(next.Plus2BestSolveSK, added.SK);
});

test("a slower +2 leaves Plus2BestMs alone", () => {
  const prev = baseScope();
  const { next } = derive({
    prev,
    core: core(prev, { total: 1, included: 1, plus2: 1 }),
    addSolve: solve("slow2", 30000, "+2", "2026-01-01T10:05:00.000Z"),
  });

  assert.strictEqual(next.Plus2BestMs, 11000);
  assert.strictEqual(next.Plus2BestSolveSK, prev.Plus2BestSolveSK);
});

test("removing a solve that holds no record reads nothing back", () => {
  const prev = baseScope();
  const { plan, next } = derive({
    prev,
    core: core(prev, { total: -1, included: -1 }),
    removeSolve: solve("middle", 12000, null, "2026-01-01T10:01:30.000Z"),
  });

  assert.deepStrictEqual(plan, {
    needsFirstSolveAt: false,
    needsPlus2Best: false,
    needsWorstSingle: false,
  });
  assert.strictEqual(next.WorstSingleMs, 20000, "an unrelated removal cannot move the worst");
  assert.strictEqual(next.FirstSolveAt, prev.FirstSolveAt);
});

test("removing the worst single reads the worst back", () => {
  const prev = baseScope();
  const removed = { ...solve("w1", 20000, null, "2026-01-01T10:02:00.000Z") };
  removed.SK = prev.WorstSingleSolveSK;

  const { plan, next } = derive({
    prev,
    core: core(prev, { total: -1, included: -1 }),
    removeSolve: removed,
    reads: { worstSingle: { WorstSingleMs: 12000, WorstSingleSolveSK: "SOLVE#x" } },
  });

  assert.strictEqual(plan.needsWorstSingle, true);
  assert.strictEqual(next.WorstSingleMs, 12000, "the loosened value comes from the read");
});

test("removing the best +2 reads Plus2Best back", () => {
  const prev = baseScope({ Plus2Count: 2 });
  const removed = { ...solve("p1", 9000, "+2", "2026-01-01T10:01:00.000Z") };
  removed.SK = prev.Plus2BestSolveSK;

  const { plan, next } = derive({
    prev,
    core: core(prev, { total: -1, included: -1, plus2: -1 }),
    removeSolve: removed,
    reads: { plus2Best: { Plus2BestMs: 18000, Plus2BestSolveSK: "SOLVE#p2", Plus2BestAt: "z" } },
  });

  assert.strictEqual(plan.needsPlus2Best, true);
  assert.strictEqual(next.Plus2BestMs, 18000);
});

test("removing the first solve reads FirstSolveAt back", () => {
  const prev = baseScope();
  const { plan, next } = derive({
    prev,
    core: core(prev, { total: -1, included: -1 }),
    removeSolve: solve("first", 10000, null, prev.FirstSolveAt),
    reads: { firstSolveAt: "2026-01-01T10:01:00.000Z" },
  });

  assert.strictEqual(plan.needsFirstSolveAt, true);
  assert.strictEqual(next.FirstSolveAt, "2026-01-01T10:01:00.000Z");
});

test("a penalty edit that creates the first +2 folds in without a read", () => {
  // The old version was a clean solve, the new one is a +2. The remove is not
  // a +2, so nothing about the +2 best can have loosened.
  const prev = baseScope({ Plus2Count: 0, Plus2BestMs: null, Plus2BestSolveSK: null, Plus2BestAt: null });
  const edited = solve("edit", 8000, "+2", "2026-01-01T10:03:00.000Z");

  const { plan, next } = derive({
    prev,
    core: core(prev, { plus2: 1 }),
    removeSolve: solve("edit", 8000, null, "2026-01-01T10:03:00.000Z"),
    addSolve: edited,
  });

  assert.strictEqual(plan.needsPlus2Best, false, "no read: a new +2 can only tighten");
  assert.strictEqual(next.Plus2BestMs, 10000, "8000 raw + the 2000 penalty");
  assert.strictEqual(next.Plus2BestSolveSK, edited.SK);
});

test("a legacy row with a null extreme is repaired by reading, not by folding", () => {
  // The exact shape the old writer left behind: counters populated, paired
  // extremes null. Folding the incoming solve in would claim today was the
  // first solve ever and that the newest +2 is the best one.
  const prev = baseScope({
    FirstSolveAt: null,
    Plus2BestMs: null,
    Plus2BestSolveSK: null,
    Plus2BestAt: null,
    Plus2BestResolvedForCount: undefined,
    WorstSingleMs: null,
    WorstSingleSolveSK: null,
  });

  const { plan, next } = derive({
    prev,
    core: core(prev, { total: 1, included: 1 }),
    addSolve: solve("today", 15000, null, "2026-06-01T10:00:00.000Z"),
    reads: {
      firstSolveAt: "2026-01-01T10:00:00.000Z",
      plus2Best: { Plus2BestMs: 11000, Plus2BestSolveSK: "SOLVE#p1", Plus2BestAt: "a" },
      worstSingle: { WorstSingleMs: 20000, WorstSingleSolveSK: "SOLVE#w1" },
    },
  });

  assert.deepStrictEqual(plan, {
    needsFirstSolveAt: true,
    needsPlus2Best: true,
    needsWorstSingle: true,
  });
  assert.strictEqual(next.FirstSolveAt, "2026-01-01T10:00:00.000Z");
  assert.strictEqual(next.Plus2BestMs, 11000);
  assert.strictEqual(next.WorstSingleMs, 20000);
});

test("an unresolvable +2 repair is attempted once per +2, not on every solve", () => {
  // Pre-backfill: the rank items carry no Penalty, so the read comes back
  // empty. Without the resolved-count marker this would re-read forever.
  const prev = baseScope({
    Plus2BestMs: null,
    Plus2BestSolveSK: null,
    Plus2BestAt: null,
    Plus2BestResolvedForCount: undefined,
  });

  const first = derive({
    prev,
    core: core(prev, { total: 1, included: 1 }),
    addSolve: solve("a", 15000, null, "2026-06-01T10:00:00.000Z"),
    reads: { plus2Best: { Plus2BestMs: null, Plus2BestSolveSK: null, Plus2BestAt: null } },
  });

  assert.strictEqual(first.plan.needsPlus2Best, true, "first attempt reads");
  assert.strictEqual(first.next.Plus2BestResolvedForCount, prev.Plus2Count);

  const second = derive({
    prev: first.next,
    core: core(first.next, { total: 1, included: 1 }),
    addSolve: solve("b", 16000, null, "2026-06-01T10:01:00.000Z"),
  });

  assert.strictEqual(second.plan.needsPlus2Best, false, "second attempt must not read again");
});

test("emptying a scope clears every extreme", () => {
  const prev = baseScope({ SolveCountTotal: 1, SolveCountIncluded: 1, Plus2Count: 1 });
  const { next } = derive({
    prev,
    core: core(prev, { total: -1, included: -1, plus2: -1 }),
    removeSolve: solve("last", 11000, "+2", prev.FirstSolveAt),
    reads: { firstSolveAt: null },
  });

  assert.strictEqual(next.FirstSolveAt, null);
  assert.strictEqual(next.Plus2BestMs, null);
  assert.strictEqual(next.WorstSingleMs, null);
});
