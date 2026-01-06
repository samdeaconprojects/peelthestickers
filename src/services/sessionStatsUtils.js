// src/services/sessionStatsUtils.js

/**
 * Convert a solve item from DynamoDB (Time, Penalty, DateTime, etc.)
 * into an effective time in ms, handling +2 and DNF.
 */
export function getEffectiveTimeMs(dynamoSolve) {
  const base = Number(dynamoSolve.Time);
  const penalty = dynamoSolve.Penalty || dynamoSolve.penalty || null;

  if (penalty === "DNF") return Infinity;
  if (penalty === "+2") return base + 2000;
  return base;
}

/**
 * Compute a WCA-style average over a slice of solves.
 * - solves: array of DynamoDB solve items
 * - returns a number in ms or Infinity if the average is DNF.
 */
export function computeWindowAverageMs(solvesSlice) {
  if (!solvesSlice || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getEffectiveTimeMs);

  // If more than 1 DNF in window, average is DNF (Infinity).
  const dnfCount = times.filter((t) => !Number.isFinite(t)).length;
  if (dnfCount > 1) return Infinity;

  // Sort copy for min/max removal
  const sorted = [...times].sort((a, b) => a - b);

  // Remove fastest + slowest
  const trimmed = sorted.slice(1, sorted.length - 1);
  if (trimmed.length === 0) return Infinity;

  // If exactly 1 DNF, it's already in trimmed; Infinity will dominate and avg is Infinity.
  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  const avg = sum / trimmed.length;
  return Number.isFinite(avg) ? avg : Infinity;
}

/**
 * Build full stats for a session from an ordered array of solves.
 * `solves` must be oldest -> newest.
 */
export function buildSessionStatsFromSolves(solves) {
  if (!Array.isArray(solves) || solves.length === 0) {
    return {
      solveCount: 0,
      totalTimeMs: 0,
      overallAvgMs: null,
      bestSingleMs: null,
      bestSingleDateTime: null,
      bestAo5Ms: null,
      bestAo5StartIndex: null,
      bestAo12Ms: null,
      bestAo12StartIndex: null,
      lastSolveDateTime: null,
      lastRecomputedAt: new Date().toISOString(),
    };
  }

  let solveCount = 0;
  let totalTimeMs = 0;
  let bestSingleMs = null;
  let bestSingleDateTime = null;

  const effectiveTimes = [];

  for (const solve of solves) {
    const t = getEffectiveTimeMs(solve);
    effectiveTimes.push(t);

    // we still count DNFs towards solveCount
    solveCount++;

    if (Number.isFinite(t)) {
      if (bestSingleMs === null || t < bestSingleMs) {
        bestSingleMs = t;
        bestSingleDateTime = solve.DateTime || solve.datetime || null;
      }
      totalTimeMs += t;
    }
  }

  const overallAvgMs =
    solveCount > 0 && totalTimeMs > 0 ? Math.round(totalTimeMs / solveCount) : null;

  // sliding Ao5 / Ao12
  let bestAo5Ms = null;
  let bestAo5StartIndex = null;
  let bestAo12Ms = null;
  let bestAo12StartIndex = null;

  if (solves.length >= 5) {
    for (let i = 0; i <= solves.length - 5; i++) {
      const avg = computeWindowAverageMs(solves.slice(i, i + 5));
      if (Number.isFinite(avg) && (bestAo5Ms === null || avg < bestAo5Ms)) {
        bestAo5Ms = avg;
        bestAo5StartIndex = i;
      }
    }
  }

  if (solves.length >= 12) {
    for (let i = 0; i <= solves.length - 12; i++) {
      const avg = computeWindowAverageMs(solves.slice(i, i + 12));
      if (Number.isFinite(avg) && (bestAo12Ms === null || avg < bestAo12Ms)) {
        bestAo12Ms = avg;
        bestAo12StartIndex = i;
      }
    }
  }

  const lastSolveDateTime =
    solves[solves.length - 1].DateTime || solves[solves.length - 1].datetime || null;

  return {
    solveCount,
    totalTimeMs,
    overallAvgMs,
    bestSingleMs,
    bestSingleDateTime,
    bestAo5Ms,
    bestAo5StartIndex,
    bestAo12Ms,
    bestAo12StartIndex,
    lastSolveDateTime,
    lastRecomputedAt: new Date().toISOString(),
  };
}
