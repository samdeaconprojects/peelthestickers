// src/smart/recon/solveRecord.js
//
// What a smart-cube solve stores (solve.Tags.SmartCube) and how to read it back
// into the reconstruction engine's input.
//
// Current format (Version 2):
//   { Version: 2, Provider, Reason, StartedAtHostTs, EndedAtHostTs,
//     StartFacelets: "<54 chars, cube frame, before the first move>",
//     Moves: "R U R' ...",          // cube-frame quarter turns as reported
//     MoveTimes: [0, 143, ...],     // ms from the first move
//     FinalFacelets }
// Version 1 (older solves) stored Moves as [{ move, hostTs, cubeTs, facelets }]
// and no start state; we rebuild it by undoing the moves from solved.

import { SOLVED, applyAlg, invertAlg, isSolved, parseToken } from "./cube3";

/**
 * Per-move times (ms since the first move) from [{ cubeTs, hostTs }] samples.
 * Prefers the cube's own clock, rescaled to host time by linear regression (the
 * cube's crystal drifts a little), since Bluetooth delivery jitters by tens of
 * ms. Falls back to host arrival times.
 */
export function fitMoveTimes(samples) {
  const list = Array.isArray(samples) ? samples : [];
  const n = list.length;
  if (!n) return [];

  const host = list.map((s) => (Number.isFinite(s?.hostTs) ? s.hostTs : null));
  const cube = list.map((s) => (Number.isFinite(s?.cubeTs) ? s.cubeTs : null));
  const haveCube = cube.filter((x) => x != null).length;

  let times = null;
  if (haveCube >= 2) {
    // Fill gaps (moves the cube recovered without a timestamp) from neighbours.
    for (let i = n - 2; i >= 0; i--) if (cube[i] == null && cube[i + 1] != null) cube[i] = cube[i + 1] - 50;
    for (let i = 1; i < n; i++) if (cube[i] == null && cube[i - 1] != null) cube[i] = cube[i - 1] + 50;

    let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
    for (let i = 0; i < n; i++) {
      if (cube[i] == null || host[i] == null) continue;
      k++;
      sx += cube[i];
      sy += host[i];
      sxx += cube[i] * cube[i];
      sxy += cube[i] * host[i];
    }
    const varX = k * sxx - sx * sx;
    let slope = varX > 1e-3 ? (k * sxy - sx * sy) / varX : 1;
    // Drift is ~0.1%, so only a long run of samples can measure it better than
    // the host jitter it's fitted against; otherwise take the cube clock as-is.
    const span = Math.max(...cube.filter((c) => c != null)) - Math.min(...cube.filter((c) => c != null));
    if (k < 10 || span < 3000 || !Number.isFinite(slope) || slope < 0.98 || slope > 1.02) slope = 1;

    const c0 = cube[0];
    const fitted = cube.map((c) => Math.round(slope * (c - c0)));
    // Sanity check against the host clock: a cube clock that is stuck, reset
    // mid-solve or in other units would otherwise produce a nonsense time.
    const hs = host.filter((h) => h != null);
    const hostSpan = hs.length >= 2 ? hs[hs.length - 1] - hs[0] : null;
    const cubeSpan = fitted[n - 1];
    const plausible =
      hostSpan == null || hostSpan < 1000 || (cubeSpan > 0 && cubeSpan / hostSpan > 0.8 && cubeSpan / hostSpan < 1.25);
    if (plausible && fitted.every((x) => Number.isFinite(x)) && cubeSpan >= 0) times = fitted;
  }

  if (!times) {
    let last = host.find((h) => h != null) ?? 0;
    const h0 = last;
    times = host.map((h) => {
      if (h != null) last = h;
      return Math.round(last - h0);
    });
  }

  // Never go backwards.
  for (let i = 1; i < n; i++) if (times[i] < times[i - 1]) times[i] = times[i - 1];
  if (times[0] !== 0) {
    const t0 = times[0];
    times = times.map((t) => t - t0);
  }
  return times;
}

export function buildSmartRecord({
  provider,
  reason,
  startState,
  moves, // [{ move, cubeTs, hostTs }]
  finalFacelets,
}) {
  const list = Array.isArray(moves) ? moves : [];
  const times = fitMoveTimes(list);
  return {
    Version: 2,
    Provider: provider || null,
    Reason: reason || "",
    StartedAtHostTs: list[0]?.hostTs ?? null,
    EndedAtHostTs: list[list.length - 1]?.hostTs ?? null,
    StartFacelets: startState && String(startState).length === 54 ? String(startState) : null,
    Moves: list.map((m) => m.move).join(" "),
    MoveTimes: times,
    FinalFacelets: finalFacelets || null,
  };
}

/** Elapsed ms of a solve record (last move time). */
export function recordElapsedMs(record) {
  const t = record?.MoveTimes;
  return Array.isArray(t) && t.length ? t[t.length - 1] : null;
}

/**
 * solve.Tags.SmartCube (any version) -> { startState, moves: [{ move, t }], provider }
 * or null when there is nothing to reconstruct.
 */
export function readSmartRecord(smart) {
  if (!smart || typeof smart !== "object") return null;

  let moves = [];
  if (typeof smart.Moves === "string") {
    const tokens = smart.Moves.split(/\s+/).filter(Boolean);
    const times = Array.isArray(smart.MoveTimes) ? smart.MoveTimes : [];
    moves = tokens.map((move, i) => ({ move, t: Number(times[i]) }));
  } else if (Array.isArray(smart.Moves)) {
    const raw = smart.Moves.filter((m) => m && (m.move || m.m));
    const times = fitMoveTimes(raw.map((m) => ({ cubeTs: Number(m.cubeTs), hostTs: Number(m.hostTs) })));
    moves = raw.map((m, i) => ({ move: String(m.move || m.m), t: times[i] }));
  }
  moves = moves.filter((m) => parseToken(m.move));
  if (!moves.length) return null;

  let startState = smart.StartFacelets && String(smart.StartFacelets).length === 54 ? smart.StartFacelets : null;
  let startSource = startState ? "recorded" : null;
  const undo = () => applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(" ")));
  if (startState) {
    // If the recorded start doesn't lead to solved but the solve finished
    // solved, trust the moves: undoing them from solved is exact.
    const end = applyAlg(startState, moves.map((m) => m.move));
    if (!isSolved(end) && String(smart.Reason || "") === "solved") {
      startState = undo();
      startSource = "derived";
    }
  } else {
    startState = undo();
    startSource = "derived";
  }

  return { startState, startSource, moves, provider: smart.Provider || null, reason: smart.Reason || "" };
}

/** Identity of a SmartCube record (same moves and times = same solve). */
export function smartKey(smart) {
  if (!smart) return "";
  if (typeof smart === "object" && !Array.isArray(smart) && smart.Moves) {
    const times = smart.MoveTimes || [];
    return `${smart.StartFacelets || ""}|${smart.Moves}|${times.length}|${times[times.length - 1]}`;
  }
  try {
    return JSON.stringify(smart);
  } catch (_) {
    return "";
  }
}
