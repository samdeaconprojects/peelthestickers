// src/smart/recon/lastLayer.js
//
// Last-layer case recognition for a state whose first two layers are solved
// with the last layer on top (U): all 21 PLLs and all 57 OLLs by number. Tables are built lazily from the algorithms below, so the
// algorithms themselves are the source of truth (cube3.test / lastLayer.test
// check they are valid and distinct).

import { SOLVED, applyAlg, applyMove, centerOf, invertAlg, rotationBringing } from "./cube3";

const U_STICKERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
// Top row of each side face, in R F L B order (left to right as seen from outside).
const SIDE_TOP = [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47];
const Y_TURNS = ["", "y", "y2", "y'"];
const U_TURNS = ["", "U", "U2", "U'"];

export const PLL_ALGS = {
  Aa: "x R' U R' D2 R U' R' D2 R2 x'",
  Ab: "x R2 D2 R U R' D2 R U' R x'",
  E: "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
  F: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  Ga: "R2 U R' U R' U' R U' R2 U' D R' U R D'",
  Gb: "R' U' R U D' R2 U R' U R U' R U' R2 D",
  Gc: "R2 U' R U' R U R' U R2 U D' R U' R' D",
  Gd: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  H: "M2 U M2 U2 M2 U M2",
  Ja: "R' U L' U2 R U' R' U2 R L",
  Jb: "R U R' F' R U R' U' R' F R2 U' R'",
  Na: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  Nb: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  Ra: "R U' R' U' R U R D R' U' R D' R' U2 R'",
  Rb: "R2 F R U R U' R' F' R U2 R' U2 R",
  T: "R U R' U' R' F R2 U' R' U' R U R' F'",
  Ua: "M2 U M U2 M' U M2",
  Ub: "M2 U' M U2 M' U' M2",
  V: "R' U R' U' y R' F' R2 U' R' U R' F R F",
  Y: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  Z: "M' U M2 U M2 U M' U2 M2",
};

// All 57 OLL cases by their standard number: one alg each (inverted, it sets
// the case up). The seven with every edge already oriented (OCLL, 21-27) keep
// their nicknames. lastLayer.test checks each against a second, independent
// alg for the same number, so a wrong number can't slip in.
export const OLL_ALGS = {
  1: "R U2 R2 F R F' U2 R' F R F'",
  2: "F R U R' U' F' f R U R' U' f'",
  3: "f R U R' U' f' U' F R U R' U' F'",
  4: "f R U R' U' f' U F R U R' U' F'",
  5: "r' U2 R U R' U r",
  6: "r U2 R' U' R U' r'",
  7: "r U R' U R U2 r'",
  8: "r' U' R U' R' U2 r",
  9: "R U R' U' R' F R2 U R' U' F'",
  10: "R U R' U R' F R F' R U2 R'",
  11: "r' R2 U R' U R U2 R' U M'",
  12: "F R U R' U' F' U F R U R' U' F'",
  13: "r U' r' U' r U r' F' U F",
  14: "R' F R U R' F' R F U' F'",
  15: "r' U' r R' U' R U r' U r",
  16: "r U r' R U R' U' r U' r'",
  17: "R U R' U R' F R F' U2 R' F R F'",
  18: "r U R' U R U2 r2 U' R U' R' U2 r",
  19: "M U R U R' U' M' R' F R F'",
  20: "r U R' U' M2 U R U' R' U' M'",
  21: "R U R' U R U' R' U R U2 R'",
  22: "R U2 R2 U' R2 U' R2 U2 R",
  23: "R2 D R' U2 R D' R' U2 R'",
  24: "r U R' U' r' F R F'",
  25: "F' r U R' U' r' F R",
  26: "R U2 R' U' R U' R'",
  27: "R U R' U R U2 R'",
  28: "r U R' U' r' R U R U' R'",
  29: "R U R' U' R U' R' F' U' F R U R'",
  30: "F U R U2 R' U' R U2 R' U' F'",
  31: "R' U' F U R U' R' F' R",
  32: "S R U R' U' R' F R f'",
  33: "R U R' U' R' F R F'",
  34: "R U R2 U' R' F R U R U' F'",
  35: "R U2 R2 F R F' R U2 R'",
  36: "L' U' L U' L' U L U L F' L' F",
  37: "F R' F' R U R U' R'",
  38: "R U R' U R U' R' U' R' F R F'",
  39: "L F' L' U' L U F U' L'",
  40: "R' F R U R' U' F' U R",
  41: "R U R' U R U2 R' F R U R' U' F'",
  42: "R' U' R U' R' U2 R F R U R' U' F'",
  43: "F' U' L' U L F",
  44: "F U R U' R' F'",
  45: "F R U R' U' F'",
  46: "R' U' R' F R F' U R",
  47: "R' U' R' F R F' R' F R F' U R",
  48: "F R U R' U' R U R' U' F'",
  49: "r U' r2 U r2 U r2 U' r",
  50: "r' U r2 U' r2 U' r2 U r'",
  51: "F U R U' R' U R U' R' F'",
  52: "R U R' U R U' B U' B' R'",
  53: "r' U' R U' R' U R U' R' U2 r",
  54: "r U R' U R U' R' U R U2 r'",
  55: "R U2 R2 U' R U' R' U2 F R F'",
  56: "F R U R' U' R F' r U R' U' r'",
  57: "R U R' U' M' U R U' r'",
};

