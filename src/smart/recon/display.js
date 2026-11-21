// src/smart/recon/display.js
//
// Cube-frame quarter turns -> readable notation, the way a human would write
// the solve down:
//   * held orientation: moves are relabelled through a rotation (e.g. z2 so
//     the cross is on D),
//   * R R -> R2 when the two turns come in quick succession,
//   * opposite faces turned together in opposite directions -> slice move:
//     a smart cube reports a physical M as R L' (it measures against its
//     centres, which the M slice carries). After a slice the centres have moved,
//     so later moves are relabelled through the new orientation.

import { SOLVED, applyMove, applyAlg, centerOf, formatToken } from "./cube3";

// Two turns of the same face this close together are one double turn.
const DOUBLE_GAP_MS = 260;
// Opposite faces this close together are one slice (or simultaneous) turn.
const SLICE_GAP_MS = 120;

const AXIS = { R: "x", L: "x", U: "y", D: "y", F: "z", B: "z" };
const POSITIVE = { x: "R", y: "U", z: "F" };
const NEGATIVE = { x: "L", y: "D", z: "B" };
// Slice name and direction for "positive face a, negative face -a", and the
// rotation the centres undergo (see file header):
//   R L' = M  (centres x'),  U D' = E  (centres y'),  F B' = S'  (centres z')
const SLICE = {
  x: { name: "M", sign: 1, rot: "x" },
  y: { name: "E", sign: 1, rot: "y" },
  z: { name: "S", sign: -1, rot: "z" },
};

const mod4 = (n) => ((n % 4) + 4) % 4;

class Frame {
  constructor(rotation) {
    this.centres = rotation ? applyAlg(SOLVED, rotation) : SOLVED;
  }

  // Where the centre of cube-frame face `face` currently sits.
  displayFace(face) {
    for (const f of "URFDLB") if (centerOf(this.centres, f) === face) return f;
    return face;
  }

  rotate(base, amount) {
    this.centres = applyMove(this.centres, { base, amount: mod4(amount) });
  }
}

function emitGroup(group, frame, out, opts = {}) {
  const axis = AXIS[group[0].dface];
  const pos = POSITIVE[axis];
  const negf = NEGATIVE[axis];
  let a = 0;
  let b = 0;
  for (const g of group) {
    if (g.dface === pos) a += g.amount;
    else b += g.amount;
  }
  a = mod4(a);
  b = mod4(b);
  const last = group[group.length - 1];
  const raw = group.map((g) => g.index);

  const push = (text) => out.push({ text, t: last.t, raw });

  if (a === 0 && b === 0) {
    // Turned and turned back (e.g. a misfire): keep what actually happened.
    for (const g of group) out.push({ text: formatToken(g.dface, g.amount), t: g.t, raw: [g.index] });
    return;
  }
  // Roux after the first block: the left block is never turned, so a left-layer
  // turn is really r (R + M), which the cube reports as L plus moved centres.
  if (opts.wideLeft && axis === "x" && a === 0 && b) {
    push(formatToken("r", b));
    frame.rotate("x", b);
    return;
  }
  if (a && b && mod4(a + b) === 0) {
    const sl = SLICE[axis];
    push(formatToken(sl.name, sl.sign * a));
    frame.rotate(sl.rot, -a);
    return;
  }
  // Single face, or both faces turned the same way: list them in order.
  const firstFace = group[0].dface;
  const order = firstFace === pos ? [[pos, a], [negf, b]] : [[negf, b], [pos, a]];
  for (const [face, amt] of order) if (amt) push(formatToken(face, amt));
}

function stepTokens(moves, step, frame) {
  const opts = { wideLeft: !!step.wideLeft };
  const out = [];
  let group = [];
  for (let i = step.from; i < step.to; i++) {
    const m = moves[i];
    const cur = { index: i, dface: frame.displayFace(m.face), amount: m.amount, t: m.t };
    const prev = group[group.length - 1];
    const joins =
      prev &&
      AXIS[prev.dface] === AXIS[cur.dface] &&
      ((cur.dface === prev.dface && cur.t - prev.t <= DOUBLE_GAP_MS) ||
        (cur.dface !== prev.dface && cur.t - prev.t <= SLICE_GAP_MS));
    if (prev && !joins) {
      emitGroup(group, frame, out, opts);
      group = [];
      // The frame may have changed: relabel this move with the new one.
      cur.dface = frame.displayFace(m.face);
    }
    group.push(cur);
  }
  if (group.length) emitGroup(group, frame, out, opts);
  return out;
}

// Back-face turns are rare on purpose: a run of them means the solver turned
// the cube (y) first. Left-hand and front turns cost a little so that, between
// otherwise equal holds, the R/U form wins — but a genuine L U L' insert never
// outweighs the cost of a rotation.
const AWKWARD = { B: 3, D: 1, L: 0.5, F: 0.25 };
const ROTATION_COST = 2.5;
function awkwardness(tokens) {
  let score = 0;
  for (const t of tokens) score += AWKWARD[t.text[0]] || 0;
  return score;
}

const Y_OPTIONS = [
  { text: "", amount: 0, cost: 0 },
  { text: "y", amount: 1, cost: ROTATION_COST },
  { text: "y'", amount: 3, cost: ROTATION_COST },
  { text: "y2", amount: 2, cost: ROTATION_COST * 1.4 },
];
const NO_ROTATION = [Y_OPTIONS[0]];

/**
 * @param moves  [{ face, amount, t }] cube-frame turns
 * @param steps  [{ from, to, autoRotate?, wideLeft? }] ranges over `moves`.
 *               autoRotate steps may get a y in front; the set of rotations is
 *               chosen over the whole solve (cheapest total), not step by step,
 *               since every rotation changes how all later moves read.
 * @param rotation  initial orientation, e.g. "z2"
 * @returns {{ steps: Array<Array<{text,t,raw,rotation?}>>, alg: string, frame: Frame }}
 */
export function buildDisplay(moves, steps, rotation = "") {
  let layer = new Map();
  const first = new Frame(rotation);
  layer.set(first.centres, { cost: 0, perStep: [], centres: first.centres });

  for (const step of steps) {
    const next = new Map();
    const options = step.autoRotate && step.to > step.from ? Y_OPTIONS : NO_ROTATION;
    for (const node of layer.values()) {
      for (const opt of options) {
        const frame = new Frame("");
        frame.centres = node.centres;
        if (opt.amount) frame.rotate("y", opt.amount);
        const tokens = stepTokens(moves, step, frame);
        const out = opt.text
          ? [{ text: opt.text, t: moves[step.from].t, raw: [], rotation: true }, ...tokens]
          : tokens;
        const cost = node.cost + awkwardness(tokens) + opt.cost;
        const prev = next.get(frame.centres);
        if (!prev || cost < prev.cost) {
          next.set(frame.centres, { cost, perStep: [...node.perStep, out], centres: frame.centres });
        }
      }
    }
    layer = next;
  }

  let best = null;
  for (const node of layer.values()) if (!best || node.cost < best.cost) best = node;
  const frame = new Frame("");
  frame.centres = best.centres;
  const perStep = best.perStep;
  const alg = [rotation, ...perStep.flat().map((x) => x.text)].filter(Boolean).join(" ");
  return { steps: perStep, alg, frame };
}

/** Where cube-frame face `face` is held after displaying `steps` from `rotation`. */
export function displayFaceAfter(moves, steps, rotation, face) {
  return buildDisplay(moves, steps, rotation).frame.displayFace(face);
}
