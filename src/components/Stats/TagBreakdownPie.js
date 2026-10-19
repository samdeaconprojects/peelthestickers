import React, { useEffect, useMemo, useState } from "react";
import PieChartBuilder, { getPieSliceStrokeWidth } from "./PieChartBuilder";
import { formatTime } from "../TimeList/TimeUtils";
import {
  getAlgorithmTagDisplayValue,
  getEventScopedAlgorithmFields,
  getSharedTagFieldMeta,
  getSolveTagValue,
  resolveTagChipTone,
} from "../TagBar/tagUtils";
import tagBadge from "../../assets/Tag.svg";
import { useSettings } from "../../contexts/SettingsContext";
import "../TimeList/TimeItem.css";
import "./Stats.css";

const CORE_FIELDS = new Set([
  "CubeModel",
  "CrossColor",
  "Method",
  "TimerInput",
  "SolveSource",
]);

function formatSolveCount(count) {
  return `${count} ${count === 1 ? "solve" : "solves"}`;
}

function getSolveTimeMs(solve) {
  const candidate = Number(
    solve?.finalTimeMs ??
      solve?.FinalTimeMs ??
      solve?.time ??
      solve?.Time ??
      solve?.rawTimeMs ??
      solve?.RawTimeMs ??
      solve?.rawTime
  );
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
}

function makeRankPalette(count) {
  const safeCount = Math.max(1, Number(count) || 0);
  return Array.from({ length: safeCount }, (_, index) => {
    const ratio = safeCount <= 1 ? 0 : index / (safeCount - 1);
    const hue = 140 - ratio * 138;
    return `hsl(${hue} 88% 58%)`;
  });
}

const UNSET_TAG_SLICE_COLOR = "rgba(255,255,255,0.42)";

// Same colour bands as TimeItem, scaled to the bucket's own best/worst.
function getSolvePerfClass(ms, minMs, maxMs, mode) {
  if (!Number.isFinite(ms) || !Number.isFinite(minMs) || !Number.isFinite(maxMs)) return "";
  if (maxMs <= minMs) return "";
  if (ms <= minMs) return "dashed-border-min";
  if (ms >= maxMs) return "dashed-border-max";

  const ratio = (ms - minMs) / (maxMs - minMs);
  if (mode === "spectrum") {
    if (ratio <= 0.2) return "fastest";
    if (ratio <= 0.4) return "faster";
    if (ratio <= 0.6) return "middle-fast";
    if (ratio <= 0.8) return "slower";
    return "slowest";
  }
  return ratio <= 0.5 ? "faster" : "slower";
}

function formatBucketAverage(value) {
  return Number.isFinite(value) ? formatTime(value) : "DNF";
}

function getPrimaryMetricMeta(sortMode, bucket, percent) {
  if (sortMode === "count") {
    return {
      label: "Count",
      value: String(bucket.value),
      subvalue: `${percent}%`,
    };
  }

  if (sortMode === "best" || sortMode === "worst") {
    return {
      label: sortMode === "best" ? "Best" : "Worst",
      value: formatBucketExtreme(bucket, sortMode === "best" ? bucket.bestMs : bucket.worstMs),
      subvalue: formatSolveCount(bucket.value),
    };
  }

  return {
    label: "Average",
    value: formatBucketAverage(bucket.averageMs),
    subvalue: formatSolveCount(bucket.value),
  };
}

// Aggregated buckets carry no solves; an Unknown slice derived from totals has
// no best/worst to show.
function formatBucketExtreme(bucket, value) {
  return bucket?.extremesUnavailable ? "—" : formatBucketAverage(value);
}

function formatBucketLabel(field, value) {
  if (!value) return "Unknown";
  if (String(field || "").startsWith("Alg_")) {
    return getAlgorithmTagDisplayValue(field, value) || value;
  }
  return value;
}