export const OLL_NICKNAMES = {
  21: "H",
  22: "Pi",
  23: "Headlights",
  24: "T",
  25: "Bowtie",
  26: "Antisune",
  27: "Sune",
};

/** "OLL 27 · Sune", "OLL 45". */
export function ollCaseName(n) {
  return OLL_NICKNAMES[n] ? `OLL ${n} · ${OLL_NICKNAMES[n]}` : `OLL ${n}`;
}


/** Re-orient so the original D colour is on D (undoes net y-less rotations in algs). */
function keepDOnBottom(state) {
  const dColour = "D";
  if (centerOf(state, "D") === dColour) return state;
  const from = ["U", "R", "F", "D", "L", "B"].find((f) => centerOf(state, f) === dColour);
  const rot = rotationBringing(from, "D");
  return rot ? applyAlg(state, rot) : state;
}

// Letter for a sticker = the face whose centre has its colour.
function relativeLetter(state, i) {
  const c = state[i];
  for (const f of "URFDLB") if (centerOf(state, f) === c) return f;
  return "?";
}

function pllKey(state) {
  return SIDE_TOP.map((i) => relativeLetter(state, i)).join("");
}

function ollKey(state) {
  const top = centerOf(state, "U");
  return [...U_STICKERS, ...SIDE_TOP].map((i) => (state[i] === top ? "1" : "0")).join("");
}

function canonical(state, keyFn) {
  let best = null;
  for (const y of Y_TURNS) {
    const r = y ? applyAlg(state, y) : state;
    for (const u of U_TURNS) {
      const k = keyFn(u ? applyMove(r, u) : r);
      if (best === null || k < best) best = k;
    }
  }
  return best;
}

let pllTable = null;
let ollTable = null;

function buildTable(algs, keyFn) {
  const table = new Map();
  for (const [name, alg] of Object.entries(algs)) {
    const s = keepDOnBottom(applyAlg(SOLVED, invertAlg(alg)));
    table.set(canonical(s, keyFn), name);
  }
  return table;
}

export function getPllTable() {
  if (!pllTable) pllTable = buildTable(PLL_ALGS, pllKey);
  return pllTable;
}

/** canonical OLL pattern -> case number. */
export function getOllTable() {
  if (!ollTable) ollTable = buildTable(OLL_ALGS, ollKey);
  return ollTable;
}

/** The state an alg solves: solved with the alg undone (last layer on U). */
export function caseStateOf(alg) {
  return keepDOnBottom(applyAlg(SOLVED, invertAlg(alg)));
}

/** The OLL case number for an alg (as performed from its case), or null. */
export function ollNumberOfAlg(alg) {
  const s = caseStateOf(alg);
  const n = getOllTable().get(canonical(s, ollKey));
  return n == null ? null : Number(n);
}

const SOLVED_PLL_KEY = canonical(SOLVED, pllKey);
const SOLVED_OLL_KEY = canonical(SOLVED, ollKey);

/** Rotate a cube-frame state so `bottomFace` sits on D. */
export function withBottomOn(state, bottomFace) {
  if (!bottomFace || bottomFace === "D") return state;
  const rot = rotationBringing(bottomFace, "D", "F", "F") || rotationBringing(bottomFace, "D");
  return rot ? applyAlg(state, rot) : state;
}

/**
 * PLL case for a state with F2L + OLL done and the last layer on U.
 * Returns a case name ("T", "Ga"...), "skip" when only an AUF is left, or null.
 */
export function recognizePll(stateLLOnTop) {
  const key = canonical(stateLLOnTop, pllKey);
  if (key === SOLVED_PLL_KEY) return "skip";
  return getPllTable().get(key) || null;
}

/**
 * OLL description for a state with F2L done and the last layer on U:
 * { name, edges: "dot" | "line" | "L" | "cross", skip, pattern }
 * `pattern` is 21 chars of "1"/"0": the 9 U stickers then the side top rows
 * (R F L B), "1" where the sticker already shows the top colour.
 */
export function describeOll(stateLLOnTop) {
  const pattern = ollKey(stateLLOnTop);
  const key = canonical(stateLLOnTop, ollKey);
  if (key === SOLVED_OLL_KEY) return { name: "OLL skip", edges: "cross", skip: true, pattern };

  const up = (i) => pattern[i] === "1";
  const edges = [1, 3, 5, 7].filter(up);
  let shape;
  if (edges.length === 4) shape = "cross";
  else if (edges.length === 0) shape = "dot";
  else if (edges.length === 2) {
    const opposite = (up(1) && up(7)) || (up(3) && up(5));
    shape = opposite ? "line" : "L";
  } else shape = "other";

  const number = getOllTable().get(key);
  let name;
  if (number != null) name = ollCaseName(Number(number));
  else if (shape === "cross") name = "OCLL";
  else if (shape === "dot") name = "Dot OLL";
  else if (shape === "line") name = "Line OLL";
  else if (shape === "L") name = "L-shape OLL";
  else name = "OLL";

  return { name, number: number == null ? null : Number(number), edges: shape, skip: false, pattern };
}
