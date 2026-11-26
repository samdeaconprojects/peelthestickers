// src/components/PuzzleSVGs/ftoFaces.js
//
// Face Turning Octahedron sticker model, ported from the p5 sketch.
//
// faces[faceIndex][stickerIndex]. Faces: 0 U white, 1 L purple, 2 F green,
// 3 R red, 4 D yellow, 5 BL orange, 6 B blue, 7 BR gray. Opposite pairs are
// U/D, F/B, R/BL, L/BR (same as cubing.js / WCA-style FTO notation).
//
// Each face is a triangle drawn tip-up: sticker 0 is the top tip, 1-3 the
// middle row and 4-8 the bottom row (4 and 8 are the bottom-left /
// bottom-right tips). The front view (U, L, F, R) and back view
// (D, BL, B, BR) each show four faces around a shared vertex.
//
// Every move is an Up turn with the puzzle reoriented so the turning face is
// in the U slot, then reoriented back.

export const FTO_FACE_NAMES = [
  "white",
  "purple",
  "green",
  "red",
  "yellow",
  "orange",
  "blue",
  "gray",
];

// Where each face goes for the reorientation that brings it to the U slot:
// faces = REORIENT[move].map((i) => faces[i]), turn U, then undo it.
const REORIENT = {
  U: [0, 1, 2, 3, 4, 5, 6, 7],
  R: [3, 0, 1, 2, 5, 6, 7, 4],
  L: [1, 2, 3, 0, 7, 4, 5, 6],
  B: [6, 7, 4, 5, 2, 3, 0, 1],
  F: [2, 3, 0, 1, 6, 7, 4, 5],
  D: [4, 5, 6, 7, 0, 1, 2, 3],
  BR: [7, 4, 5, 6, 1, 2, 3, 0],
  BL: [5, 6, 7, 4, 3, 0, 1, 2],
};

// Clockwise U turn on the sticker model (faces mutated in place).
function turnUp(faces, prime) {
  const [u, l, r, b] = [faces[0], faces[1], faces[3], faces[6]];

  // U face stickers
  const face = u.slice();
  const order = prime ? [8, 3, 7, 6, 0, 2, 1, 5, 4] : [4, 6, 5, 1, 8, 7, 3, 2, 0];
  for (let i = 0; i < 9; i++) u[i] = face[order[i]];

  // The three five-sticker strips around U (L, R, B)
  const lIdx = [4, 5, 1, 2, 0];
  const rIdx = [0, 2, 3, 7, 8];
  const bIdx = [8, 7, 6, 5, 4];
  const ls = lIdx.map((i) => l[i]);
  const rs = rIdx.map((i) => r[i]);
  const bs = bIdx.map((i) => b[i]);
  const [newL, newR, newB] = prime ? [bs, ls, rs] : [rs, bs, ls];
  lIdx.forEach((idx, k) => (l[idx] = newL[k]));
  rIdx.forEach((idx, k) => (r[idx] = newR[k]));
  bIdx.forEach((idx, k) => (b[idx] = newB[k]));

  // The U-layer corner whose stickers sit on F / BR / BL
  const f = faces[2];
  const br = faces[7];
  const bl = faces[5];
  const corner = [f[0], br[4], bl[8]];
  [f[0], br[4], bl[8]] = prime
    ? [corner[2], corner[0], corner[1]]
    : [corner[1], corner[2], corner[0]];
}

function applyMove(faces, face, prime) {
  const map = REORIENT[face];
  if (!map) return faces;
  const rotated = map.map((i) => faces[i]);
  turnUp(rotated, prime);
  // turnUp mutates the sticker arrays in place, so the original face slots
  // already hold the result; nothing to rotate back.
  return faces;
}

export function parseFTOMove(token) {
  const m = /^(BR|BL|U|D|R|L|F|B)(2)?(')?$/.exec(String(token || "").trim());
  if (!m) return null;
  // Faces have three positions, so X2 = X' and X2' = X.
  const amount = (m[2] ? 2 : 1) * (m[3] ? -1 : 1);
  return { face: m[1], prime: ((amount % 3) + 3) % 3 === 2 };
}

export function getFTOFaces(scramble) {
  const faces = FTO_FACE_NAMES.map((color) => Array(9).fill(color));
  String(scramble || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      const move = parseFTOMove(token);
      if (move) applyMove(faces, move.face, move.prime);
    });
  return faces;
}
