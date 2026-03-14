import React, { useMemo, useState } from "react";
import Detail from "../Detail/Detail";
import { formatTime } from "../TimeList/TimeUtils";
import "./Stats.css";

const CHART_WIDTH = 960;
const CHART_HEIGHT = 320;
const CHART_PADDING_X = 42;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 42;
const SEGMENT_WIDTH = 10;
const SEGMENT_HEIGHT = 14;
const SEGMENT_GAP = 4;

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

function buildTimeline(daySolves, segmentSort, colorMode) {
  const sorted = sortDaySolves(daySolves, segmentSort);
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const chartBottom = CHART_HEIGHT - CHART_PADDING_BOTTOM;
  const columnWidth = chartInnerWidth / 24;

  const speedResolver = buildSpeedColorResolver(sorted);
  const discrete =
    colorMode === "speed"
      ? { resolve: speedResolver, legend: [] }
      : buildDiscreteColorResolver(
          sorted,
          colorMode === "event"
            ? "Event"
            : colorMode === "cube-model"
            ? "CubeModel"
            : colorMode === "cross-color"
            ? "CrossColor"
            : "TimerInput"
        );

  const resolveColor = colorMode === "speed" ? speedResolver : discrete.resolve;
  const hourCounts = new Map();

  const segments = sorted.map((solve, index) => {
    const date = parseSolveDate(solve);
    if (!date) return null;
    const hour = date.getHours();
    const minuteRatio = (date.getMinutes() * 60 + date.getSeconds()) / 3600;
    const stackIndex = hourCounts.get(hour) || 0;
    hourCounts.set(hour, stackIndex + 1);

    const x = CHART_PADDING_X + columnWidth * (hour + minuteRatio);
    const y = chartBottom - SEGMENT_HEIGHT - stackIndex * (SEGMENT_HEIGHT + SEGMENT_GAP);

    return {
      id: solve?.solveRef || solve?.datetime || `solve-${index}`,
      solve,
      hour,
      x,
      y,
      color: resolveColor(solve),
      label: `${formatClockTime(solve)} · ${formatTime(getSolveBaseMs(solve))}`,
      eventLabel: getSolveTagValue(solve, "Event") || "Event",
      cubeModel: getSolveTagValue(solve, "CubeModel") || "Unknown",
      crossColor: getSolveTagValue(solve, "CrossColor") || "Unknown",
      timerInput: getSolveTagValue(solve, "TimerInput") || "Unknown",
    };
  }).filter(Boolean);

  const activeHours = new Set(segments.map((segment) => segment.hour));
  const maxStack = Array.from(hourCounts.values()).reduce((max, count) => Math.max(max, count), 0);

  return {
    segments,
    activeHours: activeHours.size,
    totalSolves: sorted.length,
    maxStack,
    legend: discrete.legend || [],
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
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [segmentSort, setSegmentSort] = useState("chronological");
  const [colorMode, setColorMode] = useState("speed");

  const timeline = useMemo(
    () => buildTimeline(Array.isArray(solves) ? solves : [], segmentSort, colorMode),
    [solves, segmentSort, colorMode]
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
    const chartInnerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
    const columnWidth = chartInnerWidth / 24;

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      x: CHART_PADDING_X + columnWidth * hour,
      label: formatHourLabel(hour),
    }));
  }, []);

  const legendItems = timeline.legend.slice(0, 8);

  return (
    <div className="timePeriodChart">
      <div className="lineChartControls">
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
          <option value="cross-color">Colors: Cross Color</option>
          <option value="timer-input">Colors: Timer Input</option>
        </select>

        <div className="chartControlGroup">
          <span className="chartControlLabel">Range</span>
          <span className="chartControlValue">{rangeLabel}</span>
        </div>

        <div className="chartControlGroup">
          <span className="chartControlLabel">Solves</span>
          <span className="chartControlValue">{timeline.totalSolves}</span>
        </div>

        <div className="chartControlGroup">
          <span className="chartControlLabel">Active Hours</span>
          <span className="chartControlValue">{timeline.activeHours}</span>
        </div>
      </div>

      <div className="timeLineChartCanvas">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="timeLineChartSvg"
          role="img"
          aria-label="Time period solve chart by hour"
        >
          {hourGuides.map((guide) => (
            <line
              key={`guide-${guide.hour}`}
              x1={guide.x}
              y1={CHART_PADDING_TOP}
              x2={guide.x}
              y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
              className="timeLineGuide"
            />
          ))}

          <line
            x1={CHART_PADDING_X}
            y1={CHART_HEIGHT - CHART_PADDING_BOTTOM}
            x2={CHART_WIDTH - CHART_PADDING_X}
            y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
            className="timeLineAxis"
          />

          {hourGuides.map((guide) => (
            <text
              key={`label-${guide.hour}`}
              x={guide.x + (CHART_WIDTH - CHART_PADDING_X * 2) / 48}
              y={CHART_HEIGHT - 12}
              textAnchor="middle"
              className="timeLineAxisLabel"
            >
              {guide.label}
            </text>
          ))}

          {timeline.segments.map((segment) => (
            <g key={segment.id}>
              <rect
                x={segment.x - SEGMENT_WIDTH / 2}
                y={segment.y}
                width={SEGMENT_WIDTH}
                height={SEGMENT_HEIGHT}
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

          {!timeline.segments.length && (
            <text
              x={CHART_WIDTH / 2}
              y={CHART_HEIGHT / 2}
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
