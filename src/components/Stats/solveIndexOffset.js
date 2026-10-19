// The stats page only loads the most recent solves, so their fullIndex counts
// from the start of the loaded window (0..499), not the start of the session.
// The offset is how many older, unloaded solves come first; adding it turns
// fullIndex into the real solve number.
//
// Returns null when the real numbers can't be known, so callers hide the range
// instead of showing window positions (e.g. "401-500" for solves ~50,000).
// That fallback-to-0 is the bug this keeps regressing to: the cached total is
// missing whenever the stats fetch fails, is offline, or hasn't landed yet.
export function computeSolveIndexOffset({
  hasActiveTagFilter = false,
  statsViewMode = "standard",
  useBucketBackedRange = false,
  hasActiveDateFilter = false,
  rawRangeViewActive = false,
  rawRangeIndexOffset = null,
  overallStats = null,
  loadedCount = 0,
  isAllLoaded = false,
} = {}) {
  // Tag-filtered solves can predate the loaded window.
  if (hasActiveTagFilter) return null;
  if (statsViewMode !== "standard" || useBucketBackedRange) return 0;
  if (hasActiveDateFilter) {
    return rawRangeViewActive && rawRangeIndexOffset != null ? rawRangeIndexOffset : 0;
  }
  const rawTotal = overallStats?.SolveCountTotal;
  const total = rawTotal == null ? NaN : Number(rawTotal);
  const loaded = Number(loadedCount) || 0;
  // No (or stale) total: only a fully loaded scope can number itself.
  if (!Number.isFinite(total) || total < loaded) return isAllLoaded ? 0 : null;
  return total - loaded;
}
