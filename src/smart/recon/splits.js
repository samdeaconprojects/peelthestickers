// src/smart/recon/splits.js
//
// Step splits: the compact per-step breakdown of a smart-cube solve that is
// saved with it (solve.Tags.SmartCube.Splits) so stats can show best crosses,
// fastest PLLs, recognition per step, etc. without replaying every solve.
//
// Stored format (V 3; older versions are re-analysed: V 1 had no Alg, V 2
// named most OLLs by shape only):
//   { V: 3, Method: "CFOP" | "Roux", Bottom: "white" | null,
//     Tagged: "CFOP",   // only when the Method tag said otherwise (the moves win)
//     Steps: [{ K: ["cross", "pair1"],  // step keys this step covers (XCross)
//               Ms: 2140,   // recognition + execution (ms)
//               Rec: 310,   // pause before the step's first move
//               Exe: 1830,  // first move to last move
//               Mv: 9,      // moves (STM)
//               Case: "T perm",   // OLL / PLL case, "skip", or absent
//               Alg: "R U R' U' R' F R2 U' R' U' R U R' F'" }] }  // with Case: the alg used
//
// Splits are derived data: the moves stay the source of truth. A solve saved
// before splits existed (or by an older analyser) is analysed on the fly.

import { analyzeSolve } from "./analyze";
import { readSmartRecord, smartKey } from "./solveRecord";

export const SPLITS_VERSION = 3;

