// Run with: npm test  (from server/)
//
// Best means are maintained in three places -- the full build, the streaming
// build, and the incremental merge -- and these pin them to the same answers.
// Divergence there is the drift this scope has been bitten by before.

const test = require("node:test");
const assert = require("node:assert");

const {
  getMeanDnfToleranceForWindow,
  bestMeansForWindow,
  computeWindowMeanMs,
  buildStatsFromSolves,
} = require("./ptsCore");

function solve(id, rawTimeMs, penalty) {
  const createdAt = `2026-01-01T00:00:${String(id % 60).padStart(2, "0")}.${String(id).padStart(3, "0")}Z`;
  return {
    SK: `SOLVE#${createdAt}#${id}`,
    SolveID: String(id),
    RawTimeMs: rawTimeMs,
    Penalty: penalty || null,
    CreatedAt: createdAt,
    Event: "333",
    SessionID: "main",
  };
}

// Ascending ramp from 10.00s in 100ms steps.
function ramp(count, startId = 0) {
  return Array.from({ length: count }, (_, i) => solve(startId + i, 10000 + i * 100));
}

test("Mo3 stays WCA-strict, larger means tolerate ceil(5%)", () => {
  assert.strictEqual(getMeanDnfToleranceForWindow(3), 0);
  assert.strictEqual(getMeanDnfToleranceForWindow(5), 1);
  assert.strictEqual(getMeanDnfToleranceForWindow(12), 1);
  assert.strictEqual(getMeanDnfToleranceForWindow(25), 2);
  assert.strictEqual(getMeanDnfToleranceForWindow(50), 3);
  assert.strictEqual(getMeanDnfToleranceForWindow(100), 5);
  assert.strictEqual(getMeanDnfToleranceForWindow(1000), 50);
});

test("computeWindowMeanMs defaults to the strict rule", () => {
  const window = [solve(1, 10000), solve(2, 11000), solve(3, 12000)];
  assert.strictEqual(computeWindowMeanMs(window), 11000);

  const withDnf = [solve(1, 10000), solve(2, 11000), solve(3, 12000, "DNF")];
  assert.strictEqual(computeWindowMeanMs(withDnf), Infinity);
  // Tolerating it averages only the successes.
  assert.strictEqual(computeWindowMeanMs(withDnf, { dnfTolerance: 1 }), 10500);
});

test("a clean scope gives the same best for both variants", () => {
  const { tolerant, strict } = bestMeansForWindow(ramp(25), 25);
  // Ramp is monotonic, so the best mean is the first window: 10.0 .. 12.4.
  assert.strictEqual(tolerant.value, 11200);
  assert.strictEqual(strict.value, 11200);
});

test("the tolerant best is never worse than the strictly clean best", () => {
  // A fast stretch spoiled by one DNF, then a slower but clean stretch.
  const solves = [
    ...ramp(24, 0),
    solve(24, 0, "DNF"),
    ...Array.from({ length: 25 }, (_, i) => solve(100 + i, 30000 + i * 100)),
  ];

  const { tolerant, strict } = bestMeansForWindow(solves, 25);
  assert.ok(tolerant.value <= strict.value);
  // The fast window is only reachable when the DNF is tolerated.
  assert.ok(tolerant.value < 20000);
  assert.ok(strict.value > 20000);
});

test("more DNFs than the tolerance voids the window", () => {
  // 25 solves with 3 DNFs: over the tolerance of 2, so no clean-enough window.
  const solves = [...ramp(22), solve(90, 0, "DNF"), solve(91, 0, "DNF"), solve(92, 0, "DNF")];
  const { tolerant, strict } = bestMeansForWindow(solves, 25);
  assert.strictEqual(tolerant.value, null);
  assert.strictEqual(strict.value, null);
});

test("buildStatsFromSolves emits every mean window, null when too short", () => {
  const stats = buildStatsFromSolves(ramp(30));

  assert.strictEqual(stats.BestMo25Ms, 11200);
  assert.strictEqual(stats.BestMo25NoDnfMs, 11200);
  assert.ok(stats.BestMo25StartSolveSK);

  // 30 solves cannot fill a Mo50 window.
  assert.strictEqual(stats.BestMo50Ms, null);
  assert.strictEqual(stats.BestMo1000Ms, null);
  assert.strictEqual(stats.BestMo1000NoDnfMs, null);
});

test("an empty scope carries the mean keys rather than omitting them", () => {
  const stats = buildStatsFromSolves([]);
  for (const n of [5, 12, 25, 50, 100, 1000]) {
    assert.strictEqual(stats[`BestMo${n}Ms`], null, `BestMo${n}Ms`);
    assert.strictEqual(stats[`BestMo${n}NoDnfMs`], null, `BestMo${n}NoDnfMs`);
  }
});

test("the rolling pass matches a naive per-window scan", () => {
  // Irregular times plus scattered DNFs -- the case a rolling sum could drift on.
  const solves = Array.from({ length: 400 }, (_, i) =>
    i % 37 === 0 ? solve(i, 0, "DNF") : solve(i, 8000 + ((i * 733) % 9000))
  );

  for (const n of [5, 12, 25, 50, 100]) {
    const tolerance = getMeanDnfToleranceForWindow(n);
    let naiveTolerant = null;
    let naiveStrict = null;

    for (let i = 0; i <= solves.length - n; i += 1) {
      const slice = solves.slice(i, i + n);
      const tolerantValue = computeWindowMeanMs(slice, { dnfTolerance: tolerance });
      if (Number.isFinite(tolerantValue)) {
        if (naiveTolerant === null || tolerantValue < naiveTolerant) naiveTolerant = tolerantValue;
      }
      const strictValue = computeWindowMeanMs(slice);
      if (Number.isFinite(strictValue)) {
        if (naiveStrict === null || strictValue < naiveStrict) naiveStrict = strictValue;
      }
    }

    const { tolerant, strict } = bestMeansForWindow(solves, n);
    assert.strictEqual(tolerant.value, naiveTolerant, `Mo${n} tolerant`);
    assert.strictEqual(strict.value, naiveStrict, `Mo${n} strict`);
  }
});
