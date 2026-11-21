// src/smart/recon/lastLayer.js
//
// Last-layer case recognition for a state whose first two layers are solved
// with the last layer on top (U). PLL is recognised against all 21 cases;
// OLL is described by its edge shape, and the 7 all-edges-oriented (OCLL)
// cases are named. Tables are built lazily from the algorithms below, so the
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

// The seven cases with all four last-layer edges already oriented.
export const OCLL_ALGS = {
  "21 · H": "R U R' U R U' R' U R U2 R'",
  "22 · Pi": "R U2 R2 U' R2 U' R2 U2 R",
  "23 · Headlights": "R2 D R' U2 R D' R' U2 R'",
  "24 · T": "r U R' U' r' F R F'",
  "25 · Bowtie": "F' r U R' U' r' F R",
  "26 · Antisune": "R U2 R' U' R U' R'",
  "27 · Sune": "R U R' U R U2 R'",
};

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
let ocllTable = null;

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

export function getOcllTable() {
  if (!ocllTable) ocllTable = buildTable(OCLL_ALGS, ollKey);
  return ocllTable;
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

  let name;
  if (shape === "cross") {
    const ocll = getOcllTable().get(key);
    name = ocll ? `OLL ${ocll}` : "OCLL";
  } else if (shape === "dot") name = "Dot OLL";
  else if (shape === "line") name = "Line OLL";
  else if (shape === "L") name = "L-shape OLL";
  else name = "OLL";

  return { name, edges: shape, skip: false, pattern };
}
