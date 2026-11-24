// src/smart/recon/stepStats.js
//
// How each step of a reconstruction compares with the same step in the user's
// other smart-cube solves, for colouring steps green (faster than usual) to
// red (slower), like the time list.
//
// App publishes its loaded solves with setReconPool(); every smart-cube solve
// in it is analysed once (timings only) and cached. A step is compared by the
// time it took against what the same steps took in other solves of the same
// event and method. Steps that cover several (an XCross is cross + pair1;
// "F2L 2+3") are compared with the time other solves spent on exactly those
// steps, so a folded step is never measured against a single pair.

import { useSyncExternalStore } from "react";
import { smartKey } from "./solveRecord";
import { splitsForSolve } from "./splits";

export { smartKey };

// Fewer comparable solves than this: no verdict (the step shows neutral).
export const MIN_SAMPLES = 3;

// ---- pool -------------------------------------------------------------------

let pool = [];
const listeners = new Set();

const tagsOf = (s) => s?.tags || s?.Tags || {};
const smartOf = (s) => tagsOf(s)?.SmartCube || s?.SmartCube || null;

/** sessions: { [event]: solve[] } (App's loaded solves). */
export function setReconPool(sessions) {
  const out = [];
  for (const [event, list] of Object.entries(sessions || {})) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const smart = smartOf(s);
      if (!smart) continue;
      out.push({ event: s?.event || event, smart, method: tagsOf(s)?.Method || "" });
    }
  }
  pool = out;
  for (const l of listeners) l();
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getPool = () => pool;

export function useReconPool() {
  return useSyncExternalStore(subscribe, getPool, getPool);
}

// ---- per-solve timings (cached) ------------------------------------------------

const cache = new WeakMap();


// The solve's step splits (stored with it, or analysed once and cached in
// splits.js; the Stats page and step averages share the same cache).
function timingsFor(entry) {
  const splits = splitsForSolve({ tags: { SmartCube: entry.smart, Method: entry.method } });
  if (!splits?.Method) return null;
  if (cache.has(splits)) return cache.get(splits);
  const result = {
    method: splits.Method,
    steps: splits.Steps.filter((s) => s.Mv > 0).map((s) => ({
      keys: s.K,
      durationMs: s.Ms,
      recognitionMs: s.Rec || 0,
    })),
  };
  cache.set(splits, result);
  return result;
}

// ---- comparison -----------------------------------------------------------------

/** Time a solve spent on exactly the steps `keys`, or null if its steps don't line up. */
function timeOnKeys(timings, keys) {
  const want = new Set(keys);
  const got = new Set();
  let total = 0;
  for (const s of timings.steps) {
    const inside = s.keys.filter((k) => want.has(k)).length;
    if (!inside) continue;
    if (inside !== s.keys.length) return null; // straddles the boundary
    s.keys.forEach((k) => got.add(k));
    total += s.durationMs;
  }
  return got.size === want.size ? total : null;
}

/**
 * Returns rank(step) -> { rank01, n } | null. rank01 is the share of other
 * solves that were faster at this step (0 = fastest yet, 1 = slowest), ties
 * counting half; null when there are fewer than MIN_SAMPLES to compare with.
 */
function comparableTimings(entries, { event, method, exclude } = {}) {
  const excludeKey = exclude ? smartKey(exclude) : null;
  const others = [];
  for (const e of entries || []) {
    if (event && e.event && e.event !== event) continue;
    if (excludeKey && smartKey(e.smart) === excludeKey) continue;
    const t = timingsFor(e);
    if (t && (!method || t.method === method)) others.push(t);
  }
  return others;
}

function rankAmong(samples, value) {
  if (samples.length < MIN_SAMPLES) return { rank01: null, n: samples.length };
  let faster = 0;
  for (const v of samples) {
    if (v < value) faster += 1;
    else if (v === value) faster += 0.5;
  }
  return { rank01: faster / samples.length, n: samples.length };
}

/**
 * Like buildStepRanker, for the recognition pause before a step: compared with
 * the pause before the same step (the step starting with the same key) in the
 * user's other solves. Null for the first step (timed from the first move).
 */
export function buildRecognitionRanker(entries, opts = {}) {
  const others = comparableTimings(entries, opts);
  return (step) => {
    if (!step?.keys?.length || !(step.moveCount > 0) || !(step.from > 0)) return null;
    const first = step.keys[0];
    const samples = [];
    for (const o of others) {
      const s = o.steps.find((x) => x.keys[0] === first);
      if (s && Number.isFinite(s.recognitionMs)) samples.push(s.recognitionMs);
    }
    return rankAmong(samples, step.recognitionMs);
  };
}

export function buildStepRanker(entries, opts = {}) {
  const others = comparableTimings(entries, opts);
  return (step) => {
    if (!step?.keys?.length || !(step.moveCount > 0)) return null;
    const samples = [];
    for (const o of others) {
      const v = timeOnKeys(o, step.keys);
      if (v != null) samples.push(v);
    }
    return rankAmong(samples, step.durationMs);
  };
}

/** Same hue scale as the time list: green (0) -> yellow -> red (1). */
export function rankColour(rank01) {
  const t = Number.isFinite(rank01) ? Math.max(0, Math.min(1, rank01)) : 0.5;
  return `hsl(${Math.round(120 * (1 - t))}, 100%, 55%)`;
}
