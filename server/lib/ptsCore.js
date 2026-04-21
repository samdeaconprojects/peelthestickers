const {
  QueryCommand,
  GetCommand,
  PutCommand,
  BatchWriteCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const STRICT_WINDOW_VERSION = 2;
const DAY_BUCKET_VERSION = 3;
const DEFAULT_DAY_BUCKET_TIMEZONE =
  process.env.PTS_DEFAULT_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";
const SPARSE_TAG_INDEX_CONFIG = Object.freeze({
  CubeModel: { attr: "CubeModelIdx", prefix: "CM", indexName: "GSI4" },
  CrossColor: { attr: "StartColorIdx", prefix: "SC", indexName: "GSI5" },
  Method: { attr: "MethodIdx", prefix: "MT", indexName: "GSI6" },
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeEvent(event) {
  return String(event || "").trim().toUpperCase();
}

function normalizeSessionID(sessionID) {
  const sid = String(sessionID || "main").trim();
  return sid || "main";
}

function normalizeTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    Intl.DateTimeFormat("en-CA", {
      timeZone: raw,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return raw;
  } catch {
    return "";
  }
}

function getDayBucketTimeZone(value) {
  return normalizeTimeZone(value) || DEFAULT_DAY_BUCKET_TIMEZONE;
}

function getDayKey(createdAt, { timeZone } = {}) {
  const raw = String(createdAt || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";

  const resolvedTimeZone = getDayBucketTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!byType.year || !byType.month || !byType.day) return "";
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function normalizePenalty(penalty) {
  if (penalty === "+2") return "+2";
  if (penalty === "DNF") return "DNF";
  return null;
}

function createSolveID() {
  return crypto.randomBytes(10).toString("hex");
}

function buildSolveSK(createdAt, solveID) {
  return `SOLVE#${createdAt}#${solveID}`;
}

function buildSolveTagSK(event, sessionID, createdAt, solveID) {
  return `${normalizeEvent(event)}#${normalizeSessionID(sessionID)}#${String(createdAt || "").trim()}#${String(
    solveID || ""
  ).trim()}`;
}

function getSparseTagIndexConfig(tagKey) {
  return SPARSE_TAG_INDEX_CONFIG[String(tagKey || "").trim()] || null;
}

function buildSparseTagIndexPK(tagKey, userID, tagValue) {
  const config = getSparseTagIndexConfig(tagKey);
  const valueNorm = normalizeTagIndexValue(tagValue);
  if (!config || !userID || !valueNorm) return null;
  return `${config.prefix}#${userID}#${valueNorm}`;
}

function buildSolveSparseTagIndexFields(userID, canonicalTags = {}) {
  const out = {};

  for (const [tagKey, config] of Object.entries(SPARSE_TAG_INDEX_CONFIG)) {
    const value = cleanTagValue(canonicalTags?.[tagKey]);
    const pk = buildSparseTagIndexPK(tagKey, userID, value);
    if (!pk) continue;
    out[config.attr] = pk;
  }

  return out;
}

function parseSolveSK(sk) {
  const s = String(sk || "");
  if (!s.startsWith("SOLVE#")) return { createdAt: null, solveID: null };

  const rest = s.slice("SOLVE#".length);
  const idx = rest.lastIndexOf("#");
  if (idx === -1) return { createdAt: rest, solveID: null };

  return {
    createdAt: rest.slice(0, idx),
    solveID: rest.slice(idx + 1),
  };
}

function buildTagStatsSK(event, sessionID, tagKey, tagValue) {
  const ev = normalizeEvent(event);
  const sid = sessionID == null || sessionID === "" ? null : normalizeSessionID(sessionID);
  const key = String(tagKey || "").trim();
  const rawValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(rawValue);

  if (!ev || !key || !tagValueNorm) {
    throw new Error("Invalid tag stats scope");
  }

  return sid
    ? `TAGSTATS#${ev}#${sid}#${key}#${tagValueNorm}`
    : `TAGSTATS#${ev}#${key}#${tagValueNorm}`;
}

function computeFinalTimeMs(rawTimeMs, penalty) {
  const raw = Number(rawTimeMs);
  const p = normalizePenalty(penalty);

  if (!Number.isFinite(raw) || raw < 0) return null;
  if (p === "DNF") return null;
  if (p === "+2") return raw + 2000;
  return raw;
}

function getRawTimeMs(solve) {
  const raw = Number(
    solve?.RawTimeMs ??
      solve?.rawTimeMs ??
      solve?.Time ??
      solve?.time ??
      solve?.ms ??
      solve?.OriginalTime ??
      solve?.originalTime
  );
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

function getFinalTimeMs(solve) {
  if (isDnfSolve(solve)) return null;

  const explicit = Number(solve?.FinalTimeMs ?? solve?.finalTimeMs);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const raw = getRawTimeMs(solve);
  return computeFinalTimeMs(raw, solve?.Penalty ?? solve?.penalty);
}

function isDnfSolve(solve) {
  return (
    normalizePenalty(solve?.Penalty ?? solve?.penalty) === "DNF" ||
    solve?.IsDNF === true ||
    solve?.isDNF === true
  );
}

function getSortTimeMsForStats(solve) {
  const finalMs = getFinalTimeMs(solve);
  return Number.isFinite(finalMs) ? finalMs : Infinity;
}

function computeWindowAverageMs(solvesSlice) {
  if (!Array.isArray(solvesSlice) || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getSortTimeMsForStats);
  const dnfCount = times.filter((t) => !Number.isFinite(t)).length;

  if (dnfCount > 1) return Infinity;

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);

  if (trimmed.length === 0) return Infinity;

  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  const avg = sum / trimmed.length;

  return Number.isFinite(avg) ? Math.round(avg) : Infinity;
}

function computeWindowMeanMs(solvesSlice) {
  if (!Array.isArray(solvesSlice) || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getFinalTimeMs);
  if (times.some((t) => !Number.isFinite(t))) return Infinity;

  const sum = times.reduce((acc, t) => acc + t, 0);
  const avg = sum / times.length;
  return Number.isFinite(avg) ? Math.round(avg) : Infinity;
}

const DAY_BUCKET_WINDOW_CONFIGS = Object.freeze([
  {
    key: "Mo3",
    kind: "mo3",
    size: 3,
    bestField: "BestMo3Ms",
    startField: "BestMo3StartSolveSK",
  },
  {
    key: "Ao5",
    kind: "ao",
    size: 5,
    bestField: "BestAo5Ms",
    startField: "BestAo5StartSolveSK",
  },
  {
    key: "Ao12",
    kind: "ao",
    size: 12,
    bestField: "BestAo12Ms",
    startField: "BestAo12StartSolveSK",
  },
]);
const DAY_BUCKET_BOUNDARY_LIMIT = Math.max(
  0,
  ...DAY_BUCKET_WINDOW_CONFIGS.map((config) => Math.max(0, config.size - 1))
);

function summarizeSolveForDayBucket(solve) {
  if (!solve) return null;
  return {
    SK: solve?.SK || null,
    CreatedAt: solve?.CreatedAt || null,
    FinalTimeMs: getFinalTimeMs(solve),
    Penalty: normalizePenalty(solve?.Penalty ?? solve?.penalty),
    IsDNF: isDnfSolve(solve),
  };
}

function expandDayBucketSolveSummary(summary) {
  if (!summary) return null;
  return {
    SK: summary?.SK || null,
    CreatedAt: summary?.CreatedAt || null,
    FinalTimeMs: Number.isFinite(Number(summary?.FinalTimeMs)) ? Number(summary.FinalTimeMs) : null,
    Penalty: normalizePenalty(summary?.Penalty),
    IsDNF: summary?.IsDNF === true || normalizePenalty(summary?.Penalty) === "DNF",
  };
}

function summarizeSolveListForDayBucket(solves = [], limit = DAY_BUCKET_BOUNDARY_LIMIT) {
  const input = Array.isArray(solves) ? solves : [];
  const max = Math.max(0, Number(limit) || 0);
  if (max <= 0) return [];
  return input.slice(0, max).map(summarizeSolveForDayBucket).filter(Boolean);
}

function tailSolveListForDayBucket(solves = [], limit = DAY_BUCKET_BOUNDARY_LIMIT) {
  const input = Array.isArray(solves) ? solves : [];
  const max = Math.max(0, Number(limit) || 0);
  if (max <= 0) return [];
  return input.slice(-max).map(summarizeSolveForDayBucket).filter(Boolean);
}

function getHistogramSecondKey(finalMs) {
  return Number.isFinite(finalMs) && finalMs >= 0 ? String(Math.floor(finalMs / 1000)) : "";
}

function mergeHistogramCounts(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [key, value] of Object.entries(map)) {
      const count = Number(value || 0);
      if (!count) continue;
      out[key] = Number(out[key] || 0) + count;
    }
  }
  return out;
}

function computeDayBucketWindowValueMs(solves, config) {
  if (!config || !Array.isArray(solves) || solves.length !== config.size) return Infinity;
  return config.kind === "mo3" ? computeWindowMeanMs(solves) : computeWindowAverageMs(solves);
}

function buildWindowSummaryFromSolves(solves = [], config) {
  const input = Array.isArray(solves) ? solves : [];
  const windowSize = Number(config?.size || 0);

  if (!config || windowSize < 1) {
    return {
      [config?.bestField || "BestWindowMs"]: null,
      [config?.startField || "BestWindowStartSolveSK"]: null,
      [config?.worstField || "WorstWindowMs"]: null,
      [config?.worstStartField || "WorstWindowStartSolveSK"]: null,
    };
  }

  let bestValue = null;
  let bestStart = null;
  let worstValue = null;
  let worstStart = null;
  for (let i = 0; i <= input.length - windowSize; i += 1) {
    const slice = input.slice(i, i + windowSize);
    const valueMs = computeDayBucketWindowValueMs(slice, config);
    if (!Number.isFinite(valueMs)) continue;
    if (bestValue == null || valueMs < bestValue) {
      bestValue = valueMs;
      bestStart = slice[0]?.SK || null;
    }
    if (worstValue == null || valueMs > worstValue) {
      worstValue = valueMs;
      worstStart = slice[0]?.SK || null;
    }
  }

  return {
    [config.bestField]: bestValue,
    [config.startField]: bestStart,
    [config.worstField]: worstValue,
    [config.worstStartField]: worstStart,
  };
}

function evaluateCrossBoundaryWindow(leftSuffix = [], rightPrefix = [], config) {
  const left = (Array.isArray(leftSuffix) ? leftSuffix : []).map(expandDayBucketSolveSummary).filter(Boolean);
  const right = (Array.isArray(rightPrefix) ? rightPrefix : []).map(expandDayBucketSolveSummary).filter(Boolean);
  const combined = [...left, ...right];
  const windowSize = Number(config?.size || 0);

  if (!config || windowSize < 1 || combined.length < windowSize) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  const leftCount = left.length;

  for (let i = 0; i <= combined.length - windowSize; i += 1) {
    const end = i + windowSize;
    const crossesBoundary = i < leftCount && end > leftCount;
    if (!crossesBoundary) continue;
    const slice = combined.slice(i, end);
    const valueMs = computeDayBucketWindowValueMs(slice, config);
    if (!Number.isFinite(valueMs)) continue;
    if (best == null || valueMs < best) {
      best = valueMs;
      bestStart = slice[0]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function mergeBoundarySolveLists(prefix = [], suffix = [], limit = DAY_BUCKET_BOUNDARY_LIMIT) {
  const max = Math.max(0, Number(limit) || 0);
  const input = [...(Array.isArray(prefix) ? prefix : []), ...(Array.isArray(suffix) ? suffix : [])]
    .map(expandDayBucketSolveSummary)
    .filter(Boolean);
  return {
    prefix: input.slice(0, max).map(summarizeSolveForDayBucket).filter(Boolean),
    suffix: input.slice(-max).map(summarizeSolveForDayBucket).filter(Boolean),
  };
}

const BEST_WINDOW_CONFIGS = Object.freeze([
  {
    kind: "mo3",
    windowSize: 3,
    candidatesField: "TopMo3Candidates",
    valueField: "BestMo3Ms",
    startField: "BestMo3StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 5,
    candidatesField: "TopAo5Candidates",
    valueField: "BestAo5Ms",
    startField: "BestAo5StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 12,
    candidatesField: "TopAo12Candidates",
    valueField: "BestAo12Ms",
    startField: "BestAo12StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 25,
    candidatesField: "TopAo25Candidates",
    valueField: "BestAo25Ms",
    startField: "BestAo25StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 50,
    candidatesField: "TopAo50Candidates",
    valueField: "BestAo50Ms",
    startField: "BestAo50StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 100,
    candidatesField: "TopAo100Candidates",
    valueField: "BestAo100Ms",
    startField: "BestAo100StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 1000,
    candidatesField: "TopAo1000Candidates",
    valueField: "BestAo1000Ms",
    startField: "BestAo1000StartSolveSK",
  },
]);

const CACHED_WINDOW_CONFIGS = Object.freeze(
  BEST_WINDOW_CONFIGS.filter((config) => [3, 5, 12].includes(Number(config?.windowSize || 0)))
);

function computeConfiguredWindowValueMs(solvesSlice, config) {
  if (!config || !Array.isArray(solvesSlice) || solvesSlice.length !== config.windowSize) {
    return Infinity;
  }

  return config.kind === "mo3"
    ? computeWindowMeanMs(solvesSlice)
    : computeWindowAverageMs(solvesSlice);
}

function buildTopWindowCandidatesFromSolves(solves, config, k = 100) {
  const input = Array.isArray(solves) ? solves : [];
  const windowSize = Number(config?.windowSize || 0);

  if (!config || windowSize < 1 || input.length < windowSize) return [];

  const out = [];
  for (let i = 0; i <= input.length - windowSize; i++) {
    const slice = input.slice(i, i + windowSize);
    const startSolveSK = String(slice[0]?.SK || "");
    if (!startSolveSK) continue;

    const memberSolveSKs = slice.map((s) => String(s?.SK || "")).filter(Boolean);
    if (memberSolveSKs.length !== windowSize) continue;

    const valueMs = computeConfiguredWindowValueMs(slice, config);
    if (!Number.isFinite(valueMs)) continue;

    out.push({
      ValueMs: Number(valueMs),
      StartSolveSK: startSolveSK,
      MemberSolveSKs: memberSolveSKs,
    });
  }

  out.sort(
    (a, b) => a.ValueMs - b.ValueMs || String(a.StartSolveSK).localeCompare(String(b.StartSolveSK))
  );
  return out.slice(0, Math.max(1, Number(k || 100)));
}

function buildWindowCandidateStatsFromSolves(solves, k = 100) {
  const out = {};

  for (const config of BEST_WINDOW_CONFIGS) {
    const candidates = buildTopWindowCandidatesFromSolves(solves, config, k);
    const best = candidates[0] || null;

    out[config.candidatesField] = candidates;
    out[config.valueField] = best?.ValueMs ?? null;
    out[config.startField] = best?.StartSolveSK || null;
  }

  return out;
}

function buildCachedWindowCandidateStatsFromSolves(solves, k = 10) {
  const out = {};

  for (const config of CACHED_WINDOW_CONFIGS) {
    const candidates = buildTopWindowCandidatesFromSolves(solves, config, k);
    const best = candidates[0] || null;

    out[config.candidatesField] = candidates;
    out[config.valueField] = best?.ValueMs ?? null;
    out[config.startField] = best?.StartSolveSK || null;
  }

  return out;
}

function bestAoForWindow(solves, n) {
  if (!Array.isArray(solves) || solves.length < n) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  for (let i = 0; i <= solves.length - n; i++) {
    const avg = computeWindowAverageMs(solves.slice(i, i + n));
    if (!Number.isFinite(avg)) continue;
    if (best === null || avg < best) {
      best = avg;
      bestStart = solves[i]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function bestMeanForWindow(solves, n) {
  if (!Array.isArray(solves) || solves.length < n) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  for (let i = 0; i <= solves.length - n; i++) {
    const avg = computeWindowMeanMs(solves.slice(i, i + n));
    if (!Number.isFinite(avg)) continue;
    if (best === null || avg < best) {
      best = avg;
      bestStart = solves[i]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function getSolveSourceForStrict(solve) {
  return String(solve?.Tags?.SolveSource || solve?.tags?.SolveSource || "").trim().toUpperCase();
}

function getSolveNoteForStrict(solve) {
  return String(solve?.Note || solve?.note || "").trim();
}

function getStrictWindowCandidates(solves, size) {
  const input = Array.isArray(solves) ? solves : [];
  const wcaGroups = new Map();
  const out = [];

  for (let i = 0; i < input.length; i += 1) {
    const solve = input[i];
    const source = getSolveSourceForStrict(solve);
    const note = getSolveNoteForStrict(solve);

    if (source === "WCA" && note) {
      const existing = wcaGroups.get(note) || [];
      existing.push(solve);
      wcaGroups.set(note, existing);
    }
  }

  for (let i = 0; i < input.length; ) {
    const solve = input[i];
    const source = getSolveSourceForStrict(solve);
    const note = getSolveNoteForStrict(solve);

    if (source === "WCA" && note) {
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < input.length) {
      if (
        getSolveSourceForStrict(input[j]) === "WCA" &&
        getSolveNoteForStrict(input[j])
      ) {
        break;
      }
      j += 1;
    }

    const segment = input.slice(i, j);
    for (let offset = 0; offset + size <= segment.length; offset += size) {
      out.push(segment.slice(offset, offset + size));
    }

    i = j;
  }

  for (const group of wcaGroups.values()) {
    if (group.length < size) continue;
    for (let offset = 0; offset + size <= group.length; offset += size) {
      out.push(group.slice(offset, offset + size));
    }
  }

  return out;
}

function bestStrictWindow(solves, n, kind = "ao") {
  if (!Array.isArray(solves) || solves.length < n) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  const candidates = getStrictWindowCandidates(solves, n);

  for (const slice of candidates) {
    if (!Array.isArray(slice) || slice.length !== n) continue;
    const value = kind === "mo3" ? computeWindowMeanMs(slice) : computeWindowAverageMs(slice);
    if (!Number.isFinite(value)) continue;
    if (best === null || value < best) {
      best = value;
      bestStart = slice[0]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function buildDayBucketSK({ dayKey, event = "", mainOnly = false } = {}) {
  const day = String(dayKey || "").trim();
  if (!day) throw new Error("Missing dayKey for day bucket");

  const ev = normalizeEvent(event);
  if (!ev) {
    return `DAYBUCKET#ALL#${day}`;
  }

  return mainOnly
    ? `DAYBUCKET#EVENT#${ev}#MAIN#${day}`
    : `DAYBUCKET#EVENT#${ev}#${day}`;
}

function buildDayBucketSummaryFromSolves(solves = []) {
  const input = Array.isArray(solves) ? solves : [];

  let SolveCountTotal = 0;
  let SolveCountIncluded = 0;
  let DNFCount = 0;
  let Plus2Count = 0;
  let SumFinalTimeMs = 0;
  let SumFinalTimeSqMs = 0;
  let BestSingleMs = null;
  let BestSingleSolveSK = null;
  let BestSingleAt = null;
  let Plus2BestMs = null;
  let FirstSolveAt = null;
  let LastSolveAt = null;
  const HistogramBySecond = {};

  for (const solve of input) {
    SolveCountTotal += 1;

    const createdAt = String(solve?.CreatedAt || "");
    if (!FirstSolveAt || createdAt < FirstSolveAt) FirstSolveAt = createdAt || FirstSolveAt;
    if (!LastSolveAt || createdAt > LastSolveAt) LastSolveAt = createdAt || LastSolveAt;

    const penalty = normalizePenalty(solve?.Penalty ?? solve?.penalty);
    if (penalty === "DNF" || isDnfSolve(solve)) DNFCount += 1;
    if (penalty === "+2") Plus2Count += 1;

    const finalMs = getFinalTimeMs(solve);
    if (!Number.isFinite(finalMs)) {
      HistogramBySecond.DNF = Number(HistogramBySecond.DNF || 0) + 1;
      continue;
    }

    const histogramKey = getHistogramSecondKey(finalMs);
    if (histogramKey) {
      HistogramBySecond[histogramKey] = Number(HistogramBySecond[histogramKey] || 0) + 1;
    }

    if (!Number.isFinite(finalMs)) continue;

    SolveCountIncluded += 1;
    SumFinalTimeMs += finalMs;
    SumFinalTimeSqMs += finalMs * finalMs;

    if (penalty === "+2" && (Plus2BestMs == null || finalMs < Plus2BestMs)) {
      Plus2BestMs = finalMs;
    }

    if (
      BestSingleMs == null ||
      finalMs < BestSingleMs ||
      (finalMs === BestSingleMs && createdAt < String(BestSingleAt || ""))
    ) {
      BestSingleMs = finalMs;
      BestSingleSolveSK = solve?.SK || null;
      BestSingleAt = createdAt || null;
    }

  }

  return {
    DayBucketVersion: DAY_BUCKET_VERSION,
    BoundaryWindowMax: DAY_BUCKET_BOUNDARY_LIMIT,
    SolveCountTotal,
    SolveCountIncluded,
    DNFCount,
    Plus2Count,
    SumFinalTimeMs,
    SumFinalTimeSqMs,
    MeanMs: SolveCountIncluded > 0 ? Math.round(SumFinalTimeMs / SolveCountIncluded) : null,
    BestSingleMs,
    BestSingleSolveSK,
    BestSingleAt,
    Plus2BestMs,
    HistogramBySecond,
    PrefixSolves: summarizeSolveListForDayBucket(input),
    SuffixSolves: tailSolveListForDayBucket(input),
    ...DAY_BUCKET_WINDOW_CONFIGS.reduce(
      (acc, config) => ({ ...acc, ...buildWindowSummaryFromSolves(input, config) }),
      {}
    ),
    FirstSolveAt,
    LastSolveAt,
    UpdatedAt: nowIso(),
  };
}

function mergeDayBucketSummaries(summaries = []) {
  const input = Array.isArray(summaries) ? summaries.filter(Boolean) : [];
  if (!input.length) {
    return buildDayBucketSummaryFromSolves([]);
  }

  const asFiniteOrNull = (value) =>
    value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

  let merged = null;

  for (const rawItem of input) {
    const item = rawItem || {};
    if (!merged) {
      merged = {
        DayBucketVersion: DAY_BUCKET_VERSION,
        BoundaryWindowMax: DAY_BUCKET_BOUNDARY_LIMIT,
        SolveCountTotal: Number(item?.SolveCountTotal || 0),
        SolveCountIncluded: Number(item?.SolveCountIncluded || 0),
        DNFCount: Number(item?.DNFCount || 0),
        Plus2Count: Number(item?.Plus2Count || 0),
        SumFinalTimeMs: Number(item?.SumFinalTimeMs || 0),
        SumFinalTimeSqMs: Number(item?.SumFinalTimeSqMs || 0),
        MeanMs: asFiniteOrNull(item?.MeanMs),
        BestSingleMs: asFiniteOrNull(item?.BestSingleMs),
        BestSingleSolveSK: item?.BestSingleSolveSK || null,
        BestSingleAt: item?.BestSingleAt || null,
        Plus2BestMs: asFiniteOrNull(item?.Plus2BestMs),
        HistogramBySecond: mergeHistogramCounts(item?.HistogramBySecond),
        PrefixSolves: (Array.isArray(item?.PrefixSolves) ? item.PrefixSolves : [])
          .map(summarizeSolveForDayBucket)
          .filter(Boolean),
        SuffixSolves: (Array.isArray(item?.SuffixSolves) ? item.SuffixSolves : [])
          .map(summarizeSolveForDayBucket)
          .filter(Boolean),
        BestMo3Ms: asFiniteOrNull(item?.BestMo3Ms),
        BestMo3StartSolveSK: item?.BestMo3StartSolveSK || null,
        BestAo5Ms: asFiniteOrNull(item?.BestAo5Ms),
        BestAo5StartSolveSK: item?.BestAo5StartSolveSK || null,
        BestAo12Ms: asFiniteOrNull(item?.BestAo12Ms),
        BestAo12StartSolveSK: item?.BestAo12StartSolveSK || null,
        FirstSolveAt: item?.FirstSolveAt || null,
        LastSolveAt: item?.LastSolveAt || null,
      };
      continue;
    }

    const next = {
      DayBucketVersion: DAY_BUCKET_VERSION,
      BoundaryWindowMax: DAY_BUCKET_BOUNDARY_LIMIT,
      SolveCountTotal: Number(merged.SolveCountTotal || 0) + Number(item?.SolveCountTotal || 0),
      SolveCountIncluded:
        Number(merged.SolveCountIncluded || 0) + Number(item?.SolveCountIncluded || 0),
      DNFCount: Number(merged.DNFCount || 0) + Number(item?.DNFCount || 0),
      Plus2Count: Number(merged.Plus2Count || 0) + Number(item?.Plus2Count || 0),
      SumFinalTimeMs: Number(merged.SumFinalTimeMs || 0) + Number(item?.SumFinalTimeMs || 0),
      SumFinalTimeSqMs:
        Number(merged.SumFinalTimeSqMs || 0) + Number(item?.SumFinalTimeSqMs || 0),
      BestSingleMs: merged.BestSingleMs,
      BestSingleSolveSK: merged.BestSingleSolveSK,
      BestSingleAt: merged.BestSingleAt,
      Plus2BestMs: merged.Plus2BestMs,
      HistogramBySecond: mergeHistogramCounts(merged.HistogramBySecond, item?.HistogramBySecond),
      PrefixSolves: mergeBoundarySolveLists(merged.PrefixSolves, item?.PrefixSolves).prefix,
      SuffixSolves: mergeBoundarySolveLists(merged.SuffixSolves, item?.SuffixSolves).suffix,
      BestMo3Ms: merged.BestMo3Ms,
      BestMo3StartSolveSK: merged.BestMo3StartSolveSK,
      BestAo5Ms: merged.BestAo5Ms,
      BestAo5StartSolveSK: merged.BestAo5StartSolveSK,
      BestAo12Ms: merged.BestAo12Ms,
      BestAo12StartSolveSK: merged.BestAo12StartSolveSK,
      FirstSolveAt: merged.FirstSolveAt,
      LastSolveAt: merged.LastSolveAt,
    };

    const itemBestSingleMs = Number(item?.BestSingleMs);
    const itemBestSingleAt = String(item?.BestSingleAt || "");
    if (
      Number.isFinite(itemBestSingleMs) &&
      (next.BestSingleMs == null ||
        itemBestSingleMs < next.BestSingleMs ||
        (itemBestSingleMs === next.BestSingleMs &&
          itemBestSingleAt < String(next.BestSingleAt || "")))
    ) {
      next.BestSingleMs = itemBestSingleMs;
      next.BestSingleSolveSK = item?.BestSingleSolveSK || null;
      next.BestSingleAt = itemBestSingleAt || null;
    }

    const itemPlus2Best = asFiniteOrNull(item?.Plus2BestMs);
    if (itemPlus2Best != null && (next.Plus2BestMs == null || itemPlus2Best < next.Plus2BestMs)) {
      next.Plus2BestMs = itemPlus2Best;
    }

    const firstAt = String(item?.FirstSolveAt || "");
    if (firstAt && (!next.FirstSolveAt || firstAt < next.FirstSolveAt)) next.FirstSolveAt = firstAt;

    const lastAt = String(item?.LastSolveAt || "");
    if (lastAt && (!next.LastSolveAt || lastAt > next.LastSolveAt)) next.LastSolveAt = lastAt;

    for (const config of DAY_BUCKET_WINDOW_CONFIGS) {
      const bestField = config.bestField;
      const bestStartField = config.startField;
      const currentBestValue = asFiniteOrNull(next[bestField]);
      const itemBestValue = asFiniteOrNull(item?.[bestField]);
      if (itemBestValue != null && (currentBestValue == null || itemBestValue < currentBestValue)) {
        next[bestField] = itemBestValue;
        next[bestStartField] = item?.[bestStartField] || null;
      }

      const cross = evaluateCrossBoundaryWindow(merged.SuffixSolves, item?.PrefixSolves, config);
      if (
        Number.isFinite(cross.value) &&
        (asFiniteOrNull(next[bestField]) == null || cross.value < Number(next[bestField]))
      ) {
        next[bestField] = cross.value;
        next[bestStartField] = cross.startSolveSK;
      }
    }

    next.MeanMs =
      next.SolveCountIncluded > 0 ? Math.round(next.SumFinalTimeMs / next.SolveCountIncluded) : null;
    merged = next;
  }

  return {
    ...merged,
    UpdatedAt: nowIso(),
  };
}

function buildDayBucketItem({
  userID,
  dayKey,
  event = "",
  mainOnly = false,
  timeZone = "",
  solves = [],
  sourceBuckets = null,
}) {
  const day = String(dayKey || "").trim();
  if (!day) throw new Error("Missing dayKey for day bucket item");

  const ev = normalizeEvent(event);
  const summary = sourceBuckets
    ? mergeDayBucketSummaries(sourceBuckets)
    : buildDayBucketSummaryFromSolves(solves);

  return {
    PK: `USER#${userID}`,
    SK: buildDayBucketSK({ dayKey: day, event: ev, mainOnly }),
    ItemType: "DAYBUCKET",
    BucketDay: day,
    Scope: ev ? "EVENT" : "ALL",
    BucketTimeZone: getDayBucketTimeZone(timeZone),
    UpdatedAt: nowIso(),
    stale: false,
    ...(ev ? { Event: ev } : {}),
    ...(mainOnly ? { SessionID: "main", ScopeVariant: "MAIN" } : {}),
    ...summary,
  };
}

function buildStatsFromSolves(solves = []) {
  if (!Array.isArray(solves) || solves.length === 0) {
    return {
      StrictWindowVersion: STRICT_WINDOW_VERSION,
      SolveCountTotal: 0,
      SolveCountIncluded: 0,
      DNFCount: 0,
      Plus2Count: 0,
      SumFinalTimeMs: 0,
      MeanMs: null,

      BestSingleMs: null,
      BestSingleSolveSK: null,
      BestSingleAt: null,
      WorstSingleMs: null,
      WorstSingleSolveSK: null,

      BestMo3Ms: null,
      BestMo3StartSolveSK: null,
      BestMo3StrictMs: null,
      BestMo3StrictStartSolveSK: null,
      WorstMo3Ms: null,
      WorstMo3StartSolveSK: null,

      BestAo5Ms: null,
      BestAo5StartSolveSK: null,
      BestAo5StrictMs: null,
      BestAo5StrictStartSolveSK: null,
      WorstAo5Ms: null,
      WorstAo5StartSolveSK: null,

      BestAo12Ms: null,
      BestAo12StartSolveSK: null,
      BestAo12StrictMs: null,
      BestAo12StrictStartSolveSK: null,
      WorstAo12Ms: null,
      WorstAo12StartSolveSK: null,

      BestAo25Ms: null,
      BestAo25StartSolveSK: null,

      BestAo50Ms: null,
      BestAo50StartSolveSK: null,

      BestAo100Ms: null,
      BestAo100StartSolveSK: null,

      BestAo1000Ms: null,
      BestAo1000StartSolveSK: null,

      TopMo3Candidates: [],
      TopAo5Candidates: [],

      LastSolveAt: null,
      LastRecomputedAt: nowIso(),
    };
  }

  let SolveCountTotal = 0;
  let SolveCountIncluded = 0;
  let DNFCount = 0;
  let Plus2Count = 0;
  let SumFinalTimeMs = 0;

  let BestSingleMs = null;
  let BestSingleSolveSK = null;
  let BestSingleAt = null;
  let WorstSingleMs = null;
  let WorstSingleSolveSK = null;

  for (const solve of solves) {
    SolveCountTotal += 1;

    const penalty = normalizePenalty(solve?.Penalty);
    const isDNF = isDnfSolve(solve);
    if (isDNF) DNFCount += 1;
    if (penalty === "+2") Plus2Count += 1;

    const finalMs = getFinalTimeMs(solve);
    if (Number.isFinite(finalMs)) {
      SolveCountIncluded += 1;
      SumFinalTimeMs += finalMs;

      if (BestSingleMs === null || finalMs < BestSingleMs) {
        BestSingleMs = finalMs;
        BestSingleSolveSK = solve?.SK || null;
        BestSingleAt = solve?.CreatedAt || null;
      }

      if (WorstSingleMs === null || finalMs > WorstSingleMs) {
        WorstSingleMs = finalMs;
        WorstSingleSolveSK = solve?.SK || null;
      }
    }
  }

  const MeanMs =
    SolveCountIncluded > 0 ? Math.round(SumFinalTimeMs / SolveCountIncluded) : null;

  const mo3 = buildWindowSummaryFromSolves(solves, {
    kind: "mo3",
    size: 3,
    bestField: "BestMo3Ms",
    startField: "BestMo3StartSolveSK",
    worstField: "WorstMo3Ms",
    worstStartField: "WorstMo3StartSolveSK",
  });
  const mo3Strict = bestStrictWindow(solves, 3, "mo3");
  const ao5 = buildWindowSummaryFromSolves(solves, {
    kind: "ao",
    size: 5,
    bestField: "BestAo5Ms",
    startField: "BestAo5StartSolveSK",
    worstField: "WorstAo5Ms",
    worstStartField: "WorstAo5StartSolveSK",
  });
  const ao5Strict = bestStrictWindow(solves, 5, "ao");
  const ao12 = buildWindowSummaryFromSolves(solves, {
    kind: "ao",
    size: 12,
    bestField: "BestAo12Ms",
    startField: "BestAo12StartSolveSK",
    worstField: "WorstAo12Ms",
    worstStartField: "WorstAo12StartSolveSK",
  });
  const ao12Strict = bestStrictWindow(solves, 12, "ao");
  const ao25 = bestAoForWindow(solves, 25);
  const ao50 = bestAoForWindow(solves, 50);
  const ao100 = bestAoForWindow(solves, 100);
  const ao1000 = bestAoForWindow(solves, 1000);
  const cachedWindowStats = buildCachedWindowCandidateStatsFromSolves(solves, 10);
  const lastSolve = solves[solves.length - 1];

  return {
    StrictWindowVersion: STRICT_WINDOW_VERSION,
    SolveCountTotal,
    SolveCountIncluded,
    DNFCount,
    Plus2Count,
    SumFinalTimeMs,
    MeanMs,

    BestSingleMs,
    BestSingleSolveSK,
    BestSingleAt,
    WorstSingleMs,
    WorstSingleSolveSK,

    BestMo3Ms: mo3.BestMo3Ms,
    BestMo3StartSolveSK: mo3.BestMo3StartSolveSK,
    BestMo3StrictMs: mo3Strict.value,
    BestMo3StrictStartSolveSK: mo3Strict.startSolveSK,
    WorstMo3Ms: mo3.WorstMo3Ms,
    WorstMo3StartSolveSK: mo3.WorstMo3StartSolveSK,

    BestAo5Ms: ao5.BestAo5Ms,
    BestAo5StartSolveSK: ao5.BestAo5StartSolveSK,
    BestAo5StrictMs: ao5Strict.value,
    BestAo5StrictStartSolveSK: ao5Strict.startSolveSK,
    WorstAo5Ms: ao5.WorstAo5Ms,
    WorstAo5StartSolveSK: ao5.WorstAo5StartSolveSK,

    BestAo12Ms: ao12.BestAo12Ms,
    BestAo12StartSolveSK: ao12.BestAo12StartSolveSK,
    BestAo12StrictMs: ao12Strict.value,
    BestAo12StrictStartSolveSK: ao12Strict.startSolveSK,
    WorstAo12Ms: ao12.WorstAo12Ms,
    WorstAo12StartSolveSK: ao12.WorstAo12StartSolveSK,

    BestAo25Ms: ao25.value,
    BestAo25StartSolveSK: ao25.startSolveSK,

    BestAo50Ms: ao50.value,
    BestAo50StartSolveSK: ao50.startSolveSK,

    BestAo100Ms: ao100.value,
    BestAo100StartSolveSK: ao100.startSolveSK,

    BestAo1000Ms: ao1000.value,
    BestAo1000StartSolveSK: ao1000.startSolveSK,

    ...cachedWindowStats,

    LastSolveAt: lastSolve?.CreatedAt || null,
    LastRecomputedAt: nowIso(),
  };
}

function compareWindowCandidate(a, b) {
  const valueDiff = Number(a?.ValueMs || 0) - Number(b?.ValueMs || 0);
  if (valueDiff !== 0) return valueDiff;
  return String(a?.StartSolveSK || "").localeCompare(String(b?.StartSolveSK || ""));
}

function insertTopWindowCandidate(candidates, candidate, k = 10) {
  const next = Array.isArray(candidates) ? [...candidates] : [];
  next.push(candidate);
  next.sort(compareWindowCandidate);
  return next.slice(0, Math.max(1, Number(k || 10)));
}

async function* iterateQueryItems(
  ddb,
  tableName,
  { indexName, keyConditionExpression, expressionAttributeValues, limit = 1000 }
) {
  let cursor = undefined;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
        Limit: limit,
      })
    );

    for (const item of out.Items || []) {
      yield item;
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);
}

async function* iterateTagScopeSolves(
  ddb,
  tableName,
  userID,
  tagKey,
  tagValue,
  { event = "", sessionID = "", limit = 500 } = {}
) {
  const key = String(tagKey || "").trim();
  const cleanValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(cleanValue);
  const ev = normalizeEvent(event || "");
  const sid = sessionID ? normalizeSessionID(sessionID) : "";
  const pageLimit = Math.max(1, Math.min(1000, Number(limit || 500)));

  if (!userID || !key || !tagValueNorm) return;

  const sparseConfig = getSparseTagIndexConfig(key);
  if (sparseConfig) {
    const pk = buildSparseTagIndexPK(key, userID, cleanValue);
    if (!pk) return;

    let keyConditionExpression = `${sparseConfig.attr} = :pk`;
    const expressionAttributeValues = {
      ":pk": pk,
    };

    if (ev && sid) {
      keyConditionExpression += " AND begins_with(SolveTagSK, :skPrefix)";
      expressionAttributeValues[":skPrefix"] = `${ev}#${sid}#`;
    } else if (ev) {
      keyConditionExpression += " AND begins_with(SolveTagSK, :skPrefix)";
      expressionAttributeValues[":skPrefix"] = `${ev}#`;
    }

    yield* iterateQueryItems(ddb, tableName, {
      indexName: sparseConfig.indexName,
      keyConditionExpression,
      expressionAttributeValues,
      limit: pageLimit,
    });
    return;
  }

  let keyConditionExpression = "GSI3PK = :pk";
  const expressionAttributeValues = {
    ":pk": `TAG#${userID}#${key}#${tagValueNorm}`,
  };

  if (ev && sid) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#${sid}#`;
  } else if (ev) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#`;
  }

  let cursor = undefined;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI3",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
        Limit: pageLimit,
      })
    );

    const tagItems = out.Items || [];
    if (tagItems.length) {
      const solveKeys = tagItems
        .map((item) => ({ PK: item?.SolvePK, SK: item?.SolveSK }))
        .filter((item) => item.PK && item.SK);
      const solves = await batchGetAll(ddb, tableName, solveKeys);
      const solveMap = new Map(solves.map((solve) => [`${solve.PK}|${solve.SK}`, solve]));

      for (const tagItem of tagItems) {
        const solve = solveMap.get(`${tagItem?.SolvePK}|${tagItem?.SolveSK}`);
        if (solve) yield solve;
      }
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);
}

async function buildStatsFromSolveIterator(iterable) {
  const stats = buildStatsFromSolves([]);
  for (const config of CACHED_WINDOW_CONFIGS) {
    if (!Array.isArray(stats[config.candidatesField])) {
      stats[config.candidatesField] = [];
    }
    if (typeof stats[config.valueField] === "undefined") {
      stats[config.valueField] = null;
    }
    if (typeof stats[config.startField] === "undefined") {
      stats[config.startField] = null;
    }
  }
  const windowConfigs = [
    {
      kind: "mo3",
      windowSize: 3,
      valueField: "BestMo3Ms",
      startField: "BestMo3StartSolveSK",
      worstField: "WorstMo3Ms",
      worstStartField: "WorstMo3StartSolveSK",
      strictValueField: "BestMo3StrictMs",
      strictStartField: "BestMo3StrictStartSolveSK",
      candidatesField: "TopMo3Candidates",
      topK: 10,
    },
    {
      kind: "ao",
      windowSize: 5,
      valueField: "BestAo5Ms",
      startField: "BestAo5StartSolveSK",
      worstField: "WorstAo5Ms",
      worstStartField: "WorstAo5StartSolveSK",
      strictValueField: "BestAo5StrictMs",
      strictStartField: "BestAo5StrictStartSolveSK",
      candidatesField: "TopAo5Candidates",
      topK: 10,
    },
    {
      kind: "ao",
      windowSize: 12,
      valueField: "BestAo12Ms",
      startField: "BestAo12StartSolveSK",
      worstField: "WorstAo12Ms",
      worstStartField: "WorstAo12StartSolveSK",
      strictValueField: "BestAo12StrictMs",
      strictStartField: "BestAo12StrictStartSolveSK",
      candidatesField: "TopAo12Candidates",
      topK: 10,
    },
    {
      kind: "ao",
      windowSize: 25,
      valueField: "BestAo25Ms",
      startField: "BestAo25StartSolveSK",
    },
    {
      kind: "ao",
      windowSize: 50,
      valueField: "BestAo50Ms",
      startField: "BestAo50StartSolveSK",
    },
    {
      kind: "ao",
      windowSize: 100,
      valueField: "BestAo100Ms",
      startField: "BestAo100StartSolveSK",
    },
    {
      kind: "ao",
      windowSize: 1000,
      valueField: "BestAo1000Ms",
      startField: "BestAo1000StartSolveSK",
    },
  ].map((config) => ({
    ...config,
    recent: [],
  }));

  const strictConfigs = [
    { kind: "mo3", windowSize: 3, valueField: "BestMo3StrictMs", startField: "BestMo3StrictStartSolveSK" },
    { kind: "ao", windowSize: 5, valueField: "BestAo5StrictMs", startField: "BestAo5StrictStartSolveSK" },
    { kind: "ao", windowSize: 12, valueField: "BestAo12StrictMs", startField: "BestAo12StrictStartSolveSK" },
  ];
  const strictState = new Map(
    strictConfigs.map((config) => [
      config.windowSize,
      {
        config,
        nonWcaRemainder: [],
        wcaRemainders: new Map(),
      },
    ])
  );

  const applyStrictChunk = (config, chunk) => {
    if (!Array.isArray(chunk) || chunk.length !== config.windowSize) return;
    const value =
      config.kind === "mo3" ? computeWindowMeanMs(chunk) : computeWindowAverageMs(chunk);
    if (!Number.isFinite(value)) return;
    if (stats[config.valueField] == null || value < stats[config.valueField]) {
      stats[config.valueField] = value;
      stats[config.startField] = chunk[0]?.SK || null;
    }
  };

  for await (const solve of iterable) {
    stats.SolveCountTotal += 1;

    const penalty = normalizePenalty(solve?.Penalty);
    const isDNF = isDnfSolve(solve);
    if (isDNF) stats.DNFCount += 1;
    if (penalty === "+2") stats.Plus2Count += 1;

    const finalMs = getFinalTimeMs(solve);
    if (Number.isFinite(finalMs)) {
      stats.SolveCountIncluded += 1;
      stats.SumFinalTimeMs += finalMs;

      if (stats.BestSingleMs === null || finalMs < stats.BestSingleMs) {
        stats.BestSingleMs = finalMs;
        stats.BestSingleSolveSK = solve?.SK || null;
        stats.BestSingleAt = solve?.CreatedAt || null;
      }

      if (stats.WorstSingleMs === null || finalMs > stats.WorstSingleMs) {
        stats.WorstSingleMs = finalMs;
        stats.WorstSingleSolveSK = solve?.SK || null;
      }
    }

    stats.LastSolveAt = solve?.CreatedAt || stats.LastSolveAt || null;

    for (const config of windowConfigs) {
      config.recent.push(solve);
      if (config.recent.length > config.windowSize) config.recent.shift();
      if (config.recent.length !== config.windowSize) continue;

      const value =
        config.kind === "mo3"
          ? computeWindowMeanMs(config.recent)
          : computeWindowAverageMs(config.recent);
      if (!Number.isFinite(value)) continue;

      if (stats[config.valueField] == null || value < stats[config.valueField]) {
        stats[config.valueField] = value;
        stats[config.startField] = config.recent[0]?.SK || null;
      }

      if (
        config.worstField &&
        (stats[config.worstField] == null || value > stats[config.worstField])
      ) {
        stats[config.worstField] = value;
        stats[config.worstStartField] = config.recent[0]?.SK || null;
      }

      if (config.candidatesField) {
        stats[config.candidatesField] = insertTopWindowCandidate(
          stats[config.candidatesField],
          {
            ValueMs: Number(value),
            StartSolveSK: config.recent[0]?.SK || null,
            MemberSolveSKs: config.recent.map((item) => String(item?.SK || "")).filter(Boolean),
          },
          config.topK
        );
      }
    }

    const source = getSolveSourceForStrict(solve);
    const note = getSolveNoteForStrict(solve);
    const isGroupedWca = source === "WCA" && note;

    for (const strict of strictState.values()) {
      if (isGroupedWca) {
        strict.nonWcaRemainder = [];
        const existing = strict.wcaRemainders.get(note) || [];
        existing.push(solve);
        if (existing.length === strict.config.windowSize) {
          applyStrictChunk(strict.config, existing);
          strict.wcaRemainders.set(note, []);
        } else {
          strict.wcaRemainders.set(note, existing);
        }
        continue;
      }

      strict.nonWcaRemainder.push(solve);
      if (strict.nonWcaRemainder.length === strict.config.windowSize) {
        applyStrictChunk(strict.config, strict.nonWcaRemainder);
        strict.nonWcaRemainder = [];
      }
    }
  }

  stats.MeanMs =
    stats.SolveCountIncluded > 0
      ? Math.round(stats.SumFinalTimeMs / stats.SolveCountIncluded)
      : null;
  stats.LastRecomputedAt = nowIso();

  return stats;
}

function cleanTagValue(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function normalizeTagIndexValue(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return s || null;
}

function sanitizeTags(input = {}) {
  const legacyCustom = input?.Custom && typeof input.Custom === "object" ? input.Custom : {};
  const solveSourceRaw = cleanTagValue(input?.SolveSource);
  const derivedSolveSource = solveSourceRaw
    ? solveSourceRaw
    : input?.IsShared || input?.Shared
    ? "Shared"
    : input?.IsRelay
    ? "Relay"
    : input?.SmartCube
    ? "SmartCube"
    : "Standard";

  return {
    CubeModel: cleanTagValue(input?.CubeModel),
    CrossColor: cleanTagValue(input?.StartColor || input?.CrossColor),
    Method: cleanTagValue(input?.Method),
    TimerInput: cleanTagValue(input?.TimerInput || input?.InputType),
    SolveSource: derivedSolveSource,
    Custom1: cleanTagValue(input?.Custom1),
    Custom2: cleanTagValue(input?.Custom2),
    Custom3: cleanTagValue(input?.Custom3),
    Custom4: cleanTagValue(input?.Custom4),
    Custom5: cleanTagValue(input?.Custom5),
    LegacyCustom: legacyCustom,
  };
}

function buildSolveItem({
  userID,
  event,
  sessionID,
  rawTimeMs,
  penalty = null,
  scramble = "",
  note = "",
  tags = {},
  createdAt,
  solveID,
  existing = null,
}) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const p = normalizePenalty(penalty);
  const raw = Number(rawTimeMs);

  if (!Number.isFinite(raw) || raw < 0) {
    throw new Error("Invalid rawTimeMs");
  }

  const finalTimeMs = computeFinalTimeMs(raw, p);
  const ts = String(createdAt || existing?.CreatedAt || nowIso());
  const sid2 = String(solveID || existing?.SolveID || createSolveID());
  const canonicalTags = sanitizeTags(tags);

  return {
    ...(existing || {}),

    PK: `USER#${userID}`,
    SK: buildSolveSK(ts, sid2),

    GSI1PK: `SESSION#${userID}#${ev}#${sid}`,
    GSI1SK: `${ts}#${sid2}`,

    GSI2PK: `EVENT#${userID}#${ev}`,
    GSI2SK: `${ts}#${sid}#${sid2}`,
    SolveTagSK: buildSolveTagSK(ev, sid, ts, sid2),
    ...buildSolveSparseTagIndexFields(userID, canonicalTags),

    ItemType: "SOLVE",
    SolveID: sid2,

    Event: ev,
    SessionID: sid,

    RawTimeMs: raw,
    FinalTimeMs: finalTimeMs,
    Penalty: p,
    IsDNF: p === "DNF",

    Scramble: scramble ?? "",
    Note: note ?? "",

    Tag_CubeModel: canonicalTags.CubeModel,
    Tag_CrossColor: canonicalTags.CrossColor,
    Tag_Method: canonicalTags.Method,
    Tag_TimerInput: canonicalTags.TimerInput,
    Tag_SolveSource: canonicalTags.SolveSource,
    Tag_Custom1: canonicalTags.Custom1,
    Tag_Custom2: canonicalTags.Custom2,
    Tag_Custom3: canonicalTags.Custom3,
    Tag_Custom4: canonicalTags.Custom4,
    Tag_Custom5: canonicalTags.Custom5,

    Tags: {
      CubeModel: canonicalTags.CubeModel,
      CrossColor: canonicalTags.CrossColor,
      Method: canonicalTags.Method,
      TimerInput: canonicalTags.TimerInput,
      SolveSource: canonicalTags.SolveSource,
      Custom1: canonicalTags.Custom1,
      Custom2: canonicalTags.Custom2,
      Custom3: canonicalTags.Custom3,
      Custom4: canonicalTags.Custom4,
      Custom5: canonicalTags.Custom5,
      ...(Object.keys(canonicalTags.LegacyCustom || {}).length
        ? { LegacyCustom: canonicalTags.LegacyCustom }
        : {}),
    },

    CreatedAt: ts,
    UpdatedAt: nowIso(),
  };
}

function getSolveTagPairsFromItem(solveItem) {
  const pairs = [];
  const nestedTags =
    solveItem?.Tags && typeof solveItem.Tags === "object" ? solveItem.Tags : {};
  const nestedCustom =
    nestedTags?.Custom && typeof nestedTags.Custom === "object" ? nestedTags.Custom : {};

  const firstNonEmpty = (...values) => {
    for (const value of values) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const entry of value) {
          const clean = cleanTagValue(entry);
          if (clean) return clean;
        }
        continue;
      }
      if (typeof value === "object") continue;
      const clean = cleanTagValue(value);
      if (clean) return clean;
    }
    return "";
  };

  const add = (key, value) => {
    const clean = cleanTagValue(value);
    if (!clean) return;
    pairs.push({ key, value: clean });
  };

  add(
    "CubeModel",
    firstNonEmpty(solveItem?.Tag_CubeModel, nestedTags?.CubeModel, nestedTags?.cubeModel, nestedTags?.cube)
  );
  add(
    "CrossColor",
    firstNonEmpty(
      solveItem?.Tag_CrossColor,
      solveItem?.Tag_StartColor,
      nestedTags?.StartColor,
      nestedTags?.startColor,
      nestedTags?.CrossColor,
      nestedTags?.crossColor,
      nestedTags?.cross
    )
  );
  add("Method", firstNonEmpty(solveItem?.Tag_Method, nestedTags?.Method, nestedTags?.method));
  add(
    "TimerInput",
    firstNonEmpty(
      solveItem?.Tag_TimerInput,
      nestedTags?.TimerInput,
      nestedTags?.InputType,
      nestedTags?.inputType
    )
  );
  add("SolveSource", firstNonEmpty(solveItem?.Tag_SolveSource, nestedTags?.SolveSource));
  add(
    "Custom1",
    firstNonEmpty(
      solveItem?.Tag_Custom1,
      nestedTags?.Custom1,
      nestedCustom?.Custom1,
      nestedCustom?.custom1,
      nestedCustom?.[1],
      Array.isArray(nestedTags?.Custom) ? nestedTags.Custom[0] : null
    )
  );
  add(
    "Custom2",
    firstNonEmpty(
      solveItem?.Tag_Custom2,
      nestedTags?.Custom2,
      nestedCustom?.Custom2,
      nestedCustom?.custom2,
      nestedCustom?.[2],
      Array.isArray(nestedTags?.Custom) ? nestedTags.Custom[1] : null
    )
  );
  add(
    "Custom3",
    firstNonEmpty(
      solveItem?.Tag_Custom3,
      nestedTags?.Custom3,
      nestedCustom?.Custom3,
      nestedCustom?.custom3,
      nestedCustom?.[3],
      Array.isArray(nestedTags?.Custom) ? nestedTags.Custom[2] : null
    )
  );
  add(
    "Custom4",
    firstNonEmpty(
      solveItem?.Tag_Custom4,
      nestedTags?.Custom4,
      nestedCustom?.Custom4,
      nestedCustom?.custom4,
      nestedCustom?.[4],
      Array.isArray(nestedTags?.Custom) ? nestedTags.Custom[3] : null
    )
  );
  add(
    "Custom5",
    firstNonEmpty(
      solveItem?.Tag_Custom5,
      nestedTags?.Custom5,
      nestedCustom?.Custom5,
      nestedCustom?.custom5,
      nestedCustom?.[5],
      Array.isArray(nestedTags?.Custom) ? nestedTags.Custom[4] : null
    )
  );

  return pairs;
}

function buildSolveTagItems(solveItem) {
  const userID = String(solveItem?.PK || "").replace(/^USER#/, "");
  const createdAt = String(solveItem?.CreatedAt || "");
  const solveID = String(solveItem?.SolveID || "");
  const event = normalizeEvent(solveItem?.Event);
  const sessionID = normalizeSessionID(solveItem?.SessionID);

  return getSolveTagPairsFromItem(solveItem)
    .filter(({ key }) => !getSparseTagIndexConfig(key))
    .map(({ key, value }) => {
    const valueNorm = normalizeTagIndexValue(value);

    return {
      PK: solveItem.PK,
      SK: `SOLVETAG#${key}#${valueNorm}#${createdAt}#${solveID}`,

      GSI3PK: `TAG#${userID}#${key}#${valueNorm}`,
      GSI3SK: `${event}#${sessionID}#${createdAt}#${solveID}`,

      ItemType: "SOLVETAG",
      UserID: userID,
      Event: event,
      SessionID: sessionID,
      TagKey: key,
      TagValue: value,
      SolvePK: solveItem.PK,
      SolveSK: solveItem.SK,
      SolveID: solveID,
      CreatedAt: createdAt,
      UpdatedAt: nowIso(),
    };
    });
}

async function batchWriteAll(ddb, tableName, requests) {
  if (!Array.isArray(requests) || requests.length === 0) return;

  // DynamoDB BatchWrite rejects duplicate PK/SK keys in a single call,
  // even if the operations are identical. Keep only the last operation per key.
  // This preserves "delete then put" replacement intent while avoiding hard failures.
  const getReqKey = (req, idx) => {
    const put = req?.PutRequest?.Item;
    if (put?.PK && put?.SK) return `${put.PK}|${put.SK}`;

    const del = req?.DeleteRequest?.Key;
    if (del?.PK && del?.SK) return `${del.PK}|${del.SK}`;

    return `__NO_KEY__${idx}`;
  };

  const deduped = [];
  const seen = new Set();
  for (let i = requests.length - 1; i >= 0; i--) {
    const req = requests[i];
    const key = getReqKey(req, i);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(req);
  }
  deduped.reverse();

  if (deduped.length !== requests.length) {
    console.warn(
      `[ptsCore] batchWriteAll deduped ${requests.length - deduped.length} duplicate key ops`
    );
  }

  const chunks = [];
  for (let i = 0; i < deduped.length; i += 25) {
    chunks.push(deduped.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    let unprocessed = chunk;
    let attempt = 0;

    while (unprocessed.length > 0) {
      const out = await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed,
          },
        })
      );

      const next = out?.UnprocessedItems?.[tableName] || [];
      unprocessed = next;

      if (!unprocessed.length) break;

      attempt += 1;
      if (attempt > 8) {
        throw new Error(`BatchWrite exceeded retries: ${unprocessed.length} unprocessed`);
      }

      const delay = Math.round(80 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function batchGetAll(ddb, tableName, keys) {
  const input = Array.isArray(keys) ? keys.filter((key) => key?.PK && key?.SK) : [];
  if (!input.length) return [];

  const deduped = Array.from(
    new Map(input.map((key) => [`${key.PK}|${key.SK}`, key])).values()
  );
  const out = [];

  for (let i = 0; i < deduped.length; i += 100) {
    let pendingKeys = deduped.slice(i, i + 100);
    let attempt = 0;

    while (pendingKeys.length > 0) {
      const result = await ddb.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pendingKeys,
            },
          },
        })
      );

      out.push(...(result?.Responses?.[tableName] || []));
      pendingKeys = result?.UnprocessedKeys?.[tableName]?.Keys || [];

      if (!pendingKeys.length) break;

      attempt += 1;
      if (attempt > 8) {
        throw new Error(`BatchGet exceeded retries: ${pendingKeys.length} unprocessed`);
      }

      const delay = Math.round(80 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return out;
}

async function putSolveAndTagItems(ddb, tableName, solveItem) {
  const tagItems = buildSolveTagItems(solveItem);
  const requests = [
    { PutRequest: { Item: solveItem } },
    ...tagItems.map((item) => ({ PutRequest: { Item: item } })),
  ];
  await batchWriteAll(ddb, tableName, requests);
}

async function deleteSolveAndTagItems(ddb, tableName, solveItem) {
  const tagItems = buildSolveTagItems(solveItem);
  const requests = [
    {
      DeleteRequest: {
        Key: { PK: solveItem.PK, SK: solveItem.SK },
      },
    },
    ...tagItems.map((item) => ({
      DeleteRequest: {
        Key: { PK: item.PK, SK: item.SK },
      },
    })),
  ];
  await batchWriteAll(ddb, tableName, requests);
}

async function replaceSolveAndTagItems(ddb, tableName, oldSolveItem, newSolveItem) {
  const oldTagItems = buildSolveTagItems(oldSolveItem);
  const newTagItems = buildSolveTagItems(newSolveItem);
  const keyOf = (it) => `${it.PK}|${it.SK}`;
  const tagFingerprint = (it) =>
    [
      it?.GSI3PK || "",
      it?.GSI3SK || "",
      it?.Event || "",
      it?.SessionID || "",
      it?.TagKey || "",
      it?.TagValue || "",
      it?.SolvePK || "",
      it?.SolveSK || "",
      it?.SolveID || "",
      it?.CreatedAt || "",
    ].join("|");
  const oldSolveKey = keyOf(oldSolveItem);
  const newSolveKey = keyOf(newSolveItem);

  const oldTagMap = new Map(oldTagItems.map((item) => [keyOf(item), item]));
  const newTagMap = new Map(newTagItems.map((item) => [keyOf(item), item]));
  const requests = [];

  if (oldSolveKey !== newSolveKey) {
    requests.push({
      DeleteRequest: {
        Key: { PK: oldSolveItem.PK, SK: oldSolveItem.SK },
      },
    });
  }

  for (const [oldKey, oldItem] of oldTagMap.entries()) {
    if (!newTagMap.has(oldKey)) {
      requests.push({
        DeleteRequest: {
          Key: { PK: oldItem.PK, SK: oldItem.SK },
        },
      });
    }
  }

  requests.push({ PutRequest: { Item: newSolveItem } });

  for (const [newKey, newItem] of newTagMap.entries()) {
    const prior = oldTagMap.get(newKey);
    if (!prior || tagFingerprint(prior) !== tagFingerprint(newItem)) {
      requests.push({ PutRequest: { Item: newItem } });
    }
  }

  await batchWriteAll(ddb, tableName, requests);
}

async function getAllSolvesBySession(ddb, tableName, userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);

  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${ev}#${sid}`,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all.reverse();
}

async function getAllSolvesByEvent(ddb, tableName, userID, event) {
  const ev = normalizeEvent(event);

  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${userID}#${ev}`,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all.reverse();
}

async function getAllSolvesByTag(
  ddb,
  tableName,
  userID,
  tagKey,
  tagValue,
  { event = "", sessionID = "" } = {}
) {
  const key = String(tagKey || "").trim();
  const cleanValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(cleanValue);
  const ev = normalizeEvent(event || "");
  const sid = sessionID ? normalizeSessionID(sessionID) : "";

  if (!userID || !key || !tagValueNorm) return [];

  if (getSparseTagIndexConfig(key)) {
    let cursor = undefined;
    const all = [];

    do {
      const out = await querySolvesBySparseTag(ddb, tableName, userID, key, cleanValue, {
        event: ev,
        sessionID: sid,
        limit: 500,
        cursor,
      });
      if (out.items?.length) all.push(...out.items);
      cursor = out.lastKey || undefined;
    } while (cursor);

    return all.sort((a, b) => String(a?.CreatedAt || "").localeCompare(String(b?.CreatedAt || "")));
  }

  let keyConditionExpression = "GSI3PK = :pk";
  const expressionAttributeValues = {
    ":pk": `TAG#${userID}#${key}#${tagValueNorm}`,
  };

  if (ev && sid) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#${sid}#`;
  } else if (ev) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#`;
  }

  let cursor = undefined;
  const tagItems = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI3",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) tagItems.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  const solveKeys = tagItems.map((item) => ({
    PK: item?.SolvePK,
    SK: item?.SolveSK,
  }));
  const solves = await batchGetAll(ddb, tableName, solveKeys);

  return solves.sort((a, b) => String(a?.CreatedAt || "").localeCompare(String(b?.CreatedAt || "")));
}

