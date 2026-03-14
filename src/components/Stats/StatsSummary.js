import React, { useMemo } from "react";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
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
    metrics[spec.key] = computeWindowStat(input, spec);
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
    mo3Worst: computeWindowStat(input, { size: 3, kind: "mo3" }).worst,
    ao5Worst: computeWindowStat(input, { size: 5, kind: "ao" }).worst,
    ao12Worst: computeWindowStat(input, { size: 12, kind: "ao" }).worst,
    mean: meanMs(numeric),
    stdDev: stdDevMs(numeric),
    sum: numeric.reduce((sum, value) => sum + value, 0),
    plus2Best: plus2Values.length ? Math.min(...plus2Values) : null,
  };
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
  worst,
  showWorst = true,
  showCurrent = true,
  onStatSelect,
}) {
  const selectValue = (variant, value) => {
    if (typeof onStatSelect !== "function") return;
    onStatSelect({
      scope,
      kind: "window",
      metricKey,
      label,
      variant,
      value,
    });
  };

  return (
    <div className="ssMetricRow">
      <div className="ssMetricLabel">{label}</div>
      <div className="ssMetricValues">
        <StatValueButton onClick={() => selectValue("best", best)} disabled={best == null}>
          <span className="ssMetricValue ssMetricValue--best">{formatStatTime(best)}</span>
        </StatValueButton>
        {showWorst && (
          <>
            <span className="ssMetricDot">·</span>
            <StatValueButton onClick={() => selectValue("worst", worst)} disabled={worst == null}>
              <span className="ssMetricValue ssMetricValue--worst">{formatStatTime(worst)}</span>
            </StatValueButton>
          </>
        )}
        {showCurrent && (
          <>
            <span className="ssMetricDot">·</span>
            <StatValueButton onClick={() => selectValue("current", current)} disabled={current == null}>
              <span className="ssMetricValue ssMetricValue--current">{formatStatTime(current)}</span>
            </StatValueButton>
          </>
        )}
      </div>
    </div>
  );
}

