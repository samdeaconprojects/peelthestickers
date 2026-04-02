import React, { useMemo, useState, useEffect } from "react";
import LineChartBuilder from "./LineChartBuilder";
import TimePeriodChart from "./TimePeriodChart";
import Detail from "../Detail/Detail";
import "./Stats.css";
import { formatTime } from "../TimeList/TimeUtils";

import useSolveSelection from "../../hooks/useSolveSelection";
import useBulkSolveActions from "../../hooks/useBulkSolveActions";
import BulkSolveControls from "../SolveBulk/BulkSolveControls";

/* -----------------------------
   DATE GROUPING HELPERS
----------------------------- */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function safeDateFromSolve(s) {
  const raw = s?.datetime ?? s?.DateTime ?? s?.dateTime;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function getSolveTimestamp(solve) {
  const date = safeDateFromSolve(solve);
  return date ? date.getTime() : null;
}

function formatBucketLabel(mode, key) {
  if (!key) return "";
  if (mode === "day") {
    const [, m, d] = key.split("-");
    return `${m}/${d}`;
  }
  if (mode === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y.slice(2)}`;
  }
  if (mode === "week") {
    const parts = key.split("-W");
    return parts.length === 2 ? `W${parts[1]}` : key;
  }
  if (mode === "year") return key;
  return key;
}

function getSolveBaseMs(solve) {
  if (!solve) return null;

  if (solve.penalty === "DNF") {
    if (typeof solve.originalTime === "number" && isFinite(solve.originalTime)) {
      return solve.originalTime;
    }
    if (typeof solve.rawTime === "number" && isFinite(solve.rawTime)) {
      return solve.rawTime;
    }
    return null;
  }

  if (typeof solve.time === "number" && isFinite(solve.time)) {
    return solve.time;
  }

  if (typeof solve.rawTime === "number" && isFinite(solve.rawTime)) {
    return solve.rawTime;
  }

  return null;
}

function groupByDate(solves, mode) {
  const map = new Map();

  for (const s of solves) {
    const d = safeDateFromSolve(s);
    if (!d) continue;

    let key;
    switch (mode) {
      case "day":
        key = d.toISOString().split("T")[0];
        break;
      case "week":
        key = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
        break;
      case "month":
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "year":
        key = `${d.getFullYear()}`;
        break;
      default:
        key = d.toISOString();
        break;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }

  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return keys
    .map((key) => {
      const arr = map.get(key) || [];

      const valid = arr.filter((solve) => {
        const ms = getSolveBaseMs(solve);
        return typeof ms === "number" && isFinite(ms);
      });

      if (valid.length === 0) return null;

      const avgMs =
        valid.reduce((sum, solve) => {
          const base = getSolveBaseMs(solve);
          return sum + base;
        }, 0) / valid.length;

      const lastSolve = valid[valid.length - 1];

      return {
        isBucket: true,
        bucketKey: key,
        bucketLabel: formatBucketLabel(mode, key),
        time: avgMs,
        solve: lastSolve,
        fullIndex: lastSolve?.fullIndex ?? null,
      };
    })
    .filter(Boolean);
}

function parseBucketDayKey(dayKey) {
  if (!dayKey) return null;
  const date = new Date(`${dayKey}T12:00:00`);
  return isNaN(date.getTime()) ? null : date;
}

function groupBucketItems(bucketItems, mode) {
  const map = new Map();

  for (const item of Array.isArray(bucketItems) ? bucketItems : []) {
    const dayKey = String(item?.BucketDay || "").trim();
    const date = parseBucketDayKey(dayKey);
    if (!date) continue;

    let key;
    switch (mode) {
      case "day":
        key = dayKey;
        break;
      case "week":
        key = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
        break;
      case "month":
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "year":
        key = `${date.getFullYear()}`;
        break;
      default:
        key = dayKey;
        break;
    }

    const existing = map.get(key) || {
      bucketKey: key,
      bucketLabel: formatBucketLabel(mode, key),
      timestamp: date.getTime(),
      SolveCountIncluded: 0,
      SumFinalTimeMs: 0,
    };

    existing.timestamp = Math.min(existing.timestamp, date.getTime());
    existing.SolveCountIncluded += Number(item?.SolveCountIncluded || 0);
    existing.SumFinalTimeMs += Number(item?.SumFinalTimeMs || 0);

    map.set(key, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((item) => {
      if (!item.SolveCountIncluded) return null;
      return {
        isBucket: true,
        bucketKey: item.bucketKey,
        bucketLabel: item.bucketLabel,
        time: item.SumFinalTimeMs / item.SolveCountIncluded,
        timestamp: item.timestamp,
        solve: null,
        fullIndex: null,
      };
    })
    .filter(Boolean);
}

/* -----------------------------
   ROLLING AVERAGES (AoN)
----------------------------- */
function rollingAverageSeconds(data, windowSize) {
  const out = new Array(data.length).fill(null);
  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < data.length; i++) {
    const v = data[i]?.y;
    if (typeof v === "number" && isFinite(v)) {
      sum += v;
      validCount += 1;
    }

    if (i >= windowSize) {
      const prev = data[i - windowSize]?.y;
      if (typeof prev === "number" && isFinite(prev)) {
        sum -= prev;
        validCount -= 1;
      }
    }

    if (i >= windowSize - 1 && validCount === windowSize) {
      out[i] = sum / windowSize;
    }
  }

  return out;
}

function interpolateHexColor(a, b, ratio) {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  const parse = (hex) => String(hex || "").replace("#", "");
  const start = parse(a);
  const end = parse(b);
  if (start.length !== 6 || end.length !== 6) return a || b || "#ffffff";

  const parts = [0, 2, 4].map((offset) => {
    const av = parseInt(start.slice(offset, offset + 2), 16);
    const bv = parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(av + (bv - av) * safeRatio).toString(16).padStart(2, "0");
  });

  return `#${parts.join("")}`;
}

function resolvePaletteColor(style, ratio, fallback = "#2EC4B6") {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (!style) return fallback;
  if (style.mode === "gradient" && Array.isArray(style.stops) && style.stops.length >= 3) {
    if (safeRatio <= 0.5) {
      return interpolateHexColor(style.stops[0], style.stops[1], safeRatio / 0.5);
    }
    return interpolateHexColor(style.stops[1], style.stops[2], (safeRatio - 0.5) / 0.5);
  }
  return style.primary || fallback;
}

function resolveStandardHeatColor(ratio) {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (safeRatio <= 0.25) {
    return interpolateHexColor("#00ff00", "#00e676", safeRatio / 0.25);
  }
  if (safeRatio <= 0.7) {
    return interpolateHexColor("#00e676", "#ffff00", (safeRatio - 0.25) / 0.45);
  }
  if (safeRatio <= 0.95) {
    return interpolateHexColor("#ffff00", "#ffa500", (safeRatio - 0.7) / 0.25);
  }
  return interpolateHexColor("#ffa500", "#ff0000", (safeRatio - 0.95) / 0.05);
}

function getPercentile(sortedValues, percentile) {
  const values = Array.isArray(sortedValues) ? sortedValues : [];
  if (!values.length) return null;
  const safePercentile = Math.min(1, Math.max(0, Number(percentile) || 0));
  const index = (values.length - 1) * safePercentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = values[lowerIndex];
  const upper = values[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  const weight = index - lowerIndex;
  return lower + (upper - lower) * weight;
}

function normalizeHexColor(value, fallback = "#2EC4B6") {
  let hex = String(value || "").trim().replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex}`;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex).replace("#", "");
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function formatXAxisLabel(groupMode, timestamp, fallbackLabel) {
  if (typeof timestamp !== "number" || !isFinite(timestamp)) return fallbackLabel;

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return fallbackLabel;

  if (groupMode === "solve") {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  if (groupMode === "day" || groupMode === "week") {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  if (groupMode === "month") {
    return `${date.getMonth() + 1}/${String(date.getFullYear()).slice(2)}`;
  }

  return `${date.getFullYear()}`;
}

function formatPointTime(baseTimeMs, solve, groupMode) {
  const timeText = formatTime(baseTimeMs);
  const timestamp = getSolveTimestamp(solve);
  if (typeof timestamp !== "number" || !isFinite(timestamp)) return timeText;

  const date = new Date(timestamp);
  const dateText =
    groupMode === "solve"
      ? date.toLocaleString([], {
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : date.toLocaleDateString([], {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });

  return `${timeText} • ${dateText}`;
}

function getTightAutoScale(values) {
  const safeValues = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "number" && isFinite(value)
  );

  if (!safeValues.length) {
    return { min: 0, max: 2 };
  }

  const minValue = Math.min(...safeValues);
  const maxValue = Math.max(...safeValues);
  const min = Math.max(0, Math.floor(minValue / 2) * 2);
  const max = Math.max(min + 2, Math.ceil(maxValue / 2) * 2);

  return { min, max };
}

function getBaselineScale(values) {
  const safeValues = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "number" && isFinite(value)
  );

  if (!safeValues.length) {
    return { min: 0, max: 1 };
  }

  return {
    min: 0,
    max: Math.max(1, Math.ceil(Math.max(...safeValues))),
  };
}

function getDefaultDotSizeForSolveCount(count) {
  const safeCount = Math.max(1, Number(count) || 0);
  if (safeCount <= 5) return 10;
  if (safeCount <= 12) return 9;
  if (safeCount <= 25) return 8;
  if (safeCount <= 50) return 7;
  if (safeCount <= 149) return 6;
  if (safeCount <= 249) return 5;
  if (safeCount <= 349) return 4;
  if (safeCount <= 749) return 3;
  return 2;
}

function buildProcessedChartData(
  solves,
  groupMode,
  style = null,
  useHeatmap = true,
  xScaleMode = "ordinal",
  bucketItems = []
) {
  const hasBucketItems = Array.isArray(bucketItems) && bucketItems.length > 0;
  const baseValid = hasBucketItems
    ? []
    : (Array.isArray(solves) ? solves : []).filter((solve) => {
        const ms = getSolveBaseMs(solve);
        return typeof ms === "number" && isFinite(ms);
      });

  let processed = [];
  if (hasBucketItems) {
    processed = groupBucketItems(bucketItems, groupMode === "solve" ? "day" : groupMode);
  } else if (groupMode === "solve") {
    processed = baseValid;
  } else {
    processed = groupByDate(baseValid, groupMode);
  }

  if (processed.length === 0) {
    return { data: [], solveCountText: "Solve Count: 0" };
  }

  const timesMs = processed
    .map((item) => (item.isBucket ? item.time : getSolveBaseMs(item)))
    .filter((v) => typeof v === "number" && isFinite(v));

  const sortedTimesMs = [...timesMs].sort((a, b) => a - b);
  const minTime = Math.min(...timesMs);
  const maxTime = Math.max(...timesMs);
  const robustMinTime = getPercentile(sortedTimesMs, 0.1) ?? minTime;
  const robustMaxTime = getPercentile(sortedTimesMs, 0.9) ?? maxTime;
  const denom = maxTime - minTime || 1;
  const robustDenom = robustMaxTime - robustMinTime || denom;

  const getColor = (timeMs) => {
    if (style) {
      const ratio = (timeMs - minTime) / denom;
      return resolvePaletteColor(style, ratio, style.primary || "#2EC4B6");
    }

    if (!useHeatmap) return "#2EC4B6";

    const ratio = (timeMs - robustMinTime) / robustDenom;
    return resolveStandardHeatColor(ratio);
  };

  const data = processed.map((item, index) => {
    const baseTimeMs = item.isBucket ? item.time : getSolveBaseMs(item);
    const solveForDetail = item.isBucket ? item.solve : item;
    const timestamp = item.isBucket
      ? item.timestamp ?? getSolveTimestamp(solveForDetail)
      : getSolveTimestamp(solveForDetail);
    const fallbackLabel = item.isBucket ? item.bucketLabel : `${index + 1}`;
    const label =
      xScaleMode === "datetime"
        ? formatXAxisLabel(groupMode, timestamp, fallbackLabel)
        : fallbackLabel;
    const selectionIndex = item.isBucket ? null : index;

    return {
      label,
      x: xScaleMode === "datetime" && timestamp != null ? timestamp : index,
      y: baseTimeMs / 1000,
      color: getColor(baseTimeMs),
      time: formatPointTime(baseTimeMs, solveForDetail, groupMode),
      solve: solveForDetail,
      fullIndex: item.fullIndex,
      isDNF: item.isBucket ? false : item.penalty === "DNF",
      isBucket: !!item.isBucket,
      bucketDay:
        item.isBucket && /^\d{4}-\d{2}-\d{2}$/.test(String(item.bucketKey || ""))
          ? String(item.bucketKey)
          : "",
      selectionIndex,
    };
  });

  return {
    data,
    solveCountText: `${groupMode === "solve" ? "Solve" : "Bucket"} Count: ${data.length}`,
  };
}

function LineChart({
  user,
  solves,
  bucketItems = [],
  comparisonSeries = [],
  seriesStyle = null,
  legendItems = [],
  title,
  deleteTime,
  addPost,
  applyPenalty,
  setSessions,
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode = false,
  allowViewPicker = true,
  initialControlState = null,
  controlsSyncKey = "",
  viewMode = "standard",
  selectedDay = "",
  onSelectedDayChange = null,
  onSolveOpen = null,
  onControlsChange = null,
  onBucketSelect = null,
}) {
  const DEFAULT_DOT_SIZE = 5;
  const MIN_DOT_SIZE = 2;
  const MAX_DOT_SIZE = 10;

  const [selectedSolve, setSelectedSolve] = useState(null);

  const resolvedInitialControlState = useMemo(() => ({
    showAo5: initialControlState?.showAo5 !== false,
    showAo12: initialControlState?.showAo12 !== false,
    showMean: initialControlState?.showMean !== false,
    showGrid: initialControlState?.showGrid !== false,
    groupMode: initialControlState?.groupMode || "solve",
    xScaleMode: initialControlState?.xScaleMode || "ordinal",
    dotSize: Math.min(
      MAX_DOT_SIZE,
      Math.max(
        MIN_DOT_SIZE,
        Number(initialControlState?.dotSize) ||
          getDefaultDotSizeForSolveCount(solves?.length || DEFAULT_DOT_SIZE)
      )
    ),
    useTightAutoScale: initialControlState?.useTightAutoScale !== false,
    yMinInput: String(initialControlState?.yMinInput || ""),
    yMaxInput: String(initialControlState?.yMaxInput || ""),
  }), [initialControlState, solves]);

  const [showAo5, setShowAo5] = useState(() => resolvedInitialControlState.showAo5);
  const [showAo12, setShowAo12] = useState(() => resolvedInitialControlState.showAo12);
  const [showMean, setShowMean] = useState(() => resolvedInitialControlState.showMean);
  const [showGrid, setShowGrid] = useState(() => resolvedInitialControlState.showGrid);
  const [groupMode, setGroupMode] = useState(() => resolvedInitialControlState.groupMode);
  const [xScaleMode, setXScaleMode] = useState(() => resolvedInitialControlState.xScaleMode);
  const [dotSize, setDotSize] = useState(() => resolvedInitialControlState.dotSize);
  const [useTightAutoScale, setUseTightAutoScale] = useState(
    () => resolvedInitialControlState.useTightAutoScale
  );
  const [yMinInput, setYMinInput] = useState(() => resolvedInitialControlState.yMinInput);
  const [yMaxInput, setYMaxInput] = useState(() => resolvedInitialControlState.yMaxInput);

  const selection = useSolveSelection();
  const hasComparison = Array.isArray(comparisonSeries) && comparisonSeries.length > 0;
  const hasBucketItems = Array.isArray(bucketItems) && bucketItems.length > 0;
  const baseValid = useMemo(() => {
    if (hasBucketItems) return [];
    const input = Array.isArray(solves) ? solves : [];
    return input.filter((solve) => {
      const ms = getSolveBaseMs(solve);
      return typeof ms === "number" && isFinite(ms);
    });
  }, [hasBucketItems, solves]);

  const bulkSelectableSolves = useMemo(() => {
    return groupMode === "solve" && !hasComparison && !hasBucketItems ? baseValid : [];
  }, [groupMode, baseValid, hasBucketItems, hasComparison]);

  const bulkActions = useBulkSolveActions({
    user,
    solves: bulkSelectableSolves,
    selectedIndices: selection.selectedIndices,
    clearSelection: selection.clearSelection,
    deleteTime,
    addPost,
    setSessions,
    sessionsList,
    currentEvent,
    currentSession,
    eventKey,
    practiceMode,
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selection.selectionCount > 0) {
          e.preventDefault();
          selection.clearSelection();
        }
        if (bulkActions.showBulkTags) bulkActions.setShowBulkTags(false);
        if (bulkActions.showBulkMove) bulkActions.setShowBulkMove(false);
        if (bulkActions.showBulkShare) bulkActions.setShowBulkShare(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, bulkActions]);

  const computed = useMemo(() => {
    const shouldUseHeatmap = !seriesStyle;
    const primary = buildProcessedChartData(
      solves,
      groupMode,
      seriesStyle,
      shouldUseHeatmap,
      xScaleMode,
      bucketItems
    );
    const data = primary.data;
    const extraSeries = [];
    const solveLevel = groupMode === "solve" && !hasBucketItems;

    if (solveLevel && showAo5 && !hasComparison) {
      const ao5 = rollingAverageSeconds(data, 5);
      extraSeries.push({
        id: "ao5",
        label: "Ao5",
        stroke: "#3B82F6",
        points: data.map((d, i) => ({ x: d.x, y: ao5[i] })),
      });
    }

    if (solveLevel && showAo12 && !hasComparison) {
      const ao12 = rollingAverageSeconds(data, 12);
      extraSeries.push({
        id: "ao12",
        label: "Ao12",
        stroke: "#A855F7",
        points: data.map((d, i) => ({ x: d.x, y: ao12[i] })),
      });
    }

    const compareData = (comparisonSeries || []).map((series, index) => {
      const resolved = buildProcessedChartData(
        series?.solves || [],
        groupMode,
        series?.style || null,
        false,
        xScaleMode,
        series?.bucketItems || []
      );
      return {
        id: series?.id || `compare-${index}`,
        label: series?.label || `Compare ${index + 1}`,
        stroke: resolvePaletteColor(series?.style || null, 0.5, "#7c8cff"),
        points: resolved.data,
      };
    });

    return {
      data,
      solveCountText: primary.solveCountText,
      extraSeries,
      compareData,
    };
  }, [bucketItems, comparisonSeries, groupMode, hasBucketItems, hasComparison, seriesStyle, showAo5, showAo12, solves, xScaleMode]);

  const solveLevel = groupMode === "solve" && !hasBucketItems;
  const bulkEnabled = solveLevel && !hasComparison;
  const isTimeView = viewMode === "time";
  const profileColor = normalizeHexColor(user?.Color || user?.color || "#2EC4B6");

  useEffect(() => {
    if (!isTimeView) return;
    if (groupMode === "solve") {
      setGroupMode("day");
    }
  }, [groupMode, isTimeView]);

  useEffect(() => {
    if (!hasBucketItems) return;
    if (groupMode === "solve") {
      setGroupMode("day");
    }
  }, [groupMode, hasBucketItems]);

  useEffect(() => {
    if (groupMode !== "solve") return;
    setDotSize(getDefaultDotSizeForSolveCount(baseValid.length || solves?.length || DEFAULT_DOT_SIZE));
  }, [baseValid.length, groupMode, solves]);

  useEffect(() => {
    if (!controlsSyncKey) return;
    const next = resolvedInitialControlState;
    setShowAo5(next.showAo5);
    setShowAo12(next.showAo12);
    setShowMean(next.showMean);
    setShowGrid(next.showGrid);
    setGroupMode(next.groupMode);
    setXScaleMode(next.xScaleMode);
    setDotSize(next.dotSize);
    setUseTightAutoScale(next.useTightAutoScale);
    setYMinInput(next.yMinInput);
    setYMaxInput(next.yMaxInput);
  }, [controlsSyncKey, resolvedInitialControlState]);

  useEffect(() => {
    if (typeof onControlsChange !== "function") return;
    onControlsChange({
      showAo5,
      showAo12,
      showMean,
      showGrid,
      groupMode,
      xScaleMode,
      dotSize,
      useTightAutoScale,
      yMinInput,
      yMaxInput,
    });
  }, [
    dotSize,
    groupMode,
    onControlsChange,
    showAo5,
    showAo12,
    showGrid,
    showMean,
    useTightAutoScale,
    xScaleMode,
    yMaxInput,
    yMinInput,
  ]);

  const scaleValues = useMemo(
    () =>
      [
      ...computed.data.map((point) => point?.y),
      ...computed.compareData.flatMap((series) => (series.points || []).map((point) => point?.y)),
    ]
      .filter((value) => typeof value === "number" && isFinite(value)),
    [computed.compareData, computed.data]
  );

  const tightAutoScale = useMemo(() => getTightAutoScale(scaleValues), [scaleValues]);
  const baselineScale = useMemo(() => getBaselineScale(scaleValues), [scaleValues]);

  const meanValue = useMemo(() => {
    const values = computed.data
      .map((point) => point?.y)
      .filter((value) => typeof value === "number" && isFinite(value));

    if (!values.length) return null;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [computed.data]);

  const parsedYMin = Number(yMinInput);
  const parsedYMax = Number(yMaxInput);
  const hasCustomYRange =
    yMinInput !== "" &&
    yMaxInput !== "" &&
    Number.isFinite(parsedYMin) &&
    Number.isFinite(parsedYMax) &&
    parsedYMax > parsedYMin;
  const activeScale = useTightAutoScale ? tightAutoScale : baselineScale;
  const resolvedYMin = hasCustomYRange ? parsedYMin : activeScale.min;
  const resolvedYMax = hasCustomYRange ? parsedYMax : activeScale.max;

  const openSolveDetail = (solve) => {
    if (typeof onSolveOpen === "function") {
      onSolveOpen(solve);
      return;
    }
    setSelectedSolve(solve);
  };

  const handleDotClick = (event, solve, fullIndex, point) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (point?.isBucket) {
      if (typeof onBucketSelect === "function" && point.bucketDay) {
        onBucketSelect(point.bucketDay);
        return;
      }
      openSolveDetail(solve);
      return;
    }

    if (!point || point.selectionIndex == null || !bulkEnabled) {
      openSolveDetail(solve);
      return;
    }

    const syntheticEvent = {
      shiftKey: window.__ptsShiftDown === true,
      ctrlKey: window.__ptsCtrlDown === true,
      metaKey: window.__ptsMetaDown === true,
      preventDefault: () => {},
    };

    const handledAsSelection = selection.handleSelectionClick(syntheticEvent, point.selectionIndex);
    if (handledAsSelection) return;

    openSolveDetail(solve);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Shift") window.__ptsShiftDown = true;
      if (e.key === "Control") window.__ptsCtrlDown = true;
      if (e.key === "Meta") window.__ptsMetaDown = true;
    };

    const onKeyUp = (e) => {
      if (e.key === "Shift") window.__ptsShiftDown = false;
      if (e.key === "Control") window.__ptsCtrlDown = false;
      if (e.key === "Meta") window.__ptsMetaDown = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.__ptsShiftDown = false;
      window.__ptsCtrlDown = false;
      window.__ptsMetaDown = false;
    };
  }, []);

  return (
    <div
      className="lineChart"
      style={{
        "--line-chart-accent": profileColor,
        "--line-chart-accent-soft": hexToRgba(profileColor, 0.18),
        "--line-chart-accent-strong": hexToRgba(profileColor, 0.55),
      }}
    >
      {isTimeView ? (
        <TimePeriodChart
          user={user}
          solves={solves}
          deleteTime={deleteTime}
          addPost={addPost}
          applyPenalty={applyPenalty}
          setSessions={setSessions}
        />
      ) : (
      <>
      {bulkEnabled && (
        <BulkSolveControls
          selectionCount={selection.selectionCount}
          clearSelection={selection.clearSelection}
          showBulkTags={bulkActions.showBulkTags}
          setShowBulkTags={bulkActions.setShowBulkTags}
          showBulkMove={bulkActions.showBulkMove}
          setShowBulkMove={bulkActions.setShowBulkMove}
          showBulkShare={bulkActions.showBulkShare}
          setShowBulkShare={bulkActions.setShowBulkShare}
          openBulkTags={bulkActions.openBulkTags}
          openBulkMove={bulkActions.openBulkMove}
          openBulkShare={bulkActions.openBulkShare}
          bulkTagMode={bulkActions.bulkTagMode}
          setBulkTagMode={bulkActions.setBulkTagMode}
          bulkCubeModel={bulkActions.bulkCubeModel}
          setBulkCubeModel={bulkActions.setBulkCubeModel}
          bulkCrossColor={bulkActions.bulkCrossColor}
          setBulkCrossColor={bulkActions.setBulkCrossColor}
          bulkTimerInput={bulkActions.bulkTimerInput}
          setBulkTimerInput={bulkActions.setBulkTimerInput}
          bulkSolveSource={bulkActions.bulkSolveSource}
          setBulkSolveSource={bulkActions.setBulkSolveSource}
          bulkCustom1={bulkActions.bulkCustom1}
          setBulkCustom1={bulkActions.setBulkCustom1}
          bulkCustom2={bulkActions.bulkCustom2}
          setBulkCustom2={bulkActions.setBulkCustom2}
          bulkCustom3={bulkActions.bulkCustom3}
          setBulkCustom3={bulkActions.setBulkCustom3}
          bulkCustom4={bulkActions.bulkCustom4}
          setBulkCustom4={bulkActions.setBulkCustom4}
          bulkCustom5={bulkActions.bulkCustom5}
          setBulkCustom5={bulkActions.setBulkCustom5}
          bulkMoveEvent={bulkActions.bulkMoveEvent}
          setBulkMoveEvent={bulkActions.setBulkMoveEvent}
          bulkMoveSession={bulkActions.bulkMoveSession}
          setBulkMoveSession={bulkActions.setBulkMoveSession}
          bulkShareNote={bulkActions.bulkShareNote}
          setBulkShareNote={bulkActions.setBulkShareNote}
          getSessionsForEvent={bulkActions.getSessionsForEvent}
          applyBulkTags={bulkActions.applyBulkTags}
          applyBulkMove={bulkActions.applyBulkMove}
          applyBulkDelete={bulkActions.applyBulkDelete}
          applyBulkShare={bulkActions.applyBulkShare}
          enableShare={true}
        />
      )}

      {allowViewPicker && (
        <div className="lineChartControls">
          <div className="chartControlGroup chartControlGroup--mode">
            <div className="chartModeGrid">
              {!isTimeView && !hasBucketItems && (
                <button
                  type="button"
                  className={`statsToggleBtn ${groupMode === "solve" ? "is-active" : ""}`}
                  onClick={() => {
                    selection.clearSelection();
                    setGroupMode("solve");
                  }}
                >
                  Idx
                </button>
              )}
              <button
                type="button"
                className={`statsToggleBtn ${groupMode === "day" ? "is-active" : ""}`}
                onClick={() => {
                  selection.clearSelection();
                  setGroupMode("day");
                }}
              >
                D
              </button>
              <button
                type="button"
                className={`statsToggleBtn ${groupMode === "week" ? "is-active" : ""}`}
                onClick={() => {
                  selection.clearSelection();
                  setGroupMode("week");
                }}
              >
                W
              </button>
              <button
                type="button"
                className={`statsToggleBtn ${groupMode === "month" ? "is-active" : ""}`}
                onClick={() => {
                  selection.clearSelection();
                  setGroupMode("month");
                }}
              >
                M
              </button>
              <button
                type="button"
                className={`statsToggleBtn ${groupMode === "year" ? "is-active" : ""}`}
                onClick={() => {
                  selection.clearSelection();
                  setGroupMode("year");
                }}
              >
                Y
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`statsToggleBtn ${showAo5 ? "is-active" : ""}`}
            disabled={!solveLevel || isTimeView || hasComparison}
            onClick={() => setShowAo5((value) => !value)}
          >
            Ao5
          </button>

          <button
            type="button"
            className={`statsToggleBtn ${showAo12 ? "is-active" : ""}`}
            disabled={!solveLevel || isTimeView || hasComparison}
            onClick={() => setShowAo12((value) => !value)}
          >
            Ao12
          </button>

          <button
            type="button"
            className={`statsToggleBtn ${xScaleMode === "datetime" ? "is-active" : ""}`}
            onClick={() =>
              setXScaleMode((value) => (value === "datetime" ? "ordinal" : "datetime"))
            }
          >
            Date Gaps
          </button>

          <button
            type="button"
            className={`statsToggleBtn ${showMean ? "is-active" : ""}`}
            onClick={() => setShowMean((value) => !value)}
          >
            Mean
          </button>

          <button
            type="button"
            className={`statsToggleBtn ${showGrid ? "is-active" : ""}`}
            onClick={() => setShowGrid((value) => !value)}
          >
            Grid
          </button>

          <div className="chartControlGroup chartControlGroup--inline">
            <span className="chartControlLabel">Dots</span>
            <div className="chartControlRow">
              <button
                type="button"
                className="statsMiniBtn"
                onClick={() => setDotSize((value) => Math.max(MIN_DOT_SIZE, value - 1))}
              >
                -
              </button>
              <span className="chartControlValue">{dotSize}</span>
              <button
                type="button"
                className="statsMiniBtn"
                onClick={() => setDotSize((value) => Math.min(MAX_DOT_SIZE, value + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="chartControlGroup chartControlGroup--inline chartControlGroup--scale">
            <span className="chartControlLabel">Scale</span>
            <div className="chartControlRow chartControlRow--scale">
              <button
                type="button"
                className={`statsMiniBtn chartScaleAutoBtn ${useTightAutoScale ? "is-active" : ""}`}
                onClick={() => {
                  setUseTightAutoScale((value) => {
                    const nextValue = !value;
                    if (nextValue) {
                      setYMinInput("");
                      setYMaxInput("");
                    }
                    return nextValue;
                  });
                }}
              >
                Auto
              </button>
              <input
                className="chartScaleInput"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder={String(activeScale.min)}
                value={yMinInput}
                onChange={(e) => {
                  setUseTightAutoScale(false);
                  setYMinInput(e.target.value);
                }}
                aria-label="Minimum seconds"
              />
              <span className="chartControlDivider">to</span>
              <input
                className="chartScaleInput"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder={String(activeScale.max)}
                value={yMaxInput}
                onChange={(e) => {
                  setUseTightAutoScale(false);
                  setYMaxInput(e.target.value);
                }}
                aria-label="Maximum seconds"
              />
            </div>
          </div>

          {hasComparison && legendItems.length > 0 && (
            <div className="lineChartLegend">
              {legendItems.map((item) => (
                <div key={item.id || item.label} className="lineChartLegendItem">
                  <span
                    className="lineChartLegendSwatch"
                    style={{ backgroundColor: item.color || "#2EC4B6" }}
                  />
                  <span className="lineChartLegendLabel">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="lineChartBody">
        <div className="lineChartCanvas">
          <LineChartBuilder
            width={560}
            height={320}
            data={computed.data}
            extraSeries={computed.extraSeries}
            comparisonSeries={computed.compareData}
            referenceLines={
              showMean && meanValue != null
                ? [
                    {
                      id: "mean",
                      y: meanValue,
                      label: `Mean ${meanValue.toFixed(2)}s`,
                      stroke: "#FFD54A",
                    },
                  ]
                : []
            }
            primaryStroke={hasComparison ? computed.data?.[0]?.color || "#2EC4B6" : "#2EC4B6"}
            horizontalGuides={5}
            precision={2}
            verticalGuides={7}
            showGuides={showGrid}
            selectedIndices={selection.selectedIndices}
            dotRadius={dotSize}
            selectedDotRadius={dotSize + 3}
            yMin={resolvedYMin}
            yMax={resolvedYMax}
            onDotClick={(event, solve, fullIndex, point) => {
              handleDotClick(event, solve, fullIndex, point);
            }}
          />
        </div>
      </div>

      {!onSolveOpen && selectedSolve && (
        <Detail
          solve={selectedSolve}
          userID={user?.UserID}
          profileColor={user?.Color || user?.color || "#2EC4B6"}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => {
            const solveRef = selectedSolve?.solveRef || null;
            if (solveRef && deleteTime) deleteTime(solveRef);
          }}
          addPost={addPost}
          applyPenalty={applyPenalty}
          setSessions={setSessions}
        />
      )}
      </>
      )}
    </div>
  );
}

export default React.memo(LineChart);
