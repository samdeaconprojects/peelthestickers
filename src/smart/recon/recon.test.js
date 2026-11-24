import {
  SOLVED,
  applyAlg,
  applyMove,
  centerOf,
  invertAlg,
  isSolved,
  rotationBringing,
  tokenizeAlg,
  stickerHome,
} from "./cube3";
import { PLL_ALGS, getPllTable, recognizePll } from "./lastLayer";
import { analyzeSolve, reconstructionText } from "./analyze";

// Re-orient a physical state so every centre is on its own face (the cube frame
// a smart cube reports in).
function toCubeFrame(state) {
  const from = "URFDLB".split("").find((f) => centerOf(state, f) === "U");
  const fromF = "URFDLB".split("").find((f) => centerOf(state, f) === "F");
  const rot = rotationBringing(from, "U", fromF, "F");
  return rot ? applyAlg(state, rot) : state;
}

const FACE_TURNS = [];
for (const f of "URFDLB") for (const s of ["", "'", "2"]) FACE_TURNS.push(f + s);

// Simulate a smart cube: physical moves (any notation) -> reported quarter turns.
function simulate(physicalAlg, { gap = 300, sliceGap = 25, start = SOLVED } = {}) {
  let phys = start;
  const out = [];
  let t = 0;
  for (const tok of tokenizeAlg(physicalAlg)) {
    const before = toCubeFrame(phys);
    phys = applyMove(phys, tok);
    const after = toCubeFrame(phys);
    if (before === after) continue; // rotation
    let found = null;
    for (const a of FACE_TURNS) {
      if (applyMove(before, a) === after) { found = [a]; break; }
    }
    if (!found) {
      outer: for (const a of FACE_TURNS) for (const b of FACE_TURNS) {
        if (a[0] === b[0]) continue;
        if (applyMove(applyMove(before, a), b) === after) { found = [a, b]; break outer; }
      }
    }
    if (!found) throw new Error(`cannot report ${tok}`);
    // Report as quarter turns.
    const quarters = [];
    for (const f of found) {
      if (f.endsWith("2")) quarters.push(f[0], f[0]);
      else quarters.push(f);
    }
    // interleave opposite faces of a slice like real hardware does
    if (found.length === 2) {
      const qa = found[0].endsWith("2") ? [found[0][0], found[0][0]] : [found[0]];
      const qb = found[1].endsWith("2") ? [found[1][0], found[1][0]] : [found[1]];
      quarters.length = 0;
      for (let i = 0; i < Math.max(qa.length, qb.length); i++) {
        if (qa[i]) quarters.push(qa[i]);
        if (qb[i]) quarters.push(qb[i]);
      }
    }
    t += gap;
    quarters.forEach((q, i) => out.push({ move: q, t: t + i * sliceGap }));
    t += (quarters.length - 1) * sliceGap;
  }
  const t0 = out[0]?.t || 0;
  return out.map((m) => ({ ...m, t: m.t - t0 }));
}

describe("last layer tables", () => {
  test("every PLL alg is a valid, distinct PLL", () => {
    for (const [name, alg] of Object.entries(PLL_ALGS)) {
      const s = applyAlg(SOLVED, alg);
      // ends solved up to a U turn and a rotation
      const ok = ["", "U", "U2", "U'"].some((u) => isSolved(applyAlg(applyAlg(SOLVED, invertAlg(alg)), alg + " " + u)));
      expect([name, ok]).toEqual([name, true]);
      const inv = toCubeFrame(applyAlg(SOLVED, invertAlg(alg)));
      // Every sticker below the top row of the side faces (and all of D) is home.
      const misplaced = [];
      for (let i = 9; i < 54; i++) {
        const row = Math.floor((i % 9) / 3);
        const isTopRow = row === 0 && !(i >= 27 && i < 36);
        if (!isTopRow && !stickerHome(inv, i)) misplaced.push(i);
      }
      expect([name, misplaced]).toEqual([name, []]);
      for (let i = 0; i < 9; i++) expect([name, stickerHome(inv, i)]).toEqual([name, true]);
      void s;
    }
    expect(getPllTable().size).toBe(21);
  });

  test("every reachable PLL state is recognised", () => {
    const names = Object.keys(PLL_ALGS);
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let trial = 0; trial < 150; trial++) {
      let s = SOLVED;
      for (let k = 0; k < 4; k++) {
        s = applyAlg(s, ["", "U", "U2", "U'"][rnd(4)]);
        s = toCubeFrame(applyAlg(s, invertAlg(PLL_ALGS[names[rnd(names.length)]])));
      }
      expect(recognizePll(s)).not.toBeNull();
    }
  });

});