async function querySolvesBySparseTag(
  ddb,
  tableName,
  userID,
  tagKey,
  tagValue,
  { event = "", sessionID = "", limit = 100, cursor = undefined } = {}
) {
  const config = getSparseTagIndexConfig(tagKey);
  const pk = buildSparseTagIndexPK(tagKey, userID, tagValue);
  const ev = normalizeEvent(event || "");
  const sid = sessionID ? normalizeSessionID(sessionID) : "";
  const pageLimit = Math.max(1, Math.min(500, Number(limit || 100)));

  if (!config || !pk) {
    return { items: [], lastKey: null };
  }

  let keyConditionExpression = `${config.attr} = :pk`;
  const expressionAttributeValues = {
    ":pk": pk,
  };

  if (ev && sid) {
    keyConditionExpression += " AND begins_with(SolveTagSK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#${sid}#`;
  } else if (ev) {
    keyConditionExpression += " AND begins_with(SolveTagSK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#`;
  }

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: config.indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      Limit: pageLimit,
      ExclusiveStartKey: cursor,
    })
  );

  return {
    items: out.Items || [],
    lastKey: out.LastEvaluatedKey || null,
  };
}

async function getLastNSolvesBySession(ddb, tableName, userID, event, sessionID, n) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const limit = Math.max(1, Math.min(1000, Number(n || 12)));

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `SESSION#${userID}#${ev}#${sid}`,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (out.Items || []).reverse();
}

