import { algKey, algTagsFromSplits, buildStepAverages, computeSplits, formatDelta, phaseOf, splitsForSolve, summarizeSplits, withSplits, SPLITS_VERSION } from "./splits";
import { buildRecognitionRanker } from "./stepStats";
import { analyzeSolve } from "./analyze";
import { readSmartRecord } from "./solveRecord";

// A real CFOP solve (XCross, F2L 2, 3, 4, OLL, PLL).
const BASE = {"Version":2,"Provider":"gan","Reason":"solved","StartFacelets":"DLBBULRUUFDUFRLBBFFFLBFDBRRUDDUDDBBDLRUFLLDRLRUFFBRRUL","Moves":"B' D D R' F D' U' B U' B' U' R' U R U U L U L' U' L U' L' R U' R' U R U' R' U F R U R' U' F' U' R U R' U' R' F R R U' R' U' R U R' F' U U","MoveTimes":[0,109,139,275,367,515,644,741,1372,1464,1569,2163,2308,2439,2597,2627,2768,2914,3018,3171,3830,3972,4074,4231,4383,4532,4642,4782,4878,5000,5141,5281,5409,6068,6914,7063,7189,7337,7468,7617,8227,9001,9095,9227,9332,9362,9499,9654,9781,9909,10036,10143,10261,10389,10419],"FinalFacelets":"UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"};
const scaled = (k) => ({ ...BASE, MoveTimes: BASE.MoveTimes.map((t) => Math.round(t * k)) });
const solveOf = (smart, time = smart.MoveTimes[smart.MoveTimes.length - 1]) => ({ time, tags: { SmartCube: smart } });

test("splits record every step with recognition, execution, moves and cases", () => {
  const sp = computeSplits(BASE);
  expect(sp.V).toBe(SPLITS_VERSION);
  expect(sp.Method).toBe("CFOP");
  expect(sp.Steps.map((s) => s.K)).toEqual([["cross", "pair1"], ["pair2"], ["pair3"], ["pair4"], ["oll"], ["pll"]]);
  expect(sp.Steps[0].Rec).toBe(0);
  for (const s of sp.Steps.slice(1)) {
    expect(s.Rec).toBeGreaterThan(0);
    expect(s.Rec + s.Exe).toBe(s.Ms);
  }
  expect(sp.Steps[4].Case).toBeTruthy();
  expect(sp.Steps[5].Case).toMatch(/perm$/);
  // Durations add up to the solve.
  expect(sp.Steps.reduce((a, s) => a + s.Ms, 0)).toBe(10419);
});

test("withSplits attaches splits to the saved record and keeps the moves", () => {
  const rec = withSplits(BASE);
  expect(rec.Moves).toBe(BASE.Moves);
  expect(rec.Splits.Method).toBe("CFOP");
  expect(withSplits({ Moves: "" }).Splits).toBeUndefined();
});

test("stored splits are used; missing ones are computed", () => {
  const stored = { ...BASE, Splits: { V: SPLITS_VERSION, Method: "CFOP", Steps: [{ K: ["cross"], Ms: 1, Rec: 0, Exe: 1, Mv: 1 }] } };
  expect(splitsForSolve(solveOf(stored)).Steps[0].Ms).toBe(1);
  expect(splitsForSolve(solveOf(BASE)).Steps.length).toBe(6);
  // A Method tag that disagrees with the stored method recomputes.
  expect(splitsForSolve({ tags: { SmartCube: stored, Method: "Roux" } })?.Steps?.[0]?.Ms).not.toBe(1);
});

test("phases skip solves whose steps straddle them (an XCross has no lone cross)", () => {
  const sp = computeSplits(BASE);
  expect(phaseOf(sp, ["cross"])).toBeNull();
  expect(phaseOf(sp, ["pair1", "pair2", "pair3", "pair4"])).toBeNull();
  const cf = phaseOf(sp, ["cross", "pair1", "pair2", "pair3", "pair4"]);
  expect(cf.ms).toBe(sp.Steps.slice(0, 4).reduce((a, s) => a + s.Ms, 0));
  expect(cf.rec).toBe(sp.Steps.slice(1, 4).reduce((a, s) => a + s.Rec, 0));
  expect(phaseOf(sp, ["pll"]).ms).toBe(sp.Steps[5].Ms);
});

