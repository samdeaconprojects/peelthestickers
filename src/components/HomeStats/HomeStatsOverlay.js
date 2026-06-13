import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import LineChartBuilder from "../Stats/LineChartBuilder";
import BarChart from "../Stats/BarChart";
import PercentBar from "../Stats/PercentBar";
import PieChartBuilder from "../Stats/PieChartBuilder";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import {
  getProfileChartPalette,
  getProfileChartStyle,
  resolvePaletteColor,
} from "../../utils/profileChartStyle";
import {
  HOME_STAT_SLOT_META,
  HOME_STAT_SLOT_ORDER,
  normalizeHomeStatsSlots,
  normalizeHomeStatsSolveLimit,
} from "./homeStatsConfig";
import "./HomeStatsOverlay.css";

const HOME_SUMMARY_METRICS = [
  {
    key: "single",
    label: "Single",
    kind: "single",
    solveField: "BestSingleSolveSK",
    worstSolveField: "WorstSingleSolveSK",
  },
  {
    key: "mo3",
    label: "MO3",
    size: 3,
    kind: "mo3",
    startField: "BestMo3StartSolveSK",
    worstStartField: "WorstMo3StartSolveSK",
  },
  {
    key: "ao5",
    label: "AO5",
    size: 5,
    kind: "ao",
    startField: "BestAo5StartSolveSK",
    worstStartField: "WorstAo5StartSolveSK",
  },
  {
    key: "ao12",
    label: "AO12",
    size: 12,
    kind: "ao",
    startField: "BestAo12StartSolveSK",
    worstStartField: "WorstAo12StartSolveSK",
  },
  { key: "ao25", label: "AO25", size: 25, kind: "ao", startField: "BestAo25StartSolveSK" },
  { key: "ao50", label: "AO50", size: 50, kind: "ao", startField: "BestAo50StartSolveSK" },
  { key: "ao100", label: "AO100", size: 100, kind: "ao", startField: "BestAo100StartSolveSK" },
  { key: "ao1000", label: "AO1000", size: 1000, kind: "ao", startField: "BestAo1000StartSolveSK" },
];

const HOME_SUMMARY_LAYOUT = [
  ["single", "ao5", "ao12"],
  ["mo3", "ao25", "ao50"],
];

const HOME_SUMMARY_METRIC_BY_KEY = new Map(
  HOME_SUMMARY_METRICS.map((metric) => [metric.key, metric])
);

function getSolvePenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
}

function getSolveTimeMs(solve) {
  if (!solve) return null;
  if (getSolvePenalty(solve) === "DNF") return null;

  const time = Number(
    solve?.time ?? solve?.finalTimeMs ?? solve?.FinalTimeMs ?? solve?.rawTimeMs ?? solve?.RawTimeMs
  );
  return Number.isFinite(time) && time >= 0 ? time : null;
}