async function getLastNSolvesByEvent(ddb, tableName, userID, event, n) {
  const ev = normalizeEvent(event);
  const limit = Math.max(1, Math.min(1000, Number(n || 12)));

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${userID}#${ev}`,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (out.Items || []).reverse();
}

async function getLastNSolvesByTag(
  ddb,
  tableName,
  userID,
  tagKey,
  tagValue,
  { event = "", sessionID = "" } = {},
  n = 12
) {
  const key = String(tagKey || "").trim();
  const cleanValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(cleanValue);
  const ev = normalizeEvent(event || "");
  const sid = sessionID ? normalizeSessionID(sessionID) : "";
  const limit = Math.max(1, Math.min(1000, Number(n || 12)));

  if (!userID || !key || !tagValueNorm) return [];

  if (getSparseTagIndexConfig(key)) {
    const out = await querySolvesBySparseTag(ddb, tableName, userID, key, cleanValue, {
      event: ev,
      sessionID: sid,
      limit,
    });

    return (out.items || []).sort((a, b) => String(a?.CreatedAt || "").localeCompare(String(b?.CreatedAt || "")));
  }

  let keyConditionExpression = "GSI3PK = :pk";
  const expressionAttributeValues = {
    ":pk": `TAG#${userID}#${key}#${tagValueNorm}`,
  };

  if (ev && sid) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#${sid}#`;
  } else if (ev) {
    keyConditionExpression += " AND begins_with(GSI3SK, :skPrefix)";
    expressionAttributeValues[":skPrefix"] = `${ev}#`;
  }

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI3",
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  const solveKeys = (out.Items || []).map((item) => ({
    PK: item?.SolvePK,
    SK: item?.SolveSK,
  }));
  const solves = await batchGetAll(ddb, tableName, solveKeys);

  return solves.sort((a, b) => String(a?.CreatedAt || "").localeCompare(String(b?.CreatedAt || "")));
}

