// src/smart/ganScrambleProgress.js
import { createScrambleTracker } from "../utils/scrambleTracker";

/**
 * Global-ish scramble progress engine for GAN moves.
 * - You call setGanCurrentScramble(scramble) whenever the displayed scramble changes.
 * - You call ingestGanMove(moveStr) whenever GAN emits a move (e.g. "U", "U'", sometimes "U2").
 * - It emits `pts:cubeScrambleProgress` with STEP progress (quarter-turn steps).
 */

let tracker = createScrambleTracker("");
let currentScrambleNorm = "";

const norm = (s) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ");

// If the library ever emits "U2" as a single move, expand to two quarter turns.
// For "U2" we feed ["U","U"] (tracker handles X2 steps as dir-agnostic where needed).
function expandGanMoveToQuarterTurns(moveStr) {
  const m = String(moveStr || "").trim();
  if (!m) return [];

  // Already a normal quarter turn
  if (!m.endsWith("2")) return [m];

  // "U2" / "R2" / etc.
  const base = m.slice(0, -1);
  if (!base) return [m];

  return [base, base];
}

function emit() {
  const snap = tracker.snapshot();
  window.dispatchEvent(
    new CustomEvent("pts:cubeScrambleProgress", {
      detail: {
        scramble: currentScrambleNorm,
        // IMPORTANT: step progress (quarter turns)
        progress: snap.progress,
        total: snap.total,
        isComplete: snap.isComplete,
        isOffTrack: snap.isOffTrack,
        undoMoves: snap.undoMoves,
      },
    })
  );
}

export function setGanCurrentScramble(scramble) {
  const s = norm(scramble);
  if (s === currentScrambleNorm) return;

  currentScrambleNorm = s;
  tracker.reset(s);
  emit();
}

export function resetGanScrambleProgress() {
  tracker.reset(currentScrambleNorm);
  emit();
}

export function ingestGanMove(moveStr) {
  const turns = expandGanMoveToQuarterTurns(moveStr);
  if (!turns.length) return;

  for (const t of turns) tracker.onMove(t);
  emit();
}