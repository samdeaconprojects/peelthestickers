// src/smart/recon/analyze.js
//
// Turns a smart-cube solve (start state + timestamped moves) into a
// reconstruction: method steps (CFOP or Roux) with move ranges, timings and
// last-layer cases. Everything is judged in the cube's own frame (centres as
// the smart cube reports them), so it doesn't matter how the solver held the
// cube: the cross / blocks are found on whichever face they were built.

import {
  OPPOSITE,
  CORNERS,
  SOLVED,
  adjacentFaces,
  applyMove,
  centerOf,
  allOrientations,
  faceMapForRotation,
  isSolved,
  parseToken,
  pieceHome,
  piecesTouching,
  rotationBringing,
} from "./cube3";
import { describeOll, recognizePll, withBottomOn } from "./lastLayer";
import { buildDisplay, displayFaceAfter } from "./display";

export const FACE_COLOURS = {
  U: "white",
  D: "yellow",
  F: "green",
  B: "blue",
  R: "red",
  L: "orange",
};

const turn = (state, face, amount) => (amount ? applyMove(state, { base: face, amount }) : state);

// ---- CFOP ---------------------------------------------------------------------

function cfopModel(bottom) {
  const top = OPPOSITE[bottom];
  const sides = adjacentFaces(bottom);
  const crossEdges = piecesTouching([bottom], "edge");
  const slots = [];
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const a = sides[i];
      const b = sides[j];
      if (OPPOSITE[a] === b) continue;
      slots.push({
        faces: [a, b],
        corner: piecesTouching([bottom, a, b], "corner")[0],
        edge: piecesTouching([a, b], "edge")[0],
      });
    }
  }
  const topIdx = [];
  const t0 = "URFDLB".indexOf(top) * 9;
  for (let i = 0; i < 9; i++) topIdx.push(t0 + i);
  return { bottom, top, crossEdges, slots, topIdx };
}

function crossAligned(state, m) {
  return m.crossEdges.every((e) => pieceHome(state, e));
}

function crossDone(state, m) {
  for (let d = 0; d < 4; d++) {
    if (crossAligned(turn(state, m.bottom, d), m)) return true;
  }
  return false;
}

function solvedSlots(state, m) {
  const out = [];
  m.slots.forEach((s, i) => {
    if (pieceHome(state, s.corner) && pieceHome(state, s.edge)) out.push(i);
  });
  return out;
}

function topOriented(state, m) {
  const c = centerOf(state, m.top);
  return m.topIdx.every((i) => state[i] === c);
}

function firstFrom(states, from, pred) {
  for (let k = Math.max(0, from); k < states.length; k++) if (pred(states[k], k)) return k;
  return -1;
}

function analyzeCfopFor(states, bottom, moveFaces) {
  const m = cfopModel(bottom);
  const ends = [];

  let crossEnd = firstFrom(states, 0, (s) => crossDone(s, m));
  if (crossEnd < 0) return { bottom, model: m, ends, score: 0, f2lEnd: Infinity, crossEnd: Infinity };
  // The cross is built relative to itself; a closing turn of the bottom layer
  // that lines it up with the centres still belongs to the cross.
  while (crossEnd < moveFaces.length && moveFaces[crossEnd] === bottom && !crossAligned(states[crossEnd], m)) {
    crossEnd += 1;
  }
  ends.push({ key: "cross", end: crossEnd });

  let prev = crossEnd;
  let prevSlots = solvedSlots(states[crossEnd], m);
  for (let n = 1; n <= 4; n++) {
    const end = firstFrom(
      states,
      prev,
      (s) => crossAligned(s, m) && solvedSlots(s, m).length >= n
    );
    if (end < 0) break;
    const nowSlots = solvedSlots(states[end], m);
    const before = prevSlots;
    const added = nowSlots.filter((i) => !before.includes(i));
    ends.push({ key: `pair${n}`, end, slots: added.map((i) => m.slots[i].faces) });
    prev = end;
    prevSlots = nowSlots;
  }

  if (ends.length === 5) {
    const f2lOk = (s) => crossAligned(s, m) && solvedSlots(s, m).length === 4;
    const ollEnd = firstFrom(states, prev, (s) => f2lOk(s) && topOriented(s, m));
    if (ollEnd >= 0) {
      ends.push({ key: "oll", end: ollEnd });
      const pllEnd = firstFrom(states, ollEnd, (s) => isSolved(s));
      if (pllEnd >= 0) ends.push({ key: "pll", end: pllEnd });
    }
  }

  const f2lEnd = ends.length >= 5 ? ends[4].end : Infinity;
  return { bottom, model: m, ends, score: ends.length, f2lEnd, crossEnd };
}