function getSolveDate(solve) {
  const raw = solve?.datetime || solve?.createdAt || solve?.CreatedAt || solve?.DateTime || null;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getSolveValueForAverage(solve) {
  if (getSolvePenalty(solve) === "DNF") return "DNF";
  const ms = getSolveTimeMs(solve);
  return Number.isFinite(ms) ? ms : "DNF";
}

function getAdjustedSolveTimeMs(solve) {
  if (!solve) return null;
  const penalty = getSolvePenalty(solve);
  if (penalty === "DNF") return null;
  const ms = getSolveTimeMs(solve);
  if (!Number.isFinite(ms)) return null;
  return penalty === "+2" ? ms + 2000 : ms;
}

function computeWindowExtremeValue(solves, spec, mode = "best") {
  const source = Array.isArray(solves) ? solves : [];
  if (!source.length) return null;
  const isWorst = mode === "worst";

  if (spec.kind === "single") {
    const numeric = source
      .map(getAdjustedSolveTimeMs)
      .filter((value) => Number.isFinite(value));
    return numeric.length ? (isWorst ? Math.max(...numeric) : Math.min(...numeric)) : null;
  }

  if (source.length < spec.size) return null;

  let extreme = null;

  for (let index = 0; index <= source.length - spec.size; index += 1) {
    const window = source.slice(index, index + spec.size);
    let value = null;

    if (spec.kind === "mo3") {
      const numeric = window
        .map(getAdjustedSolveTimeMs)
        .filter((item) => Number.isFinite(item));
      if (numeric.length === spec.size) {
        value = numeric.reduce((sum, item) => sum + item, 0) / numeric.length;
      }
    } else if (spec.kind === "ao") {
      const result = calculateAverage(window.map(getSolveValueForAverage), true)?.average;
      value = Number.isFinite(result) ? result : null;
    }

    if (
      Number.isFinite(value) &&
      (extreme == null || (isWorst ? value > extreme : value < extreme))
    ) {
      extreme = value;
    }
  }

  return extreme;
}

function computeCurrentMetricValue(solves, spec) {
  const source = Array.isArray(solves) ? solves : [];
  if (!source.length) return null;

  if (spec.kind === "single") {
    return getAdjustedSolveTimeMs(source[source.length - 1]);
  }

  if (source.length < spec.size) return null;

  const window = source.slice(-spec.size);

  if (spec.kind === "mo3") {
    const numeric = window.map(getAdjustedSolveTimeMs).filter((item) => Number.isFinite(item));
    return numeric.length === spec.size
      ? numeric.reduce((sum, item) => sum + item, 0) / numeric.length
      : null;
  }

  if (spec.kind === "ao") {
    const result = calculateAverage(window.map(getSolveValueForAverage), true)?.average;
    return Number.isFinite(result) ? result : null;
  }

  return null;
}

function buildCompactSummary(solves) {
  return HOME_SUMMARY_METRICS.map((metric) => ({
    ...metric,
    currentValue: computeCurrentMetricValue(solves, metric),
    value: computeWindowExtremeValue(solves, metric, "best"),
    bestValue: computeWindowExtremeValue(solves, metric, "best"),
    worstValue: computeWindowExtremeValue(solves, metric, "worst"),
  }));
}

function meanMs(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function medianMs(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDevMs(values) {
  if (values.length < 2) return null;
  const mean = meanMs(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function finiteMetricOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function buildCompactSummaryFromCache(overallStats) {
  if (!overallStats || typeof overallStats !== "object") return [];
  const source = {
    single: { best: overallStats?.BestSingleMs, worst: overallStats?.WorstSingleMs },
    mo3: { best: overallStats?.BestMo3Ms, worst: overallStats?.WorstMo3Ms },
    ao5: { best: overallStats?.BestAo5Ms, worst: overallStats?.WorstAo5Ms },
    ao12: { best: overallStats?.BestAo12Ms, worst: overallStats?.WorstAo12Ms },
    ao25: { best: overallStats?.BestAo25Ms, worst: overallStats?.WorstAo25Ms },
    ao50: { best: overallStats?.BestAo50Ms, worst: overallStats?.WorstAo50Ms },
    ao100: { best: overallStats?.BestAo100Ms, worst: overallStats?.WorstAo100Ms },
    ao1000: { best: overallStats?.BestAo1000Ms, worst: overallStats?.WorstAo1000Ms },
  };

  return HOME_SUMMARY_METRICS.map((metric) => {
    const cachedBest = finiteMetricOrNull(source[metric.key]?.best);
    const cachedWorst = finiteMetricOrNull(source[metric.key]?.worst);

    return {
      ...metric,
      currentValue: null,
      value: cachedBest,
      bestValue: cachedBest,
      worstValue: cachedWorst,
    };
  });
}

function groupSummaryRows(rows) {
  const rowsByKey = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.key, row]));
  return HOME_SUMMARY_LAYOUT.map((group) =>
    group.map((key) => rowsByKey.get(key)).filter(Boolean)
  ).filter((group) => group.length);
}

function buildSummaryMeta(solves, overallStats) {
  const numeric = (Array.isArray(solves) ? solves : [])
    .map(getAdjustedSolveTimeMs)
    .filter((value) => Number.isFinite(value));
  const plus2Values = (Array.isArray(solves) ? solves : [])
    .filter((solve) => getSolvePenalty(solve) === "+2")
    .map(getAdjustedSolveTimeMs)
    .filter((value) => Number.isFinite(value));
  const dnfCount = (Array.isArray(solves) ? solves : []).filter(
    (solve) => getSolvePenalty(solve) === "DNF"
  ).length;

  const cachedMean = Number(overallStats?.MeanMs);
  const cachedMedian = Number(overallStats?.MedianMs);
  const cachedPlus2Count = Number(overallStats?.Plus2Count);
  const cachedPlus2Best = Number(overallStats?.Plus2BestMs);
  const cachedSum = Number(overallStats?.SumFinalTimeMs);
  const cachedDnfCount = Number(overallStats?.DNFCount);
  const count = Number(overallStats?.SolveCountIncluded || 0);
  const sum = Number(overallStats?.SumFinalTimeMs || 0);
  const sumSquares = Number(overallStats?.SumFinalTimeSqMs || 0);
  const cachedStdDev =
    count >= 2 && Number.isFinite(sum) && Number.isFinite(sumSquares)
      ? Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2))
      : null;

  return [
    {
      key: "mean",
      label: "Mean",
      value: Number.isFinite(cachedMean) ? cachedMean : meanMs(numeric),
      average: true,
    },
    {
      key: "median",
      label: "Median",
      value: Number.isFinite(cachedMedian) ? cachedMedian : medianMs(numeric),
      average: true,
    },
    {
      key: "std-dev",
      label: "σ",
      value: Number.isFinite(cachedStdDev) ? cachedStdDev : stdDevMs(numeric),
      average: true,
    },
    {
      key: "plus2-count",
      label: "+2 Count",
      value: Number.isFinite(cachedPlus2Count) ? cachedPlus2Count : plus2Values.length,
      numeric: true,
    },
    {
      key: "plus2-best",
      label: "+2 Best",
      value:
        Number.isFinite(cachedPlus2Best)
          ? cachedPlus2Best
          : plus2Values.length
            ? Math.min(...plus2Values)
            : null,
      average: false,
    },
    {
      key: "dnf-count",
      label: "DNF",
      value: Number.isFinite(cachedDnfCount) ? cachedDnfCount : dnfCount,
      numeric: true,
    },
    {
      key: "sum",
      label: "Sum",
      value: Number.isFinite(cachedSum) ? cachedSum : numeric.reduce((acc, value) => acc + value, 0),
      duration: true,
    },
  ];
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
}

