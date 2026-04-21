import React, { useEffect, useMemo, useRef, useState } from "react";
import Detail from "../Detail/Detail";
import { formatTime } from "../TimeList/TimeUtils";
import "./Stats.css";

const CHART_WIDTH = 960;
const CHART_HEIGHT = 344;
const CHART_PADDING_X = 10;
const CHART_PADDING_TOP = 24;
const CHART_PADDING_BOTTOM = 42;
const SEGMENT_WIDTH = 8;
const SEGMENT_HEIGHT = 12;
const SEGMENT_GAP = 3;
const BAR_WIDTH_RATIO = 0.68;

const COLOR_PALETTE = [
  "#38d6c9",
  "#5ab2ff",
  "#f2ef62",
  "#ff8c5a",
  "#c084fc",
  "#fb7185",
  "#4ade80",
  "#f59e0b",
  "#22d3ee",
  "#a3e635",
];

function parseSolveDate(solve) {
  const raw = solve?.datetime ?? solve?.DateTime ?? solve?.dateTime;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatHourLabel(hour) {
  if (!Number.isFinite(hour)) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  const base = hour % 12 || 12;
  return `${base}${suffix}`;
}

function getSolveHourValue(solve) {
  const date = parseSolveDate(solve);
  if (!date) return null;
  return date.getHours() + (date.getMinutes() * 60 + date.getSeconds()) / 3600;
}

function getSolveBaseMs(solve) {
  if (!solve) return null;

  if (String(solve.penalty ?? solve.Penalty ?? "").toUpperCase() === "DNF") {
    const original = Number(
      solve.originalTime ?? solve.rawTime ?? solve.rawTimeMs ?? solve.time ?? solve.finalTimeMs
    );
    return Number.isFinite(original) ? original : null;
  }

  const time = Number(
    solve.time ?? solve.finalTimeMs ?? solve.rawTime ?? solve.rawTimeMs ?? solve.originalTime
  );
  return Number.isFinite(time) ? time : null;
}

function getSolveTagValue(solve, key) {
  const tags = solve?.tags || solve?.Tags || {};
  if (key === "CubeModel") return String(tags?.CubeModel || "").trim();
  if (key === "CrossColor") return String(tags?.CrossColor || "").trim();
  if (key === "TimerInput") return String(tags?.TimerInput || tags?.InputType || "").trim();
  if (key === "SolveSource") return String(tags?.SolveSource || "").trim();
  if (key === "Event") return String(solve?.event || solve?.Event || "").trim();
  return "";
}

function formatClockTime(solve) {
  const date = parseSolveDate(solve);
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortDaySolves(solves, mode) {
  const items = [...solves];

  items.sort((a, b) => {
    const aTime = Number(getSolveBaseMs(a));
    const bTime = Number(getSolveBaseMs(b));
    const aDate = parseSolveDate(a)?.getTime() ?? 0;
    const bDate = parseSolveDate(b)?.getTime() ?? 0;

    if (mode === "fastest") {
      if (aTime !== bTime) return aTime - bTime;
      return aDate - bDate;
    }

    if (mode === "slowest") {
      if (aTime !== bTime) return bTime - aTime;
      return aDate - bDate;
    }

    return aDate - bDate;
  });

  return items;
}

function buildSpeedColorResolver(daySolves) {
  const numericTimes = daySolves
    .map((solve) => getSolveBaseMs(solve))
    .filter((value) => Number.isFinite(value));

  const minTime = numericTimes.length ? Math.min(...numericTimes) : 0;
  const maxTime = numericTimes.length ? Math.max(...numericTimes) : 1;
  const denom = maxTime - minTime || 1;

  return (solve) => {
    const timeMs = getSolveBaseMs(solve);
    if (!Number.isFinite(timeMs)) return "rgba(255,255,255,0.32)";
    const ratio = (timeMs - minTime) / denom;
    if (timeMs <= (minTime + maxTime) / 2) return `rgb(${255 * ratio}, 255, 0)`;
    return `rgb(255, ${255 * (1 - ratio)}, 0)`;
  };
}

function buildDiscreteColorResolver(daySolves, key) {
  const valueOrder = [];
  const seen = new Set();

  for (const solve of daySolves) {
    const value = getSolveTagValue(solve, key) || "Unknown";
    if (seen.has(value)) continue;
    seen.add(value);
    valueOrder.push(value);
  }

  const colorMap = new Map(
    valueOrder.map((value, index) => [value, COLOR_PALETTE[index % COLOR_PALETTE.length]])
  );

  return {
    resolve: (solve) => colorMap.get(getSolveTagValue(solve, key) || "Unknown") || COLOR_PALETTE[0],
    legend: valueOrder.map((value) => ({
      value,
      color: colorMap.get(value),
    })),
  };
}

function buildSpeedBandResolver(daySolves) {
  const numericTimes = daySolves
    .map((solve) => getSolveBaseMs(solve))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!numericTimes.length) {
    return {
      resolve: () => ({ value: "Unknown", color: "rgba(255,255,255,0.32)" }),
      legend: [{ value: "Unknown", color: "rgba(255,255,255,0.32)" }],
    };
  }

  const lowerIndex = Math.floor((numericTimes.length - 1) / 3);
  const upperIndex = Math.floor(((numericTimes.length - 1) * 2) / 3);
  const fastMax = numericTimes[lowerIndex];
  const midMax = numericTimes[upperIndex];
  const legend = [
    { value: "Fast", color: "#38d6c9" },
    { value: "Mid", color: "#f2ef62" },
    { value: "Slow", color: "#ff8c5a" },
  ];

  return {
    resolve: (solve) => {
      const timeMs = getSolveBaseMs(solve);
      if (!Number.isFinite(timeMs)) return { value: "Unknown", color: "rgba(255,255,255,0.32)" };
      if (timeMs <= fastMax) return legend[0];
      if (timeMs <= midMax) return legend[1];
      return legend[2];
    },
    legend,
  };
}

function buildColorGrouping(daySolves, colorMode, chartMode) {
  if (colorMode === "speed") {
    if (chartMode === "hour-bars") return buildSpeedBandResolver(daySolves);
    return {
      resolve: buildSpeedColorResolver(daySolves),
      legend: [],
    };
  }

  const discrete = buildDiscreteColorResolver(
    daySolves,
    colorMode === "event"
      ? "Event"
      : colorMode === "cube-model"
      ? "CubeModel"
      : colorMode === "cross-color"
      ? "CrossColor"
      : "TimerInput"
  );

  if (chartMode === "hour-bars") {
    return {
      resolve: (solve) => {
        const value =
          getSolveTagValue(
            solve,
            colorMode === "event"
              ? "Event"
              : colorMode === "cube-model"
              ? "CubeModel"
              : colorMode === "cross-color"
              ? "CrossColor"
              : "TimerInput"
          ) || "Unknown";
        return {
          value,
          color: discrete.resolve(solve),
        };
      },
      legend: discrete.legend || [],
    };
  }

  return discrete;
}

function buildTimeline(daySolves, segmentSort, colorMode, chartMode = "segments", chartWidth = CHART_WIDTH, chartHeight = CHART_HEIGHT) {
  const sorted = sortDaySolves(daySolves, segmentSort);
  const chartInnerWidth = chartWidth - CHART_PADDING_X * 2;
  const chartBottom = chartHeight - CHART_PADDING_BOTTOM;
  const chartInnerHeight = chartBottom - CHART_PADDING_TOP;
  const columnWidth = chartInnerWidth / 24;

  const grouping = buildColorGrouping(sorted, colorMode, chartMode);
  const resolveColor = (solve) => {
    const resolved = grouping.resolve(solve);
    return typeof resolved === "string" ? resolved : resolved?.color || COLOR_PALETTE[0];
  };
  const hourCounts = new Map();

  for (const solve of sorted) {
    const date = parseSolveDate(solve);
    if (!date) continue;
    const hour = date.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  const maxStack = Array.from(hourCounts.values()).reduce((max, count) => Math.max(max, count), 0);
  const laneHeight = maxStack > 0 ? Math.min(SEGMENT_HEIGHT + SEGMENT_GAP, chartInnerHeight / maxStack) : SEGMENT_HEIGHT + SEGMENT_GAP;
  const segmentHeight = Math.max(5, Math.min(SEGMENT_HEIGHT, laneHeight - 1));
  const segmentWidth = maxStack > 28 ? 6 : SEGMENT_WIDTH;
  const stackCursor = new Map();

  const segments = sorted.map((solve, index) => {
    const date = parseSolveDate(solve);
    if (!date) return null;
    const hour = date.getHours();
    const minuteRatio = (date.getMinutes() * 60 + date.getSeconds()) / 3600;
    const stackIndex = stackCursor.get(hour) || 0;
    stackCursor.set(hour, stackIndex + 1);

    const x = CHART_PADDING_X + columnWidth * (hour + minuteRatio);
    const y = chartBottom - segmentHeight - stackIndex * laneHeight;

    return {
      id: solve?.solveRef || solve?.datetime || `solve-${index}`,
      solve,
      hour,
      hourValue: hour + minuteRatio,
      x,
      y,
      width: segmentWidth,
      height: segmentHeight,
      color: resolveColor(solve),
      label: `${formatClockTime(solve)} · ${formatTime(getSolveBaseMs(solve))}`,
      eventLabel: getSolveTagValue(solve, "Event") || "Event",
      cubeModel: getSolveTagValue(solve, "CubeModel") || "Unknown",
      crossColor: getSolveTagValue(solve, "CrossColor") || "Unknown",
      timerInput: getSolveTagValue(solve, "TimerInput") || "Unknown",
    };
  }).filter(Boolean);

  const activeHours = new Set(segments.map((segment) => segment.hour));

  return {
    segments,
    activeHours: activeHours.size,
    totalSolves: sorted.length,
    maxStack,
    segmentWidth,
    segmentHeight,
    legend: grouping.legend || [],
  };
}

function buildHourlyBars(daySolves, colorMode) {
  const sorted = sortDaySolves(daySolves, "chronological");
  const grouping = buildColorGrouping(sorted, colorMode, "hour-bars");
  const buckets = new Map();

  for (const solve of sorted) {
    const date = parseSolveDate(solve);
    if (!date) continue;
    const hour = date.getHours();
    const bucket = buckets.get(hour) || { hour, total: 0, entries: new Map() };
    const resolved = grouping.resolve(solve);
    const value = typeof resolved === "string" ? "Unknown" : resolved?.value || "Unknown";
    const color = typeof resolved === "string" ? resolved : resolved?.color || COLOR_PALETTE[0];
    const existing = bucket.entries.get(value) || { value, color, count: 0 };
    existing.count += 1;
    bucket.entries.set(value, existing);
    bucket.total += 1;
    buckets.set(hour, bucket);
  }

  const hourBars = Array.from(buckets.values())
    .sort((a, b) => a.hour - b.hour)
    .map((bucket) => ({
      hour: bucket.hour,
      total: bucket.total,
      segments: Array.from(bucket.entries.values()).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    }));

  const maxTotal = hourBars.reduce((max, item) => Math.max(max, item.total), 0);

  return {
    hourBars,
    maxTotal,
    legend: grouping.legend || [],
  };
}

function buildHourDomain(daySolves, scaleToActiveHours) {
  if (!scaleToActiveHours) {
    return {
      startHour: 0,
      endHour: 24,
    };
  }

  const hourValues = daySolves
    .map((solve) => getSolveHourValue(solve))
    .filter((value) => Number.isFinite(value));

  if (!hourValues.length) {
    return {
      startHour: 0,
      endHour: 24,
    };
  }

  const minHour = Math.min(...hourValues);
  const maxHour = Math.max(...hourValues);
  const startHour = Math.max(0, Math.floor(minHour));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.floor(maxHour) + 1));

  return {
    startHour,
    endHour,
  };
}