function analyzeCfop(states, moveFaces) {
  let best = null;
  for (const bottom of "URFDLB") {
    const r = analyzeCfopFor(states, bottom, moveFaces);
    if (
      !best ||
      r.score > best.score ||
      (r.score === best.score && r.f2lEnd < best.f2lEnd) ||
      (r.score === best.score && r.f2lEnd === best.f2lEnd && r.crossEnd < best.crossEnd)
    ) {
      best = r;
    }
  }
  return best;
}

// ---- Roux ---------------------------------------------------------------------

function blockPieces(side, bottom) {
  const others = adjacentFaces(side).filter((f) => f !== bottom && f !== OPPOSITE[bottom]);
  return [
    ...[bottom, ...others].map((f) => piecesTouching([side, f], "edge")[0]),
    ...others.map((f) => piecesTouching([side, bottom, f], "corner")[0]),
  ];
}

// Blocks live in the L/R-style layer of `side`, so an M-slice offset just turns
// that layer relative to the centres: a block counts if some turn of its layer
// lines it up.
function blockAlignment(state, side, pieces) {
  for (let k = 0; k < 4; k++) {
    const s = turn(state, side, k);
    if (pieces.every((p) => pieceHome(s, p))) return k;
  }
  return -1;
}

function analyzeRouxFor(states, side, bottom, moveFaces = []) {
  const other = OPPOSITE[side];
  const pa = blockPieces(side, bottom);
  const pb = blockPieces(other, bottom);
  const ends = [];

  const doneA = (s) => blockAlignment(s, side, pa) >= 0;
  const doneB = (s) => blockAlignment(s, other, pb) >= 0;

  const ea = firstFrom(states, 0, doneA);
  const eb = firstFrom(states, 0, doneB);
  if (ea < 0 && eb < 0) return { side, bottom, ends, score: 0, sbEnd: Infinity };

  const fbSide = eb >= 0 && (ea < 0 || eb < ea) ? other : side;
  const fbEnd = fbSide === side ? ea : eb;
  const fbAlign = blockAlignment(states[fbEnd], fbSide, fbSide === side ? pa : pb);
  ends.push({ key: "fb", end: fbEnd });

  const bothDone = (s) => doneA(s) && doneB(s);
  let sbEnd = firstFrom(states, fbEnd, bothDone);
  if (sbEnd >= 0) {
    // Like the cross: a closing turn of the second block's layer that brings it
    // level with the first block still belongs to the second block. (The
    // blocks' layers turn in opposite senses, so level means ka + kb = 0.)
    const sbSide = fbSide === side ? other : side;
    const level = (s) => (blockAlignment(s, side, pa) + blockAlignment(s, other, pb)) % 4 === 0;
    while (sbEnd < moveFaces.length && moveFaces[sbEnd] === sbSide && !level(states[sbEnd])) sbEnd += 1;
    ends.push({ key: "sb", end: sbEnd });
    const cmllDone = (s) => {
      const ka = blockAlignment(s, side, pa);
      const kb = blockAlignment(s, other, pb);
      if (ka < 0 || kb < 0 || (ka + kb) % 4 !== 0) return false;
      const aligned = turn(turn(s, side, ka), other, kb);
      return CORNERS.every((c) => pieceHome(aligned, c));
    };
    const cmllEnd = firstFrom(states, sbEnd, cmllDone);
    if (cmllEnd >= 0) {
      ends.push({ key: "cmll", end: cmllEnd });
      const lseEnd = firstFrom(states, cmllEnd, (s) => isSolved(s));
      if (lseEnd >= 0) ends.push({ key: "lse", end: lseEnd });
    }
  }

  return {
    side: fbSide,
    bottom,
    ends,
    score: ends.length,
    sbEnd: sbEnd >= 0 ? sbEnd : Infinity,
    fbEnd,
    fbAlign,
  };
}