test("summary: best, mean and cases per step", () => {
  const solves = [solveOf(BASE), solveOf(scaled(1.5)), solveOf(scaled(2)), { ...solveOf(scaled(0.5)), penalty: "DNF" }];
  const { methods } = summarizeSplits(solves);
  expect(methods).toHaveLength(1);
  const m = methods[0];
  expect(m.method).toBe("CFOP");
  expect(m.count).toBe(3);
  const pll = m.phases.find((r) => r.key === "pll");
  expect(pll.n).toBe(3);
  expect(pll.best.solve).toBe(solves[0]);
  expect(pll.mean).toBeCloseTo((pll.best.ms * (1 + 1.5 + 2)) / 3, -1);
  expect(pll.recMean).toBeGreaterThan(0);
  expect(m.phases.find((r) => r.key === "cross")).toBeUndefined();
  expect(m.phases.find((r) => r.key === "xcross").n).toBe(3);
  expect(m.phases.find((r) => r.key === "xcross").recMean).toBeNull();
  expect(m.phases.find((r) => r.key === "crossf2l").recMean).toBeGreaterThan(0);
  expect(m.cases.PLL).toHaveLength(1);
  expect(m.cases.PLL[0].n).toBe(3);
  expect(m.total.mean).toBeCloseTo((10419 * 4.5) / 3, -1);
});

test("recognition is ranked against the pause before the same step", () => {
  const steps = (smart) => {
    const r = readSmartRecord(smart);
    return analyzeSolve({ startState: r.startState, moves: r.moves }).steps;
  };
  const entries = [1.2, 1.3, 1.5].map((k) => ({ event: "333", smart: scaled(k), method: "" }));
  const rank = buildRecognitionRanker(entries, { event: "333", method: "CFOP", exclude: BASE });
  const s = steps(BASE);
  expect(rank(s[0])).toBeNull();
  expect(rank(s[5])).toEqual({ rank01: 0, n: 3 });
});

test("splits of a solve whose tag disagrees remember the tag", () => {
  // BASE is CFOP; tagged Roux it is still analysed as CFOP.
  const sp = computeSplits(BASE, "Roux");
  expect(sp.Method).toBe("CFOP");
  expect(sp.Tagged).toBe("Roux");
  const stored = { ...BASE, Splits: { ...sp, Steps: sp.Steps.map((s) => ({ ...s, Ms: s.Ms + 1 })) } };
  // Same tag, or the tag now naming the detected method: stored splits hold.
  expect(splitsForSolve({ tags: { SmartCube: stored, Method: "Roux" } })).toBe(stored.Splits);
  expect(splitsForSolve({ tags: { SmartCube: stored, Method: "CFOP" } })).toBe(stored.Splits);
  expect(computeSplits(BASE, "CFOP").Tagged).toBeUndefined();
});

test("step and case averages come from the other solves", () => {
  const pool = [0.8, 1, 1.2].map((k) => ({ event: "333", method: "", smart: scaled(k) }));
  const record = readSmartRecord(BASE);
  const a = analyzeSolve({ startState: record.startState, moves: record.moves });
  const avg = buildStepAverages(pool, { event: "333", method: "CFOP", exclude: BASE });
  // BASE itself is excluded: the 0.8x and 1.2x solves average to 1x.
  const pll = a.steps.find((s) => s.key === "pll");
  const r = avg(pll);
  expect(r.step.n).toBe(2);
  expect(r.step.mean).toBeNull(); // fewer than 3 solves: no step average
  expect(r.case.name).toBe(pll.caseName);
  expect(r.case.n).toBe(2);
  expect(Math.abs(r.case.mean - pll.durationMs)).toBeLessThan(2);
  expect(Math.abs(r.case.delta)).toBeLessThan(2);

  const all = buildStepAverages(pool, { event: "333", method: "CFOP", minSamples: 2 });
  const xcross = a.steps[0];
  const rx = all(xcross);
  expect(rx.step.n).toBe(3);
  expect(rx.step.mean).toBeCloseTo(xcross.durationMs, -1);
  expect(rx.case).toBeNull();
  expect(all({ keys: ["pll"], moveCount: 0 })).toBeNull();
});

test("formatDelta", () => {
  expect(formatDelta(-380)).toBe("−0.38");
  expect(formatDelta(120)).toBe("+0.12");
  expect(formatDelta(NaN)).toBe("");
});

