// src/smart/recon/cube3.js
//
// 54-sticker 3x3 model in Kociemba facelet order (U R F D L B, 9 each), used by
// the reconstruction engine. Every move — face turns, wide turns, slices and
// whole-cube rotations — is a permutation of sticker positions, generated once
// from 3D coordinates, so states are plain 54-char strings of colour letters.
//
// A state's letters are colours, not positions: a solved cube held in the
// standard orientation is "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
// and a whole-cube rotation moves those letters around. "Solved" and "piece is
// home" are always judged against the centre stickers, never the letters.

export const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
export const FACES = "URFDLB";
export const CENTERS = [4, 13, 22, 31, 40, 49];
export const OPPOSITE = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

// Facelet indices of each corner / edge cubie (same layout as cubieCube.js).
export const CORNERS = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];
export const EDGES = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

export const faceOfIndex = (i) => FACES[Math.floor(i / 9)];

// ---- geometry -------------------------------------------------------------

const NORMALS = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

// (row, col) on a face's 3x3 grid -> cubie position, per the Kociemba net.
function stickerPosition(face, r, c) {
  switch (face) {
    case "U":
      return [c - 1, 1, r - 1];
    case "R":
      return [1, 1 - r, 1 - c];
    case "F":
      return [c - 1, 1 - r, 1];
    case "D":
      return [c - 1, -1, 1 - r];
    case "L":
      return [-1, 1 - r, c - 1];
    case "B":
      return [1 - c, 1 - r, -1];
    default:
      throw new Error(`bad face ${face}`);
  }
}

const STICKERS = [];
for (let f = 0; f < 6; f++) {
  const face = FACES[f];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      STICKERS.push({ pos: stickerPosition(face, r, c), normal: NORMALS[face] });
    }
  }
}

const keyOf = (pos, normal) => `${pos.join(",")}|${normal.join(",")}`;
const STICKER_INDEX = new Map(STICKERS.map((s, i) => [keyOf(s.pos, s.normal), i]));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Quarter turn clockwise as seen looking at the tip of `axis` from outside.
function rotateCW(v, axis) {
  const c = cross(axis, v);
  const d = dot(axis, v);
  return [0, 1, 2].map((k) => -c[k] + axis[k] * d);
}

// to[i] = where the sticker at position i ends up after one quarter turn of the
// layers selected by `inLayer` about `axis`.
function buildQuarterTurn(axis, inLayer) {
  const to = new Array(54);
  for (let i = 0; i < 54; i++) {
    const s = STICKERS[i];
    if (!inLayer(dot(s.pos, axis))) {
      to[i] = i;
      continue;
    }
    const j = STICKER_INDEX.get(keyOf(rotateCW(s.pos, axis), rotateCW(s.normal, axis)));
    to[i] = j;
  }
  return to;
}

// Base quarter turns. Depth is measured along the move's own axis (1 = the
// outer layer on the axis tip). A quarter turn is clockwise looking at the axis
// tip from outside, i.e. -90 degrees about the axis by the right-hand rule
// (x = R, y = U, z = F). Shared with the 3D renderer so it turns exactly the
// stickers the model moves.
const LAYER = {
  outer: (d) => d === 1,
  wide: (d) => d >= 0,
  middle: (d) => d === 0,
  all: () => true,
};
export const MOVE_GEOMETRY = {};
for (const face of FACES) {
  MOVE_GEOMETRY[face] = { axis: NORMALS[face], inLayer: LAYER.outer };
  MOVE_GEOMETRY[face.toLowerCase()] = { axis: NORMALS[face], inLayer: LAYER.wide };
}
MOVE_GEOMETRY.M = { axis: NORMALS.L, inLayer: LAYER.middle };
MOVE_GEOMETRY.E = { axis: NORMALS.D, inLayer: LAYER.middle };
MOVE_GEOMETRY.S = { axis: NORMALS.F, inLayer: LAYER.middle };
MOVE_GEOMETRY.x = { axis: NORMALS.R, inLayer: LAYER.all };
MOVE_GEOMETRY.y = { axis: NORMALS.U, inLayer: LAYER.all };
MOVE_GEOMETRY.z = { axis: NORMALS.F, inLayer: LAYER.all };

/** Sticker i's cubie position and outward normal (x = R, y = U, z = F). */
export const STICKER_GEOMETRY = STICKERS;
export const stickerIndexAt = (pos, normal) => STICKER_INDEX.get(keyOf(pos, normal));

const BASE = {};
for (const [base, g] of Object.entries(MOVE_GEOMETRY)) {
  BASE[base] = buildQuarterTurn(g.axis, g.inLayer);
}

function applyTo(state, to, times) {
  let s = state;
  for (let t = 0; t < times; t++) {
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[to[i]] = s[i];
    s = out;
  }
  return s;
}