function analyzeRoux(states, moveFaces) {
  let best = null;
  for (const side of ["L", "F", "U"]) {
    for (const bottom of adjacentFaces(side)) {
      const r = analyzeRouxFor(states, side, bottom, moveFaces);
      if (
        !best ||
        r.score > best.score ||
        (r.score === best.score && r.sbEnd < best.sbEnd) ||
        (r.score === best.score && r.sbEnd === best.sbEnd && r.fbEnd < best.fbEnd)
      ) {
        best = r;
      }
    }
  }
  return best;
}

// The first block is held at DL when it's finished. Its layer can be offset
// from the centres (an M-slice offset), so find where the block itself sits,
// then the hold that puts it at DL once the first block's moves are displayed.
const SIDE_ROTATION = { R: "x", L: "x'", U: "y", D: "y'", F: "z", B: "z'" };
function rouxRotation(ms, fbStep, pick) {
  const undo = (4 - (pick.fbAlign || 0)) % 4;
  const turn = Array(undo).fill(SIDE_ROTATION[pick.side]).join(" ");
  const blockBottom = turn ? faceMapForRotation(turn)[pick.bottom] : pick.bottom;
  const candidates = allOrientations().sort((a, b) => a.split(" ").length - b.split(" ").length);
  for (const rot of candidates) {
    if (
      displayFaceAfter(ms, [fbStep], rot, blockBottom) === "D" &&
      displayFaceAfter(ms, [fbStep], rot, pick.side) === "L"
    ) {
      return rot;
    }
  }
  return rotationBringing(pick.bottom, "D", pick.side, "L") ?? "";
}

// ---- assembly -----------------------------------------------------------------

const LABELS = {
  cross: "Cross",
  pair1: "F2L 1",
  pair2: "F2L 2",
  pair3: "F2L 3",
  pair4: "F2L 4",
  oll: "OLL",
  pll: "PLL",
  fb: "First block",
  sb: "Second block",
  cmll: "CMLL",
  lse: "LSE",
};

export const STEP_GROUP = {
  cross: "cross",
  pair1: "f2l",
  pair2: "f2l",
  pair3: "f2l",
  pair4: "f2l",
  oll: "oll",
  pll: "pll",
  fb: "fb",
  sb: "sb",
  cmll: "cmll",
  lse: "lse",
};

// F2L pairs finished on the same move as the step before them fold into it
// (XCross, "F2L 2+3"), so no step shows zero moves except a real LL skip.
function foldFreePairs(ends) {
  const out = [];
  for (const e of ends) {
    const prev = out[out.length - 1];
    if (prev && e.key.startsWith("pair") && e.end === prev.end) {
      prev.extraPairs = (prev.extraPairs || 0) + 1;
      prev.slots = [...(prev.slots || []), ...(e.slots || [])];
      prev.foldedKeys = [...(prev.foldedKeys || []), e.key];
      continue;
    }
    out.push({ ...e });
  }
  return out.map((e) => {
    let label = LABELS[e.key];
    if (e.extraPairs) {
      if (e.key === "cross") label = `${"X".repeat(e.extraPairs)}Cross`;
      else {
        const n = Number(e.key.slice(4));
        label = `F2L ${Array.from({ length: e.extraPairs + 1 }, (_, i) => n + i).join("+")}`;
      }
    }
    return { ...e, label };
  });
}