const ALG_MAX = 160;
const AMOUNT = { "": 1, "2": 2, "'": 3 };
const SUFFIX = ["", "", "2", "'"];
const EDGE_TOKEN = /^(U|y)[2']?$/; // AUF and y regrips around an alg

/**
 * The alg a step was solved with, as a comparable string: the displayed moves
 * without the AUF / y turns at either end (they vary with how the case came
 * up), and with back-to-back turns of one face merged (a slow "R R" is "R2").
 * Null when nothing is left (a skip).
 */
export function algKey(tokens) {
  const parsed = [];
  for (const tok of tokens || []) {
    const text = String(tok?.text ?? tok ?? "").trim();
    const m = /^([A-Za-z]+)([2']?)$/.exec(text);
    if (!m) {
      parsed.push({ base: text, amount: 1, raw: true });
      continue;
    }
    const last = parsed[parsed.length - 1];
    const amount = AMOUNT[m[2]];
    if (last && !last.raw && last.base === m[1]) {
      last.amount = (last.amount + amount) % 4;
      if (!last.amount) parsed.pop();
    } else {
      parsed.push({ base: m[1], amount });
    }
  }
  const texts = parsed.map((p) => (p.raw ? p.base : p.base + SUFFIX[p.amount]));
  let a = 0;
  let b = texts.length;
  while (a < b && EDGE_TOKEN.test(texts[a])) a++;
  while (b > a && EDGE_TOKEN.test(texts[b - 1])) b--;
  const alg = texts.slice(a, b).join(" ");
  return alg ? alg.slice(0, ALG_MAX) : null;
}

const round = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** analyzeSolve() result -> stored splits (null when no method was found). */
export function splitsFromAnalysis(analysis) {
  if (!analysis?.method || !Array.isArray(analysis.steps)) return null;
  const steps = analysis.steps
    .filter((s) => Array.isArray(s.keys) && s.keys.length)
    .map((s) => {
      const out = {
        K: s.keys.slice(),
        Ms: round(s.durationMs),
        Rec: round(s.recognitionMs),
        Exe: round(s.executionMs),
        Mv: Number.isFinite(s.stm) ? s.stm : s.moveCount || 0,
      };
      if (s.caseName) {
        out.Case = String(s.caseName);
        const alg = s.caseName !== "skip" ? algKey(s.tokens) : null;
        if (alg) out.Alg = alg;
      }
      return out;
    });
  if (!steps.length) return null;
  return {
    V: SPLITS_VERSION,
    Method: analysis.method,
    ...(analysis.methodMismatch && analysis.taggedMethod ? { Tagged: analysis.taggedMethod } : {}),
    Bottom: analysis.bottomColour || null,
    Steps: steps,
  };
}

/** Splits for a SmartCube record, analysed from its moves. */
export function computeSplits(smart, method = "") {
  try {
    const record = readSmartRecord(smart);
    if (!record) return null;
    const a = analyzeSolve({ startState: record.startState, moves: record.moves, method });
    return splitsFromAnalysis(a);
  } catch (_) {
    return null;
  }
}

/** The record to save: the SmartCube record with its splits attached. */
export function withSplits(record, method = "") {
  if (!record || typeof record !== "object") return record;
  const splits = computeSplits(record, method);
  return splits ? { ...record, Splits: splits } : record;
}

// ---- reading ------------------------------------------------------------------

const tagsOf = (s) => s?.tags || s?.Tags || {};
const smartOf = (s) => tagsOf(s)?.SmartCube || s?.SmartCube || null;

// Stored splits were worked out against the solve's Method tag at the time;
// they still hold while the tag is the same (or now names the method found).
const methodMatches = (tagMethod, splits) => {
  const want = String(tagMethod || "").trim().toLowerCase();
  const had = String(splits.Tagged || splits.Method || "").toLowerCase();
  if (want !== "cfop" && want !== "roux") return !splits.Tagged; // auto
  return want === had || want === String(splits.Method || "").toLowerCase();
};

function validStored(splits) {
  return (
    splits &&
    typeof splits === "object" &&
    splits.V === SPLITS_VERSION &&
    Array.isArray(splits.Steps) &&
    splits.Steps.every((s) => Array.isArray(s?.K) && Number.isFinite(s?.Ms))
  );
}

const cache = new Map();
const CACHE_MAX = 20000;

/** Splits of any solve (stored when current, computed and cached otherwise). */
export function splitsForSolve(solve) {
  const smart = smartOf(solve);
  if (!smart) return null;
  const method = tagsOf(solve)?.Method || "";
  if (validStored(smart.Splits) && methodMatches(method, smart.Splits)) return smart.Splits;
  const key = `${smartKey(smart)}|${String(method).toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const splits = computeSplits(smart, method);
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(key, splits);
  return splits;
}

// ---- aggregation -------------------------------------------------------------

export const PHASES = {
  CFOP: [
    { key: "cross", label: "Cross", keys: ["cross"] },
    // Only solves that really built an XCross (cross and first pair as one step).
    { key: "xcross", label: "XCross", keys: ["cross", "pair1"], exact: true },
    { key: "f2l", label: "F2L", keys: ["pair1", "pair2", "pair3", "pair4"] },
    { key: "pair1", label: "F2L 1", keys: ["pair1"], sub: true },
    { key: "pair2", label: "F2L 2", keys: ["pair2"], sub: true },
    { key: "pair3", label: "F2L 3", keys: ["pair3"], sub: true },
    { key: "pair4", label: "F2L 4", keys: ["pair4"], sub: true },
    { key: "crossf2l", label: "Cross + F2L", keys: ["cross", "pair1", "pair2", "pair3", "pair4"] },
    { key: "oll", label: "OLL", keys: ["oll"] },
    { key: "pll", label: "PLL", keys: ["pll"] },
    { key: "ll", label: "Last layer", keys: ["oll", "pll"] },
  ],
  Roux: [
    { key: "fb", label: "First block", keys: ["fb"] },
    { key: "sb", label: "Second block", keys: ["sb"] },
    { key: "f2b", label: "F2B", keys: ["fb", "sb"] },
    { key: "cmll", label: "CMLL", keys: ["cmll"] },
    { key: "lse", label: "LSE", keys: ["lse"] },
  ],
};

/**
 * What a solve spent on exactly the steps `keys`: { ms, rec, exe, mv } or null
 * when its steps don't line up with them (an XCross has no separate cross).
 * Recognition is every pause inside the phase, including the one before it.
 */
export function phaseOf(splits, keys) {
  if (!splits?.Steps) return null;
  const want = new Set(keys);
  const got = new Set();
  let ms = 0;
  let rec = 0;
  let mv = 0;
  let steps = 0;
  let first = false;
  splits.Steps.forEach((s, i) => {
    const inside = s.K.filter((k) => want.has(k)).length;
    if (!inside) return;
    if (inside !== s.K.length) {
      steps = -Infinity;
      return;
    }
    s.K.forEach((k) => got.add(k));
    steps += 1;
    if (i === 0) first = true;
    ms += s.Ms || 0;
    rec += s.Rec || 0;
    mv += s.Mv || 0;
  });
  if (steps < 1 || got.size !== want.size) return null;
  // The solve's first step is timed from its first move: no recognition there.
  return { ms, rec, exe: Math.max(0, ms - rec), mv, hasRec: !(first && steps === 1) };
}

function solveTime(solve) {
  const v = Number(solve?.time ?? solve?.FinalTimeMs ?? solve?.rawTime ?? solve?.RawTimeMs);
  return Number.isFinite(v) ? v : null;
}

const isDnf = (solve) => String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase() === "DNF";

function newRow(base) {
  return { ...base, n: 0, skips: 0, best: null, bestRec: null, sumMs: 0, sumRec: 0, sumExe: 0, sumMv: 0, recN: 0 };
}

function addSample(row, v, solve) {
  if (v.mv === 0) {
    row.skips += 1;
    return;
  }
  row.n += 1;
  row.sumMs += v.ms;
  row.sumExe += v.exe;
  row.sumMv += v.mv;
  if (v.hasRec) {
    row.sumRec += v.rec;
    row.recN += 1;
    if (!row.bestRec || v.rec < row.bestRec.ms) row.bestRec = { ms: v.rec, solve };
  }
  if (!row.best || v.ms < row.best.ms) row.best = { ms: v.ms, solve };
}

function finishRow(row) {
  const { sumMs, sumRec, sumExe, sumMv, recN, ...rest } = row;
  return {
    ...rest,
    mean: row.n ? sumMs / row.n : null,
    recMean: recN ? sumRec / recN : null,
    exeMean: row.n ? sumExe / row.n : null,
    movesMean: row.n ? sumMv / row.n : null,
    tps: row.n && sumMs > 0 ? sumMv / (sumMs / 1000) : null,
  };
}

// A case row with the algs it was solved with (most used first).
function finishCaseRow(row) {
  const { algRows, ...rest } = row;
  const algs = algRows ? [...algRows.values()].map(finishRow).sort((a, b) => b.n - a.n || a.mean - b.mean) : [];
  return { ...finishRow(rest), algs };
}

/**
 * solves -> { methods: [{ method, count, phases: [...rows], cases: { OLL: [...], PLL: [...] } }] }
 * Rows: { key, label, n, skips, best: { ms, solve }, mean, recMean, exeMean, movesMean, tps }.
 * Case rows also have algs: [row per alg used, label = the alg].
 * DNFs and unfinished solves are left out.
 */
export function summarizeSplits(solves) {
  const byMethod = new Map();
  for (const solve of solves || []) {
    if (!solve || isDnf(solve)) continue;
    const splits = splitsForSolve(solve);
    if (!splits?.Method || !PHASES[splits.Method]) continue;
    let m = byMethod.get(splits.Method);
    if (!m) {
      m = {
        method: splits.Method,
        count: 0,
        total: newRow({ key: "total", label: "Total" }),
        phases: PHASES[splits.Method].map((p) => newRow(p)),
        cases: { OLL: new Map(), PLL: new Map() },
      };
      byMethod.set(splits.Method, m);
    }
    m.count += 1;
    for (const row of m.phases) {
      const v =
        row.exact && !splits.Steps.some((s) => s.K.join() === row.keys.join()) ? null : phaseOf(splits, row.keys);
      if (v) addSample(row, v, solve);
    }
    const t = solveTime(solve);
    if (t != null) {
      const rec = splits.Steps.reduce((a, s) => a + (s.Rec || 0), 0);
      const mv = splits.Steps.reduce((a, s) => a + (s.Mv || 0), 0);
      addSample(m.total, { ms: t, rec, exe: Math.max(0, t - rec), mv, hasRec: true }, solve);
    }
    for (const s of splits.Steps) {
      const group = s.K.length === 1 && s.K[0] === "oll" ? "OLL" : s.K.length === 1 && s.K[0] === "pll" ? "PLL" : null;
      if (!group || !s.Case) continue;
      const name = s.Case;
      let row = m.cases[group].get(name);
      if (!row) {
        row = newRow({ key: name, label: name === "skip" ? `${group} skip` : name });
        m.cases[group].set(name, row);
      }
      if (name === "skip") {
        row.skips += 1;
        continue;
      }
      const sample = { ms: s.Ms, rec: s.Rec || 0, exe: s.Exe ?? Math.max(0, s.Ms - (s.Rec || 0)), mv: s.Mv, hasRec: true };
      addSample(row, sample, solve);
      if (s.Alg) {
        if (!row.algRows) row.algRows = new Map();
        let algRow = row.algRows.get(s.Alg);
        if (!algRow) {
          algRow = newRow({ key: s.Alg, label: s.Alg, alg: s.Alg });
          row.algRows.set(s.Alg, algRow);
        }
        addSample(algRow, sample, solve);
      }
    }
  }

  const methods = [...byMethod.values()]
    .map((m) => ({
      method: m.method,
      count: m.count,
      total: finishRow(m.total),
      phases: m.phases.map(finishRow).filter((r) => r.n || r.skips),
      cases: {
        OLL: [...m.cases.OLL.values()].map(finishCaseRow),
        PLL: [...m.cases.PLL.values()].map(finishCaseRow),
      },
    }))
    .sort((a, b) => b.count - a.count);
  return { methods };
}

// ---- averages for one solve's steps --------------------------------------------

// Fewer other solves than this: no average (as stepStats' MIN_SAMPLES).
const MIN_STEP_SAMPLES = 3;
// Fewer other solves with the same case than this: no case average.
export const MIN_CASE_SAMPLES = 2;

function meanOf(sum, n, min, ms) {
  if (n < min) return { mean: null, n, delta: null };
  const mean = sum / n;
  return { mean, n, delta: Number.isFinite(ms) ? ms - mean : null };
}

/**
 * The user's average for each step of a solve, from the other solves in the
 * pool (same event and method): rank-free numbers to show "−0.38 vs avg".
 * Returns avg(step) -> { step: { mean, n, delta }, case: { name, mean, n, delta } | null,
 *   alg: { alg, variants, mean, n, delta } | null } | null.
 * `alg` (the same case solved with the same alg) is there only when the user
 * has solved the case with more than one alg.
 * `step` is what other solves spent on exactly these steps (an XCross against
 * other XCrosses); `case` is the same OLL / PLL case, when the step has one.
 */
export function buildStepAverages(entries, { event, method, exclude, minSamples = MIN_STEP_SAMPLES } = {}) {
  const excludeKey = exclude ? smartKey(exclude) : null;
  const list = [];
  for (const e of entries || []) {
    if (event && e.event && e.event !== event) continue;
    if (excludeKey && smartKey(e.smart) === excludeKey) continue;
    const splits = splitsForSolve({ tags: { SmartCube: e.smart, Method: e.method } });
    if (splits && (!method || splits.Method === method)) list.push(splits);
  }
  const memo = new Map();
  return (step) => {
    if (!step?.keys?.length || !(step.moveCount > 0)) return null;
    const keyStr = step.keys.join();
    const caseName = step.caseName && step.caseName !== "skip" ? step.caseName : null;
    const alg = caseName ? algKey(step.tokens) : null;
    const memoKey = `${keyStr}|${caseName || ""}|${alg || ""}`;
    let sums = memo.get(memoKey);
    if (!sums) {
      sums = { sum: 0, n: 0, caseSum: 0, caseN: 0, algSum: 0, algN: 0, algs: new Set(alg ? [alg] : []) };
      for (const splits of list) {
        const v = phaseOf(splits, step.keys);
        if (v && v.mv > 0) {
          sums.sum += v.ms;
          sums.n += 1;
        }
        if (!caseName) continue;
        for (const s of splits.Steps) {
          if (s.Case === caseName && s.Mv > 0 && s.K.join() === keyStr) {
            sums.caseSum += s.Ms;
            sums.caseN += 1;
            if (s.Alg) sums.algs.add(s.Alg);
            if (alg && s.Alg === alg) {
              sums.algSum += s.Ms;
              sums.algN += 1;
            }
          }
        }
      }
      memo.set(memoKey, sums);
    }
    return {
      step: meanOf(sums.sum, sums.n, minSamples, step.durationMs),
      case: caseName
        ? { name: caseName, ...meanOf(sums.caseSum, sums.caseN, MIN_CASE_SAMPLES, step.durationMs) }
        : null,
      // Only when the user solves this case more than one way.
      alg:
        alg && sums.algs.size > 1
          ? { alg, variants: sums.algs.size, ...meanOf(sums.algSum, sums.algN, MIN_CASE_SAMPLES, step.durationMs) }
          : null,
    };
  };
}

/** "−0.38" / "+0.12" (seconds), for a delta in ms. */
export function formatDelta(ms) {
  if (!Number.isFinite(ms)) return "";
  const s = Math.abs(ms) / 1000;
  return `${ms < 0 ? "−" : "+"}${s.toFixed(2)}`;
}

// ---- detected cases as solve tags ----------------------------------------------

/**
 * The OLL / PLL cases a solve's splits found, as the solve's algorithm tags
 * (the same values the post-solve tag keys write): { Alg_PLL: "T Perm",
 * Alg_OLL: "OLL #27" | "Skip" }.
 */
export function algTagsFromSplits(splits) {
  const out = {};
  if (!splits || splits.Method !== "CFOP" || !Array.isArray(splits.Steps)) return out;
  for (const s of splits.Steps) {
    if (!Array.isArray(s?.K) || s.K.length !== 1 || !s.Case) continue;
    const name = String(s.Case);
    if (s.K[0] === "pll") {
      if (name === "skip") out.Alg_PLL = "Skip";
      else {
        const m = /^(\w+) perm$/i.exec(name);
        if (m) out.Alg_PLL = `${m[1]} Perm`;
      }
    } else if (s.K[0] === "oll") {
      if (name === "skip") out.Alg_OLL = "Skip";
      else {
        const m = /^OLL (\d{1,2})\b/.exec(name);
        if (m && Number(m[1]) >= 1 && Number(m[1]) <= 57) out.Alg_OLL = `OLL #${Number(m[1])}`;
      }
    }
  }
  return out;
}
