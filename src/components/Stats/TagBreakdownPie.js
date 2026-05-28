import React, { useEffect, useMemo, useState } from "react";
import PieChartBuilder from "./PieChartBuilder";
import { formatTime } from "../TimeList/TimeUtils";
import {
  getAlgorithmTagDisplayValue,
  getEventScopedAlgorithmFields,
  getSharedTagFieldMeta,
  getSolveTagValue,
} from "../TagBar/tagUtils";
import "./Stats.css";

const CORE_FIELDS = new Set([
  "CubeModel",
  "CrossColor",
  "Method",
  "TimerInput",
  "SolveSource",
]);

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

function formatBucketAverage(value) {
  return Number.isFinite(value) ? formatTime(value) : "DNF";
}

function getSortHeading(sortMode, sortDirection) {
  if (sortMode === "count") {
    return sortDirection === "asc" ? "Lowest count to highest" : "Highest count to lowest";
  }
  return sortDirection === "asc" ? "Fastest average to slowest" : "Slowest average to fastest";
}

function getPrimaryMetricMeta(sortMode, bucket, percent) {
  if (sortMode === "count") {
    return {
      label: "Count",
      value: String(bucket.value),
      subvalue: `${percent}%`,
    };
  }

  return {
    label: "Average",
    value: formatBucketAverage(bucket.averageMs),
    subvalue: `${bucket.value} solves`,
  };
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

function getFieldDescription(field) {
  if (field === "CubeModel") return "Break down your visible solves by puzzle setup.";
  if (field === "CrossColor") return "See which starting colors are producing your fastest averages.";
  if (field === "Method") return "Compare solve methods across the current visible slice.";
  if (field === "TimerInput") return "Check whether input style is affecting your results.";
  if (field === "SolveSource") return "Separate standard solves from imports, shared solves, practice, and more.";
  if (String(field || "").startsWith("Alg_")) return "Rank algorithm cases by average solve time.";
  return "Compare tagged groups inside the solves currently on screen.";
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

function TagBreakdownPie({
  solves,
  tagConfig,
  eventKey,
  title = "Tag Breakdown",
  onSolveOpen,
}) {
  const safeSolves = useMemo(() => (Array.isArray(solves) ? solves : []), [solves]);
  const fieldMeta = useMemo(() => getSharedTagFieldMeta(tagConfig), [tagConfig]);
  const eventAlgorithmFields = useMemo(
    () => new Set(getEventScopedAlgorithmFields(eventKey)),
    [eventKey]
  );

  const availableFields = useMemo(() => {
    return fieldMeta.filter((meta) => {
      const field = String(meta?.field || "").trim();
      const hasData = safeSolves.some((solve) => !!getSolveTagValue(solve, field));
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
  }, [eventAlgorithmFields, fieldMeta, safeSolves]);

  const [activeField, setActiveField] = useState(() => availableFields[0]?.field || "CubeModel");
  const [activeBucketKey, setActiveBucketKey] = useState("");
  const [hoveredBucketKey, setHoveredBucketKey] = useState("");
  const [hideUnknown, setHideUnknown] = useState(false);
  const [sortMode, setSortMode] = useState("average");
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    if (!availableFields.some((item) => item.field === activeField)) {
      setActiveField(availableFields[0]?.field || "CubeModel");
    }
  }, [activeField, availableFields]);

  const activeFieldMeta = useMemo(
    () => availableFields.find((item) => item.field === activeField) || availableFields[0] || null,
    [activeField, availableFields]
  );

  const buckets = useMemo(
    () => buildBucketData(safeSolves, activeFieldMeta?.field || "CubeModel"),
    [activeFieldMeta?.field, safeSolves]
  );

  const hasUnknownBucket = useMemo(
    () => buckets.some((bucket) => bucket.key === "Unknown" || bucket.label === "Unknown"),
    [buckets]
  );

  const visibleBuckets = useMemo(() => {
    if (!hideUnknown) return buckets;
    return buckets.filter((bucket) => bucket.key !== "Unknown" && bucket.label !== "Unknown");
  }, [buckets, hideUnknown]);

  const orderedBuckets = useMemo(() => {
    const comparator = sortMode === "count" ? compareBucketsByCount : compareBucketsByAverage;
    const next = [...visibleBuckets].sort(comparator);
    if (sortDirection === "desc") next.reverse();
    return next;
  }, [visibleBuckets, sortDirection, sortMode]);

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

  const palette = useMemo(() => makeRankPalette(orderedBuckets.length), [orderedBuckets.length]);
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
        solves: bucket.solves,
        calloutLines: [bucket.label, `Avg ${formatBucketAverage(bucket.averageMs)}`, `${bucket.value} solves`],
        alwaysShowCallout: topAverageBucketKeys.has(bucket.key),
      })),
    [orderedBuckets, topAverageBucketKeys]
  );

  const totalCount = visibleBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const displayBucketKey = hoveredBucketKey || activeBucketKey;
  const activeBucket =
    orderedBuckets.find((bucket) => bucket.key === displayBucketKey) || orderedBuckets[0] || null;
  const activeBucketPercent =
    activeBucket && totalCount > 0 ? Math.round((activeBucket.value / totalCount) * 100) : 0;
  const activePrimaryMetric = activeBucket
    ? getPrimaryMetricMeta(sortMode, activeBucket, activeBucketPercent)
    : null;
  const recentBucketSolves = useMemo(() => {
    if (!activeBucket) return [];
    return [...activeBucket.solves]
      .sort((a, b) => new Date(b?.datetime || "").getTime() - new Date(a?.datetime || "").getTime())
      .slice(0, 5);
  }, [activeBucket]);

  return (
    <div className="tagBreakdownView">
      <div className="tagBreakdownHeader">
        <div>
          <div className="tagBreakdownEyebrow">{title}</div>
          <h3 className="tagBreakdownTitle">
            {activeFieldMeta?.label || "Tags"} across {totalCount} visible solves
          </h3>
          <p className="tagBreakdownSubtitle">
            {getFieldDescription(activeFieldMeta?.field || "")}
          </p>
        </div>
        <div className="tagBreakdownMeta">
          <div className="tagBreakdownMetaCard">
            <span className="tagBreakdownMetaLabel">Buckets</span>
            <strong className="tagBreakdownMetaValue">{buckets.length}</strong>
          </div>
          <div className="tagBreakdownMetaCard">
            <span className="tagBreakdownMetaLabel">Visible Solves</span>
            <strong className="tagBreakdownMetaValue">{totalCount}</strong>
          </div>
        </div>
      </div>

      <div className="tagBreakdownFieldTabs" role="tablist" aria-label="Tag breakdown fields">
        {availableFields.map((field) => (
          <button
            key={field.field}
            type="button"
            className={`tagBreakdownFieldTab ${field.field === activeFieldMeta?.field ? "is-active" : ""}`}
            onClick={() => setActiveField(field.field)}
          >
            {field.label}
          </button>
        ))}
      </div>

      {hasUnknownBucket ? (
        <div className="tagBreakdownTools">
          <button
            type="button"
            className={`tagBreakdownToolButton ${hideUnknown ? "is-active" : ""}`}
            onClick={() => setHideUnknown((prev) => !prev)}
          >
            {hideUnknown ? "Show Unknown" : "Hide Unknown"}
          </button>
        </div>
      ) : null}

      {!orderedBuckets.length ? (
        <div className="tagBreakdownEmpty">
          {hideUnknown
            ? "Only Unknown solves are available for this field right now."
            : "No tag data is available for this field in the currently visible solves."}
        </div>
      ) : (
        <div className="tagBreakdownBody">
          <div className="tagBreakdownChartCard">
            <div className="tagBreakdownChartStage">
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
                onSliceClick={(_, entry) => setActiveBucketKey(entry?.key || "")}
                onSliceHover={(entry) => setHoveredBucketKey(entry?.key || "")}
                onSliceLeave={() => setHoveredBucketKey("")}
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
                        palette[
                          Math.max(0, orderedBuckets.findIndex((bucket) => bucket.key === activeBucket.key))
                        ] ||
                        "#2EC4B6",
                    }}
                  />
                  <div className="tagBreakdownFocusIntro">
                    <div>
                      <div className="tagBreakdownFocusLabel">{activeBucket.label}</div>
                      <div className="tagBreakdownFocusMeta">
                        {activeBucket.value} solves · {activeBucketPercent}% of visible slice
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
                  <div className="tagBreakdownFocusStat">
                    <span className="tagBreakdownFocusStatLabel">Best</span>
                    <strong className="tagBreakdownFocusStatValue">
                      {formatBucketAverage(activeBucket.bestMs)}
                    </strong>
                  </div>
                  <div className="tagBreakdownFocusStat">
                    <span className="tagBreakdownFocusStatLabel">Worst</span>
                    <strong className="tagBreakdownFocusStatValue">
                      {formatBucketAverage(activeBucket.worstMs)}
                    </strong>
                  </div>
                  <div className="tagBreakdownFocusStat">
                    <span className="tagBreakdownFocusStatLabel">DNFs</span>
                    <strong className="tagBreakdownFocusStatValue">{activeBucket.dnfCount}</strong>
                  </div>
                </div>

                {recentBucketSolves.length ? (
                  <div className="tagBreakdownRecent">
                    <div className="tagBreakdownRecentLabel">Recent solves</div>
                    <div className="tagBreakdownRecentList">
                      {recentBucketSolves.map((solve, index) => (
                        <button
                          key={String(solve?.solveRef || solve?.datetime || `${activeBucket.key}-${index}`)}
                          type="button"
                          className="tagBreakdownRecentSolve"
                          onClick={() => onSolveOpen?.(solve)}
                        >
                          {formatBucketAverage(getSolveTimeMs(solve))}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="tagBreakdownLegendCard">
              <div className="tagBreakdownLegendHeader">
                <div className="tagBreakdownLegendHeaderText">
                  <span>{getSortHeading(sortMode, sortDirection)}</span>
                  <span className="tagBreakdownLegendHeaderSubtext">
                    Big number follows the current sort mode
                  </span>
                </div>
                <span>{sortMode === "count" ? "Count" : "Average"}</span>
              </div>

              <div className="tagBreakdownLegendControls">
                <button
                  type="button"
                  className={`tagBreakdownLegendControl ${sortMode === "average" ? "is-active" : ""}`}
                  onClick={() => setSortMode("average")}
                >
                  Avg
                </button>
                <button
                  type="button"
                  className={`tagBreakdownLegendControl ${sortMode === "count" ? "is-active" : ""}`}
                  onClick={() => setSortMode("count")}
                >
                  Count
                </button>
                <button
                  type="button"
                  className="tagBreakdownLegendControl"
                  onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                >
                  {sortDirection === "asc" ? "Flip Desc" : "Flip Asc"}
                </button>
              </div>

              <div className="tagBreakdownLegendList">
                {orderedBuckets.map((bucket, index) => {
                  const percent = totalCount > 0 ? Math.round((bucket.value / totalCount) * 100) : 0;
                  const isActive = bucket.key === activeBucket?.key;
                  const primaryMetric = getPrimaryMetricMeta(sortMode, bucket, percent);
                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      className={`tagBreakdownLegendRow ${isActive ? "is-active" : ""}`}
                      style={{
                        "--tag-breakdown-accent": palette[index] || "#2EC4B6",
                      }}
                      onClick={() => setActiveBucketKey(bucket.key)}
                      onMouseEnter={() => setHoveredBucketKey(bucket.key)}
                      onMouseLeave={() => setHoveredBucketKey("")}
                    >
                      <span className="tagBreakdownLegendMain">
                        <span className="tagBreakdownLegendLabel">{bucket.label}</span>
                        <span className="tagBreakdownLegendStats tagBreakdownLegendStats--primary">
                          Avg {formatBucketAverage(bucket.averageMs)} · Best {formatBucketAverage(bucket.bestMs)}
                        </span>
                        <span className="tagBreakdownLegendStats">
                          Worst {formatBucketAverage(bucket.worstMs)}
                        </span>
                        <span className="tagBreakdownLegendStats">
                          {bucket.value} solves · {percent}% · {bucket.dnfCount} DNFs
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