function TimePeriodChart({
  user,
  solves,
  deleteTime,
  addPost,
  applyPenalty,
  setSessions,
}) {
  const canvasRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(CHART_WIDTH);
  const chartHeight = CHART_HEIGHT;
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [segmentSort, setSegmentSort] = useState("chronological");
  const [colorMode, setColorMode] = useState("speed");
  const [scaleToActiveHours, setScaleToActiveHours] = useState(true);
  const [chartMode, setChartMode] = useState("segments");

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.max(1, Math.round(node.clientWidth || CHART_WIDTH));
      setChartWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const timeline = useMemo(
    () => buildTimeline(Array.isArray(solves) ? solves : [], segmentSort, colorMode, chartMode, chartWidth, chartHeight),
    [solves, segmentSort, colorMode, chartMode, chartWidth, chartHeight]
  );
  const hourlyBars = useMemo(
    () => buildHourlyBars(Array.isArray(solves) ? solves : [], colorMode),
    [solves, colorMode]
  );

  const hourDomain = useMemo(
    () => buildHourDomain(Array.isArray(solves) ? solves : [], scaleToActiveHours),
    [solves, scaleToActiveHours]
  );

  const rangeLabel = useMemo(() => {
    const items = (Array.isArray(solves) ? solves : [])
      .map((solve) => parseSolveDate(solve))
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (!items.length) return "No range selected";

    const fmt = (date) =>
      date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    return `${fmt(items[0])} - ${fmt(items[items.length - 1])}`;
  }, [solves]);

  const hourGuides = useMemo(() => {
    const chartInnerWidth = chartWidth - CHART_PADDING_X * 2;
    const visibleHours = Math.max(1, hourDomain.endHour - hourDomain.startHour);
    const columnWidth = chartInnerWidth / visibleHours;

    return Array.from({ length: visibleHours }, (_, index) => {
      const hour = hourDomain.startHour + index;
      return {
        hour,
        x: CHART_PADDING_X + columnWidth * index,
        label: formatHourLabel(hour),
      };
    });
  }, [chartWidth, hourDomain.endHour, hourDomain.startHour]);

  const legendItems = (chartMode === "hour-bars" ? hourlyBars.legend : timeline.legend).slice(0, 8);
  const chartInnerWidth = chartWidth - CHART_PADDING_X * 2;
  const visibleHours = Math.max(1, hourDomain.endHour - hourDomain.startHour);
  const columnWidth = chartInnerWidth / visibleHours;
  const visibleHourBars = hourlyBars.hourBars
    .filter((item) => item.hour >= hourDomain.startHour && item.hour < hourDomain.endHour)
    .map((item) => {
      const barHeight =
        hourlyBars.maxTotal > 0 ? (item.total / hourlyBars.maxTotal) * (chartHeight - CHART_PADDING_BOTTOM - CHART_PADDING_TOP) : 0;
      const x = CHART_PADDING_X + (item.hour - hourDomain.startHour) * columnWidth + columnWidth * (1 - BAR_WIDTH_RATIO) / 2;
      const width = Math.max(8, columnWidth * BAR_WIDTH_RATIO);
      let yCursor = chartHeight - CHART_PADDING_BOTTOM;
      const segments = item.segments.map((segment) => {
        const height = item.total > 0 ? (segment.count / item.total) * barHeight : 0;
        yCursor -= height;
        return {
          ...segment,
          x,
          y: yCursor,
          width,
          height,
        };
      });

      return {
        ...item,
        x,
        width,
        barHeight,
        segments,
      };
    });
  const peakHourCount = chartMode === "hour-bars" ? hourlyBars.maxTotal : timeline.maxStack;

  return (
    <div className="timePeriodChart">
      <div className="lineChartControls lineChartControls--time lineChartControls--timePeriod">
        <button
          type="button"
          className={`statsToggleBtn ${chartMode === "segments" ? "is-active" : ""}`}
          onClick={() => setChartMode((value) => (value === "segments" ? "hour-bars" : "segments"))}
          title={chartMode === "segments" ? "Click to show stacked hour bars" : "Click to show individual solve segments"}
        >
          View: {chartMode === "segments" ? "Segments" : "Hour Bars"}
        </button>

        <select
          className="statsSelect statsSelect--chart"
          value={segmentSort}
          onChange={(e) => setSegmentSort(e.target.value)}
        >
          <option value="chronological">Segment Order: Time</option>
          <option value="fastest">Segment Order: Fastest</option>
          <option value="slowest">Segment Order: Slowest</option>
        </select>

        <select
          className="statsSelect statsSelect--chart"
          value={colorMode}
          onChange={(e) => setColorMode(e.target.value)}
        >
          <option value="speed">Colors: Speed</option>
          <option value="event">Colors: Event</option>
          <option value="cube-model">Colors: Cube Model</option>
          <option value="cross-color">Colors: Start Color</option>
          <option value="timer-input">Colors: Timer Input</option>
        </select>

        <button
          type="button"
          className={`statsToggleBtn ${scaleToActiveHours ? "is-active" : ""}`}
          onClick={() => setScaleToActiveHours((value) => !value)}
          title={scaleToActiveHours ? "Click to show all 24 hours" : "Click to scale to active hours"}
        >
          Scale: {scaleToActiveHours ? "Active Hours" : "All Hours"}
        </button>

        <div className="chartControlGroup chartControlGroup--timePeriod chartControlGroup--timePeriodRange">
          <span className="chartControlValue chartControlValue--timePeriodRange">{rangeLabel}</span>
        </div>

        <div className="chartControlGroup chartControlGroup--timePeriod">
          <span className="chartControlLabel chartControlLabel--timePeriod">Solves</span>
          <span className="chartControlValue chartControlValue--timePeriod">{timeline.totalSolves}</span>
        </div>

        <div className="chartControlGroup chartControlGroup--timePeriod">
          <span className="chartControlLabel chartControlLabel--timePeriod">Hours</span>
          <span className="chartControlValue chartControlValue--timePeriod">{timeline.activeHours}</span>
        </div>

        <div className="chartControlGroup chartControlGroup--timePeriod">
          <span className="chartControlLabel chartControlLabel--timePeriod">{chartMode === "hour-bars" ? "Peak" : "Stack"}</span>
          <span className="chartControlValue chartControlValue--timePeriod">{peakHourCount}</span>
        </div>
      </div>

      <div ref={canvasRef} className="timeLineChartCanvas">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="timeLineChartSvg"
          role="img"
          aria-label="Time period solve chart by hour"
        >
          {hourGuides.map((guide) => (
            <g key={`guide-${guide.hour}`}>
              <rect
                x={guide.x}
                y={CHART_PADDING_TOP}
                width={columnWidth}
                height={chartHeight - CHART_PADDING_BOTTOM - CHART_PADDING_TOP}
                className={guide.hour % 2 === 0 ? "timeLineHourBand" : "timeLineHourBand timeLineHourBand--alt"}
              />
              <line
                x1={guide.x}
                y1={CHART_PADDING_TOP}
                x2={guide.x}
                y2={chartHeight - CHART_PADDING_BOTTOM}
                className="timeLineGuide"
              />
            </g>
          ))}

          <line
            x1={CHART_PADDING_X}
            y1={chartHeight - CHART_PADDING_BOTTOM}
            x2={chartWidth - CHART_PADDING_X}
            y2={chartHeight - CHART_PADDING_BOTTOM}
            className="timeLineAxis"
          />

          {hourGuides.map((guide) => (
            <text
              key={`label-${guide.hour}`}
              x={guide.x + columnWidth / 2}
              y={chartHeight - 12}
              textAnchor="middle"
              className="timeLineAxisLabel"
            >
              {guide.label}
            </text>
          ))}

          {chartMode === "segments" &&
            timeline.segments.map((segment) => (
              <g key={segment.id}>
                <rect
                  x={
                    CHART_PADDING_X +
                    (segment.hourValue - hourDomain.startHour) *
                      columnWidth -
                    segment.width / 2
                  }
                  y={segment.y}
                  width={segment.width}
                  height={segment.height}
                  rx={4}
                  ry={4}
                  fill={segment.color}
                  className="timeLineSegment"
                  onClick={() => setSelectedSolve(segment.solve)}
                >
                  <title>
                    {segment.label} | {segment.eventLabel} | {segment.cubeModel} | {segment.crossColor} | {segment.timerInput}
                  </title>
                </rect>
              </g>
            ))}

          {chartMode === "hour-bars" &&
            visibleHourBars.map((bar) => (
              <g key={`bar-${bar.hour}`}>
                {bar.segments.map((segment) => (
                  <rect
                    key={`${bar.hour}-${segment.value}`}
                    x={segment.x}
                    y={segment.y}
                    width={segment.width}
                    height={Math.max(2, segment.height)}
                    rx={4}
                    ry={4}
                    fill={segment.color}
                    className="timeLineSegment"
                  >
                    <title>
                      {formatHourLabel(bar.hour)} | {segment.value} | {segment.count} solve{segment.count === 1 ? "" : "s"}
                    </title>
                  </rect>
                ))}
              </g>
            ))}

          {!timeline.segments.length && (
            <text
              x={chartWidth / 2}
              y={chartHeight / 2}
              textAnchor="middle"
              className="timeLineEmptyText"
            >
              No solves available for the selected day
            </text>
          )}
        </svg>
      </div>

      {legendItems.length > 0 && (
        <div className="timeLineLegend">
          {legendItems.map((item) => (
            <div key={item.value} className="timeLineLegendItem">
              <span className="timeLineLegendSwatch" style={{ background: item.color }} />
              <span className="timeLineLegendLabel">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {selectedSolve && (
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
    </div>
  );
}

export default React.memo(TimePeriodChart);
