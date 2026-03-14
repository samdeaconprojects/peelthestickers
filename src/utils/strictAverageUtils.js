import { calculateAverage } from "../components/TimeList/TimeUtils";

function getPenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
}

function getSolveSource(solve) {
  return String(solve?.tags?.SolveSource || solve?.Tags?.SolveSource || "").trim().toUpperCase();
}

function getSolveNote(solve) {
  return String(solve?.note ?? solve?.Note ?? "").trim();
}

function getAdjustedSolveTime(solve) {
  if (!solve) return "DNF";
  if (getPenalty(solve) === "DNF") return "DNF";

  const base =
    typeof solve?.originalTime === "number" && Number.isFinite(solve.originalTime)
      ? solve.originalTime
      : typeof solve?.rawTime === "number" && Number.isFinite(solve.rawTime)
      ? solve.rawTime
      : typeof solve?.rawTimeMs === "number" && Number.isFinite(solve.rawTimeMs)
      ? solve.rawTimeMs
      : typeof solve?.time === "number" && Number.isFinite(solve.time)
      ? solve.time
      : typeof solve?.finalTimeMs === "number" && Number.isFinite(solve.finalTimeMs)
      ? solve.finalTimeMs
      : null;

  if (!Number.isFinite(base)) return "DNF";
  if (getPenalty(solve) === "+2") return base + 2000;
  return base;
}

function computeWindowValue(solves, kind) {
  const adjusted = (Array.isArray(solves) ? solves : []).map(getAdjustedSolveTime);
  if (!adjusted.length) return null;

  if (kind === "mo3") {
    if (adjusted.some((value) => value === "DNF")) return null;
    const numeric = adjusted.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (!numeric.length) return null;
    return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  }

  const out = calculateAverage(adjusted, true)?.average;
  return typeof out === "number" && Number.isFinite(out) ? out : null;
}

function buildWcaRoundWindows(solves, size) {
  const input = Array.isArray(solves) ? solves : [];
  const groups = new Map();
  const out = [];

  for (let i = 0; i < input.length; i += 1) {
    const solve = input[i];
    const source = getSolveSource(solve);
    const note = getSolveNote(solve);

    if (source !== "WCA" || !note) continue;
    const existing = groups.get(note) || [];
    existing.push({ solve, index: i });
    groups.set(note, existing);
  }

  for (const items of groups.values()) {
    if (items.length < size) continue;
    for (let offset = 0; offset + size <= items.length; offset += size) {
      out.push({
        startIndex: items[offset].index,
        solves: items.slice(offset, offset + size).map((item) => item.solve),
      });
    }
  }

  return out;
}

function buildChunkedWindowsForRange(solves, size, startIndex = 0) {
  const input = Array.isArray(solves) ? solves : [];
  const out = [];

  for (let i = 0; i + size <= input.length; i += size) {
    out.push({
      startIndex: startIndex + i,
      solves: input.slice(i, i + size),
    });
  }

  return out;
}

export function getStrictWindowCandidates(solves, size) {
  const input = Array.isArray(solves) ? solves : [];
  const out = [];

  for (let i = 0; i < input.length; ) {
    const solve = input[i];
    const source = getSolveSource(solve);
    const note = getSolveNote(solve);

    if (source === "WCA" && note) {
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < input.length) {
      const next = input[j];
      if (getSolveSource(next) === "WCA" && getSolveNote(next)) break;
      j += 1;
    }

    out.push(...buildChunkedWindowsForRange(input.slice(i, j), size, i));
    i = j;
  }

  out.push(...buildWcaRoundWindows(input, size));
  return out;
}

export function findBestStrictWindow(solves, size, kind = "ao") {
  const candidates = getStrictWindowCandidates(solves, size);
  let best = null;

  for (const candidate of candidates) {
    const value = computeWindowValue(candidate.solves, kind);
    if (!Number.isFinite(value)) continue;

    if (!best || value < best.value) {
      best = {
        value,
        startIndex: candidate.startIndex,
        solves: candidate.solves,
      };
    }
  }

  return best;
}