function formatDurationMs(ms) {
  if (!Number.isFinite(Number(ms))) return "—";
  const total = Math.max(0, Math.round(Number(ms)));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centis = Math.floor((total % 1000) / 10)
    .toString()
    .padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${centis}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}.${centis}`;
}

function formatTileMetricParts(label) {
  const safeLabel = String(label || "").trim().toUpperCase();
  if (safeLabel === "SINGLE") {
    return { prefix: "Single", value: "", single: true };
  }

  const match = safeLabel.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return { prefix: safeLabel, value: "", single: false };
  }

  return {
    prefix: match[1],
    value: match[2],
    single: false,
  };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function bucketKeyForDate(date, groupBy) {
  if (!(date instanceof Date)) return null;
  if (groupBy === "day") return date.toISOString().slice(0, 10);
  if (groupBy === "week") return `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
  if (groupBy === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (groupBy === "year") return `${date.getFullYear()}`;
  return null;
}

function bucketLabelForKey(key, groupBy) {
  if (!key) return "";
  if (groupBy === "day") {
    const [, month, day] = key.split("-");
    return `${month}/${day}`;
  }
  if (groupBy === "week") {
    const [, week] = key.split("-W");
    return `W${week || ""}`;
  }
  if (groupBy === "month") {
    const [year, month] = key.split("-");
    return `${month}/${String(year || "").slice(2)}`;
  }
  return key;
}

function buildLineSeries(solves, metric, groupBy, seriesStyle) {
  const source = Array.isArray(solves) ? solves : [];
  const points = [];

  if (metric === "single") {
    source.forEach((solve, index) => {
      const ms = getSolveTimeMs(solve);
      if (!Number.isFinite(ms)) return;
      points.push({
        index,
        ms,
        date: getSolveDate(solve),
      });
    });
  } else {
    const windowSize = metric === "ao12" ? 12 : 5;
    source.forEach((solve, index) => {
      if (index < windowSize - 1) return;
      const windowSolves = source.slice(index - (windowSize - 1), index + 1);
      const result = calculateAverage(windowSolves.map(getSolveValueForAverage), true);
      if (!Number.isFinite(result?.average)) return;
      points.push({
        index,
        ms: result.average,
        date: getSolveDate(solve),
      });
    });
  }

  if (!points.length) return [];

  const pointMsValues = points
    .map((point) => point.ms)
    .filter((value) => Number.isFinite(value));
  const minPointMs = pointMsValues.length ? Math.min(...pointMsValues) : 0;
  const maxPointMs = pointMsValues.length ? Math.max(...pointMsValues) : minPointMs;
  const pointMsDenom = maxPointMs - minPointMs || 1;
  const getPointColor = (ms) => {
    const ratio = pointMsDenom === 0 ? 0.5 : (ms - minPointMs) / pointMsDenom;
    return resolvePaletteColor(seriesStyle, ratio, "#50B6FF");
  };

  if (groupBy === "solve") {
    return points.map((point, index) => {
      return {
        label: String(index + 1),
        x: index,
        y: point.ms / 1000,
        color: getPointColor(point.ms),
        time: formatTime(point.ms),
      };
    });
  }

  const grouped = new Map();
  points.forEach((point) => {
    const key = bucketKeyForDate(point.date, groupBy);
    if (!key) return;
    const bucket = grouped.get(key) || [];
    bucket.push(point.ms);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values], index) => {
      const avgMs = values.reduce((sum, value) => sum + value, 0) / values.length;
      return {
        label: bucketLabelForKey(key, groupBy),
        x: index,
        y: avgMs / 1000,
        color: getPointColor(avgMs),
        time: formatTime(avgMs),
      };
    });
}

