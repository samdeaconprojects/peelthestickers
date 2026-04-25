import React, { useMemo, useState } from "react";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import { findBestStrictWindow } from "../../utils/strictAverageUtils";
import PieChartBuilder from "./PieChartBuilder";
import tagBadge from "../../assets/Tag.svg";
import "./StatsSummary.css";

const WINDOW_SPECS = [
  { key: "ao5", label: "AO5", size: 5, kind: "ao" },
  { key: "ao12", label: "AO12", size: 12, kind: "ao" },
  { key: "mo3", label: "MO3", size: 3, kind: "mo3" },
  { key: "ao25", label: "AO25", size: 25, kind: "ao" },
  { key: "ao50", label: "AO50", size: 50, kind: "ao" },
  { key: "ao100", label: "AO100", size: 100, kind: "ao" },
  { key: "ao1000", label: "AO1000", size: 1000, kind: "ao" },
];

function solveMsAdjusted(s) {
  if (!s) return null;

  const base =
    typeof s.originalTime === "number" && isFinite(s.originalTime)
      ? s.originalTime
      : typeof s.rawTime === "number" && isFinite(s.rawTime)
      ? s.rawTime
      : typeof s.rawTimeMs === "number" && isFinite(s.rawTimeMs)
      ? s.rawTimeMs
      : typeof s.time === "number" && isFinite(s.time)
      ? s.time
      : typeof s.finalTimeMs === "number" && isFinite(s.finalTimeMs)
      ? s.finalTimeMs
      : null;

  if (base == null) return null;

  const penalty = String(s.penalty ?? s.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return null;
  if (penalty === "+2") return base + 2000;
  return typeof s.time === "number" && isFinite(s.time) ? s.time : base;
}

function toTimesForWCA(solves) {
  return (Array.isArray(solves) ? solves : []).map((s) => {
    if (!s) return "DNF";
    if (String(s.penalty ?? s.Penalty ?? "").toUpperCase() === "DNF") return "DNF";
    const adjusted = solveMsAdjusted(s);
    return adjusted == null ? "DNF" : adjusted;
  });
}

function meanMs(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function medianMs(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDevMs(nums) {
  if (nums.length < 2) return null;
  const avg = meanMs(nums);
  const variance = nums.reduce((sum, x) => sum + (x - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function stdDevFromAggregate(summary) {
  const count = Number(summary?.SolveCountIncluded || 0);
  const sum = Number(summary?.SumFinalTimeMs || 0);
  const sumSquares = Number(summary?.SumFinalTimeSqMs || 0);
  if (count < 2 || !Number.isFinite(sum) || !Number.isFinite(sumSquares)) return null;
  const mean = sum / count;
  const variance = Math.max(0, sumSquares / count - mean * mean);
  return Math.sqrt(variance);
}

function formatStatTime(msOrDnf, { average = true } = {}) {
  if (msOrDnf === "DNF") return "DNF";
  if (msOrDnf == null || !isFinite(msOrDnf)) return "—";
  return formatTime(msOrDnf, average);
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

function formatCompareLabel(label) {
  return String(label || "").trim() || "Compare";
}

function normalizeHexColor(input, fallback = "#50B6FF") {
  const value = String(input || "").trim();
  if (/^#([0-9a-f]{3})$/i.test(value)) {
    const hex = value.slice(1);
    return `#${hex.split("").map((ch) => ch + ch).join("")}`;
  }
  if (/^#([0-9a-f]{6})$/i.test(value)) return value;
  return fallback;
}

function withAlpha(hex, alpha) {
  const safeHex = normalizeHexColor(hex);
  const raw = safeHex.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDateRange(solves) {
  const input = Array.isArray(solves) ? solves : [];
  if (!input.length) return "—";
  const first = input[0]?.datetime || input[0]?.createdAt;
  const last = input[input.length - 1]?.datetime || input[input.length - 1]?.createdAt;
  if (!first || !last) return "—";

  const fmt = (iso) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });
  };

  const start = fmt(first);
  const end = fmt(last);
  return start && end ? `${start} - ${end}` : "—";
}

function getSolveDate(solve) {
  const raw = solve?.datetime || solve?.createdAt || solve?.DateTime || solve?.dateTime;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getLocalDayKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(dayKey) {
  if (!dayKey) return "—";
  const date = new Date(`${dayKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatClockTime(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatIndexRange(solves, totalSolveCount = null, loadedSolveCount = null) {
  const input = Array.isArray(solves) ? solves : [];
  if (!input.length) return "—";
  const first = input[0]?.fullIndex;
  const last = input[input.length - 1]?.fullIndex;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "—";

  return `${first + 1}-${last + 1}`;
}

function getLastSolveDisplay(solves) {
  const input = Array.isArray(solves) ? solves : [];
  const last = input[input.length - 1];
  if (!last) return null;
  if (String(last.penalty ?? last.Penalty ?? "").toUpperCase() === "DNF") return "DNF";
  return solveMsAdjusted(last);
}

function computeMo3Value(times) {
  if (times.length < 3) return null;
  if (times.some((t) => t === "DNF")) return "DNF";
  const nums = times.filter((t) => typeof t === "number" && isFinite(t));
  if (nums.length !== 3) return null;
  return meanMs(nums);
}

function computeAoValue(times) {
  const out = calculateAverage(times, true)?.average;
  return out ?? null;
}

function computeMeanWindow(nums) {
  if (!nums.every((n) => typeof n === "number" && isFinite(n))) return null;
  return meanMs(nums);
}

function computeWindowStat(solves, spec) {
  const input = Array.isArray(solves) ? solves : [];
  if (input.length < spec.size) return { current: null, best: null, worst: null };

  const windows = [];
  const timesForWCA = toTimesForWCA(input);
  const numeric = input.map(solveMsAdjusted);

  for (let i = 0; i <= input.length - spec.size; i += 1) {
    let value = null;

    if (spec.kind === "mo3") {
      value = computeMo3Value(timesForWCA.slice(i, i + spec.size));
    } else if (spec.kind === "ao") {
      value = computeAoValue(timesForWCA.slice(i, i + spec.size));
    } else {
      value = computeMeanWindow(numeric.slice(i, i + spec.size));
    }

    windows.push(value);
  }

  const current = windows[windows.length - 1] ?? null;
  const numericValues = windows.filter((v) => typeof v === "number" && isFinite(v));

  return {
    current,
    best: numericValues.length ? Math.min(...numericValues) : null,
    worst: numericValues.length ? Math.max(...numericValues) : null,
  };
}

function buildViewSummary(solves, totalSolveCount = null, loadedSolveCount = null) {
  const input = Array.isArray(solves) ? solves : [];
  if (!input.length) return null;

  const numeric = input.map(solveMsAdjusted).filter((x) => typeof x === "number" && isFinite(x));
  const plus2Values = input
    .filter((s) => String(s.penalty ?? s.Penalty ?? "").toUpperCase() === "+2")
    .map(solveMsAdjusted)
    .filter((x) => typeof x === "number" && isFinite(x));

  const metrics = {};
  for (const spec of WINDOW_SPECS) {
    metrics[spec.key] = {
      ...computeWindowStat(input, spec),
      strictBest:
        spec.key === "mo3" || spec.key === "ao5" || spec.key === "ao12"
          ? findBestStrictWindow(input, spec.size, spec.kind)?.value ?? null
          : null,
    };
  }

  return {
    solveCount: input.length,
    dateRange: formatDateRange(input),
    indexRange: formatIndexRange(input, totalSolveCount, loadedSolveCount),
    single: {
      current: getLastSolveDisplay(input),
      best: numeric.length ? Math.min(...numeric) : null,
      worst: numeric.length ? Math.max(...numeric) : null,
    },
    metrics,
    mean: meanMs(numeric),
    median: medianMs(numeric),
    stdDev: stdDevMs(numeric),
    plus2Count: plus2Values.length,
    plus2Best: plus2Values.length ? Math.min(...plus2Values) : null,
    sum: numeric.reduce((sum, value) => sum + value, 0),
    dnfCount: input.filter((s) => String(s.penalty ?? s.Penalty ?? "").toUpperCase() === "DNF").length,
  };
}

function buildBucketViewSummary(bucketSummary, bucketItems = []) {
  if (!bucketSummary) return null;

  const items = Array.isArray(bucketItems) ? bucketItems : [];
  const sortedDays = items
    .map((item) => String(item?.BucketDay || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const startDay = sortedDays[0] || "";
  const endDay = sortedDays[sortedDays.length - 1] || "";
  const dateRange =
    startDay && endDay ? `${formatDayLabel(startDay)} - ${formatDayLabel(endDay)}` : "—";

  return {
    solveCount: Number(bucketSummary?.SolveCountTotal || 0),
    dateRange,
    indexRange: items.length ? `${items.length.toLocaleString()} buckets` : "Bucketed range",
    single: {
      current: null,
      best: Number.isFinite(Number(bucketSummary?.BestSingleMs))
        ? Number(bucketSummary.BestSingleMs)
        : null,
      worst: null,
    },
    metrics: {
      mo3: {
        current: null,
        best: Number.isFinite(Number(bucketSummary?.BestMo3Ms)) ? Number(bucketSummary.BestMo3Ms) : null,
        worst: null,
        strictBest: null,
      },
      ao5: {
        current: null,
        best: Number.isFinite(Number(bucketSummary?.BestAo5Ms)) ? Number(bucketSummary.BestAo5Ms) : null,
        worst: null,
        strictBest: null,
      },
      ao12: {
        current: null,
        best: Number.isFinite(Number(bucketSummary?.BestAo12Ms)) ? Number(bucketSummary.BestAo12Ms) : null,
        worst: null,
        strictBest: null,
      },
      ao25: { current: null, best: null, worst: null, strictBest: null },
      ao50: { current: null, best: null, worst: null, strictBest: null },
      ao100: { current: null, best: null, worst: null, strictBest: null },
      ao1000: { current: null, best: null, worst: null, strictBest: null },
    },
    mean: Number.isFinite(Number(bucketSummary?.MeanMs)) ? Number(bucketSummary.MeanMs) : null,
    median: null,
    stdDev: stdDevFromAggregate(bucketSummary),
    plus2Count: Number(bucketSummary?.Plus2Count || 0),
    plus2Best: Number.isFinite(Number(bucketSummary?.Plus2BestMs))
      ? Number(bucketSummary.Plus2BestMs)
      : null,
    sum: Number(bucketSummary?.SumFinalTimeMs || 0),
    dnfCount: Number(bucketSummary?.DNFCount || 0),
  };
}

function buildBucketTimeViewSummary(bucketSummary, bucketItems = []) {
  if (!bucketSummary) return null;

  const items = (Array.isArray(bucketItems) ? bucketItems : [])
    .filter((item) => item && item.BucketDay)
    .sort((a, b) => String(a.BucketDay).localeCompare(String(b.BucketDay)));

  const startDay = String(items[0]?.BucketDay || "").trim();
  const endDay = String(items[items.length - 1]?.BucketDay || "").trim();
  const startDate = startDay ? new Date(`${startDay}T00:00:00`) : null;
  const endDate = endDay ? new Date(`${endDay}T00:00:00`) : null;
  const busiestDay = [...items].sort(
    (a, b) =>
      Number(b?.SolveCountTotal || 0) - Number(a?.SolveCountTotal || 0) ||
      String(a?.BucketDay || "").localeCompare(String(b?.BucketDay || ""))
  )[0] || null;

  return {
    solveCount: Number(bucketSummary?.SolveCountTotal || 0),
    dateLabel: startDay && endDay ? `${formatDayLabel(startDay)} - ${formatDayLabel(endDay)}` : "—",
    firstSolve: startDay || "—",
    lastSolve: endDay || "—",
    activeDays: items.length,
    activeHours: null,
    busiestDay: busiestDay ? `${formatDayLabel(busiestDay.BucketDay)} (${formatCount(busiestDay.SolveCountTotal)})` : "—",
    busiestHour: "—",
    fastestHour: "—",
    bestSingle: Number.isFinite(Number(bucketSummary?.BestSingleMs)) ? Number(bucketSummary.BestSingleMs) : null,
    worstSingle: Number.isFinite(Number(bucketSummary?.WorstSingleMs)) ? Number(bucketSummary.WorstSingleMs) : null,
    mean: Number.isFinite(Number(bucketSummary?.MeanMs)) ? Number(bucketSummary.MeanMs) : null,
    median: null,
    stdDev: stdDevFromAggregate(bucketSummary),
    sum: Number(bucketSummary?.SumFinalTimeMs || 0),
    dnfCount: Number(bucketSummary?.DNFCount || 0),
    spanMs:
      startDate && endDate && Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime())
        ? Math.max(0, endDate.getTime() - startDate.getTime())
        : null,
    topHours: [],
  };
}

function buildBucketDailyTrend(bucketItems = []) {
  return (Array.isArray(bucketItems) ? bucketItems : [])
    .filter((item) => item && item.BucketDay)
    .map((item) => ({
      dayKey: String(item.BucketDay).trim(),
      average: Number.isFinite(Number(item?.MeanMs)) ? Number(item.MeanMs) : null,
      count: Number(item?.SolveCountTotal || 0),
    }))
    .filter((item) => item.dayKey)
    .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

function buildRawDailyTrend(solves = []) {
  const grouped = new Map();

  for (const solve of Array.isArray(solves) ? solves : []) {
    const date = getSolveDate(solve);
    const dayKey = getLocalDayKey(date);
    if (!dayKey) continue;

    const existing = grouped.get(dayKey) || { dayKey, count: 0, numeric: [] };
    existing.count += 1;
    const adjusted = solveMsAdjusted(solve);
    if (typeof adjusted === "number" && isFinite(adjusted)) {
      existing.numeric.push(adjusted);
    }
    grouped.set(dayKey, existing);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      dayKey: item.dayKey,
      average: item.numeric.length ? meanMs(item.numeric) : null,
      count: item.count,
    }))
    .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

function buildTrendPath(points, width, height, minValue, maxValue) {
  if (!Array.isArray(points) || points.length === 0) return "";
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const span = Math.max(1, maxValue - minValue);

  return points
    .map((point, index) => {
      const x = points.length === 1 ? safeWidth / 2 : (index / (points.length - 1)) * safeWidth;
      const y = safeHeight - ((point.value - minValue) / span) * safeHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function bucketTrendItems(items = [], maxPoints = 56, mode = "average") {
  const input = Array.isArray(items) ? items : [];
  if (input.length <= maxPoints) {
    return input.map((item) => ({
      ...item,
      startDayKey: item.dayKey,
      endDayKey: item.dayKey,
      value: mode === "count" ? Number(item.count || 0) : Number(item.average),
    }));
  }

  const bucketSize = Math.ceil(input.length / maxPoints);
  const out = [];

  for (let index = 0; index < input.length; index += bucketSize) {
    const slice = input.slice(index, index + bucketSize);
    const values = slice
      .map((item) => (mode === "count" ? Number(item.count || 0) : Number(item.average)))
      .filter((value) => Number.isFinite(value));

    if (!values.length) continue;

    out.push({
      dayKey: slice[slice.length - 1]?.dayKey || slice[0]?.dayKey || "",
      startDayKey: slice[0]?.dayKey || "",
      endDayKey: slice[slice.length - 1]?.dayKey || slice[0]?.dayKey || "",
      value: meanMs(values),
      count: meanMs(slice.map((item) => Number(item.count || 0)).filter((value) => Number.isFinite(value))),
      average: meanMs(slice.map((item) => Number(item.average)).filter((value) => Number.isFinite(value))),
    });
  }

  return out;
}

function formatTrendDayRange(startDayKey, endDayKey) {
  const start = String(startDayKey || "").trim();
  const end = String(endDayKey || "").trim();
  if (!start && !end) return "—";
  if (!start || start === end) return formatDayLabel(start || end);
  return `${formatDayLabel(start)} - ${formatDayLabel(end)}`;
}

function MiniTrendChart({ items = [], mode = "average" }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const chart = useMemo(() => {
    const normalized = bucketTrendItems(
      (Array.isArray(items) ? items : []).map((item) => ({
        dayKey: String(item?.dayKey || "").trim(),
        startDayKey: String(item?.startDayKey || item?.dayKey || "").trim(),
        endDayKey: String(item?.endDayKey || item?.dayKey || "").trim(),
        average: Number(item?.average),
        count: Number(item?.count || 0),
      })),
      56,
      mode
    )
      .filter((item) => item.dayKey && Number.isFinite(item.value));

    if (!normalized.length) return null;

    const values = normalized.map((item) => item.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const path = buildTrendPath(normalized, 100, 44, minValue, maxValue);
    const first = normalized[0] || null;
    const last = normalized[normalized.length - 1] || null;
    const peak = [...normalized].sort((a, b) => b.value - a.value || String(a.dayKey).localeCompare(String(b.dayKey)))[0] || null;
    const trough = [...normalized].sort((a, b) => a.value - b.value || String(a.dayKey).localeCompare(String(b.dayKey)))[0] || null;
    const span = Math.max(1, maxValue - minValue);
    const bars = normalized.map((point, index) => {
      const step = 100 / normalized.length;
      const width = Math.max(0.8, step - 0.6);
      const x = index * step + (step - width) / 2;
      const y = 44 - ((point.value - minValue) / span) * 44;
      return {
        x,
        y,
        width,
        height: Math.max(1.5, 44 - y),
      };
    });

    return {
      points: normalized,
      path,
      bars,
      minValue,
      maxValue,
      first,
      last,
      peak,
      trough,
    };
  }, [items, mode]);

  if (!chart) {
    return <div className="ssTrendEmpty">No daily data</div>;
  }

  const activePoint =
    activeIndex >= 0 && activeIndex < chart.points.length ? chart.points[activeIndex] : null;
  const hoverLabel = activePoint
    ? formatTrendDayRange(activePoint.startDayKey, activePoint.endDayKey)
    : "Hover a bar";
  const hoverPrimary = activePoint
    ? mode === "count"
      ? `${formatCount(activePoint.count)} solves`
      : `${formatStatTime(activePoint.average)} mean`
    : mode === "count"
      ? "Solve count"
      : "Daily mean";
  const hoverSecondary = activePoint
    ? mode === "count"
      ? (Number.isFinite(activePoint.average) ? `${formatStatTime(activePoint.average)} mean` : "No average")
      : `${formatCount(activePoint.count)} solves`
    : "Move across the chart";

  return (
    <div className="ssTrendCard">
      <div className="ssTrendHover">
        <div className="ssTrendHoverLabel">{hoverLabel}</div>
        <div className="ssTrendHoverValue">{hoverPrimary}</div>
        <div className="ssTrendHoverMeta">{hoverSecondary}</div>
      </div>

      <div className="ssTrendCanvas">
        <svg className="ssTrendSvg" viewBox="0 0 100 44" preserveAspectRatio="none">
          <path className="ssTrendGridLine" d="M 0 43.5 L 100 43.5" />
          <path className="ssTrendGridLine" d="M 0 22 L 100 22" />
          {mode === "count"
            ? chart.bars.map((bar, index) => (
                <rect
                  key={`${chart.points[index]?.dayKey || index}`}
                  className={`ssTrendBar ${index === activeIndex ? "is-active" : ""}`}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx="0.8"
                />
              ))
            : <path className="ssTrendLine" d={chart.path} />}
          {chart.bars.map((bar, index) => (
            <rect
              key={`hover-${chart.points[index]?.dayKey || index}`}
              className="ssTrendHitbox"
              x={bar.x}
              y="0"
              width={bar.width}
              height="44"
              rx="0.8"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(-1)}
            >
              <title>
                {`${formatTrendDayRange(chart.points[index]?.startDayKey, chart.points[index]?.endDayKey)} | ${
                  mode === "count"
                    ? `${formatCount(chart.points[index]?.count)} solves`
                    : `${formatStatTime(chart.points[index]?.average)} mean`
                }${
                  mode === "count" && Number.isFinite(chart.points[index]?.average)
                    ? ` | ${formatStatTime(chart.points[index]?.average)} mean`
                    : mode !== "count"
                      ? ` | ${formatCount(chart.points[index]?.count)} solves`
                      : ""
                }`}
              </title>
            </rect>
          ))}
        </svg>
        <div className="ssTrendAxis">
          <span>{formatTrendDayRange(chart.first?.startDayKey, chart.first?.endDayKey)}</span>
          <span>{formatTrendDayRange(chart.last?.startDayKey, chart.last?.endDayKey)}</span>
        </div>
      </div>
    </div>
  );
}

function buildOverallDerived(solves) {
  const input = Array.isArray(solves) ? solves : [];
  if (!input.length) return null;

  const numeric = input.map(solveMsAdjusted).filter((x) => typeof x === "number" && isFinite(x));
  const plus2Values = input
    .filter((s) => String(s.penalty ?? s.Penalty ?? "").toUpperCase() === "+2")
    .map(solveMsAdjusted)
    .filter((x) => typeof x === "number" && isFinite(x));

  return {
    singleWorst: numeric.length ? Math.max(...numeric) : null,
    mo3Strict: findBestStrictWindow(input, 3, "mo3")?.value ?? null,
    ao5Strict: findBestStrictWindow(input, 5, "ao")?.value ?? null,
    ao12Strict: findBestStrictWindow(input, 12, "ao")?.value ?? null,
    mo3Worst: computeWindowStat(input, { size: 3, kind: "mo3" }).worst,
    ao5Worst: computeWindowStat(input, { size: 5, kind: "ao" }).worst,
    ao12Worst: computeWindowStat(input, { size: 12, kind: "ao" }).worst,
    mean: meanMs(numeric),
    stdDev: stdDevMs(numeric),
    sum: numeric.reduce((sum, value) => sum + value, 0),
    plus2Best: plus2Values.length ? Math.min(...plus2Values) : null,
  };
}

function finiteStatOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function buildTimeViewSummary(solves) {
  const input = Array.isArray(solves) ? solves : [];
  if (!input.length) return null;

  const dated = input
    .map((solve) => ({ solve, date: getSolveDate(solve) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date - b.date);

  if (!dated.length) return null;

  const numeric = input.map(solveMsAdjusted).filter((x) => typeof x === "number" && isFinite(x));
  const dnfCount = input.filter((s) => String(s.penalty ?? s.Penalty ?? "").toUpperCase() === "DNF").length;

  const hourMap = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    numeric: [],
  }));

  const dayMap = new Map();

  for (const item of dated) {
    const hour = item.date.getHours();
    hourMap[hour].count += 1;
    const adjusted = solveMsAdjusted(item.solve);
    if (typeof adjusted === "number" && isFinite(adjusted)) {
      hourMap[hour].numeric.push(adjusted);
    }

    const dayKey = getLocalDayKey(item.date);
    const existing = dayMap.get(dayKey) || { key: dayKey, count: 0, numeric: [] };
    existing.count += 1;
    if (typeof adjusted === "number" && isFinite(adjusted)) {
      existing.numeric.push(adjusted);
    }
    dayMap.set(dayKey, existing);
  }

  const activeHours = hourMap.filter((hour) => hour.count > 0);
  const activeDays = Array.from(dayMap.values());
  const busiestHour = [...activeHours].sort((a, b) => b.count - a.count || a.hour - b.hour)[0] || null;
  const busiestDay = [...activeDays].sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))[0] || null;
  const fastestHour =
    [...activeHours]
      .filter((hour) => hour.numeric.length)
      .sort(
        (a, b) =>
          meanMs(a.numeric) - meanMs(b.numeric) ||
          b.count - a.count ||
          a.hour - b.hour
      )[0] || null;

  const firstDate = dated[0]?.date || null;
  const lastDate = dated[dated.length - 1]?.date || null;
  const spanMs = firstDate && lastDate ? lastDate.getTime() - firstDate.getTime() : null;

  return {
    solveCount: input.length,
    dateLabel: formatDateRange(input),
    firstSolve: formatClockTime(firstDate),
    lastSolve: formatClockTime(lastDate),
    activeDays: activeDays.length,
    activeHours: activeHours.length,
    busiestDay: busiestDay ? `${formatDayLabel(busiestDay.key)} (${busiestDay.count})` : "—",
    busiestHour: busiestHour
      ? `${formatClockTime(new Date(2000, 0, 1, busiestHour.hour, 0))} (${busiestHour.count})`
      : "—",
    fastestHour: fastestHour
      ? `${formatClockTime(new Date(2000, 0, 1, fastestHour.hour, 0))} (${formatStatTime(meanMs(fastestHour.numeric))})`
      : "—",
    bestSingle: numeric.length ? Math.min(...numeric) : null,
    worstSingle: numeric.length ? Math.max(...numeric) : null,
    mean: meanMs(numeric),
    median: medianMs(numeric),
    stdDev: stdDevMs(numeric),
    sum: numeric.reduce((sum, value) => sum + value, 0),
    dnfCount,
    spanMs,
    topHours: [...activeHours]
      .sort((a, b) => b.count - a.count || a.hour - b.hour)
      .slice(0, 3)
      .map((hour) => ({
        label: formatClockTime(new Date(2000, 0, 1, hour.hour, 0)),
        count: hour.count,
        mean: hour.numeric.length ? meanMs(hour.numeric) : null,
      })),
  };
}

function StatValueButton({ children, onClick, disabled = false }) {
  if (!onClick || disabled) {
    return children;
  }

  return (
    <button
      type="button"
      className="ssStatButton"
      data-interactive="summary-stat"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function MetricRow({
  label,
  metricKey,
  scope,
  current,
  best,
  strictBest = null,
  worst,
  showWorst = true,
  showCurrent = true,
  collapseHiddenSlots = false,
  onStatSelect,
  summarySource = "primary",
}) {
  const isAoMetric = /^AO\d+$/i.test(String(label || "").trim());
  const isSingleMetric = metricKey === "single" || /^single$/i.test(String(label || "").trim());

  const selectValue = (variant, value) => {
    if (typeof onStatSelect !== "function") return;
    onStatSelect({
      source: summarySource,
      scope,
      kind: "window",
      metricKey,
      label,
      variant,
      value,
    });
  };

  const renderValueSlot = ({ variant, value, className, visible = true }) => {
    if (!visible && collapseHiddenSlots) {
      return null;
    }

    if (!visible) {
      return <span className="ssMetricSlot ssMetricSlot--empty" aria-hidden="true" />;
    }

    return (
      <span className="ssMetricSlot">
        <StatValueButton onClick={() => selectValue(variant, value)} disabled={value == null}>
          <span
            className={`ssMetricValue ${className} ${isAoMetric ? "ssMetricValue--ao" : ""} ${
              isSingleMetric ? "ssMetricValue--singleMetric" : ""
            }`}
          >
            {formatStatTime(value)}
          </span>
        </StatValueButton>
      </span>
    );
  };

  return (
    <div className="ssMetricRow">
      <div className={`ssMetricLabel ${isAoMetric ? "ssMetricLabel--ao" : ""}`}>{label}</div>
      <div className={`ssMetricValues ${collapseHiddenSlots ? "ssMetricValues--compact" : ""}`}>
        {renderValueSlot({
          variant: "best",
          value: best,
          className: "ssMetricValue--best",
        })}
        {renderValueSlot({
          variant: "strict-best",
          value: strictBest,
          className: "ssMetricValue--strict",
          visible: strictBest !== null,
        })}
        {renderValueSlot({
          variant: "worst",
          value: worst,
          className: "ssMetricValue--worst",
          visible: showWorst,
        })}
        {renderValueSlot({
          variant: "current",
          value: current,
          className: "ssMetricValue--current",
          visible: showCurrent,
        })}
      </div>
    </div>
  );
}

function OverallMetricRow({
  label,
  metricKey,
  best,
  strictBest = null,
  worst = null,
  average = true,
  inlineStrictLabel = true,
  onStatSelect,
  summarySource = "primary",
}) {
  const selectValue = (variant, value) => {
    if (typeof onStatSelect !== "function") return;
    onStatSelect({
      source: summarySource,
      scope: "overall",
      kind: metricKey === "single" ? "single" : "window",
      metricKey,
      label,
      variant,
      value,
    });
  };

  return (
    <div className="ssOverallMetricRow">
      <div className="ssOverallMetricLabel">{label}</div>
      <div className="ssOverallMetricValues">
        <StatValueButton onClick={() => selectValue("best", best)} disabled={best == null}>
          <span className="ssMetricValue ssMetricValue--best">
            {formatStatTime(best, { average })}
          </span>
        </StatValueButton>
        {strictBest !== null && (
          <>
            <span className="ssMetricSpacer" />
            <StatValueButton
              onClick={() => selectValue("strict-best", strictBest)}
              disabled={strictBest == null}
            >
              <span className="ssMetricValue ssMetricValue--strict">
                {inlineStrictLabel
                  ? `Strict ${formatStatTime(strictBest, { average })}`
                  : formatStatTime(strictBest, { average })}
              </span>
            </StatValueButton>
          </>
        )}
        {worst !== null && (
          <>
            <span className="ssMetricSpacer" />
            <StatValueButton onClick={() => selectValue("worst", worst)} disabled={worst == null}>
              <span className="ssMetricValue ssMetricValue--worst">
                {formatStatTime(worst, { average })}
              </span>
            </StatValueButton>
          </>
        )}
      </div>
    </div>
  );
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

function SummaryTileValue({
  label,
  value,
  className,
  onClick,
  disabled = false,
  average = true,
  showLabel = true,
  single = false,
  emphasizeValue = false,
}) {
  return (
    <div
      className={`ssTileMetricValueBlock ${
        label === "WORST" || label === "Worst" ? "ssTileMetricValueBlock--worst" : ""
      } ${single ? "ssTileMetricValueBlock--single" : ""}`}
    >
      {showLabel ? <div className={`ssTileMetricValueLabel ${className}`}>{label}</div> : null}
      <StatValueButton onClick={onClick} disabled={disabled}>
        <div className={`ssTileMetricValue ${className} ${emphasizeValue ? "ssTileMetricValue--emphasized" : ""}`}>
          {formatStatTime(value, { average })}
        </div>
      </StatValueButton>
    </div>
  );
}

function SummaryMetricTile({
  label,
  metricKey,
  best,
  worst,
  scope = "current",
  summarySource = "primary",
  average = true,
  onStatSelect,
}) {
  const { prefix, value, single } = formatTileMetricParts(label);
  const isAoMetric = /^AO\d+$/i.test(String(label || "").trim());
  const isSingleMetric = metricKey === "single" || /^single$/i.test(String(label || "").trim());
  const selectValue = (variant, metricValue) => {
    if (typeof onStatSelect !== "function") return;
    onStatSelect({
      source: summarySource,
      scope,
      kind: metricKey === "single" ? "single" : "window",
      metricKey,
      label,
      variant,
      value: metricValue,
    });
  };

  return (
    <div className={`ssMetricTile ${single ? "ssMetricTile--single" : ""}`}>
      {!single ? (
        <div className="ssMetricTileHeader">
          <span className="ssMetricTilePrefix">{prefix}</span>
          <span className="ssMetricTileNumber">{value}</span>
        </div>
      ) : (
        <div className="ssMetricTileHeader ssMetricTileHeader--single" aria-hidden="true" />
      )}

      <div className="ssMetricTileValues">
        <SummaryTileValue
          label="BEST"
          value={best}
          className="ssMetricValue--best"
          average={average}
          emphasizeValue={isAoMetric || isSingleMetric}
          showLabel={single}
          single={single}
          onClick={() => selectValue("best", best)}
          disabled={best == null}
        />
        <SummaryTileValue
          label="WORST"
          value={worst}
          className="ssMetricValue--worst"
          average={average}
          emphasizeValue={isAoMetric || isSingleMetric}
          showLabel={single}
          single={single}
          onClick={() => selectValue("worst", worst)}
          disabled={worst == null}
        />
      </div>
    </div>
  );
}

function MetaStat({ label, value, tone = "default", stacked = false }) {
  const isSigmaLabel = label === "σ";
  return (
    <div className={`ssMetaStat ssMetaStat--${tone} ${stacked ? "ssMetaStat--stacked" : ""}`}>
      <div className={`ssMetaLabel ${isSigmaLabel ? "ssMetaLabel--sigma" : ""}`}>{label}</div>
      <div className="ssMetaValue">{value}</div>
    </div>
  );
}

function TimeViewAllEventsSummary({
  view,
  timeView,
  eventBreakdownData,
  loading = false,
}) {
  const breakdownRows = Array.isArray(eventBreakdownData)
    ? eventBreakdownData
        .filter((entry) => Number(entry?.value) > 0)
        .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
    : [];

  if (!view) {
    return (
      <section className={`ssCard ssCard--timeAllEvents ${loading ? "is-loading" : ""}`} aria-busy={loading}>
        <div className="statsSummaryEmpty">No solves available for the selected day</div>
      </section>
    );
  }

  return (
    <section className={`ssCard ssCard--timeAllEvents ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <div className="ssTimeAllEventsLead">
        <div className="ssViewCountValue">{formatCount(view?.solveCount)}</div>
        <div className="ssViewCountLabel">solves in range</div>
        <div className="ssViewMeta">{view?.dateRange || timeView?.dateLabel || "—"}</div>
        <div className="ssViewMeta">{view?.indexRange || "—"}</div>
      </div>

      <div className="ssTimeAllEventsMeta">
        <MetaStat label="+2 Count" value={formatCount(view?.plus2Count)} tone="lime" />
        <MetaStat label="DNF Count" value={formatCount(view?.dnfCount)} tone="danger" />
        <MetaStat label="Sum" value={formatDurationMs(view?.sum)} tone="blue" />
      </div>

      <div className="ssTimeAllEventsBreakdown">
        <div className="ssTimeAllEventsBreakdownChart">
          <PieChartBuilder
            width="100%"
            height="100%"
            data={breakdownRows}
            legendValueMode="count-percent"
            interactive={false}
            maxLegendItems={5}
            promoteHoveredOverflowItem
            reverseLayout
          />
        </div>
      </div>
    </section>
  );
}

function useStatsSummaryData({
  solves,
  overallSolves = [],
  overallStats,
  allowOverallDerived = true,
  selectedEvent,
  selectedSession,
  selectedTagLabel = "",
  loadedSolveCount = null,
}) {
  const view = useMemo(
    () => buildViewSummary(solves, overallStats?.SolveCountTotal ?? null, loadedSolveCount),
    [solves, overallStats?.SolveCountTotal, loadedSolveCount]
  );
  const overallFallback = useMemo(
    () => buildViewSummary(overallSolves, overallStats?.SolveCountTotal ?? null, overallSolves?.length ?? null),
    [overallSolves, overallStats?.SolveCountTotal]
  );
  const overallDerived = useMemo(() => buildOverallDerived(overallSolves), [overallSolves]);

  const overall = useMemo(
    () => ({
      solveCountTotal: overallStats?.SolveCountTotal ?? overallSolves?.length ?? null,
      single: overallStats?.BestSingleMs ?? overallFallback?.single?.best ?? null,
      mo3: overallStats?.BestMo3Ms ?? overallFallback?.metrics?.mo3?.best ?? null,
      ao5: overallStats?.BestAo5Ms ?? overallFallback?.metrics?.ao5?.best ?? null,
      ao12: overallStats?.BestAo12Ms ?? overallFallback?.metrics?.ao12?.best ?? null,
      ao25: overallStats?.BestAo25Ms ?? overallFallback?.metrics?.ao25?.best ?? null,
      ao50: overallStats?.BestAo50Ms ?? overallFallback?.metrics?.ao50?.best ?? null,
      ao100: overallStats?.BestAo100Ms ?? overallFallback?.metrics?.ao100?.best ?? null,
      ao1000: overallStats?.BestAo1000Ms ?? overallFallback?.metrics?.ao1000?.best ?? null,
      mo3Strict:
        overallStats?.BestMo3StrictMs ??
        (allowOverallDerived ? overallDerived?.mo3Strict ?? null : null),
      ao5Strict:
        overallStats?.BestAo5StrictMs ??
        (allowOverallDerived ? overallDerived?.ao5Strict ?? null : null),
      ao12Strict:
        overallStats?.BestAo12StrictMs ??
        (allowOverallDerived ? overallDerived?.ao12Strict ?? null : null),
      mean: overallStats?.MeanMs ?? (allowOverallDerived ? overallDerived?.mean ?? null : null),
      stdDev:
        overallStats?.SumFinalTimeSqMs != null
          ? stdDevFromAggregate(overallStats)
          : allowOverallDerived
            ? overallDerived?.stdDev ?? null
            : null,
      sum: overallStats?.SumFinalTimeMs ?? (allowOverallDerived ? overallDerived?.sum ?? null : null),
      plus2Count: overallStats?.Plus2Count ?? null,
      plus2Best:
        overallStats?.Plus2BestMs ??
        (allowOverallDerived ? overallDerived?.plus2Best ?? null : null),
      dnfCount: overallStats?.DNFCount ?? null,
      singleWorst:
        finiteStatOrNull(overallStats?.WorstSingleMs) ??
        (allowOverallDerived ? overallDerived?.singleWorst ?? null : null),
      mo3Worst:
        finiteStatOrNull(overallStats?.WorstMo3Ms) ??
        (allowOverallDerived ? overallDerived?.mo3Worst ?? null : null),
      ao5Worst:
        finiteStatOrNull(overallStats?.WorstAo5Ms) ??
        (allowOverallDerived ? overallDerived?.ao5Worst ?? null : null),
      ao12Worst:
        finiteStatOrNull(overallStats?.WorstAo12Ms) ??
        (allowOverallDerived ? overallDerived?.ao12Worst ?? null : null),
    }),
    [overallStats, overallFallback, overallDerived, overallSolves, allowOverallDerived]
  );

  const compactSession = String(selectedSession || "").replace(/\s+session$/i, "").trim();
  const overallTitle = `Overall ${selectedEvent || "Event"}${compactSession ? ` · ${compactSession}` : ""}`;

  return { view, overall, overallTitle };
}

export const StatsSummaryCurrent = React.memo(function StatsSummaryCurrent({
  solves,
  overallStats,
  bucketSummary = null,
  bucketItems = [],
  allEventsBreakdown,
  mode = "session",
  loadedSolveCount = null,
  showCurrentMetrics = true,
  viewMode = "standard",
  summaryLayout = "row",
  selectedDay = "",
  selectedTagPills = [],
  summarySource = "primary",
  onStatSelect,
  compareSummary = null,
  eventBreakdownData = [],
  loading = false,
}) {
  const [timeTrendMode, setTimeTrendMode] = useState("average");
  const view = useMemo(
    () =>
      bucketSummary
        ? buildBucketViewSummary(bucketSummary, bucketItems)
        : buildViewSummary(solves, overallStats?.SolveCountTotal ?? null, loadedSolveCount),
    [bucketItems, bucketSummary, solves, overallStats?.SolveCountTotal, loadedSolveCount]
  );
  const compareView = useMemo(
    () => buildViewSummary(compareSummary?.solves || [], null, null),
    [compareSummary?.solves]
  );
  const timeView = useMemo(
    () => (bucketSummary ? buildBucketTimeViewSummary(bucketSummary, bucketItems) : buildTimeViewSummary(solves)),
    [bucketItems, bucketSummary, solves]
  );
  const timeTrendItems = useMemo(
    () => (bucketSummary ? buildBucketDailyTrend(bucketItems) : buildRawDailyTrend(solves)),
    [bucketItems, bucketSummary, solves]
  );
  const effectiveViewMode = viewMode === "time" ? "time" : bucketSummary ? "standard" : viewMode;
  const isTileLayout = effectiveViewMode === "standard" && summaryLayout === "tile";
  const hasEventBreakdownData = Array.isArray(eventBreakdownData) && eventBreakdownData.length > 0;

  if (mode === "all-events") {
    if (effectiveViewMode === "time") {
      return (
        <TimeViewAllEventsSummary
          view={view}
          timeView={timeView}
          eventBreakdownData={eventBreakdownData}
          loading={loading}
        />
      );
    }

    return null;
  }

  if (!view) {
    return (
      <section
        className={`ssCard ${viewMode === "time" ? "ssCard--time" : "ssCard--view"} ${loading ? "is-loading" : ""}`}
        aria-busy={loading}
      >
        <div className="statsSummaryEmpty">
          {effectiveViewMode === "time" ? "No solves available for the selected day" : "No solves available"}
        </div>
      </section>
    );
  }

  if (effectiveViewMode === "time" && hasEventBreakdownData) {
    return (
      <TimeViewAllEventsSummary
        view={view}
        timeView={timeView}
        eventBreakdownData={eventBreakdownData}
        loading={loading}
      />
    );
  }

  return (
    <section
      className={`ssCard ${
        effectiveViewMode === "time"
          ? "ssCard--time"
          : isTileLayout
            ? "ssCard--view ssCard--viewTile"
            : "ssCard--view"
      } ${loading ? "is-loading" : ""}`}
      aria-busy={loading}
    >
      {effectiveViewMode === "time" ? (
        timeView ? (
          <>
            <div className="ssTimeLead">
              <div className="ssViewCountValue">{formatCount(timeView.solveCount)}</div>
              <div className="ssViewCountLabel">solves in range</div>
              <div className="ssViewMeta">{timeView.dateLabel}</div>
              <div className="ssViewMeta">{formatCount(timeView.activeDays)} active days</div>
            </div>

            <div className="ssTimeBody">
              <div className="ssTimeBodyHeaderRow">
                <div className="ssTimeBodyHeader">Daily trend</div>
                <div className="ssTrendToggle" role="tablist" aria-label="Daily trend metric">
                  <button
                    type="button"
                    className={`ssTrendToggleButton ${timeTrendMode === "average" ? "is-active" : ""}`}
                    aria-pressed={timeTrendMode === "average"}
                    onClick={() => setTimeTrendMode("average")}
                  >
                    Avg
                  </button>
                  <button
                    type="button"
                    className={`ssTrendToggleButton ${timeTrendMode === "count" ? "is-active" : ""}`}
                    aria-pressed={timeTrendMode === "count"}
                    onClick={() => setTimeTrendMode("count")}
                  >
                    Count
                  </button>
                </div>
              </div>
              <MiniTrendChart items={timeTrendItems} mode={timeTrendMode} />

              {timeView.topHours.length > 0 && (
                <>
                  <div className="ssTimeBodyHeader">Top hours</div>
                  <div className="ssTimeHours">
                    {timeView.topHours.map((hour) => (
                      <div key={hour.label} className="ssTimeHourRow">
                        <span className="ssTimeHourLabel">{hour.label}</span>
                        <span className="ssTimeHourCount">{hour.count} solves</span>
                        <span className="ssTimeHourMean">{formatStatTime(hour.mean)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="ssTimeSide">
              <MetaStat label="Days" value={formatCount(timeView.activeDays)} />
              <MetaStat label="Busiest Day" value={timeView.busiestDay} />
              <div className="ssSingleRow">
                <div className="ssSingleLabel">Single</div>
                <div className="ssSingleValues">
                  <StatValueButton
                    onClick={() =>
                      onStatSelect?.({
                        scope: "current",
                        kind: "single",
                        metricKey: "single",
                        label: "Single",
                        variant: "best",
                        value: timeView.bestSingle,
                      })
                    }
                    disabled={timeView.bestSingle == null}
                  >
                    <span className="ssMetricValue ssMetricValue--best">
                      {formatStatTime(timeView.bestSingle, { average: false })}
                    </span>
                  </StatValueButton>
                  <StatValueButton
                    onClick={() =>
                      onStatSelect?.({
                        scope: "current",
                        kind: "single",
                        metricKey: "single",
                        label: "Single",
                        variant: "worst",
                        value: timeView.worstSingle,
                      })
                    }
                    disabled={timeView.worstSingle == null}
                  >
                    <span className="ssMetricValue ssMetricValue--worst">
                      {formatStatTime(timeView.worstSingle, { average: false })}
                    </span>
                  </StatValueButton>
                </div>
              </div>

              <div className="ssTopMetaRow">
                <MetaStat label="Mean" value={formatStatTime(timeView.mean)} tone="accent" stacked />
                <MetaStat label="Median" value={formatStatTime(timeView.median)} tone="accent" stacked />
                <MetaStat label="σ" value={formatStatTime(timeView.stdDev)} tone="accent" stacked />
              </div>

              <div className="ssMetaGrid">
                <div className="ssMetaColumn">
                  <MetaStat label="Active Hours" value={formatCount(timeView.activeHours)} tone="lime" />
                  <MetaStat label="Busiest Hour" value={timeView.busiestHour} tone="teal" />
                </div>
                <div className="ssMetaColumn">
                  <MetaStat label="Fastest Hour" value={timeView.fastestHour} tone="blue" />
                  <MetaStat label="DNF Count" value={formatCount(timeView.dnfCount)} tone="danger" />
                </div>
              </div>

              <div className="ssMetaGrid">
                <div className="ssMetaColumn">
                  <MetaStat label="Day Span" value={formatDurationMs(timeView.spanMs)} tone="blue" />
                </div>
                <div className="ssMetaColumn">
                  <MetaStat label="Sum" value={formatDurationMs(timeView.sum)} tone="blue" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="statsSummaryEmpty">No solves available for the selected day</div>
        )
      ) : (
        <>
          {compareView && (
            <div className="ssCompareStrip">
              <div className="ssCompareStripHeader">Compare</div>
              <div className="ssCompareStripGrid">
                <div className="ssComparePill">
                  <span className="ssComparePillLabel">{formatCompareLabel(compareSummary.primaryLabel)}</span>
                  <span className="ssComparePillValue">{formatCount(view?.solveCount)}</span>
                  <span className="ssComparePillMeta">
                    {formatStatTime(view?.single?.best, { average: false })} best
                  </span>
                </div>
                <div className="ssComparePill">
                  <span className="ssComparePillLabel">{formatCompareLabel(compareSummary.compareLabel)}</span>
                  <span className="ssComparePillValue">{formatCount(compareView?.solveCount)}</span>
                  <span className="ssComparePillMeta">
                    {formatStatTime(compareView?.single?.best, { average: false })} best
                  </span>
                </div>
                <div className="ssCompareMiniStat">
                  <span className="ssCompareMiniLabel">AO5</span>
                  <span className="ssCompareMiniValue">
                    {formatStatTime(view?.metrics?.ao5?.best)} / {formatStatTime(compareView?.metrics?.ao5?.best)}
                  </span>
                </div>
                <div className="ssCompareMiniStat">
                  <span className="ssCompareMiniLabel">Mean</span>
                  <span className="ssCompareMiniValue">
                    {formatStatTime(view?.mean)} / {formatStatTime(compareView?.mean)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="ssViewCount">
            <div className="ssViewCountValue">{formatCount(view?.solveCount)}</div>
            <div className="ssViewCountLabel">solves</div>
            <div className="ssViewMeta ssViewMeta--date">{view?.dateRange || "—"}</div>
            <div className="ssViewMeta ssViewMeta--range">{view?.indexRange || "—"}</div>
            {Array.isArray(selectedTagPills) && selectedTagPills.length ? (
              <div className="ssViewTagList">
                {selectedTagPills.map((tag) => (
                  <span
                    key={`${tag.field || "tag"}-${tag.value || ""}`}
                    className="ssOverallTagPill"
                    style={{
                      "--ss-tag-color": tag.color || "#2EC4B6",
                      "--ss-tag-border": tag.color || "#2EC4B6",
                      "--ss-tag-bg": `${tag.color || "#2EC4B6"}22`,
                    }}
                    title={`${tag.label || tag.field || "Tag"}: ${tag.value || ""}`}
                  >
                    <span className="ssOverallTagPillIconWrap" aria-hidden="true">
                      <img src={tagBadge} alt="" className="ssOverallTagPillIcon" />
                    </span>
                    <span className="ssOverallTagPillText">{tag.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className={`ssViewBody ${isTileLayout ? "ssViewBody--tile" : ""}`}>
            {isTileLayout ? (
              <div className="ssCurrentTileLayout">
                <div className="ssCurrentTileLead">
                  <div className="ssCurrentTileTopRow">
                    <SummaryMetricTile
                      label="Single"
                      metricKey="single"
                      best={view?.single?.best}
                      worst={view?.single?.worst}
                      average={false}
                      scope="current"
                      summarySource={summarySource}
                      onStatSelect={onStatSelect}
                    />
                    <SummaryMetricTile
                      label="AO5"
                      metricKey="ao5"
                      best={view?.metrics?.ao5?.best}
                      worst={view?.metrics?.ao5?.worst}
                      scope="current"
                      summarySource={summarySource}
                      onStatSelect={onStatSelect}
                    />
                    <SummaryMetricTile
                      label="AO12"
                      metricKey="ao12"
                      best={view?.metrics?.ao12?.best}
                      worst={view?.metrics?.ao12?.worst}
                      scope="current"
                      summarySource={summarySource}
                      onStatSelect={onStatSelect}
                    />
                  </div>
                </div>

                <div className="ssCurrentTileMeta">
                  <div className="ssTopMetaRow">
                    <MetaStat label="Mean" value={formatStatTime(view?.mean)} tone="accent" stacked />
                    <MetaStat label="Median" value={formatStatTime(view?.median)} tone="accent" stacked />
                    <MetaStat label="σ" value={formatStatTime(view?.stdDev)} tone="accent" stacked />
                  </div>

                  <div className="ssMetaGrid ssMetaGrid--currentRow">
                    <MetaStat label="+2 Count" value={formatCount(view?.plus2Count)} tone="lime" />
                    <MetaStat label="DNF Count" value={formatCount(view?.dnfCount)} tone="danger" />
                  </div>

                  <div className="ssMetaGrid ssMetaGrid--currentRow">
                    <MetaStat label="+2 Best" value={formatStatTime(view?.plus2Best, { average: false })} tone="teal" />
                    <MetaStat label="Sum" value={formatDurationMs(view?.sum)} tone="blue" />
                  </div>
                </div>

                <div className="ssMetricTileGrid">
                  <SummaryMetricTile
                    label="MO3"
                    metricKey="mo3"
                    best={view?.metrics?.mo3?.best}
                    worst={view?.metrics?.mo3?.worst}
                    scope="current"
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                  <SummaryMetricTile
                    label="AO25"
                    metricKey="ao25"
                    best={view?.metrics?.ao25?.best}
                    worst={view?.metrics?.ao25?.worst}
                    scope="current"
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                  <SummaryMetricTile
                    label="AO50"
                    metricKey="ao50"
                    best={view?.metrics?.ao50?.best}
                    worst={view?.metrics?.ao50?.worst}
                    scope="current"
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                  <SummaryMetricTile
                    label="AO100"
                    metricKey="ao100"
                    best={view?.metrics?.ao100?.best}
                    worst={view?.metrics?.ao100?.worst}
                    scope="current"
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                  <SummaryMetricTile
                    label="AO1000"
                    metricKey="ao1000"
                    best={view?.metrics?.ao1000?.best}
                    worst={view?.metrics?.ao1000?.worst}
                    scope="current"
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                </div>
              </div>
            ) : (
              <div className="ssCurrentSummaryGrid">
                <div className="ssCurrentSummaryCell ssCurrentSummaryCell--meta">
                  <div className="ssSingleRow">
                    <div className="ssSingleLabel">Single</div>
                    <div className="ssSingleValues">
                      <StatValueButton
                        onClick={() =>
                          onStatSelect?.({
                            source: summarySource,
                            scope: "current",
                            kind: "single",
                            metricKey: "single",
                            label: "Single",
                            variant: "best",
                            value: view?.single?.best,
                          })
                        }
                        disabled={view?.single?.best == null}
                      >
                        <span className="ssMetricValue ssMetricValue--best">
                          {formatStatTime(view?.single?.best, { average: false })}
                        </span>
                      </StatValueButton>
                      <StatValueButton
                        onClick={() =>
                          onStatSelect?.({
                            source: summarySource,
                            scope: "current",
                            kind: "single",
                            metricKey: "single",
                            label: "Single",
                            variant: "worst",
                            value: view?.single?.worst,
                          })
                        }
                        disabled={view?.single?.worst == null}
                      >
                        <span className="ssMetricValue ssMetricValue--worst">
                          {formatStatTime(view?.single?.worst, { average: false })}
                        </span>
                      </StatValueButton>
                      {showCurrentMetrics && (
                        <StatValueButton
                          onClick={() =>
                            onStatSelect?.({
                              source: summarySource,
                              scope: "current",
                              kind: "single",
                              metricKey: "single",
                              label: "Single",
                              variant: "current",
                              value: view?.single?.current,
                            })
                          }
                          disabled={view?.single?.current == null}
                        >
                          <span className="ssMetricValue ssMetricValue--current">
                            {formatStatTime(view?.single?.current, { average: false })}
                          </span>
                        </StatValueButton>
                      )}
                    </div>
                  </div>
                </div>

                <div className="ssCurrentSummaryCell ssCurrentSummaryCell--legend">
                  <div className="ssViewLegend">
                    <span className="ssMetricLegendSpacer" aria-hidden="true" />
                    <span className="ssMetricValue--best">Best</span>
                    <span className="ssMetricValue--strict">Strict</span>
                    <span className="ssMetricValue--worst">Worst</span>
                    {showCurrentMetrics && <span className="ssMetricValue--current">Current</span>}
                  </div>
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO25"
                    metricKey="ao25"
                    scope="current"
                    current={view?.metrics?.ao25?.current}
                    best={view?.metrics?.ao25?.best}
                    worst={view?.metrics?.ao25?.worst}
                    showWorst={false}
                    showCurrent={showCurrentMetrics}
                    collapseHiddenSlots
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell ssCurrentSummaryCell--meta">
                  <div className="ssTopMetaRow">
                    <MetaStat label="Mean" value={formatStatTime(view?.mean)} tone="accent" stacked />
                    <MetaStat label="Median" value={formatStatTime(view?.median)} tone="accent" stacked />
                    <MetaStat label="σ" value={formatStatTime(view?.stdDev)} tone="accent" stacked />
                  </div>
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO5"
                    metricKey="ao5"
                    scope="current"
                    current={view?.metrics?.ao5?.current}
                    best={view?.metrics?.ao5?.best}
                    strictBest={view?.metrics?.ao5?.strictBest}
                    worst={view?.metrics?.ao5?.worst}
                    showCurrent={showCurrentMetrics}
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO50"
                    metricKey="ao50"
                    scope="current"
                    current={view?.metrics?.ao50?.current}
                    best={view?.metrics?.ao50?.best}
                    worst={view?.metrics?.ao50?.worst}
                    showWorst={false}
                    showCurrent={showCurrentMetrics}
                    collapseHiddenSlots
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell ssCurrentSummaryCell--meta">
                  <div className="ssMetaGrid ssMetaGrid--currentRow">
                    <MetaStat label="+2 Count" value={formatCount(view?.plus2Count)} tone="lime" />
                    <MetaStat label="DNF Count" value={formatCount(view?.dnfCount)} tone="danger" />
                  </div>
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO12"
                    metricKey="ao12"
                    scope="current"
                    current={view?.metrics?.ao12?.current}
                    best={view?.metrics?.ao12?.best}
                    strictBest={view?.metrics?.ao12?.strictBest}
                    worst={view?.metrics?.ao12?.worst}
                    showCurrent={showCurrentMetrics}
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO100"
                    metricKey="ao100"
                    scope="current"
                    current={view?.metrics?.ao100?.current}
                    best={view?.metrics?.ao100?.best}
                    worst={view?.metrics?.ao100?.worst}
                    showWorst={false}
                    showCurrent={showCurrentMetrics}
                    collapseHiddenSlots
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell ssCurrentSummaryCell--meta">
                  <div className="ssMetaGrid ssMetaGrid--currentRow">
                    <MetaStat label="+2 Best" value={formatStatTime(view?.plus2Best, { average: false })} tone="teal" />
                    <MetaStat label="Sum" value={formatDurationMs(view?.sum)} tone="blue" />
                  </div>
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="MO3"
                    metricKey="mo3"
                    scope="current"
                    current={view?.metrics?.mo3?.current}
                    best={view?.metrics?.mo3?.best}
                    strictBest={view?.metrics?.mo3?.strictBest}
                    worst={view?.metrics?.mo3?.worst}
                    showCurrent={showCurrentMetrics}
                    onStatSelect={onStatSelect}
                    summarySource={summarySource}
                  />
                </div>

                <div className="ssCurrentSummaryCell">
                  <MetricRow
                    label="AO1000"
                    metricKey="ao1000"
                    scope="current"
                    current={view?.metrics?.ao1000?.current}
                    best={view?.metrics?.ao1000?.best}
                    worst={view?.metrics?.ao1000?.worst}
                    showWorst={false}
                    showCurrent={showCurrentMetrics}
                    collapseHiddenSlots
                    summarySource={summarySource}
                    onStatSelect={onStatSelect}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
});

export const StatsSummaryOverall = React.memo(function StatsSummaryOverall({
  solves,
  overallSolves = [],
  overallStats,
  allowOverallDerived = true,
  mode = "session",
  selectedEvent,
  selectedSession,
  selectedTagLabel = "",
  selectedTagPills = [],
  summarySource = "primary",
  loadedSolveCount = null,
  onStatSelect,
  compareSummary = null,
  profileColor = "#50B6FF",
  loading = false,
}) {
  const { view, overall, overallTitle } = useStatsSummaryData({
    solves,
    overallSolves,
    overallStats,
    allowOverallDerived,
    selectedEvent,
    selectedSession,
    selectedTagLabel,
    loadedSolveCount,
  });
  const compareOverall = useMemo(
    () => buildOverallDerived(compareSummary?.overallSolves || compareSummary?.solves || []),
    [compareSummary?.overallSolves, compareSummary?.solves]
  );
  const resolvedProfileColor = normalizeHexColor(profileColor, "#50B6FF");
  const overallCardStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${withAlpha(resolvedProfileColor, 0.26)}, ${withAlpha(
        resolvedProfileColor,
        0.14
      )})`,
      borderColor: withAlpha(resolvedProfileColor, 0.82),
      boxShadow: `inset 0 1px 0 ${withAlpha(resolvedProfileColor, 0.18)}`,
    }),
    [resolvedProfileColor]
  );

  if (mode === "all-events") {
    return null;
  }

  if (!view && !overallStats && !overallSolves?.length) {
    return (
      <section className={`ssCard ssCard--overall ${loading ? "is-loading" : ""}`} style={overallCardStyle} aria-busy={loading}>
        <div className="statsSummaryEmpty">No solves available</div>
      </section>
    );
  }

  return (
    <section className={`ssCard ssCard--overall ${loading ? "is-loading" : ""}`} style={overallCardStyle} aria-busy={loading}>
      <div className="ssOverallHeader">
        <div className="ssOverallTitle">
          <span>{overallTitle}</span>
          {Array.isArray(selectedTagPills) && selectedTagPills.length ? (
            <span className="ssOverallTagList">
              {selectedTagPills.map((tag) => (
                <span
                  key={`${tag.field || "tag"}-${tag.value || ""}`}
                  className="ssOverallTagPill"
                  style={{
                    "--ss-tag-color": tag.color || "#2EC4B6",
                    "--ss-tag-border": tag.color || "#2EC4B6",
                    "--ss-tag-bg": `${tag.color || "#2EC4B6"}22`,
                  }}
                  title={`${tag.label || tag.field || "Tag"}: ${tag.value || ""}`}
                >
                  <span className="ssOverallTagPillIconWrap" aria-hidden="true">
                    <img src={tagBadge} alt="" className="ssOverallTagPillIcon" />
                  </span>
                  <span className="ssOverallTagPillText">{tag.value}</span>
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <div className="ssOverallCount">{formatCount(overall.solveCountTotal)} solves</div>
      </div>

      {compareOverall && (
        <div className="ssOverallCompare">
          <div className="ssComparePill">
            <span className="ssComparePillLabel">{formatCompareLabel(compareSummary.primaryLabel)}</span>
            <span className="ssComparePillValue">{formatCount(overall.solveCountTotal)}</span>
            <span className="ssComparePillMeta">
              {formatStatTime(overall.single, { average: false })} best
            </span>
          </div>
          <div className="ssComparePill">
            <span className="ssComparePillLabel">{formatCompareLabel(compareSummary.compareLabel)}</span>
            <span className="ssComparePillValue">{formatCount(compareOverall.solveCountTotal)}</span>
            <span className="ssComparePillMeta">
              {formatStatTime(compareOverall.single, { average: false })} best
            </span>
          </div>
        </div>
      )}

      <div className="ssOverallBody">
        <div className="ssOverallMetricsSection">
          <div className="ssOverallLegend">
            <span className="ssMetricLegendSpacer" aria-hidden="true" />
            <span className="ssMetricValue--best">Best</span>
            <span className="ssMetricValue--strict">Strict</span>
            <span className="ssMetricValue--worst">Worst</span>
          </div>
          <div className="ssOverallMetricGrid">
            <OverallMetricRow
              label="Single"
              metricKey="single"
              best={overall.single}
              worst={overall.singleWorst}
              average={false}
              onStatSelect={onStatSelect}
              summarySource={summarySource}
            />
            <OverallMetricRow label="AO25" metricKey="ao25" best={overall.ao25} onStatSelect={onStatSelect} summarySource={summarySource} />
            <OverallMetricRow
              label="AO5"
              metricKey="ao5"
              best={overall.ao5}
              strictBest={overall.ao5Strict}
              worst={overall.ao5Worst}
              inlineStrictLabel={false}
              onStatSelect={onStatSelect}
              summarySource={summarySource}
            />
            <OverallMetricRow label="AO50" metricKey="ao50" best={overall.ao50} onStatSelect={onStatSelect} summarySource={summarySource} />
            <OverallMetricRow
              label="AO12"
              metricKey="ao12"
              best={overall.ao12}
              strictBest={overall.ao12Strict}
              worst={overall.ao12Worst}
              inlineStrictLabel={false}
              onStatSelect={onStatSelect}
              summarySource={summarySource}
            />
            <OverallMetricRow label="AO100" metricKey="ao100" best={overall.ao100} onStatSelect={onStatSelect} summarySource={summarySource} />
            <OverallMetricRow
              label="MO3"
              metricKey="mo3"
              best={overall.mo3}
              strictBest={overall.mo3Strict}
              worst={overall.mo3Worst}
              inlineStrictLabel={false}
              onStatSelect={onStatSelect}
              summarySource={summarySource}
            />
            <OverallMetricRow label="AO1000" metricKey="ao1000" best={overall.ao1000} onStatSelect={onStatSelect} summarySource={summarySource} />
          </div>
        </div>

        <div className="ssOverallMeta">
          <div className="ssOverallMetaRow ssOverallMetaRow--pair">
            <MetaStat label="Mean" value={formatStatTime(overall.mean)} tone="accent" />
            <MetaStat label="σ" value={formatStatTime(overall.stdDev)} tone="accent" />
          </div>
          <div className="ssOverallMetaRow">
            <MetaStat label="Sum" value={formatDurationMs(overall.sum)} tone="blue" />
          </div>
          <div className="ssOverallMetaRow">
            <MetaStat label="+2 Count" value={formatCount(overall.plus2Count)} tone="lime" />
          </div>
          <div className="ssOverallMetaRow">
            <MetaStat
              label="+2 Best"
              value={formatStatTime(overall.plus2Best, { average: false })}
              tone="teal"
            />
          </div>
          <div className="ssOverallMetaRow">
            <MetaStat label="DNF Count" value={formatCount(overall.dnfCount)} tone="danger" />
          </div>
        </div>
      </div>
    </section>
  );
});

function StatsSummary(props) {
  if (props.mode === "all-events") {
    return <StatsSummaryCurrent {...props} />;
  }

  return (
    <div className="statsSummaryShell">
      <StatsSummaryCurrent {...props} />
      <StatsSummaryOverall {...props} />
    </div>
  );
}

export default React.memo(StatsSummary);
