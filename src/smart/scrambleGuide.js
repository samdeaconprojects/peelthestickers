// src/smart/scrambleGuide.js
//
// Follows a smart cube through a scramble by state, not by matching moves one
// by one, so a wrong turn never loses the user's place:
//
//   * after every turn, if the cube is at a point along the scramble (after a
//     whole number of tokens, or halfway through a double turn) that is the
//     progress — however it got there;
//   * otherwise the fix is the shortest sequence (up to 3 turns) from the
//     cube's actual state to any point along the scramble, and progress shows
//     where that lands. That point can be past where the user went wrong: if a
//     stray turn commutes with the next scramble move (L instead of R2, then
//     R2 anyway), the fix is just L' after the R2, not "undo R2, undo L";
//   * a longer detour falls back to undoing the turns since the last on-track
//     point (simplified: R R -> R2, R R' -> nothing, opposite faces commute).
//
// Progress is in quarter-turn steps (a double counts 2), matching the
// scramble display.
//
// A fix never stops halfway through a double: the display can't show "one
// quarter of U2 done", so a user put back there would do the whole U2 again
// and end up halfway the other way round. The fix carries on to finish the
// double instead (and landing back there after a detour asks for the last
// quarter).

import { SOLVED, applyMove, formatToken, parseToken, tokenizeAlg } from "./recon/cube3";

const AXIS = { U: "y", D: "y", R: "x", L: "x", F: "z", B: "z" };
const mod4 = (n) => ((n % 4) + 4) % 4;

/** Add `move` to a simplified move list (mutates and returns `list`). */
export function pushSimplified(list, move) {
  const p = parseToken(move);
  if (!p || !AXIS[p.base]) return list;
  // Walk back over turns on the same axis (they commute) looking for the same face.
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    if (AXIS[q.base] !== AXIS[p.base]) break;
    if (q.base === p.base) {
      const amount = mod4(q.amount + p.amount);
      if (amount) list[i] = { base: q.base, amount };
      else list.splice(i, 1);
      return list;
    }
  }
  list.push({ base: p.base, amount: p.amount });
  return list;
}

const fixFor = (detour) =>
  detour
    .slice()
    .reverse()
    .map((m) => formatToken(m.base, 4 - m.amount));

const SEARCH_MOVES = [];
for (const base of "URFDLB") for (const amount of [1, 2, 3]) SEARCH_MOVES.push({ base, amount });
const SEARCH_DEPTH = 3;