async function recomputeSessionStats(ddb, tableName, userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);

  const stats = await buildStatsFromSolveIterator(
    iterateQueryItems(ddb, tableName, {
      indexName: "GSI1",
      keyConditionExpression: "GSI1PK = :pk",
      expressionAttributeValues: {
        ":pk": `SESSION#${userID}#${ev}#${sid}`,
      },
    })
  );

  const item = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${ev}#${sid}`,
    ItemType: "SESSIONSTATS",
    Event: ev,
    SessionID: sid,
    UpdatedAt: nowIso(),
    stale: false,
    ...stats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function recomputeEventStats(ddb, tableName, userID, event) {
  const ev = normalizeEvent(event);

  const stats = await buildStatsFromSolveIterator(
    iterateQueryItems(ddb, tableName, {
      indexName: "GSI2",
      keyConditionExpression: "GSI2PK = :pk",
      expressionAttributeValues: {
        ":pk": `EVENT#${userID}#${ev}`,
      },
    })
  );

  const item = {
    PK: `USER#${userID}`,
    SK: `EVENTSTATS#${ev}`,
    ItemType: "EVENTSTATS",
    Event: ev,
    UpdatedAt: nowIso(),
    stale: false,
    ...stats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function recomputeTagStats(
  ddb,
  tableName,
  userID,
  event,
  sessionID,
  tagKey,
  tagValue
) {
  const ev = normalizeEvent(event);
  const sid = sessionID == null || sessionID === "" ? null : normalizeSessionID(sessionID);
  const key = String(tagKey || "").trim();
  const cleanValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(cleanValue);

  if (!ev || !key || !tagValueNorm) {
    throw new Error("Invalid tag stats scope");
  }

  const stats = await buildStatsFromSolveIterator(
    iterateTagScopeSolves(ddb, tableName, userID, key, cleanValue, {
      event: ev,
      sessionID: sid || "",
    })
  );

  const item = {
    PK: `USER#${userID}`,
    SK: buildTagStatsSK(ev, sid, key, cleanValue),
    ItemType: "TAGSTATS",
    Event: ev,
    TagKey: key,
    TagValue: cleanValue,
    TagValueNorm: tagValueNorm,
    UpdatedAt: nowIso(),
    stale: false,
    ...stats,
  };
  if (sid) item.SessionID = sid;

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

function mergeIncrementalStats(
  prevStats,
  solveItem,
  recentSolves,
  windowSize,
  { includeCounters = true } = {}
) {
  const prev = prevStats || buildStatsFromSolves([]);

  const penalty = normalizePenalty(solveItem?.Penalty);
  const finalMs = getFinalTimeMs(solveItem);
  const isIncluded = Number.isFinite(finalMs);

  let next = { ...prev };

  if (includeCounters) {
    next = {
      ...next,
      StrictWindowVersion: STRICT_WINDOW_VERSION,
      SolveCountTotal: Number(prev.SolveCountTotal || 0) + 1,
      SolveCountIncluded: Number(prev.SolveCountIncluded || 0) + (isIncluded ? 1 : 0),
      DNFCount: Number(prev.DNFCount || 0) + (penalty === "DNF" ? 1 : 0),
      Plus2Count: Number(prev.Plus2Count || 0) + (penalty === "+2" ? 1 : 0),
      SumFinalTimeMs: Number(prev.SumFinalTimeMs || 0) + (isIncluded ? finalMs : 0),
      LastSolveAt: solveItem?.CreatedAt || prev.LastSolveAt || null,
      LastRecomputedAt: nowIso(),
    };

    next.MeanMs =
      next.SolveCountIncluded > 0
        ? Math.round(next.SumFinalTimeMs / next.SolveCountIncluded)
        : null;

    if (isIncluded) {
      if (
        next.BestSingleMs == null ||
        finalMs < next.BestSingleMs ||
        (finalMs === next.BestSingleMs &&
          String(solveItem?.CreatedAt || "") < String(next.BestSingleAt || ""))
      ) {
        next.BestSingleMs = finalMs;
        next.BestSingleSolveSK = solveItem?.SK || null;
        next.BestSingleAt = solveItem?.CreatedAt || null;
      }
    }
  }

  const windowMap = {
    3: ["BestMo3Ms", "BestMo3StartSolveSK"],
    5: ["BestAo5Ms", "BestAo5StartSolveSK"],
    12: ["BestAo12Ms", "BestAo12StartSolveSK"],
    25: ["BestAo25Ms", "BestAo25StartSolveSK"],
    50: ["BestAo50Ms", "BestAo50StartSolveSK"],
    100: ["BestAo100Ms", "BestAo100StartSolveSK"],
    1000: ["BestAo1000Ms", "BestAo1000StartSolveSK"],
  };

  const fields = windowMap[windowSize] || null;

  if (Array.isArray(recentSolves) && recentSolves.length >= windowSize) {
    const candidateSlice = recentSolves.slice(-windowSize);
    const avg =
      windowSize === 3
        ? computeWindowMeanMs(candidateSlice)
        : computeWindowAverageMs(candidateSlice);

    if (Number.isFinite(avg) && fields) {
      const [valueField, startField] = fields;
      if (next[valueField] == null || avg < next[valueField]) {
        next[valueField] = avg;
        next[startField] = candidateSlice[0]?.SK || null;
      }
    }
  }

  if ([3, 5, 12].includes(Number(windowSize)) && Array.isArray(recentSolves) && recentSolves.length >= windowSize) {
    const strict =
      windowSize === 3
        ? bestStrictWindow(recentSolves, windowSize, "mo3")
        : bestStrictWindow(recentSolves, windowSize, "ao");
    const strictValueField =
      windowSize === 3 ? "BestMo3StrictMs" : windowSize === 5 ? "BestAo5StrictMs" : "BestAo12StrictMs";
    const strictStartField =
      windowSize === 3
        ? "BestMo3StrictStartSolveSK"
        : windowSize === 5
        ? "BestAo5StrictStartSolveSK"
        : "BestAo12StrictStartSolveSK";

    if (Number.isFinite(strict.value) && (next[strictValueField] == null || strict.value < next[strictValueField])) {
      next[strictValueField] = strict.value;
      next[strictStartField] = strict.startSolveSK || null;
    }
  }

  return next;
}

async function getStatsItem(ddb, tableName, pk, sk) {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk },
    })
  );
  return out.Item || null;
}