describe("analyzeSolve", () => {
  const cfopSolution = [
    ["cross", "D2 F' R B' L2 D'"],
    ["pair1", "U R U' R'"],
    ["pair2", "U' L' U L"],
    ["pair3", "U2 R' U R"],
    ["pair4", "L U' L'"],
    ["oll", "R U R' U R U2 R'"],
    ["pll", "R U R' U' R' F R2 U' R' U' R U R' F' U"],
  ];

  test("CFOP steps, cases and timings", () => {
    const solution = cfopSolution.map((x) => x[1]).join(" ");
    const scramble = invertAlg(solution);
    const moves = simulate(solution);
    const a = analyzeSolve({ startState: applyAlg(SOLVED, scramble), moves });
    expect(a.method).toBe("CFOP");
    expect(a.solved).toBe(true);
    expect(a.bottom).toBe("D");
    expect(a.rotation).toBe("");
    expect(a.steps.map((s) => s.key)).toEqual(cfopSolution.map((x) => x[0]));
    a.steps.forEach((s, i) => {
      expect(s.tokens.map((x) => x.text).join(" ")).toBe(cfopSolution[i][1]);
    });
    expect(a.steps.find((s) => s.key === "oll").caseName).toBe("OLL 27 · Sune");
    expect(a.steps.find((s) => s.key === "pll").caseName).toBe("T perm");
    // recognition = gap before the step's first move
    expect(a.steps[1].recognitionMs).toBe(300);
    expect(a.totalMs).toBe(moves[moves.length - 1].t);
    expect(reconstructionText(a)).toContain("// OLL (OLL 27 · Sune)");
  });

  test("CFOP with the cross on top gets a z2 and relabelled moves", () => {
    const solution = "z2 " + cfopSolution.map((x) => x[1]).join(" ");
    // Scrambled white-top; the solver turns it over (z2) and solves.
    const movesOnly = cfopSolution.map((x) => x[1]).join(" ");
    const start = applyAlg(SOLVED, `z2 ${invertAlg(movesOnly)} z2`);
    const moves = simulate(solution, { start });
    const a = analyzeSolve({ startState: start, moves });
    expect(a.bottom).toBe("U");
    expect(a.bottomColour).toBe("white");
    expect(a.rotation).toBe("z2");
    expect(a.steps.map((s) => s.key)).toEqual(cfopSolution.map((x) => x[0]));
    expect(a.displayAlg).toBe(solution);
  });

  test("Roux with r and M moves reads like the solver wrote it", () => {
    const steps = [
      ["fb", "D' F2 L' B U2 L F'"],
      ["sb", "r' U' R U2 r U r' U' R' U R"],
      ["cmll", "U R U R' U R U2 R'"],
      ["lse", "M' U M U2 M' U' M2 U2"],
    ];
    const solution = steps.map((x) => x[1]).join(" ");
    const phys = applyAlg(SOLVED, invertAlg(solution));
    const moves = simulate(solution, { start: phys });
    const a = analyzeSolve({ startState: toCubeFrame(phys), moves });
    expect(a.method).toBe("Roux");
    expect(a.steps.map((s) => s.key)).toEqual(steps.map((x) => x[0]));
    a.steps.forEach((s, i) => expect(s.tokens.map((x) => x.text).join(" ")).toBe(steps[i][1]));
  });

  test("Roux with M slices", () => {
    const steps = [
      ["fb", "D' F2 L' B U2 L F'"],
      ["sb", "R' U M' U' R U R'"],
      ["cmll", "U R U R' U R U2 R'"],
      ["lse", "M' U M U2 M' U' M2 U2"],
    ];
    const solution = steps.map((x) => x[1]).join(" ");
    const phys = applyAlg(SOLVED, invertAlg(solution));
    const moves = simulate(solution, { start: phys });
    const start = toCubeFrame(phys);
    const a = analyzeSolve({ startState: start, moves });
    expect(a.method).toBe("Roux");
    expect(a.steps.map((s) => s.key)).toEqual(steps.map((x) => x[0]));
    expect(a.displayAlg).toBe(solution);
    expect(isSolved(applyAlg(start, a.displayAlg))).toBe(true);
  });

  test("a Roux solve tagged CFOP is shown as Roux and flagged; force keeps the tag", () => {
    const steps = ["D' F2 L' B U2 L F'", "R' U M' U' R U R'", "U R U R' U R U2 R'", "M' U M U2 M' U' M2 U2"];
    const solution = steps.join(" ");
    const phys = applyAlg(SOLVED, invertAlg(solution));
    const moves = simulate(solution, { start: phys });
    const start = toCubeFrame(phys);
    const a = analyzeSolve({ startState: start, moves, method: "CFOP" });
    expect(a.method).toBe("Roux");
    expect(a.detectedMethod).toBe("Roux");
    expect(a.taggedMethod).toBe("CFOP");
    expect(a.methodMismatch).toBe(true);
    const forced = analyzeSolve({ startState: start, moves, method: "CFOP", force: true });
    expect(forced.method).toBe("CFOP");
    expect(forced.methodMismatch).toBe(false);
    expect(analyzeSolve({ startState: start, moves, method: "Roux" }).methodMismatch).toBe(false);
  });

  test("a CFOP solve tagged CFOP or untagged is not flagged", () => {
    const solution = cfopSolution.map((x) => x[1]).join(" ");
    const moves = simulate(solution);
    const start = applyAlg(SOLVED, invertAlg(solution));
    expect(analyzeSolve({ startState: start, moves, method: "CFOP" }).methodMismatch).toBe(false);
    const untagged = analyzeSolve({ startState: start, moves });
    expect(untagged.methodMismatch).toBe(false);
    expect(untagged.detectedMethod).toBe("CFOP");
    const taggedRoux = analyzeSolve({ startState: start, moves, method: "Roux" });
    expect(taggedRoux.method).toBe("CFOP");
    expect(taggedRoux.methodMismatch).toBe(true);
  });

  test("pairs done after a y rotation read as R-moves", () => {
    const solution = [
      "D2 F' R B' L2 D'",
      "y U R U' R'",
      "y' U' L' U L",
      "R U R' U R U2 R'",
      "R U R' U' R' F R2 U' R' U' R U R' F' U",
    ];
    // Smart cubes can't see the rotations: simulate, then analyse.
    const all = solution.join(" ");
    const movesOnly = invertAlg(invertAlg(all));
    let state = SOLVED;
    // physical start: undo the whole thing (rotations included) and re-hold
    state = toCubeFrame(applyAlg(SOLVED, invertAlg(movesOnly)));
    const moves = simulate(all, { start: state });
    const a = analyzeSolve({ startState: state, moves });
    expect(a.method).toBe("CFOP");
    const f2l = a.steps.filter((s) => s.group === "f2l");
    expect(f2l[0].tokens.map((x) => x.text).join(" ")).toBe("y U R U' R'");
    expect(f2l[0].stm).toBe(4);
    expect(isSolved(applyAlg(state, a.displayAlg))).toBe(true);
    // the second pair needs a rotation too; either hand is fine, B-turns are not
    expect(f2l[1].tokens.some((x) => x.text[0] === "B")).toBe(false);
    expect(f2l[1].stm).toBe(4);
  });

  test("double turns merge only when quick", () => {
    const start = applyAlg(SOLVED, "R2 U");
    const quick = analyzeSolve({ startState: start, moves: [{ move: "U'", t: 0 }, { move: "R", t: 400 }, { move: "R", t: 480 }] });
    expect(quick.steps.flatMap((x) => x.tokens).length).toBe(2);
    const slow = analyzeSolve({ startState: start, moves: [{ move: "U'", t: 0 }, { move: "R", t: 400 }, { move: "R", t: 1400 }] });
    expect(slow.steps.flatMap((x) => x.tokens).length).toBe(3);
  });

  test("unsolved / unrecognised solves still produce a move list", () => {
    const a = analyzeSolve({ startState: applyAlg(SOLVED, "R U F"), moves: [{ move: "F'", t: 0 }] });
    expect(a.solved).toBe(false);
    expect(a.steps.flatMap((x) => x.tokens)).toHaveLength(1);
  });
});