export function createScrambleGuide(scramble, startState = SOLVED) {
  const tokens = tokenizeAlg(scramble)
    .map((t) => parseToken(t))
    .filter((p) => p && p.amount && AXIS[p.base]);

  // On-track states: after each whole token, and halfway through doubles.
  const checkpoints = []; // { state, steps }
  let s = startState && startState.length === 54 ? startState : SOLVED;
  let steps = 0;
  checkpoints.push({ state: s, steps });
  tokens.forEach((t) => {
    if (t.amount === 2) {
      for (const half of [1, 3]) {
        // `finish`: the quarter turn that completes the double from here.
        const finish = { base: t.base, amount: half };
        checkpoints.push({ state: applyMove(s, finish), steps: steps + 1, finish });
      }
    }
    s = applyMove(s, t);
    steps += t.amount === 2 ? 2 : 1;
    checkpoints.push({ state: s, steps });
  });
  const total = steps;
  const byState = new Map();
  for (const c of checkpoints) {
    if (!byState.has(c.state)) byState.set(c.state, []);
    byState.get(c.state).push(c);
  }

  let state = checkpoints[0].state;
  let anchorCp = checkpoints[0]; // the last on-track point
  let anchor = 0; // its steps
  let here = checkpoints[0]; // the checkpoint the cube is at, or null off track
  let detour = []; // simplified turns since then
  let progress = 0; // shown: where the user is, or where the fix lands
  let fix = [];

  // Fix moves (parsed) that land on checkpoint `c`, carried on to the end of
  // the double if `c` is halfway through one. Returns { moves, steps }.
  function finishDouble(moves, c) {
    if (!c.finish) return { moves, steps: c.steps };
    const out = moves.slice();
    const last = out[out.length - 1];
    if (last && last.base === c.finish.base) {
      const amount = mod4(last.amount + c.finish.amount);
      if (amount) out[out.length - 1] = { base: last.base, amount };
      else out.pop();
    } else {
      out.push(c.finish);
    }
    return { moves: out, steps: c.steps + 1 };
  }

  const nearest = (list, to) =>
    list.reduce((best, c) =>
      !best || Math.abs(c.steps - to) < Math.abs(best.steps - to) ? c : best
    , null);

  // Shortest way back onto the scramble from `from` (breadth-first, no two
  // turns of the same face in a row). Among equally short fixes, the one
  // landing nearest the last on-track point wins.
  function shortestFix(from) {
    let frontier = [{ state: from, path: [], last: null }];
    for (let depth = 1; depth <= SEARCH_DEPTH; depth++) {
      const next = [];
      let found = null;
      for (const node of frontier) {
        for (const m of SEARCH_MOVES) {
          if (m.base === node.last) continue;
          const st = applyMove(node.state, m);
          const path = [...node.path, m];
          const hits = byState.get(st);
          if (hits) {
            const c = nearest(hits, anchor);
            if (!found || Math.abs(c.steps - anchor) < Math.abs(found.c.steps - anchor)) {
              found = { c, path };
            }
          }
          if (depth < SEARCH_DEPTH) next.push({ state: st, path, last: m.base });
        }
      }
      if (found) return found;
      frontier = next;
    }
    return null;
  }

  const snapshot = () => ({
    progress,
    total,
    fix: fix.slice(),
    offTrack: fix.length > 0,
    complete: progress === total && fix.length === 0,
  });

  return {
    total,
    snapshot,
    /** Feed one turn as reported by the cube ("R", "U'", "F2"). */
    onMove(move) {
      const p = parseToken(move);
      if (!p || !p.amount || !AXIS[p.base]) return snapshot();
      state = applyMove(state, p);
      const prev = here;
      here = null;

      const hits = byState.get(state);
      if (hits) {
        // Back on track (possibly further along, or further back).
        const c = nearest(hits, progress);
        here = c;
        anchorCp = c;
        anchor = c.steps;
        detour = [];
        // Halfway through a double straight from its start: the user is doing
        // it and knows it. Got there any other way (the last move of a fix, or
        // turning back from the end of the double): ask for the quarter that
        // finishes it.
        const doingIt = prev && !prev.finish && prev.steps === c.steps - 1;
        if (c.finish && !doingIt) {
          const done = finishDouble([], c);
          progress = done.steps;
          fix = done.moves.map((m) => formatToken(m.base, m.amount));
        } else {
          progress = c.steps;
          fix = [];
        }
        return snapshot();
      }

      pushSimplified(detour, move);
      const found = shortestFix(state);
      const done = found
        ? finishDouble(found.path, found.c)
        : finishDouble(fixFor(detour).map((t) => parseToken(t)), anchorCp);
      progress = done.steps;
      fix = done.moves.map((m) => formatToken(m.base, m.amount));
      return snapshot();
    },
  };
}

/**
 * What the scramble display shows while the cube is off track. Fix moves the
 * user has already done stay on screen (marked done) instead of vanishing one
 * by one, and the whole fix clears once the cube is back on the scramble.
 *
 * `prev` is { moves, done } from the last call (or null); `fix` is the guide's
 * current fix. Returns the next { moves, done }.
 */
export function nextFixDisplay(prev, fix) {
  const next = Array.isArray(fix) ? fix.filter((m) => typeof m === "string" && m) : [];
  if (!next.length) return { moves: [], done: 0 };
  const moves = prev?.moves || [];
  const done = prev?.done || 0;
  const remaining = moves.slice(done);
  const same = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

  if (same(remaining, next)) return prev;
  // Did the next fix move: the fix is now what was left after it.
  if (remaining.length > 1 && same(remaining.slice(1), next)) {
    return { moves, done: done + 1 };
  }
  // Halfway through a double (R2 shown, one R done): keep showing R2.
  const head = parseToken(remaining[0] || "");
  const nh = parseToken(next[0]);
  if (
    head && nh && head.amount === 2 && nh.amount !== 2 && head.base === nh.base &&
    same(remaining.slice(1), next.slice(1))
  ) {
    return prev;
  }
  return { moves: next, done: 0 };
}
