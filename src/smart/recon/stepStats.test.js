import { buildStepRanker, rankColour, setReconPool } from "./stepStats";
import { analyzeSolve } from "./analyze";
import { readSmartRecord } from "./solveRecord";

// A real CFOP solve (XCross, F2L 2, 3, 4, OLL, PLL), replayed at other speeds.
const BASE = {"Version":2,"Provider":"gan","Reason":"solved","StartFacelets":"DLBBULRUUFDUFRLBBFFFLBFDBRRUDDUDDBBDLRUFLLDRLRUFFBRRUL","Moves":"B' D D R' F D' U' B U' B' U' R' U R U U L U L' U' L U' L' R U' R' U R U' R' U F R U R' U' F' U' R U R' U' R' F R R U' R' U' R U R' F' U U","MoveTimes":[0,109,139,275,367,515,644,741,1372,1464,1569,2163,2308,2439,2597,2627,2768,2914,3018,3171,3830,3972,4074,4231,4383,4532,4642,4782,4878,5000,5141,5281,5409,6068,6914,7063,7189,7337,7468,7617,8227,9001,9095,9227,9332,9362,9499,9654,9781,9909,10036,10143,10261,10389,10419],"FinalFacelets":"UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"};
const scaled = (k) => ({ ...BASE, MoveTimes: BASE.MoveTimes.map((t) => Math.round(t * k)) });
const entry = (smart, event = "333") => ({ event, smart, method: "" });

const stepsOf = (smart) => {
  const r = readSmartRecord(smart);
  return analyzeSolve({ startState: r.startState, moves: r.moves }).steps;
};

test("neutral until there are enough other solves", () => {
  const rank = buildStepRanker([entry(scaled(1.2)), entry(scaled(0.8))], { event: "333", method: "CFOP", exclude: BASE });
  const p = rank(stepsOf(BASE)[0]);
  expect(p).toEqual({ rank01: null, n: 2 });
  expect(rankColour(null)).toBe("hsl(60, 100%, 55%)");
});

test("faster than every other solve is green, slower is red", () => {
  const others = [1.2, 1.3, 1.5, 1.6].map((k) => entry(scaled(k)));
  const fast = buildStepRanker(others, { event: "333", method: "CFOP", exclude: BASE });
  for (const s of stepsOf(BASE).filter((x) => x.keys && x.moveCount)) {
    expect(fast(s)).toEqual({ rank01: 0, n: 4 });
  }
  const slowSolve = scaled(2);
  const slow = buildStepRanker(others, { event: "333", method: "CFOP", exclude: slowSolve });
  const xcross = stepsOf(slowSolve)[0];
  expect(xcross.keys).toEqual(["cross", "pair1"]);
  expect(slow(xcross)).toEqual({ rank01: 1, n: 4 });
  expect(rankColour(0)).toBe("hsl(120, 100%, 55%)");
  expect(rankColour(1)).toBe("hsl(0, 100%, 55%)");
});

test("other events and the solve itself are left out", () => {
  const rank = buildStepRanker(
    [entry(BASE), entry(scaled(1.2), "333OH"), entry(scaled(1.3), "333OH"), entry(scaled(1.4), "333OH")],
    { event: "333", method: "CFOP", exclude: BASE }
  );
  expect(rank(stepsOf(BASE)[1]).n).toBe(0);
});

test("pool reads App sessions", () => {
  expect(() => setReconPool({ "333": [{ tags: { SmartCube: BASE } }, { tags: {} }], bad: null })).not.toThrow();
});