describe("solve records", () => {
  const { fitMoveTimes, buildSmartRecord, readSmartRecord } = require("./solveRecord");
  test("cube clock beats jittery host arrival times", () => {
    const samples = [0, 100, 250, 400].map((c, i) => ({ cubeTs: 5000 + c, hostTs: 90000 + c + [0, 40, -10, 30][i] }));
    expect(fitMoveTimes(samples)).toEqual([0, 100, 250, 400]);
    expect(fitMoveTimes([{ hostTs: 10 }, { hostTs: 60 }])).toEqual([0, 50]);
  });
  test("round trip and v1 fallback", () => {
    const rec = buildSmartRecord({ provider: "gan", reason: "solved", startState: applyAlg(SOLVED, "R'"), moves: [{ move: "R", cubeTs: 1, hostTs: 2 }] });
    const back = readSmartRecord(rec);
    expect(back.moves).toEqual([{ move: "R", t: 0 }]);
    expect(back.startSource).toBe("recorded");
    const v1 = readSmartRecord({ Reason: "solved", Moves: [{ move: "U", hostTs: 0, facelets: null }, { move: "R", hostTs: 300 }] });
    expect(isSolved(applyAlg(v1.startState, "U R"))).toBe(true);
    expect(v1.moves[1].t).toBe(300);
  });
});