test("averaging over many solves stays quick", () => {
  const pool = [];
  for (let i = 0; i < 400; i++) pool.push({ event: "333", method: "", smart: scaled(0.7 + i / 1000) });
  const t0 = Date.now();
  const avg = buildStepAverages(pool, { event: "333", method: "CFOP" });
  const record = readSmartRecord(BASE);
  const a = analyzeSolve({ startState: record.startState, moves: record.moves });
  a.steps.forEach((s) => avg(s));
  const ms = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`buildStepAverages over 400 unsplit solves: ${ms}ms`);
  expect(ms).toBeLessThan(10000);
});

test("algKey: same alg whatever the AUF, regrips and double-turn timing", () => {
  const t = (str) => str.split(" ").map((text) => ({ text }));
  const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
  expect(algKey(t(T))).toBe(T);
  expect(algKey(t(`U ${T} U2`))).toBe(T);
  expect(algKey(t(`y U' ${T}`))).toBe(T);
  expect(algKey(t("R U R' U' R' F R R U' R' U' R U R' F'"))).toBe(T);
  expect(algKey(t("R R'"))).toBe(null);
  expect(algKey(t("U2"))).toBe(null);
  expect(algKey([])).toBe(null);
});

test("splits keep the alg of each case; stats and averages split by alg", () => {
  const sp = computeSplits(BASE);
  const pll = sp.Steps.find((s) => s.K[0] === "pll");
  expect(pll.Alg).toBeTruthy();
  expect(pll.Alg).not.toMatch(/^U/);

  // Two ways of solving the same T perm.
  const other = (k) => {
    const s = splitsForSolve(solveOf(scaled(k)));
    return {
      ...scaled(k),
      Splits: { ...s, Steps: s.Steps.map((x) => (x.K[0] === "pll" ? { ...x, Alg: "R2 U R U R' U' R' U' R' U R'" } : x)) },
    };
  };
  const solves = [solveOf(scaled(1)), solveOf(scaled(1.1)), solveOf(other(1.3)), solveOf(other(1.4))];
  const { methods } = summarizeSplits(solves);
  const row = methods[0].cases.PLL.find((r) => r.key === pll.Case);
  expect(row.n).toBe(4);
  expect(row.algs).toHaveLength(2);
  expect(row.algs.map((a) => a.n)).toEqual([2, 2]);
  expect(row.algs.reduce((a, r) => a + r.n, 0)).toBe(row.n);

  const pool = solves.map((s) => ({ event: "333", method: "", smart: s.tags.SmartCube }));
  const record = readSmartRecord(BASE);
  const a = analyzeSolve({ startState: record.startState, moves: record.moves });
  const avg = buildStepAverages(pool, { event: "333", method: "CFOP", exclude: BASE });
  const r = avg(a.steps.find((s) => s.key === "pll"));
  expect(r.alg.variants).toBe(2);
  // BASE (the 1x solve) is excluded: one other solve used this alg, too few to average.
  expect(r.alg.n).toBe(1);
  expect(r.alg.mean).toBeNull();
  expect(r.case.n).toBe(3);
});

test("detected cases become the solve's OLL / PLL tags", () => {
  const steps = (oll, pll) => ({
    V: SPLITS_VERSION,
    Method: "CFOP",
    Steps: [
      { K: ["cross"], Ms: 1, Mv: 1 },
      { K: ["oll"], Ms: 1, Mv: oll === "skip" ? 0 : 1, Case: oll },
      { K: ["pll"], Ms: 1, Mv: pll === "skip" ? 0 : 1, Case: pll },
    ],
  });
  expect(algTagsFromSplits(steps("OLL 27 · Sune", "T perm"))).toEqual({ Alg_OLL: "OLL #27", Alg_PLL: "T Perm" });
  expect(algTagsFromSplits(steps("skip", "Ga perm"))).toEqual({ Alg_OLL: "Skip", Alg_PLL: "Ga Perm" });
  expect(algTagsFromSplits(steps("Line OLL", "skip"))).toEqual({ Alg_PLL: "Skip" });
  expect(algTagsFromSplits({ ...steps("skip", "skip"), Method: "Roux" })).toEqual({});
  expect(algTagsFromSplits(null)).toEqual({});
  // From a real solve.
  const real = algTagsFromSplits(computeSplits(BASE));
  expect(real).toEqual({ Alg_OLL: "OLL #45", Alg_PLL: "T Perm" });
});