async function upsertSessionStatsOnNewSolve(ddb, tableName, userID, solveItem) {
  const ev = normalizeEvent(solveItem?.Event);
  const sid = normalizeSessionID(solveItem?.SessionID);
  const pk = `USER#${userID}`;
  const sk = `SESSIONSTATS#${ev}#${sid}`;

  const existingStats = await getStatsItem(ddb, tableName, pk, sk);

  if (
    existingStats?.LastSolveAt &&
    String(solveItem?.CreatedAt || "") < String(existingStats.LastSolveAt)
  ) {
    return recomputeSessionStats(ddb, tableName, userID, ev, sid);
  }

  const recentSolves = await getLastNSolvesBySession(ddb, tableName, userID, ev, sid, 1000);

  let nextStats = mergeIncrementalStats(existingStats, solveItem, recentSolves, 3);
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 5, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 12, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 25, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 50, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 100, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 1000, {
    includeCounters: false,
  });

  const item = {
    PK: pk,
    SK: sk,
    ItemType: "SESSIONSTATS",
    Event: ev,
    SessionID: sid,
    UpdatedAt: nowIso(),
    stale: false,
    ...nextStats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function upsertEventStatsOnNewSolve(ddb, tableName, userID, solveItem) {
  const ev = normalizeEvent(solveItem?.Event);
  const pk = `USER#${userID}`;
  const sk = `EVENTSTATS#${ev}`;

  const existingStats = await getStatsItem(ddb, tableName, pk, sk);

  if (
    existingStats?.LastSolveAt &&
    String(solveItem?.CreatedAt || "") < String(existingStats.LastSolveAt)
  ) {
    return recomputeEventStats(ddb, tableName, userID, ev);
  }

  const recentSolves = await getLastNSolvesByEvent(ddb, tableName, userID, ev, 1000);

  let nextStats = mergeIncrementalStats(existingStats, solveItem, recentSolves, 3);
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 5, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 12, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 25, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 50, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 100, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 1000, {
    includeCounters: false,
  });

  const item = {
    PK: pk,
    SK: sk,
    ItemType: "EVENTSTATS",
    Event: ev,
    UpdatedAt: nowIso(),
    stale: false,
    ...nextStats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function upsertTagStatsOnNewSolve(
  ddb,
  tableName,
  userID,
  solveItem,
  { event, sessionID = null, tagKey, tagValue } = {}
) {
  const ev = normalizeEvent(event || solveItem?.Event);
  const sid = sessionID == null || sessionID === "" ? null : normalizeSessionID(sessionID);
  const key = String(tagKey || "").trim();
  const cleanValue = cleanTagValue(tagValue);
  const tagValueNorm = normalizeTagIndexValue(cleanValue);
  const pk = `USER#${userID}`;
  const sk = buildTagStatsSK(ev, sid, key, cleanValue);

  if (!ev || !key || !tagValueNorm) {
    throw new Error("Invalid tag stats scope");
  }

  const existingStats = await getStatsItem(ddb, tableName, pk, sk);

  if (
    existingStats?.LastSolveAt &&
    String(solveItem?.CreatedAt || "") < String(existingStats.LastSolveAt)
  ) {
    return recomputeTagStats(ddb, tableName, userID, ev, sid, key, cleanValue);
  }

  const recentSolves = await getLastNSolvesByTag(
    ddb,
    tableName,
    userID,
    key,
    cleanValue,
    { event: ev, sessionID: sid || "" },
    1000
  );

  let nextStats = mergeIncrementalStats(existingStats, solveItem, recentSolves, 3);
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 5, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 12, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 25, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 50, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 100, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 1000, {
    includeCounters: false,
  });

  const item = {
    PK: pk,
    SK: sk,
    ItemType: "TAGSTATS",
    Event: ev,
    TagKey: key,
    TagValue: cleanValue,
    TagValueNorm: tagValueNorm,
    UpdatedAt: nowIso(),
    stale: false,
    ...nextStats,
  };
  if (sid) item.SessionID = sid;

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

module.exports = {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  getDayKey,
  getDayBucketTimeZone,
  normalizePenalty,
  createSolveID,
  buildSolveSK,
  parseSolveSK,
  computeFinalTimeMs,
  getRawTimeMs,
  getFinalTimeMs,
  isDnfSolve,
  computeWindowAverageMs,
  computeWindowMeanMs,
  buildStatsFromSolves,
  STRICT_WINDOW_VERSION,
  DAY_BUCKET_VERSION,
  BEST_WINDOW_CONFIGS,
  CACHED_WINDOW_CONFIGS,
  buildDayBucketSK,
  buildDayBucketItem,
  buildDayBucketSummaryFromSolves,
  mergeDayBucketSummaries,
  buildTopWindowCandidatesFromSolves,
  buildWindowCandidateStatsFromSolves,
  buildCachedWindowCandidateStatsFromSolves,

  cleanTagValue,
  normalizeTagIndexValue,
  sanitizeTags,
  buildTagStatsSK,
  buildSolveTagSK,
  getSparseTagIndexConfig,
  buildSparseTagIndexPK,
  buildSolveSparseTagIndexFields,

  buildSolveItem,
  getSolveTagPairsFromItem,
  buildSolveTagItems,
  putSolveAndTagItems,
  replaceSolveAndTagItems,
  deleteSolveAndTagItems,
  batchWriteAll,

  getAllSolvesBySession,
  getAllSolvesByEvent,
  getAllSolvesByTag,
  getLastNSolvesBySession,
  getLastNSolvesByEvent,
  getLastNSolvesByTag,
  querySolvesBySparseTag,

  recomputeSessionStats,
  recomputeEventStats,
  recomputeTagStats,
  upsertSessionStatsOnNewSolve,
  upsertEventStatsOnNewSolve,
  upsertTagStatsOnNewSolve,
};