function buildBucketData(solves, field) {
  const grouped = new Map();

  for (const solve of Array.isArray(solves) ? solves : []) {
    const rawValue = getSolveTagValue(solve, field) || "Unknown";
    const label = formatBucketLabel(field, rawValue);
    const timeMs = getSolveTimeMs(solve);
    const next = grouped.get(rawValue) || {
      key: rawValue,
      label,
      value: 0,
      solves: [],
      sumMs: 0,
      validCount: 0,
      bestMs: null,
      worstMs: null,
    };

    next.value += 1;
    next.solves.push(solve);

    if (Number.isFinite(timeMs)) {
      next.sumMs += timeMs;
      next.validCount += 1;
      next.bestMs = next.bestMs == null ? timeMs : Math.min(next.bestMs, timeMs);
      next.worstMs = next.worstMs == null ? timeMs : Math.max(next.worstMs, timeMs);
    }

    grouped.set(rawValue, next);
  }

  return Array.from(grouped.values())
    .map((bucket) => ({
      ...bucket,
      averageMs: bucket.validCount > 0 ? bucket.sumMs / bucket.validCount : null,
      dnfCount: bucket.value - bucket.validCount,
    }))
    .sort((a, b) => {
      const aAvg = Number.isFinite(a.averageMs) ? a.averageMs : Number.POSITIVE_INFINITY;
      const bAvg = Number.isFinite(b.averageMs) ? b.averageMs : Number.POSITIVE_INFINITY;
      if (aAvg !== bAvg) return aAvg - bAvg;
      if (b.value !== a.value) return b.value - a.value;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
}

function groupAggregateItemsByField(items) {
  const byField = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const field = String(item?.TagKey || "").trim();
    const value = String(item?.TagValue || "").trim();
    const count = Number(item?.SolveCountTotal || 0);
    if (!field || !value || !(count > 0)) continue;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(item);
  }
  return byField;
}

function getAggregateUnknownCount(fieldItems, summary) {
  const total = Number(summary?.SolveCountTotal || 0);
  const tagged = fieldItems.reduce((sum, item) => sum + Number(item?.SolveCountTotal || 0), 0);
  return Math.max(0, total - tagged);
}

// Same bucket shape as buildBucketData, from per-tag stats records instead of
// raw solves. Whatever the scope total has beyond the tagged solves is Unknown.
function buildAggregateBucketData(fieldItems, field, summary) {
  const finiteOrNull = (value) =>
    value != null && Number.isFinite(Number(value)) ? Number(value) : null;

  const buckets = fieldItems.map((item) => {
    const value = Number(item.SolveCountTotal || 0);
    const validCount = Math.min(value, Number(item.SolveCountIncluded || 0));
    const sumMs = Number(item.SumFinalTimeMs || 0);
    return {
      key: item.TagValue,
      label: formatBucketLabel(field, item.TagValue),
      value,
      solves: [],
      sumMs,
      validCount,
      bestMs: finiteOrNull(item.BestSingleMs),
      worstMs: finiteOrNull(item.WorstSingleMs),
      averageMs: validCount > 0 ? sumMs / validCount : null,
      dnfCount: value - validCount,
    };
  });

  const unknownCount = getAggregateUnknownCount(fieldItems, summary);
  if (unknownCount > 0) {
    const validCount = Math.min(
      unknownCount,
      Math.max(
        0,
        Number(summary?.SolveCountIncluded || 0) -
          buckets.reduce((sum, bucket) => sum + bucket.validCount, 0)
      )
    );
    const sumMs = Math.max(
      0,
      Number(summary?.SumFinalTimeMs || 0) - buckets.reduce((sum, bucket) => sum + bucket.sumMs, 0)
    );
    buckets.push({
      key: "Unknown",
      label: "Unknown",
      value: unknownCount,
      solves: [],
      sumMs,
      validCount,
      bestMs: null,
      worstMs: null,
      averageMs: validCount > 0 ? sumMs / validCount : null,
      dnfCount: unknownCount - validCount,
      extremesUnavailable: true,
    });
  }

  return buckets.sort(compareBucketsByAverage);
}

function compareBucketsByAverage(a, b) {
  const aAvg = Number.isFinite(a.averageMs) ? a.averageMs : Number.POSITIVE_INFINITY;
  const bAvg = Number.isFinite(b.averageMs) ? b.averageMs : Number.POSITIVE_INFINITY;
  if (aAvg !== bAvg) return aAvg - bAvg;
  if (b.value !== a.value) return b.value - a.value;
  return String(a.label || "").localeCompare(String(b.label || ""));
}

function compareBucketsByCount(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  return compareBucketsByAverage(a, b);
}

// Fastest first on the given single (bestMs or worstMs); buckets without one go last.
function makeExtremeComparator(field) {
  return (a, b) => {
    const aMs = Number.isFinite(a[field]) ? a[field] : Number.POSITIVE_INFINITY;
    const bMs = Number.isFinite(b[field]) ? b[field] : Number.POSITIVE_INFINITY;
    if (aMs !== bMs) return aMs - bMs;
    return compareBucketsByAverage(a, b);
  };
}

const BUCKET_COMPARATORS = {
  average: compareBucketsByAverage,
  count: compareBucketsByCount,
  best: makeExtremeComparator("bestMs"),
  worst: makeExtremeComparator("worstMs"),
};

const SORT_MODE_OPTIONS = [
  { value: "average", label: "Avg" },
  { value: "best", label: "Best" },
  { value: "worst", label: "Worst" },
  { value: "count", label: "Count" },
];

function assignBucketColorIndices(buckets) {
  return buckets.map((bucket, index) => ({
    ...bucket,
    colorIndex: index,
  }));
}

// Picks the field that splits the solves into the most groups, skipping fields
// the page is already filtered on (those collapse into a single slice). Fields
// tagged on most solves win over sparsely tagged ones.
function pickMostPartitionedField(fields, solves, excludedFields) {
  const total = solves.length;
  let best = null;

  for (const meta of fields) {
    const field = String(meta?.field || "").trim();
    if (!field || excludedFields.has(field)) continue;

    const values = new Set();
    let taggedCount = 0;
    for (const solve of solves) {
      const value = getSolveTagValue(solve, field);
      if (!value) continue;
      values.add(value);
      taggedCount += 1;
    }
    if (values.size < 2) continue;

    const candidate = {
      field,
      mostlyTagged: total > 0 && taggedCount / total >= 0.5,
      groupCount: values.size,
      taggedCount,
    };
    if (
      !best ||
      Number(candidate.mostlyTagged) > Number(best.mostlyTagged) ||
      (candidate.mostlyTagged === best.mostlyTagged &&
        (candidate.groupCount > best.groupCount ||
          (candidate.groupCount === best.groupCount && candidate.taggedCount > best.taggedCount)))
    ) {
      best = candidate;
    }
  }

  return best?.field || "";
}

const NO_FILTERED_FIELDS = [];

// Hovering swaps the active bucket constantly, so the newest-solves lookup is a
// single pass cached per bucket rather than a full date sort on every hover.
const recentBucketSolvesCache = new WeakMap();

function getRecentBucketSolves(solves, limit = 5) {
  if (!Array.isArray(solves) || !solves.length) return [];
  const cached = recentBucketSolvesCache.get(solves);
  if (cached) return cached;

  const newest = [];
  for (const solve of solves) {
    const time = new Date(solve?.datetime || "").getTime();
    const rank = Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
    if (newest.length === limit && rank <= newest[newest.length - 1].rank) continue;
    let at = newest.length;
    while (at > 0 && newest[at - 1].rank < rank) at -= 1;
    newest.splice(at, 0, { rank, solve });
    if (newest.length > limit) newest.pop();
  }

  const recent = newest.map((item) => item.solve);
  recentBucketSolvesCache.set(solves, recent);
  return recent;
}

function TagBreakdownPie({
  solves,
  tagConfig,
  eventKey,
  onSolveOpen,
  filteredFields = NO_FILTERED_FIELDS,
  aggregateItems = null,
  aggregateSummary = null,
  tagColors,
  profileColor = "#2EC4B6",
  onBucketSolvesOpen,
}) {
  const { settings } = useSettings();
  const timeColorMode = settings?.timeColorMode || "binary";
  const safeSolves = useMemo(() => (Array.isArray(solves) ? solves : []), [solves]);
  const fieldMeta = useMemo(() => getSharedTagFieldMeta(tagConfig), [tagConfig]);
  const eventAlgorithmFields = useMemo(
    () => new Set(getEventScopedAlgorithmFields(eventKey)),
    [eventKey]
  );

  // With no raw solves loaded (the bucket-backed overview), fall back to the
  // per-tag stats records when they are supplied.
  const aggregateByField = useMemo(
    () =>
      !safeSolves.length && Array.isArray(aggregateItems) && aggregateItems.length
        ? groupAggregateItemsByField(aggregateItems)
        : null,
    [aggregateItems, safeSolves.length]
  );

  const [hideUnknown, setHideUnknown] = useState(true);

  // Tabs are ordered by how many buckets (slices) each field splits the solves
  // into; the Unknown bucket only counts while it is shown.
  const availableFields = useMemo(() => {
    const fields = fieldMeta.filter((meta) => {
      const field = String(meta?.field || "").trim();
      const hasData = aggregateByField
        ? aggregateByField.has(field)
        : safeSolves.some((solve) => !!getSolveTagValue(solve, field));
      const isCoreField = CORE_FIELDS.has(field);
      const isAlgorithmField = field.startsWith("Alg_");
      const isCustomField = field.startsWith("Custom");
      const hasLabel = !!String(meta?.label || "").trim();

      if (hasData) return true;
      if (isCoreField) return true;
      if (isAlgorithmField) return eventAlgorithmFields.has(field);
      if (isCustomField) return hasLabel && hasLabel !== field;
      return false;
    });

    return fields
      .map((meta) => {
        if (aggregateByField) {
          const fieldItems = aggregateByField.get(meta.field) || [];
          const hasUnknown = !hideUnknown && getAggregateUnknownCount(fieldItems, aggregateSummary) > 0;
          return { ...meta, bucketCount: fieldItems.length + (hasUnknown ? 1 : 0) };
        }
        const values = new Set();
        for (const solve of safeSolves) {
          const value = getSolveTagValue(solve, meta.field);
          if (value || !hideUnknown) values.add(value || "Unknown");
        }
        return { ...meta, bucketCount: values.size };
      })
      .sort((a, b) => b.bucketCount - a.bucketCount);
  }, [aggregateByField, aggregateSummary, eventAlgorithmFields, fieldMeta, hideUnknown, safeSolves]);

  const [activeField, setActiveField] = useState(() => availableFields[0]?.field || "CubeModel");
  const [activeBucketKey, setActiveBucketKey] = useState("");
  const [hoveredBucketKey, setHoveredBucketKey] = useState("");
  const [sortMode, setSortMode] = useState("average");
  const [sortDirection, setSortDirection] = useState("asc");
  const [hiddenBucketKeys, setHiddenBucketKeys] = useState([]);
  const [colorMode, setColorMode] = useState("tag");

  useEffect(() => {
    if (!availableFields.some((item) => item.field === activeField)) {
      setActiveField(availableFields[0]?.field || "CubeModel");
    }
  }, [activeField, availableFields]);

  // Until the user picks a tab, follow the most partitioned field as solves
  // load (the first render has no solves, so every field ties). When the page
  // is filtered to a tag (e.g. one cube model), that field is a single slice,
  // so skip it for the next most partitioned field.
  const filteredFieldsKey = (Array.isArray(filteredFields) ? filteredFields : []).join("|");
  const [userPickedField, setUserPickedField] = useState(false);
  useEffect(() => {
    setUserPickedField(false);
  }, [filteredFieldsKey]);
  const suggestedField = useMemo(() => {
    if (!filteredFieldsKey) return availableFields[0]?.field || "";
    return pickMostPartitionedField(availableFields, safeSolves, new Set(filteredFieldsKey.split("|")));
  }, [availableFields, filteredFieldsKey, safeSolves]);
  useEffect(() => {
    if (userPickedField || !suggestedField) return;
    setActiveField(suggestedField);
  }, [suggestedField, userPickedField]);

  const activeFieldMeta = useMemo(
    () => availableFields.find((item) => item.field === activeField) || availableFields[0] || null,
    [activeField, availableFields]
  );

  const buckets = useMemo(() => {
    const field = activeFieldMeta?.field || "CubeModel";
    if (aggregateByField) {
      return buildAggregateBucketData(aggregateByField.get(field) || [], field, aggregateSummary);
    }
    return buildBucketData(safeSolves, field);
  }, [activeFieldMeta?.field, aggregateByField, aggregateSummary, safeSolves]);

  const hasUnknownBucket = useMemo(
    () => buckets.some((bucket) => bucket.key === "Unknown" || bucket.label === "Unknown"),
    [buckets]
  );

  const visibleBuckets = useMemo(() => {
    if (!hideUnknown) return buckets;
    return buckets.filter((bucket) => bucket.key !== "Unknown" && bucket.label !== "Unknown");
  }, [buckets, hideUnknown]);

  const rankedBuckets = useMemo(() => {
    const comparator = BUCKET_COMPARATORS[sortMode] || compareBucketsByAverage;
    const next = [...visibleBuckets].sort(comparator);
    if (sortDirection === "desc") next.reverse();
    return assignBucketColorIndices(next);
  }, [visibleBuckets, sortDirection, sortMode]);

  const orderedBuckets = useMemo(() => {
    if (!hiddenBucketKeys.length) return rankedBuckets;
    const hiddenSet = new Set(hiddenBucketKeys);
    return rankedBuckets.filter((bucket) => !hiddenSet.has(bucket.key));
  }, [hiddenBucketKeys, rankedBuckets]);

  useEffect(() => {
    const visibleKeys = new Set(rankedBuckets.map((bucket) => bucket.key));
    setHiddenBucketKeys((current) => current.filter((key) => visibleKeys.has(key)));
  }, [rankedBuckets]);

  const canResetHiddenBuckets = hiddenBucketKeys.length > 0;

  const handleBucketHide = (entry) => {
    const bucketKey = String(entry?.key || "").trim();
    if (!bucketKey) return;

    setHiddenBucketKeys((current) => {
      if (current.includes(bucketKey)) return current;
      if (orderedBuckets.length <= 1) return current;
      return [...current, bucketKey];
    });
  };

  useEffect(() => {
    if (!orderedBuckets.some((bucket) => bucket.key === activeBucketKey)) {
      setActiveBucketKey(orderedBuckets[0]?.key || "");
    }
  }, [activeBucketKey, orderedBuckets]);

  useEffect(() => {
    if (!orderedBuckets.some((bucket) => bucket.key === hoveredBucketKey)) {
      setHoveredBucketKey("");
    }
  }, [hoveredBucketKey, orderedBuckets]);

  // A tag's own colour (cube model, cross colour, ...) when it has one set; an
  // empty fallback tells apart tags that would otherwise get the profile colour.
  const bucketTagColors = useMemo(
    () =>
      rankedBuckets.map((bucket) =>
        bucket.key === "Unknown"
          ? ""
          : resolveTagChipTone(activeFieldMeta?.field, bucket.key, tagColors, "")
      ),
    [activeFieldMeta?.field, rankedBuckets, tagColors]
  );
  const hasTagColors = bucketTagColors.some(Boolean);
  const useTagColors = hasTagColors && colorMode === "tag";

  const palette = useMemo(
    () =>
      useTagColors
        ? bucketTagColors.map((color) => color || UNSET_TAG_SLICE_COLOR)
        : makeRankPalette(rankedBuckets.length),
    [bucketTagColors, rankedBuckets.length, useTagColors]
  );
  const topAverageBucketKeys = useMemo(() => {
    const limit = Math.max(1, Math.ceil(orderedBuckets.length * 0.25));
    return new Set(
      [...orderedBuckets]
        .sort(compareBucketsByAverage)
        .slice(0, limit)
        .map((bucket) => bucket.key)
    );
  }, [orderedBuckets]);

  const chartData = useMemo(
    () =>
      orderedBuckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        value: bucket.value,
        colorIndex: bucket.colorIndex,
        solves: bucket.solves,
        calloutLines: [bucket.label, `Avg ${formatBucketAverage(bucket.averageMs)}`, formatSolveCount(bucket.value)],
        alwaysShowCallout: topAverageBucketKeys.has(bucket.key),
      })),
    [orderedBuckets, topAverageBucketKeys]
  );

  const totalCount = orderedBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const displayBucketKey = hoveredBucketKey || activeBucketKey;
  const activeBucket =
    orderedBuckets.find((bucket) => bucket.key === displayBucketKey) || orderedBuckets[0] || null;
  const activeBucketPercent =
    activeBucket && totalCount > 0 ? Math.round((activeBucket.value / totalCount) * 100) : 0;
  const activePrimaryMetric = activeBucket
    ? getPrimaryMetricMeta(sortMode, activeBucket, activeBucketPercent)
    : null;
  const recentBucketSolves = useMemo(
    () => (activeBucket ? getRecentBucketSolves(activeBucket.solves) : []),
    [activeBucket]
  );

  // Tag pills use the tag's own colour (cube model, cross colour, ...), not the slice colour.
  const getBucketTagColor = (bucket) =>
    bucket.key === "Unknown"
      ? "rgba(255,255,255,0.42)"
      : resolveTagChipTone(activeFieldMeta?.field, bucket.key, tagColors, profileColor);

  // Aggregate buckets load their solves through the tag index, which has no
  // entry for untagged (Unknown) solves.
  const canOpenBucketSolves = (bucket) =>
    typeof onBucketSolvesOpen === "function" &&
    !!bucket &&
    bucket.value > 0 &&
    (bucket.solves?.length > 0 || (!!aggregateByField && bucket.key !== "Unknown"));
  const openBucketSolves = (bucket) => onBucketSolvesOpen(bucket, activeFieldMeta);

  const unknownToggleButton = (
    <button
      type="button"
      className={`tagBreakdownToolButton ${hideUnknown ? "is-active" : ""}`}
      onClick={() => setHideUnknown((prev) => !prev)}
    >
      {hideUnknown ? "Show Unknown" : "Hide Unknown"}
    </button>
  );

  return (
    <div className="tagBreakdownView">
      <div className="tagBreakdownFieldTabs" role="tablist" aria-label="Tag breakdown fields">
        <img src={tagBadge} alt="Tag breakdown" title="Tag breakdown" className="tagBreakdownFieldTabsIcon" />
        {availableFields.map((field) => (
          <button
            key={field.field}
            type="button"
            className={`tagBreakdownFieldTab ${field.field === activeFieldMeta?.field ? "is-active" : ""}`}
            onClick={() => {
              setUserPickedField(true);
              setActiveField(field.field);
            }}
          >
            <span>{field.label}</span>
            {field.field === activeFieldMeta?.field ? (
              <span className="tagBreakdownFieldTabCount">
                {field.bucketCount} {field.bucketCount === 1 ? "bucket" : "buckets"}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {!orderedBuckets.length ? (
        <div className="tagBreakdownEmpty">
          {hideUnknown
            ? "Only Unknown solves are available for this field right now."
            : "No tag data is available for this field in the currently visible solves."}
          {hasUnknownBucket ? unknownToggleButton : null}
        </div>
      ) : (
        <div className="tagBreakdownBody">
          <div className="tagBreakdownChartCard">
            <div className="tagBreakdownChartStage">
              {hasUnknownBucket || canResetHiddenBuckets ? (
                <div className="tagBreakdownChartReset">
                  {hasUnknownBucket ? unknownToggleButton : null}
                  {canResetHiddenBuckets ? (
                    <button
                      type="button"
                      className="statsToggleBtn barChartToggleBtn pieChartResetButton"
                      onClick={() => setHiddenBucketKeys([])}
                    >
                      Reset chart
                    </button>
                  ) : null}
                </div>
              ) : null}
              <PieChartBuilder
                width="100%"
                height="100%"
                data={chartData}
                colorPalette={palette}
                showLegend={false}
                showCallouts
                maxCallouts={10}
                promoteHoveredOverflowItem
                sortMode="none"
                sliceStrokeWidth={getPieSliceStrokeWidth(orderedBuckets.length)}
                showInnerOutline
                onSliceClick={(_, entry) => {
                  const bucket = orderedBuckets.find((item) => item.key === entry?.key);
                  if (canOpenBucketSolves(bucket)) openBucketSolves(bucket);
                  else handleBucketHide(entry);
                }}
                onSliceHover={(entry) => {
                  const bucketKey = entry?.key || "";
                  setHoveredBucketKey(bucketKey);
                  // Keep the last hovered slice in the focus card after the cursor leaves the chart.
                  if (bucketKey) setActiveBucketKey(bucketKey);
                }}
                onSliceLeave={() => setHoveredBucketKey("")}
                highlightedKey={hoveredBucketKey}
              />
            </div>
          </div>

          <div className="tagBreakdownSidebar">
            {activeBucket ? (
              <div className="tagBreakdownFocusCard">
                <div className="tagBreakdownFocusHeader">
                  <span
                    className="tagBreakdownFocusSwatch"
                    style={{
                      backgroundColor:
                        palette[activeBucket.colorIndex] ||
                        "#2EC4B6",
                    }}
                  />
                  <div className="tagBreakdownFocusIntro">
                    <div>
                      <div
                        className="statsScopeTagPill tagBreakdownFocusLabel"
                        style={{
                          "--tag-chip-color": getBucketTagColor(activeBucket),
                          "--tag-chip-bg": "rgba(255,255,255,0.06)",
                        }}
                        title={`${activeFieldMeta?.label || "Tag"}: ${activeBucket.label}`}
                      >
                        <span className="statsScopeTagPillIconWrap" aria-hidden="true">
                          <img src={tagBadge} alt="" className="statsScopeTagPillIcon" />
                        </span>
                        <span className="statsScopeTagPillText">{activeBucket.label}</span>
                      </div>
                      <div className="tagBreakdownFocusMeta">
                        {formatSolveCount(activeBucket.value)} · {activeBucketPercent}% of visible slice
                      </div>
                    </div>
                    {activePrimaryMetric ? (
                      <div className="tagBreakdownFocusHero">
                        <span className="tagBreakdownFocusHeroLabel">{activePrimaryMetric.label}</span>
                        <strong className="tagBreakdownFocusHeroValue">{activePrimaryMetric.value}</strong>
                        <span className="tagBreakdownFocusHeroMeta">{activePrimaryMetric.subvalue}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="tagBreakdownFocusStats">
                  <div className="tagBreakdownFocusStat">
                    <span className="tagBreakdownFocusStatLabel">Average</span>
                    <strong className="tagBreakdownFocusStatValue">
                      {formatBucketAverage(activeBucket.averageMs)}
                    </strong>
                  </div>
                  <div className="tagBreakdownFocusStat tagBreakdownFocusStat--best">
                    <span className="tagBreakdownFocusStatLabel">Best</span>
                    <strong className="tagBreakdownFocusStatValue">
                      {formatBucketExtreme(activeBucket, activeBucket.bestMs)}
                    </strong>
                  </div>
                  <div className="tagBreakdownFocusStat tagBreakdownFocusStat--worst">
                    <span className="tagBreakdownFocusStatLabel">Worst</span>
                    <strong className="tagBreakdownFocusStatValue">
                      {formatBucketExtreme(activeBucket, activeBucket.worstMs)}
                    </strong>
                  </div>
                  <div className="tagBreakdownFocusStat">
                    <span className="tagBreakdownFocusStatLabel">DNFs</span>
                    <strong className="tagBreakdownFocusStatValue">{activeBucket.dnfCount}</strong>
                  </div>
                </div>

                <div className="tagBreakdownFocusActions">
                  {canOpenBucketSolves(activeBucket) ? (
                    <button
                      type="button"
                      className="tagBreakdownToolButton"
                      onClick={() => openBucketSolves(activeBucket)}
                    >
                      View {formatSolveCount(activeBucket.value)}
                    </button>
                  ) : null}
                  {orderedBuckets.length > 1 ? (
                    <button
                      type="button"
                      className="tagBreakdownToolButton"
                      onClick={() => handleBucketHide(activeBucket)}
                    >
                      Hide slice
                    </button>
                  ) : null}
                </div>

                {recentBucketSolves.length ? (
                  <div className="tagBreakdownRecent">
                    <div className="tagBreakdownRecentLabel">Recent solves</div>
                    <div className="tagBreakdownRecentList">
                      {recentBucketSolves.map((solve, index) => {
                        const solveMs = getSolveTimeMs(solve);
                        const perfClass = getSolvePerfClass(
                          solveMs,
                          activeBucket.bestMs,
                          activeBucket.worstMs,
                          timeColorMode
                        );
                        return (
                          <button
                            key={String(solve?.solveRef || solve?.datetime || `${activeBucket.key}-${index}`)}
                            type="button"
                            className={`tagBreakdownRecentSolve ${perfClass}`.trim()}
                            onClick={() => onSolveOpen?.(solve)}
                          >
                            {formatBucketAverage(solveMs)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="tagBreakdownLegendCard">
              <div className="tagBreakdownLegendControls">
                {SORT_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`tagBreakdownLegendControl ${sortMode === option.value ? "is-active" : ""}`}
                    onClick={() => setSortMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="tagBreakdownLegendControl"
                  onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                >
                  {sortDirection === "asc" ? "Flip Desc" : "Flip Asc"}
                </button>
                {hasTagColors ? (
                  <button
                    type="button"
                    className="tagBreakdownLegendControl"
                    title="Switch between each tag's own colour and a green-to-red ranking"
                    onClick={() => setColorMode((prev) => (prev === "tag" ? "rank" : "tag"))}
                  >
                    {useTagColors ? "Colors: Tag" : "Colors: Rank"}
                  </button>
                ) : null}
              </div>

              <div className="tagBreakdownLegendList">
                {orderedBuckets.map((bucket) => {
                  const percent = totalCount > 0 ? Math.round((bucket.value / totalCount) * 100) : 0;
                  const isActive = bucket.key === activeBucket?.key;
                  const primaryMetric = getPrimaryMetricMeta(sortMode, bucket, percent);
                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      className={`tagBreakdownLegendRow ${isActive ? "is-active" : ""}`}
                      style={{
                        "--tag-breakdown-accent": palette[bucket.colorIndex] || "#2EC4B6",
                      }}
                      onClick={() => setActiveBucketKey(bucket.key)}
                      onMouseEnter={() => {
                        setHoveredBucketKey(bucket.key);
                        // Same as leaving a slice: the focus card stays on the last hovered tag.
                        setActiveBucketKey(bucket.key);
                      }}
                      onMouseLeave={() => setHoveredBucketKey("")}
                    >
                      <span
                        className="statsScopeTagPill tagBreakdownLegendLabel"
                        style={{
                          "--tag-chip-color": getBucketTagColor(bucket),
                          "--tag-chip-bg": "rgba(255,255,255,0.06)",
                        }}
                        title={bucket.label}
                      >
                        <span className="statsScopeTagPillIconWrap" aria-hidden="true">
                          <img src={tagBadge} alt="" className="statsScopeTagPillIcon" />
                        </span>
                        <span className="statsScopeTagPillText">{bucket.label}</span>
                      </span>
                      <span className="tagBreakdownLegendMain">
                        <span className="tagBreakdownLegendStats tagBreakdownLegendStats--primary">
                          Avg {formatBucketAverage(bucket.averageMs)} · Best {formatBucketExtreme(bucket, bucket.bestMs)}
                        </span>
                        <span className="tagBreakdownLegendStats">
                          Worst {formatBucketExtreme(bucket, bucket.worstMs)}
                        </span>
                        <span className="tagBreakdownLegendStats">
                          {formatSolveCount(bucket.value)} · {percent}% · {bucket.dnfCount} {bucket.dnfCount === 1 ? "DNF" : "DNFs"}
                        </span>
                      </span>
                      <span className="tagBreakdownLegendMetric">
                        <span className="tagBreakdownLegendMetricLabel">{primaryMetric.label}</span>
                        <strong className="tagBreakdownLegendMetricValue">{primaryMetric.value}</strong>
                        <span className="tagBreakdownLegendMetricMeta">{primaryMetric.subvalue}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(TagBreakdownPie);