function normaliseMoves(moves) {
  const out = [];
  for (const m of moves || []) {
    const token = String(m?.move ?? m?.m ?? "").trim();
    const p = parseToken(token);
    if (!p || !/^[URFDLB]$/.test(p.base) || !p.amount) continue;
    const t = Number(m?.t);
    out.push({ move: token, face: p.base, amount: p.amount, t: Number.isFinite(t) ? t : null });
  }
  // Fill missing timestamps by carrying the last known one forward.
  let last = 0;
  for (const m of out) {
    if (m.t == null) m.t = last;
    last = m.t;
  }
  return out;
}

/**
 * @param {object} input
 * @param {string} input.startState  54-char facelets before the first move
 * @param {Array<{move:string,t:number}>} input.moves  cube-frame moves, t = ms from first move
 * @param {string} [input.method]  the Method tag: "CFOP" | "Roux" | anything else = auto
 * @param {boolean} [input.force]  analyse as `method` even if the solve looks like another
 * @param {boolean} [input.timingsOnly]  skip notation and last-layer cases
 *   (step keys and times only; used to compare many solves cheaply)
 */
export function analyzeSolve({ startState, moves, method, timingsOnly = false, force = false } = {}) {
  const ms = normaliseMoves(moves);
  if (!ms.length) return null;
  const start = startState && String(startState).length === 54 ? String(startState) : null;
  if (!start) return null;

  const states = [start];
  for (const m of ms) states.push(applyMove(states[states.length - 1], m.move));
  const endsSolved = isSolved(states[states.length - 1]);

  // `method` is the solve's Method tag (a hint). The solve itself decides:
  // Roux finishes both blocks long before a cross exists; CFOP builds its
  // cross before any 1x2x3 block can be complete. A tag that disagrees with
  // that (a Roux solve in a CFOP-tagged session) is reported, not followed,
  // unless `force` is set.
  const wanted = String(method || "").trim().toLowerCase();
  const tagged = wanted === "cfop" ? "CFOP" : wanted === "roux" ? "Roux" : null;
  const faces = ms.map((m) => m.face);
  const cfop = analyzeCfop(states, faces);
  const roux = analyzeRoux(states, faces);
  const cfopCross = cfop?.score ? cfop.crossEnd : Infinity;
  const rouxFirst = !!roux && roux.score >= 2 && roux.sbEnd < cfopCross;
  const detected = rouxFirst ? "Roux" : cfop?.score ? "CFOP" : null;
  let chosen = tagged && (force || !detected) ? tagged : detected || "CFOP";
  const methodMismatch = !!(tagged && detected && tagged !== detected);

  const pick = chosen === "Roux" ? roux : cfop;
  const rawEnds = pick?.ends || [];
  const ends = chosen === "CFOP" ? foldFreePairs(rawEnds) : rawEnds.map((e) => ({ ...e, label: LABELS[e.key] }));

  // Orientation used to display moves: cross / block bottom on D, and for Roux
  // the first block on the left.
  let rotation = "";
  let bottom = null;
  if (chosen === "CFOP" && pick?.score) {
    bottom = pick.bottom;
    rotation = rotationBringing(bottom, "D", "F", "F") ?? rotationBringing(bottom, "D") ?? "";
  } else if (chosen === "Roux" && pick?.score) {
    bottom = pick.bottom;
  }

  // Step ranges [from, to) over the raw move list.
  const steps = [];
  let from = 0;
  for (const e of ends) {
    steps.push({
      key: e.key,
      // Every step this one covers (an XCross is cross + pair1).
      keys: [e.key, ...(e.foldedKeys || [])],
      label: e.label,
      from,
      to: e.end,
      slots: e.slots || null,
      // CFOP solvers rotate (y) freely; Roux keeps its hold.
      autoRotate: chosen === "CFOP",
      wideLeft: chosen === "Roux" && e.key !== "fb",
    });
    from = e.end;
  }
  if (from < ms.length || !steps.length) {
    steps.push({
      key: steps.length ? "rest" : "solve",
      label: steps.length ? (endsSolved ? "Finish" : "Unfinished") : "Solve",
      from,
      to: ms.length,
    });
  }

  // Last-layer cases.
  if (chosen === "CFOP" && bottom && !timingsOnly) {
    for (const s of steps) {
      if (s.key === "oll") {
        const ll = withBottomOn(states[s.from], bottom);
        s.oll = describeOll(ll);
        s.caseName = s.oll.skip ? "skip" : s.oll.name;
      }
      if (s.key === "pll") {
        const ll = withBottomOn(states[s.from], bottom);
        const name = recognizePll(ll);
        s.caseName = name === "skip" ? "skip" : name ? `${name} perm` : null;
      }
    }
  }

  // Timings: t is ms since the first move (the timer starts on that move).
  const t = ms.map((m) => m.t);
  for (const s of steps) {
    const n = s.to - s.from;
    const prevLast = s.from > 0 ? t[s.from - 1] : 0;
    s.moveCount = n;
    if (n > 0) {
      s.startMs = t[s.from];
      s.endMs = t[s.to - 1];
      s.recognitionMs = s.from > 0 ? Math.max(0, t[s.from] - prevLast) : 0;
      s.executionMs = Math.max(0, t[s.to - 1] - t[s.from]);
      s.durationMs = Math.max(0, t[s.to - 1] - prevLast);
    } else {
      s.startMs = prevLast;
      s.endMs = prevLast;
      s.recognitionMs = 0;
      s.executionMs = 0;
      s.durationMs = 0;
    }
    s.group = STEP_GROUP[s.key] || "other";
  }

  const methodInfo = {
    detectedMethod: detected,
    taggedMethod: tagged,
    // The tag says one method, the moves say another.
    methodMismatch: methodMismatch && !force,
  };

  if (timingsOnly) {
    return {
      method: pick?.score ? chosen : null,
      ...methodInfo,
      steps,
      totalMs: t[t.length - 1] || 0,
      solved: endsSolved,
    };
  }

  if (chosen === "Roux" && pick?.score) rotation = rouxRotation(ms, steps[0], pick);

  const display = buildDisplay(ms, steps, rotation);
  steps.forEach((s, i) => {
    s.tokens = display.steps[i];
    s.stm = s.tokens.filter((x) => !x.rotation).length;
    s.tps = s.executionMs > 0 ? (s.stm / (s.durationMs / 1000)) : null;
  });

  const totalMs = t[t.length - 1] || 0;
  const totalStm = steps.reduce((a, s) => a + s.stm, 0);

  return {
    method: pick?.score ? chosen : null,
    ...methodInfo,
    bottom,
    bottomColour: bottom ? FACE_COLOURS[centerOf(SOLVED, bottom)] : null,
    rotation,
    steps,
    totalMs,
    moveCount: ms.length,
    stm: totalStm,
    tps: totalMs > 0 ? totalStm / (totalMs / 1000) : null,
    solved: endsSolved,
    displayAlg: display.alg,
  };
}

/** Plain-text reconstruction, one line per step, alg.cubing.net style comments. */
export function reconstructionText(analysis, scramble = "") {
  if (!analysis) return "";
  const lines = [];
  if (scramble) lines.push(String(scramble).trim(), "");
  if (analysis.rotation) lines.push(`${analysis.rotation} // inspection`);
  for (const s of analysis.steps) {
    const moves = s.tokens.map((x) => x.text).join(" ");
    const label = s.caseName && s.caseName !== "skip" ? `${s.label} (${s.caseName})` : s.caseName === "skip" ? `${s.label} skip` : s.label;
    lines.push(`${moves}${moves ? " " : ""}// ${label}`);
  }
  return lines.join("\n");
}
