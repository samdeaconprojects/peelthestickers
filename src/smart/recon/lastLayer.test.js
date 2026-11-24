import { SOLVED, stickerHome } from "./cube3";
import {
  OLL_ALGS,
  caseStateOf,
  describeOll,
  getOllTable,
  ollCaseName,
  ollNumberOfAlg,
} from "./lastLayer";

// A second alg for every OLL number, from an independent list (jperm.net/algs/oll,
// with its group names). Each must land on the same case as OLL_ALGS[n]: two
// different algs agreeing on a number is what makes the numbering trustworthy.
const REFERENCE = {
  1: ["Dot", "R U2 R2 F R F' U2 R' F R F'"],
  2: ["Dot", "r U r' U2 r U2 R' U2 R U' r'"],
  3: ["Dot", "r' R2 U R' U r U2 r' U M'"],
  4: ["Dot", "M U' r U2 r' U' R U' R' M'"],
  5: ["Square", "l' U2 L U L' U l"],
  6: ["Square", "r U2 R' U' R U' r'"],
  7: ["Small Lightning Bolt", "r U R' U R U2 r'"],
  8: ["Small Lightning Bolt", "l' U' L U' L' U2 l"],
  9: ["Fish", "R U R' U' R' F R2 U R' U' F'"],
  10: ["Fish", "R U R' U R' F R F' R U2 R'"],
  11: ["Small Lightning Bolt", "r U R' U R' F R F' R U2 r'"],
  12: ["Small Lightning Bolt", "M' R' U' R U' R' U2 R U' R r'"],
  13: ["Knight Move", "F U R U' R2 F' R U R U' R'"],
  14: ["Knight Move", "R' F R U R' F' R F U' F'"],
  15: ["Knight Move", "l' U' l L' U' L U l' U l"],
  16: ["Knight Move", "r U r' R U R' U' r U' r'"],
  17: ["Dot", "F R' F' R2 r' U R U' R' U' M'"],
  18: ["Dot", "r U R' U R U2 r2 U' R U' R' U2 r"],
  19: ["Dot", "r' R U R U R' U' M' R' F R F'"],
  20: ["Dot", "r U R' U' M2 U R U' R' U' M'"],
  21: ["Cross", "R U2 R' U' R U R' U' R U' R'"],
  22: ["Cross", "R U2 R2 U' R2 U' R2 U2 R"],
  23: ["Cross", "R2 D' R U2 R' D R U2 R"],
  24: ["Cross", "r U R' U' r' F R F'"],
  25: ["Cross", "F' r U R' U' r' F R"],
  26: ["Cross", "R U2 R' U' R U' R'"],
  27: ["Cross", "R U R' U R U2 R'"],
  28: ["Corners Oriented", "r U R' U' r' R U R U' R'"],
  29: ["Awkward", "R U R' U' R U' R' F' U' F R U R'"],
  30: ["Awkward", "F R' F R2 U' R' U' R U R' F2"],
  31: ["P", "R' U' F U R U' R' F' R"],
  32: ["P", "L U F' U' L' U L F L'"],
  33: ["T", "R U R' U' R' F R F'"],
  34: ["C", "R U R2 U' R' F R U R U' F'"],
  35: ["Fish", "R U2 R2 F R F' R U2 R'"],
  36: ["W", "L' U' L U' L' U L U L F' L' F"],
  37: ["Fish", "F R' F' R U R U' R'"],
  38: ["W", "R U R' U R U' R' U' R' F R F'"],
  39: ["Big Lightning Bolt", "L F' L' U' L U F U' L'"],
  40: ["Big Lightning Bolt", "R' F R U R' U' F' U R"],
  41: ["Awkward", "R U R' U R U2 R' F R U R' U' F'"],
  42: ["Awkward", "R' U' R U' R' U2 R F R U R' U' F'"],
  43: ["P", "F' U' L' U L F"],
  44: ["P", "F U R U' R' F'"],
  45: ["T", "F R U R' U' F'"],
  46: ["C", "R' U' R' F R F' U R"],
  47: ["Small L", "R' U' R' F R F' R' F R F' U R"],
  48: ["Small L", "F R U R' U' R U R' U' F'"],
  49: ["Small L", "r U' r2 U r2 U r2 U' r"],
  50: ["Small L", "r' U r2 U' r2 U' r2 U r'"],
  51: ["I", "F U R U' R' U R U' R' F'"],
  52: ["I", "R U R' U R U' B U' B' R'"],
  53: ["Small L", "l' U2 L U L' U' L U L' U l"],
  54: ["Small L", "r U2 R' U' R U R' U' R U' r'"],
  55: ["I", "R' F R U R U' R2 F' R2 U' R' U R U R'"],
  56: ["I", "r' U' r U' R' U R U' R' U R r' U r"],
  57: ["Corners Oriented", "R U R' U' M' U R U' r'"],
};

const LL = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47]);
const f2lSolved = (s) => [...Array(54).keys()].filter((i) => !LL.has(i)).every((i) => stickerHome(s, i));

describe("OLL", () => {
  test("every alg keeps F2L and sets up an unsolved orientation", () => {
    for (const [n, alg] of Object.entries(OLL_ALGS)) {
      const s = caseStateOf(alg);
      expect([n, f2lSolved(s)]).toEqual([n, true]);
      expect([n, describeOll(s).skip]).toEqual([n, false]);
    }
  });

  test("57 distinct cases", () => {
    expect(Object.keys(OLL_ALGS)).toHaveLength(57);
    expect(getOllTable().size).toBe(57);
  });

  test("each number matches an independent alg for that number", () => {
    const wrong = [];
    for (const [n, [, alg]] of Object.entries(REFERENCE)) {
      const got = ollNumberOfAlg(alg);
      if (got !== Number(n)) wrong.push(`${n} -> ${got}`);
    }
    expect(wrong).toEqual([]);
  });

  test("shapes agree with the groups", () => {
    const EDGES = { Dot: "dot", Cross: "cross", I: "line" };
    const got = [];
    const want = [];
    for (const [n, [group]] of Object.entries(REFERENCE)) {
      const d = describeOll(caseStateOf(OLL_ALGS[n]));
      got.push([n, d.number, EDGES[group] ? d.edges : null]);
      want.push([n, Number(n), EDGES[group] || null]);
    }
    expect(got).toEqual(want);
  });

  test("names", () => {
    expect(ollCaseName(27)).toBe("OLL 27 · Sune");
    expect(ollCaseName(45)).toBe("OLL 45");
    expect(describeOll(caseStateOf("F R U R' U' F'")).name).toBe("OLL 45");
    expect(describeOll(SOLVED).skip).toBe(true);
  });
});