function OverallMetricRow({ label, metricKey, best, worst = null, average = true, onStatSelect }) {
  const selectValue = (variant, value) => {
    if (typeof onStatSelect !== "function") return;
    onStatSelect({
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

function MetaStat({ label, value, tone = "default", stacked = false }) {
  return (
    <div className={`ssMetaStat ssMetaStat--${tone} ${stacked ? "ssMetaStat--stacked" : ""}`}>
      <div className="ssMetaLabel">{label}</div>
      <div className="ssMetaValue">{value}</div>
    </div>
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
      mean: overallStats?.MeanMs ?? (allowOverallDerived ? overallDerived?.mean ?? null : null),
      stdDev: allowOverallDerived ? overallDerived?.stdDev ?? null : null,
      sum: overallStats?.SumFinalTimeMs ?? (allowOverallDerived ? overallDerived?.sum ?? null : null),
      plus2Count: overallStats?.Plus2Count ?? null,
      plus2Best: allowOverallDerived ? overallDerived?.plus2Best ?? null : null,
      dnfCount: overallStats?.DNFCount ?? null,
      singleWorst: overallDerived?.singleWorst ?? null,
      mo3Worst: overallDerived?.mo3Worst ?? null,
      ao5Worst: overallDerived?.ao5Worst ?? null,
      ao12Worst: overallDerived?.ao12Worst ?? null,
    }),
    [overallStats, overallFallback, overallDerived, overallSolves, allowOverallDerived]
  );

  const compactSession = String(selectedSession || "").replace(/\s+session$/i, "").trim();
  const overallTitle = `Overall ${selectedEvent || "Event"}${compactSession ? ` · ${compactSession}` : ""}${selectedTagLabel ? ` · ${selectedTagLabel}` : ""}`;

  return { view, overall, overallTitle };
}

export const StatsSummaryCurrent = React.memo(function StatsSummaryCurrent({
  solves,
  overallStats,
  allEventsBreakdown,
  mode = "session",
  loadedSolveCount = null,
  showCurrentMetrics = true,
  viewMode = "standard",
  selectedDay = "",
  onStatSelect,
  compareSummary = null,
}) {
  const view = useMemo(
    () => buildViewSummary(solves, overallStats?.SolveCountTotal ?? null, loadedSolveCount),
    [solves, overallStats?.SolveCountTotal, loadedSolveCount]
  );
  const compareView = useMemo(
    () => buildViewSummary(compareSummary?.solves || [], null, null),
    [compareSummary?.solves]
  );
  const timeView = useMemo(() => buildTimeViewSummary(solves), [solves]);

  if (mode === "all-events") {
    const rows = Array.isArray(allEventsBreakdown) ? allEventsBreakdown : [];
    return (
      <section className="ssCard ssCard--view">
        <div className="statsSummaryEmpty">
          {rows.length ? `All events overview: ${rows.length} events cached.` : "No solves available"}
        </div>
      </section>
    );
  }

  if (!view) {
    return (
      <section className={`ssCard ${viewMode === "time" ? "ssCard--time" : "ssCard--view"}`}>
        <div className="statsSummaryEmpty">
          {viewMode === "time" ? "No solves available for the selected day" : "No solves available"}
        </div>
      </section>
    );
  }

  return (
    <section className={`ssCard ${viewMode === "time" ? "ssCard--time" : "ssCard--view"}`}>
      {viewMode === "time" ? (
        timeView ? (
          <>
            <div className="ssTimeLead">
              <div className="ssViewCountValue">{formatCount(timeView.solveCount)}</div>
              <div className="ssViewCountLabel">solves in range</div>
              <div className="ssViewMeta">{timeView.dateLabel}</div>
              <div className="ssViewMeta">
                {timeView.firstSolve} - {timeView.lastSolve}
              </div>
            </div>

            <div className="ssTimeBody">
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
                <MetaStat label="SD" value={formatStatTime(timeView.stdDev)} tone="accent" stacked />
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
            <div className="ssViewMeta">{view?.dateRange || "—"}</div>
            <div className="ssViewMeta">{view?.indexRange || "—"}</div>
          </div>

          <div className="ssViewBody">
            <div className="ssMetricGrid">
              <div className="ssMetricColumn">
                <div className="ssViewLegend">
                  <span className="ssMetricValue--best">Best</span>
                  <span className="ssMetricDot">·</span>
                  <span className="ssMetricValue--worst">Worst</span>
                  {showCurrentMetrics && (
                    <>
                      <span className="ssMetricDot">·</span>
                      <span className="ssMetricValue--current">Current</span>
                    </>
                  )}
                </div>
                <MetricRow
                  label="AO5"
                  metricKey="ao5"
                  scope="current"
                  current={view?.metrics?.ao5?.current}
                  best={view?.metrics?.ao5?.best}
                  worst={view?.metrics?.ao5?.worst}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
                <MetricRow
                  label="AO12"
                  metricKey="ao12"
                  scope="current"
                  current={view?.metrics?.ao12?.current}
                  best={view?.metrics?.ao12?.best}
                  worst={view?.metrics?.ao12?.worst}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
                <MetricRow
                  label="MO3"
                  metricKey="mo3"
                  scope="current"
                  current={view?.metrics?.mo3?.current}
                  best={view?.metrics?.mo3?.best}
                  worst={view?.metrics?.mo3?.worst}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
              </div>

              <div className="ssMetricColumn">
                <MetricRow
                  label="AO25"
                  metricKey="ao25"
                  scope="current"
                  current={view?.metrics?.ao25?.current}
                  best={view?.metrics?.ao25?.best}
                  worst={view?.metrics?.ao25?.worst}
                  showWorst={false}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
                <MetricRow
                  label="AO50"
                  metricKey="ao50"
                  scope="current"
                  current={view?.metrics?.ao50?.current}
                  best={view?.metrics?.ao50?.best}
                  worst={view?.metrics?.ao50?.worst}
                  showWorst={false}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
                <MetricRow
                  label="AO100"
                  metricKey="ao100"
                  scope="current"
                  current={view?.metrics?.ao100?.current}
                  best={view?.metrics?.ao100?.best}
                  worst={view?.metrics?.ao100?.worst}
                  showWorst={false}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
                <MetricRow
                  label="AO1000"
                  metricKey="ao1000"
                  scope="current"
                  current={view?.metrics?.ao1000?.current}
                  best={view?.metrics?.ao1000?.best}
                  worst={view?.metrics?.ao1000?.worst}
                  showWorst={false}
                  showCurrent={showCurrentMetrics}
                  onStatSelect={onStatSelect}
                />
              </div>
            </div>
          </div>

          <div className="ssViewSide">
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

            <div className="ssTopMetaRow">
              <MetaStat label="Mean" value={formatStatTime(view?.mean)} tone="accent" stacked />
              <MetaStat label="Median" value={formatStatTime(view?.median)} tone="accent" stacked />
              <MetaStat label="SD" value={formatStatTime(view?.stdDev)} tone="accent" stacked />
            </div>

            <div className="ssMetaGrid">
              <div className="ssMetaColumn">
                <MetaStat label="+2 Count" value={formatCount(view?.plus2Count)} tone="lime" />
                <MetaStat
                  label="+2 Best"
                  value={formatStatTime(view?.plus2Best, { average: false })}
                  tone="teal"
                />
              </div>
              <div className="ssMetaColumn">
                <MetaStat label="Sum" value={formatDurationMs(view?.sum)} tone="blue" />
                <MetaStat label="DNF Count" value={formatCount(view?.dnfCount)} tone="danger" />
              </div>
            </div>
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
  loadedSolveCount = null,
  onStatSelect,
  compareSummary = null,
  profileColor = "#50B6FF",
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
      <section className="ssCard ssCard--overall" style={overallCardStyle}>
        <div className="statsSummaryEmpty">No solves available</div>
      </section>
    );
  }

  return (
    <section className="ssCard ssCard--overall" style={overallCardStyle}>
      <div className="ssOverallHeader">
        <div className="ssOverallTitle">{overallTitle}</div>
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
        <div className="ssOverallMetricGrid">
          <OverallMetricRow
            label="Single"
            metricKey="single"
            best={overall.single}
            worst={overall.singleWorst}
            average={false}
            onStatSelect={onStatSelect}
          />
          <OverallMetricRow label="AO25" metricKey="ao25" best={overall.ao25} onStatSelect={onStatSelect} />
          <OverallMetricRow label="AO5" metricKey="ao5" best={overall.ao5} worst={overall.ao5Worst} onStatSelect={onStatSelect} />
          <OverallMetricRow label="AO50" metricKey="ao50" best={overall.ao50} onStatSelect={onStatSelect} />
          <OverallMetricRow label="AO12" metricKey="ao12" best={overall.ao12} worst={overall.ao12Worst} onStatSelect={onStatSelect} />
          <OverallMetricRow label="AO100" metricKey="ao100" best={overall.ao100} onStatSelect={onStatSelect} />
          <OverallMetricRow label="MO3" metricKey="mo3" best={overall.mo3} worst={overall.mo3Worst} onStatSelect={onStatSelect} />
          <OverallMetricRow label="AO1000" metricKey="ao1000" best={overall.ao1000} onStatSelect={onStatSelect} />
        </div>

        <div className="ssOverallMeta">
          <div className="ssOverallMetaRow ssOverallMetaRow--pair">
            <MetaStat label="Mean" value={formatStatTime(overall.mean)} tone="accent" />
            <MetaStat label="SD" value={formatStatTime(overall.stdDev)} tone="accent" />
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