// ---- notation ---------------------------------------------------------------

const TOKEN_RE = /^([URFDLBurfdlbMESxyz])(w?)(\d*)('?)$/;

/** Parse one token ("R", "U2", "Rw'", "r", "M2'", "x") -> { base, amount } | null. */
export function parseToken(token) {
  const t = String(token || "").replace(/[’‘`]/g, "'").trim();
  const m = TOKEN_RE.exec(t);
  if (!m) return null;
  let base = m[1];
  if (m[2]) {
    if (!/[URFDLB]/.test(base)) return null;
    base = base.toLowerCase();
  }
  const n = m[3] ? parseInt(m[3], 10) : 1;
  if (!Number.isFinite(n)) return null;
  let amount = ((n % 4) + 4) % 4;
  if (m[4]) amount = (4 - amount) % 4;
  return { base, amount };
}

/** Split an alg string into tokens, dropping brackets and // comments. */
export function tokenizeAlg(alg) {
  return String(alg || "")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/[()[\]]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formatToken(base, amount) {
  const a = ((amount % 4) + 4) % 4;
  if (a === 0) return "";
  return base + (a === 2 ? "2" : a === 3 ? "'" : "");
}

export function invertToken(token) {
  const p = parseToken(token);
  if (!p) return token;
  return formatToken(p.base, 4 - p.amount);
}

export function invertAlg(alg) {
  return tokenizeAlg(alg).reverse().map(invertToken).filter(Boolean).join(" ");
}

/** Apply one move token to a state string. Unknown tokens are ignored. */
export function applyMove(state, token) {
  const p = typeof token === "string" ? parseToken(token) : token;
  if (!p || !BASE[p.base] || !p.amount) return state;
  const out = applyTo(state.split(""), BASE[p.base], p.amount);
  return out.join("");
}

export function applyAlg(state, alg) {
  let s = state;
  for (const t of Array.isArray(alg) ? alg : tokenizeAlg(alg)) s = applyMove(s, t);
  return s;
}

// ---- state predicates ---------------------------------------------------------

export const centerOf = (state, face) => state[CENTERS[FACES.indexOf(face)]];

/** Sticker i shows the colour of the centre on its own face. */
export const stickerHome = (state, i) => state[i] === state[CENTERS[Math.floor(i / 9)]];

export const pieceHome = (state, stickers) => stickers.every((i) => stickerHome(state, i));

export function isSolved(state) {
  if (!state || state.length !== 54) return false;
  for (let i = 0; i < 54; i++) if (!stickerHome(state, i)) return false;
  return true;
}

/** Corner/edge facelet lists for the pieces touching every face in `faces`. */
export function piecesTouching(faces, kind) {
  const list = kind === "corner" ? CORNERS : EDGES;
  return list.filter((p) => {
    const fs = p.map(faceOfIndex);
    return faces.every((f) => fs.includes(f));
  });
}

/** Faces adjacent to `face` (the four that are neither it nor its opposite). */
export function adjacentFaces(face) {
  return FACES.split("").filter((f) => f !== face && f !== OPPOSITE[face]);
}

// ---- orientations -------------------------------------------------------------

// Rotation sequences of length <= 2 (shortest first); together they reach all
// 24 whole-cube orientations.
const ROT_TOKENS = ["y", "y'", "y2", "z", "z'", "z2", "x", "x'", "x2"];
const ORIENTATION_ALGS = (() => {
  const out = [""];
  for (const a of ROT_TOKENS) out.push(a);
  for (const a of ROT_TOKENS) for (const b of ROT_TOKENS) out.push(`${a} ${b}`);
  return out;
})();

/**
 * Where each face's centre ends up after `rotationAlg`:
 * returns { U: "D", ... } meaning "the old U centre now sits on the D face".
 */
export function faceMapForRotation(rotationAlg) {
  const s = applyAlg(SOLVED, rotationAlg);
  const map = {};
  for (const face of FACES) {
    const at = FACES.split("").find((f) => centerOf(s, f) === face);
    map[face] = at;
  }
  return map;
}

/** Shortest rotation that brings face `from` to `to` (and, if given, `from2` to `to2`). */
export function rotationBringing(from, to, from2 = null, to2 = null) {
  let best = null;
  for (const alg of ORIENTATION_ALGS) {
    const map = faceMapForRotation(alg);
    if (map[from] !== to) continue;
    if (from2 && map[from2] !== to2) continue;
    const len = alg ? alg.split(" ").length : 0;
    if (!best || len < best.len) best = { alg, len };
  }
  return best ? best.alg : null;
}

/** One rotation sequence per distinct whole-cube orientation (24). */
export function allOrientations() {
  const seen = new Set();
  const out = [];
  for (const alg of ORIENTATION_ALGS) {
    const key = applyAlg(SOLVED, alg);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alg);
  }
  return out;
}
