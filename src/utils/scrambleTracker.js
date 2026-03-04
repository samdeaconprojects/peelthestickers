// src/utils/scrambleTracker.js

// Move parsing:
// "L"  => { face:"L", dir:+1 }
// "L'" => { face:"L", dir:-1 }
// "L2" => { face:"L", dir:0, double:true }  (dir=0 means direction chosen at runtime)
export function parseMove(m) {
  const s = String(m || "").trim();
  if (!s) return null;

  // Take first character as face (simple R L U D F B).
  // If your cube emits wide moves later (Rw, etc), we can extend this.
  const face = s[0].toUpperCase();
  const suf = s.slice(1);

  if (suf === "2") return { face, dir: 0, double: true };
  if (suf === "'") return { face, dir: -1, double: false };
  return { face, dir: +1, double: false };
}

export function moveToString(move) {
  if (!move) return "";
  if (move.double) return `${move.face}2`;
  if (move.dir === -1) return `${move.face}'`;
  return `${move.face}`;
}

export function inverseMove(move) {
  if (!move) return null;
  if (move.double) return { ...move }; // inverse of 180 is itself
  // dir=0 means "either direction"; inverse is still "either direction"
  if (move.dir === 0) return { ...move };
  return { ...move, dir: move.dir === 1 ? -1 : 1 };
}

// When expected.dir === 0, either direction is accepted (used for X2 steps)
function matchesExpected(actual, expected) {
  if (!actual || !expected) return false;
  if (actual.face !== expected.face) return false;
  if (expected.dir === 0) return true;
  return actual.dir === expected.dir;
}

/**
 * Expand scramble into STEP expectations.
 *
 * For normal tokens: "L" or "L'" => one step with direction
 * For "L2": two steps with dir=0, AND we tag them with a pairId so we can lock
 * direction based on the first physical turn:
 *   - First step of pair picks dir (+1 or -1)
 *   - Second step of pair must match same dir
 */
export function expandScrambleToExpectedSteps(scramble) {
  const tokens = String(scramble || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const steps = [];
  let pairCounter = 0;

  for (const tok of tokens) {
    const t = parseMove(tok);
    if (!t) continue;

    if (t.double) {
      const pairId = `p${pairCounter++}`;

      steps.push({ face: t.face, dir: 0, double: false, pairId, pairIndex: 0 });
      steps.push({ face: t.face, dir: 0, double: false, pairId, pairIndex: 1 });
    } else {
      steps.push({ face: t.face, dir: t.dir, double: false, pairId: null });
    }
  }
  return steps;
}

/**
 * Adaptive scramble tracker:
 * - progress: how many expected steps are satisfied
 * - debt: stack of moves that must be undone to get back on track (top = next required undo)
 *
 * Key behaviors:
 * - If on track and move matches next expected step => progress++
 * - If on track and move is inverse of previous correct step => progress-- (nice UX)
 *   BUT: we disable this for dir=0 ("X2") steps because inverse is ambiguous and causes resets.
 * - For X2 steps: lock direction on the first move of the pair; second must match.
 * - Else (wrong move) => push inverse(move) onto debt (now user must undo)
 * - If in debt:
 *    - if move matches required undo => pop debt
 *    - else => push inverse(move)
 */
export function createScrambleTracker(scramble) {
  const expected = expandScrambleToExpectedSteps(scramble);
  let progress = 0;
  const debt = [];

  // Stores chosen direction for each X2 pairId: +1 or -1
  const pairDir = new Map();

  function reset(newScramble) {
    expected.splice(0, expected.length, ...expandScrambleToExpectedSteps(newScramble));
    progress = 0;
    debt.splice(0, debt.length);
    pairDir.clear();
  }

  function stepMatchesWithPairLock(actual, expStep) {
    if (!actual || !expStep) return false;
    if (actual.face !== expStep.face) return false;

    // Normal directed step
    if (expStep.dir !== 0) return actual.dir === expStep.dir;

    // expStep.dir === 0 => this is part of an X2 pair
    // We lock the direction for that pair based on the first time we see it.
    const pid = expStep.pairId;
    if (!pid) {
      // fallback: accept either direction
      return true;
    }

    const chosen = pairDir.get(pid);

    // If not chosen yet, choose based on this actual move (must be +1 or -1)
    if (chosen == null) {
      if (actual.dir !== 1 && actual.dir !== -1) return false;
      pairDir.set(pid, actual.dir);
      return true;
    }

    // Must match the chosen direction
    return actual.dir === chosen;
  }

  function onMove(moveStr) {
    const actual = parseMove(moveStr);
    if (!actual) return snapshot();

    // If off-track, only accept undoing debt
    if (debt.length > 0) {
      const need = debt[debt.length - 1];
      if (matchesExpected(actual, need)) {
        debt.pop();
      } else {
        debt.push(inverseMove(actual));
      }
      return snapshot();
    }

    // On track: allow backtracking by doing inverse of last correct step,
    // BUT ONLY when the previous expected step has a real direction (dir !== 0).
    if (progress > 0) {
      const prevExpected = expected[progress - 1];

      // 🚫 Critical fix: do NOT backtrack against dir=0 steps (X2 parts),
      // because inverse is ambiguous and would treat the 2nd turn as an undo.
      if (prevExpected && prevExpected.dir !== 0) {
        const prevInverse = inverseMove(prevExpected);
        if (matchesExpected(actual, prevInverse)) {
          progress = Math.max(0, progress - 1);
          return snapshot();
        }
      }
    }

    // Normal forward matching (with X2 direction-lock)
    const next = expected[progress];
    if (stepMatchesWithPairLock(actual, next)) {
      progress = Math.min(expected.length, progress + 1);
      return snapshot();
    }

    // Wrong move => go into debt mode
    debt.push(inverseMove(actual));
    return snapshot();
  }

  function snapshot() {
    const undo = debt
      .slice()
      .reverse()
      .map(moveToString);

    return {
      progress,
      total: expected.length,
      undoMoves: undo,
      isComplete: progress >= expected.length && debt.length === 0,
      isOffTrack: debt.length > 0,
    };
  }

  return { onMove, reset, snapshot };
}