function getSolveWindow(solves, limit) {
  const source = Array.isArray(solves) ? solves : [];
  const parsedLimit = Number(limit);
  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return source;
  if (source.length <= parsedLimit) return source;
  return source.slice(source.length - parsedLimit);
}

function breakdownValueForSolve(solve, breakdown) {
  const tags = solve?.tags || solve?.Tags || {};

  if (breakdown === "penalty") return getSolvePenalty(solve) || "OK";
  if (breakdown === "solveSource") return String(tags?.SolveSource || "").trim() || "Unknown";
  if (breakdown === "cubeModel") return String(tags?.CubeModel || "").trim() || "Unknown";
  if (breakdown === "crossColor") return String(tags?.CrossColor || "").trim() || "Unknown";
  if (breakdown === "timerInput") {
    return String(tags?.TimerInput || tags?.InputType || "").trim() || "Unknown";
  }
  return "Unknown";
}

function buildPieData(solves, breakdown) {
  const grouped = new Map();
  (Array.isArray(solves) ? solves : []).forEach((solve) => {
    const label = breakdownValueForSolve(solve, breakdown);
    const current = grouped.get(label) || { label, value: 0, solves: [] };
    current.value += 1;
    current.solves.push(solve);
    grouped.set(label, current);
  });

  return Array.from(grouped.values())
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

function getDefaultHomeChartStyle() {
  return {
    label: "Default",
    mode: "gradient",
    stops: ["#36d9b8", "#f6e96b", "#ff6f61"],
    primary: "#f6e96b",
    accent: "#fff4bf",
  };
}

function getDefaultHomeChartPalette() {
  return ["#2EC4B6", "#FFB044", "#50B6FF", "#FB596D", "#FFE863", "#FDFFFC"];
}

function getDefaultHomeSummaryStyle() {
  return {
    label: "Summary Default",
    mode: "solid",
    primary: "#2EC4B6",
    accent: "#BFF7F0",
  };
}

function hexToRgb(hex, fallback = { r: 80, g: 182, b: 255 }) {
  const raw = String(hex || "").trim().replace("#", "");
  const normalized =
    raw.length === 3 ? raw.split("").map((char) => `${char}${char}`).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbaString(hex, alpha, fallbackHex = "#50B6FF") {
  const { r, g, b } = hexToRgb(hex, hexToRgb(fallbackHex));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function slotTitle(config) {
  if (config.chartType === "line") {
    if (config.lineMetric === "ao5") return "Ao5 Trend";
    if (config.lineMetric === "ao12") return "Ao12 Trend";
    return "Single Trend";
  }
  if (config.chartType === "bar") return "Time Histogram";
  if (config.chartType === "percent") return `Sub ${config.percentThresholdSeconds}s`;
  if (config.chartType === "summary") return "Stats Summary";
  if (config.chartType === "pie") {
    if (config.pieBreakdown === "solveSource") return "Solve Source";
    if (config.pieBreakdown === "cubeModel") return "Cube Model";
    if (config.pieBreakdown === "crossColor") return "Start Color";
    if (config.pieBreakdown === "timerInput") return "Timer Input";
    return "Penalty";
  }
  return "Stats";
}

function HomeStatsOverlay({ solves, settings, user, overallStats, onSummarySelect }) {
  const slots = useMemo(() => normalizeHomeStatsSlots(settings?.homeStatsSlots), [settings?.homeStatsSlots]);
  const solveLimit = useMemo(
    () => normalizeHomeStatsSolveLimit(settings?.homeStatsSolveLimit, 50),
    [settings?.homeStatsSolveLimit]
  );
  const profileChartStyle = useMemo(() => getProfileChartStyle(user), [user]);
  const profileChartPalette = useMemo(() => getProfileChartPalette(user, 8), [user]);
  const defaultChartStyle = useMemo(() => getDefaultHomeChartStyle(), []);
  const defaultSummaryStyle = useMemo(() => getDefaultHomeSummaryStyle(), []);
  const defaultChartPalette = useMemo(() => getDefaultHomeChartPalette(), []);
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [expandedSummarySlots, setExpandedSummarySlots] = useState({});

  return (
    <div className="homeStatsOverlay">
      {HOME_STAT_SLOT_ORDER.map((slotKey) => {
        const config = slots[slotKey];
        if (!config?.enabled) return null;
        const isSideSlot = slotKey === "left" || slotKey === "right";
        const isHovered = hoveredSlot === slotKey;

        const slotChartStyle =
          config.colorScheme === "profile"
            ? profileChartStyle
            : config.chartType === "summary"
              ? defaultSummaryStyle
              : defaultChartStyle;
        const slotPiePalette =
          config.colorScheme === "profile" ? profileChartPalette : defaultChartPalette;
        const summaryCardStyle =
          config.chartType === "summary"
            ? {
                "--home-summary-border": rgbaString("#2EC4B6", 0.72),
                "--home-summary-border-hover": rgbaString("#2EC4B6", 0.96),
                "--home-summary-panel": rgbaString("#2EC4B6", 0.05),
                "--home-summary-panel-strong": rgbaString("#2EC4B6", 0.42),
                "--home-summary-glow": rgbaString("#2EC4B6", 0.22),
                "--home-summary-label": "rgba(243, 255, 252, 0.9)",
                "--home-summary-text": "rgba(255, 255, 255, 0.92)",
              }
            : undefined;

        const lineData =
          config.chartType === "line"
            ? buildLineSeries(
                getSolveWindow(solves, solveLimit),
                config.lineMetric,
                config.lineGroupBy,
                slotChartStyle
              )
            : [];
        const pieData =
          config.chartType === "pie" ? buildPieData(solves, config.pieBreakdown) : [];
        const summarySolveWindow =
          config.chartType === "summary" ? getSolveWindow(solves, solveLimit) : [];
        const liveSummaryRows =
          config.chartType === "summary" ? buildCompactSummary(summarySolveWindow) : [];
        const summaryRows =
          config.chartType === "summary"
            ? (() => {
                const cachedRows = buildCompactSummaryFromCache(overallStats);
                const baseRows = cachedRows.some((row) => row.value != null)
                  ? cachedRows
                  : liveSummaryRows;
                const liveByKey = new Map(liveSummaryRows.map((row) => [row.key, row]));
                return baseRows.map((row) => ({
                  ...row,
                  currentValue: liveByKey.get(row.key)?.currentValue ?? row.currentValue ?? null,
                }));
              })()
            : [];
        const summaryGroups =
          config.chartType === "summary" ? groupSummaryRows(summaryRows) : [];
        const summaryListRows =
          config.chartType === "summary"
            ? HOME_SUMMARY_METRICS.map((metric) =>
                summaryRows.find((row) => row.key === metric.key)
              ).filter(Boolean)
            : [];
        const isSummaryTile =
          config.chartType === "summary" && (config.summaryLayout || "tile") === "tile";
        const isSummaryExpanded =
          config.chartType === "summary" && !isSummaryTile && !!expandedSummarySlots[slotKey];
        const renderedSlotWidth =
          slotKey === "background"
            ? config.width
            : config.chartType === "summary"
              ? isSummaryTile
                ? Math.round(config.width * 1.46)
                : Math.round(config.width * (isSummaryExpanded ? 1.18 : 0.8))
              : config.width;
        const defaultSlotWidth = HOME_STAT_SLOT_META[slotKey]?.defaultWidth ?? config.width;
        const baselineSlotWidth =
          slotKey === "background"
            ? config.width
            : config.chartType === "summary"
              ? isSummaryTile
                ? Math.round(defaultSlotWidth * 1.46)
                : Math.round(defaultSlotWidth * (isSummaryExpanded ? 1.18 : 0.8))
              : defaultSlotWidth;
        const sideCenterShift =
          slotKey !== "background"
            ? Math.round((renderedSlotWidth - baselineSlotWidth) / 2) *
              (slotKey === "left" ? -1 : 1)
            : 0;
        const summaryExpandedWidthShift =
          config.chartType === "summary" && !isSummaryTile && isSummaryExpanded
            ? Math.round(config.width * 0.19) * (slotKey === "left" ? -1 : slotKey === "right" ? 1 : 0)
            : 0;
        const summaryMeta =
          config.chartType === "summary" && isSummaryTile
            ? buildSummaryMeta(summarySolveWindow, overallStats)
            : [];

        const empty =
          (config.chartType === "line" && !lineData.length) ||
          (config.chartType === "pie" && !pieData.length) ||
          (config.chartType === "summary" &&
            !summaryRows.some((row) => row.value != null)) ||
          ((config.chartType === "bar" || config.chartType === "percent") &&
            !(Array.isArray(solves) && solves.length));

        return (
          <div
            key={slotKey}
            className={`homeStatsSlot homeStatsSlot--${slotKey}${
              slotKey === "background" && config.chartType === "line"
                ? " homeStatsSlot--backgroundLine"
                : ""
            }${config.chartType === "pie" ? " homeStatsSlot--pie" : ""}${
              config.chartType === "summary" ? " homeStatsSlot--summary" : ""
            }${isHovered ? " is-hovered" : ""}`}
            onMouseEnter={isSideSlot ? () => setHoveredSlot(slotKey) : undefined}
            onMouseLeave={isSideSlot ? () => setHoveredSlot((current) => (current === slotKey ? null : current)) : undefined}
            style={{
              ...(slotKey === "background"
                ? {
                    "--home-stat-max-width": `${config.width}px`,
                    "--home-stat-height": `${config.height}px`,
                    "--home-stat-aspect-ratio": `${config.width / Math.max(config.height, 1)}`,
                    "--home-stat-background-opacity": `${config.opacity}`,
                  }
                : {
                    width: `${
                      renderedSlotWidth
                    }px`,
                    height: `${
                      config.chartType === "summary"
                        ? isSummaryTile
                          ? Math.round(config.height * 1.02)
                          : Math.round(config.height * (isSummaryExpanded ? 1.76 : 1.74))
                        : config.height
                    }px`,
                    "--home-stat-rest-opacity": `${
                      config.chartType === "summary"
                        ? Math.max(0.58, Math.min(config.opacity * 0.7, 0.72))
                        : Math.max(0.16, Math.min(config.opacity * 0.55, 0.55))
                    }`,
                    "--home-stat-hover-opacity": `${
                      config.chartType === "summary" ? Math.max(0.94, config.opacity) : config.opacity
                    }`,
                    "--home-slot-center-shift-x": `${sideCenterShift}px`,
                    "--home-summary-expand-shift-x": `${summaryExpandedWidthShift}px`,
                  }),
            }}
          >
            {config.chartType === "summary" && !isSummaryTile ? (
              <button
                type="button"
                className={`homeStatsSummaryEdgeToggle${
                  isSummaryExpanded ? " is-expanded" : ""
                }`}
                onClick={() =>
                  setExpandedSummarySlots((current) => ({
                    ...current,
                    [slotKey]: !current[slotKey],
                  }))
                }
                aria-label={isSummaryExpanded ? "Collapse stats details" : "Expand stats details"}
                aria-pressed={isSummaryExpanded}
              >
                {isSummaryExpanded ? "−" : "+"}
              </button>
            ) : null}

            <div
                className={`homeStatsCard homeStatsCard--${config.chartType}${
                config.chartType === "summary"
                  ? isSummaryTile
                    ? " homeStatsCard--summaryTile"
                    : ` homeStatsCard--summaryCompact${
                        isSummaryExpanded ? " homeStatsCard--summaryCompactExpanded" : ""
                      }`
                  : ""
              } ${slotKey === "background" ? "is-background" : ""}${
                isSideSlot ? " is-side-slot" : ""
              }${isHovered ? " is-hovered" : ""}`}
              style={
                slotKey === "background"
                  ? { opacity: config.opacity }
                  : config.chartType === "summary"
                    ? {
                        ...summaryCardStyle,
                        "--home-summary-surface":
                          config.summarySurface === "gradient"
                            ? `radial-gradient(circle at top, var(--home-summary-glow, rgba(80, 182, 255, 0.18)), transparent 58%), linear-gradient(180deg, var(--home-summary-panel-strong, rgba(255, 255, 255, 0.12)), var(--home-summary-panel, rgba(255, 255, 255, 0.08)))`
                            : "var(--home-summary-panel, rgba(255, 255, 255, 0.08))",
                      }
                    : undefined
              }
            >
              <div
                className={`homeStatsCardTitle${
                  config.chartType === "bar" ? " homeStatsCardTitle--bar" : ""
                }`}
              >
                {slotTitle(config)}
              </div>

              <div className={`homeStatsCardBody homeStatsCardBody--${config.chartType}`}>
                {empty ? null : config.chartType === "line" ? (
                  <LineChartBuilder
                    width={config.width}
                    height={config.height}
                    data={lineData}
                    extraSeries={[]}
                    comparisonSeries={[]}
                    primaryStroke={slotKey === "background" ? "#2EC4B6" : slotChartStyle?.primary || "#50B6FF"}
                    horizontalGuides={4}
                    verticalGuides={6}
                    precision={2}
                    dotRadius={slotKey === "background" ? 4 : isHovered ? 4 : 3}
                    selectedIndices={new Set()}
                    onDotClick={() => {}}
                    showAxes={slotKey === "background" ? false : isHovered}
                    showGuides={slotKey === "background" ? false : isHovered}
                    showAxisLabels={slotKey === "background" ? false : isHovered}
                  />
                ) : config.chartType === "bar" ? (
                  <div className="homeStatsChartFrame homeStatsChartFrame--bar">
                    <BarChart
                      solves={solves}
                      seriesStyle={slotChartStyle}
                      showAxes={isHovered}
                      showLabels={isHovered}
                      showLegend={false}
                    />
                  </div>
                ) : config.chartType === "percent" ? (
                  <PercentBar
                    solves={solves}
                    seriesStyle={slotChartStyle}
                    initialThresholdSeconds={config.percentThresholdSeconds}
                    compact={!isHovered}
                  />
                ) : config.chartType === "summary" ? (
                  isSummaryTile ? (
                    <div
                      className={`homeStatsSummaryTile${
                        config.summaryShowMeta ? " homeStatsSummaryTile--withMeta" : ""
                      }`}
                    >
                      {config.summaryShowMeta ? (
                        <div className="homeStatsSummaryMeta">
                          {summaryMeta.map((item) => (
                            <div className="homeStatsSummaryMetaItem" key={`${slotKey}-${item.key}`}>
                              <span className="homeStatsSummaryMetaLabel">{item.label}</span>
                              <span className="homeStatsSummaryMetaValue">
                                {item.value == null
                                  ? "—"
                                  : item.numeric
                                  ? formatCount(item.value)
                                  : item.duration
                                    ? formatDurationMs(item.value)
                                    : formatTime(item.value, item.average !== false)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="homeStatsSummaryTileLead">
                        {summaryGroups[0]?.map((row) => {
                          const metric = HOME_SUMMARY_METRIC_BY_KEY.get(row.key) || row;
                          const { prefix, value, single } = formatTileMetricParts(row.label);
                          return (
                            <div
                              className={`homeStatsSummaryTileItem homeStatsSummaryTileItem--lead homeStatsSummaryTileItem--${row.key}${
                                single ? " homeStatsSummaryTileItem--single" : ""
                              }`}
                              key={`${slotKey}-${row.key}`}
                            >
                              {!single ? (
                                <div className="homeStatsSummaryTileHeader">
                                  <span className="homeStatsSummaryTilePrefix">{prefix}</span>
                                  <span className="homeStatsSummaryTileNumber">{value}</span>
                                </div>
                              ) : (
                                <div
                                  className="homeStatsSummaryTileHeader homeStatsSummaryTileHeader--single"
                                  aria-hidden="true"
                                />
                              )}

                              <div className="homeStatsSummaryTileValues">
                                <button
                                  type="button"
                                  className="homeStatsSummaryTileValueBlock homeStatsSummaryTileValueBlock--best"
                                  onClick={() =>
                                    onSummarySelect?.({
                                      ...metric,
                                      variant: "best",
                                      value: row.bestValue,
                                    })
                                  }
                                  disabled={row.bestValue == null}
                                >
                                  <span className="homeStatsSummaryTileValueRow">
                                    {single ? (
                                      <span className="homeStatsSummaryTileValueLabel homeStatsSummaryTileValueLabel--best">
                                        B
                                      </span>
                                    ) : null}
                                    <span className="homeStatsSummaryTileValue homeStatsSummaryTileValue--best">
                                      {row.bestValue == null
                                        ? "—"
                                        : formatTime(row.bestValue, row.kind !== "single")}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="homeStatsSummaryTileValueBlock homeStatsSummaryTileValueBlock--worst"
                                  onClick={() =>
                                    onSummarySelect?.({
                                      ...metric,
                                      variant: "worst",
                                      value: row.worstValue,
                                    })
                                  }
                                  disabled={row.worstValue == null}
                                >
                                  <span className="homeStatsSummaryTileValueRow">
                                    {single ? (
                                      <span className="homeStatsSummaryTileValueLabel homeStatsSummaryTileValueLabel--worst">
                                        W
                                      </span>
                                    ) : null}
                                    <span className="homeStatsSummaryTileValue homeStatsSummaryTileValue--worst">
                                      {row.worstValue == null
                                        ? "—"
                                        : formatTime(row.worstValue, row.kind !== "single")}
                                    </span>
                                  </span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="homeStatsSummaryTileGrid">
                        {summaryGroups.slice(1).flat().map((row) => {
                          const metric = HOME_SUMMARY_METRIC_BY_KEY.get(row.key) || row;
                          const { prefix, value } = formatTileMetricParts(row.label);
                          return (
                            <div
                              className={`homeStatsSummaryTileItem homeStatsSummaryTileItem--grid homeStatsSummaryTileItem--${row.key}`}
                              key={`${slotKey}-${row.key}`}
                            >
                              <span className="homeStatsSummaryTileHeader">
                                <span className="homeStatsSummaryTilePrefix">{prefix}</span>
                                <span className="homeStatsSummaryTileNumber">{value}</span>
                              </span>
                              <div className="homeStatsSummaryTileValues">
                                <button
                                  type="button"
                                  className="homeStatsSummaryTileValueBlock homeStatsSummaryTileValueBlock--best"
                                  onClick={() =>
                                    onSummarySelect?.({
                                      ...metric,
                                      variant: "best",
                                      value: row.bestValue,
                                    })
                                  }
                                  disabled={row.bestValue == null}
                                >
                                  <span className="homeStatsSummaryTileValueRow">
                                    <span
                                      className="homeStatsSummaryTileValueLabel homeStatsSummaryTileValueLabel--best"
                                      aria-hidden="true"
                                    />
                                    <span className="homeStatsSummaryTileValue homeStatsSummaryTileValue--best">
                                      {row.bestValue == null
                                        ? "—"
                                        : formatTime(row.bestValue, row.kind !== "single")}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="homeStatsSummaryTileValueBlock homeStatsSummaryTileValueBlock--worst"
                                  onClick={() =>
                                    onSummarySelect?.({
                                      ...metric,
                                      variant: "worst",
                                      value: row.worstValue,
                                    })
                                  }
                                  disabled={row.worstValue == null}
                                >
                                  <span className="homeStatsSummaryTileValueRow">
                                    <span
                                      className="homeStatsSummaryTileValueLabel homeStatsSummaryTileValueLabel--worst"
                                      aria-hidden="true"
                                    />
                                    <span className="homeStatsSummaryTileValue homeStatsSummaryTileValue--worst">
                                      {row.worstValue == null
                                        ? "—"
                                        : formatTime(row.worstValue, row.kind !== "single")}
                                    </span>
                                  </span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`homeStatsSummary homeStatsSummary--list${
                        isSummaryExpanded ? " homeStatsSummary--expanded" : ""
                      }`}
                    >
                      {summaryListRows.map((row) => {
                        const metric = HOME_SUMMARY_METRIC_BY_KEY.get(row.key) || row;
                        const { prefix, value, single } = formatTileMetricParts(row.label);
                        const renderSummaryValueButton = (variant, metricValue, tone, extraClass = "") => (
                          <button
                            type="button"
                            className={`homeStatsSummaryValueButton homeStatsSummaryValueButton--${tone}${extraClass}`}
                            onClick={() =>
                              onSummarySelect?.({
                                ...metric,
                                variant,
                                value: metricValue,
                              })
                            }
                            disabled={metricValue == null}
                          >
                            <span className={`homeStatsSummaryValue homeStatsSummaryValue--${tone}`}>
                              {metricValue == null
                                ? "—"
                                : formatTime(metricValue, row.kind !== "single")}
                            </span>
                          </button>
                        );

                        return (
                          <div
                            className={`homeStatsSummaryRow homeStatsSummaryRow--list${
                              isSummaryExpanded ? " homeStatsSummaryRow--expanded" : ""
                            }`}
                            key={`${slotKey}-${row.key}`}
                          >
                            {single ? (
                              <span
                                className={`homeStatsSummaryLabel${
                                  isSummaryExpanded ? " homeStatsSummaryLabel--expanded" : ""
                                }`}
                              >
                                {prefix}
                              </span>
                            ) : (
                              <span
                                className={`homeStatsSummaryLabel homeStatsSummaryLabel--split${
                                  isSummaryExpanded ? " homeStatsSummaryLabel--expanded" : ""
                                }`}
                              >
                                <span className="homeStatsSummaryLabelPrefix">{prefix}</span>
                                <span className="homeStatsSummaryLabelNumber">{value}</span>
                              </span>
                            )}
                            {renderSummaryValueButton("best", row.bestValue, "best")}
                            {renderSummaryValueButton(
                              "worst",
                              row.worstValue,
                              "worst",
                              isSummaryExpanded ? "" : " homeStatsSummaryValueButton--hidden"
                            )}
                            {renderSummaryValueButton(
                              "current",
                              row.currentValue,
                              "current",
                              isSummaryExpanded ? "" : " homeStatsSummaryValueButton--hidden"
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="homeStatsChartFrame homeStatsChartFrame--pie">
                    <PieChartBuilder
                      width="100%"
                      height="100%"
                      data={pieData}
                      legendValueMode="count-percent"
                      interactive={false}
                      colorPalette={slotPiePalette}
                      showLegend={isHovered}
                      showCenterLabel={isHovered}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

HomeStatsOverlay.propTypes = {
  solves: PropTypes.arrayOf(PropTypes.object),
  settings: PropTypes.shape({
    homeStatsSlots: PropTypes.object,
  }),
  user: PropTypes.object,
  overallStats: PropTypes.object,
  onSummarySelect: PropTypes.func,
};

HomeStatsOverlay.defaultProps = {
  solves: [],
  settings: {},
  user: null,
  overallStats: null,
  onSummarySelect: null,
};

export default React.memo(HomeStatsOverlay);
