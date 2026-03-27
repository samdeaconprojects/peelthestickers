import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary, { StatsSummaryCurrent, StatsSummaryOverall } from "./StatsSummary";
import BarChart from "./BarChart";
import PieChart from "./PieChart";
import StatFocusModal from "./StatFocusModal";
import Detail from "../Detail/Detail";
import AverageDetailModal from "../Detail/AverageDetailModal";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import TagBar from "../TagBar/TagBar";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import NameTag from "../Profile/NameTag";
import PtsLinkStatsIcon from "../../assets/ptsLinkStats.svg";

import { getSolvesBySession, getSolvesBySessionPage } from "../../services/getSolvesBySession";
import { getSolvesByTag } from "../../services/getSolvesByTag";
import { getSessionStats } from "../../services/getSessionStats";
import { getEventStats } from "../../services/getEventStats";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";
import { recomputeEventStats } from "../../services/recomputeEventStats";
import { updateUser } from "../../services/updateUser";
import { getSolveWindowFromStart } from "../../services/getSolveWindow";

import ImportSolvesModal from "./ImportSolvesModal";
import { importSolvesBatch } from "../../services/importSolvesBatch";
import { createSession } from "../../services/createSession";
import { useDbStatus } from "../../contexts/DbStatusContext";
import { findBestStrictWindow } from "../../utils/strictAverageUtils";
import { getProfileChartStyle } from "../../utils/profileChartStyle";
import {
  collectTagSelectionOptions,
  DEFAULT_TAG_CONFIG,
  getTagColorMapForEvent,
  getTagCatalogOptionsForEvent,
  hasActiveTagSelection,
  makeEmptyTagSelection,
  normalizeTagConfig,
  sanitizeTagSelection,
  solveMatchesTagSelection,
  summarizeTagSelection,
} from "../TagBar/tagUtils";

/* -------------------------------------------------------------------------- */
/*                              TAG/TIME HELPERS                              */
/* -------------------------------------------------------------------------- */

const ALL_EVENTS = "__all_events__";
const ALL_SESSIONS = "__all_sessions__";
const DEFAULT_HEATMAP_PALETTE = "default";
const PROFILE_PALETTE = "profile";
const COMPARE_PALETTES = {
  "solid-teal": {
    label: "Pastel Teal",
    mode: "solid",
    primary: "#2EC4B6",
    accent: "#bff7f0",
  },
  "solid-indigo": {
    label: "Pastel Indigo",
    mode: "solid",
    primary: "#7c8cff",
    accent: "#dbe3ff",
  },
  "solid-coral": {
    label: "Pastel Coral",
    mode: "solid",
    primary: "#ff8c69",
    accent: "#ffd6ca",
  },
  "heat-rise": {
    label: "Heat Rise",
    mode: "gradient",
    stops: ["#36d9b8", "#f6e96b", "#ff6f61"],
    primary: "#f6e96b",
    accent: "#fff4bf",
  },
  "aurora": {
    label: "Aurora",
    mode: "gradient",
    stops: ["#77a8ff", "#f3f6ff", "#8a63ff"],
    primary: "#9d8cff",
    accent: "#ede9ff",
  },
};

const DEFAULT_PRIMARY_PALETTE = DEFAULT_HEATMAP_PALETTE;
const DEFAULT_COMPARE_PALETTE = DEFAULT_HEATMAP_PALETTE;
const SOLVE_WINDOW_PRESETS = [5, 12, 25, 50, 100];
const WINDOW_SPECS = {
  mo3: { size: 3, kind: "mo3", label: "MO3", startField: "BestMo3StartSolveSK" },
  ao5: { size: 5, kind: "ao", label: "AO5", startField: "BestAo5StartSolveSK" },
  ao12: { size: 12, kind: "ao", label: "AO12", startField: "BestAo12StartSolveSK" },
  ao25: { size: 25, kind: "ao", label: "AO25", startField: "BestAo25StartSolveSK" },
  ao50: { size: 50, kind: "ao", label: "AO50", startField: "BestAo50StartSolveSK" },
  ao100: { size: 100, kind: "ao", label: "AO100", startField: "BestAo100StartSolveSK" },
  ao1000: { size: 1000, kind: "ao", label: "AO1000", startField: "BestAo1000StartSolveSK" },
};

function isFiniteDate(d) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return String(a) > String(b) ? a : b;
}

function formatShareTime(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getNextSmallerSolveWindow(value) {
  const current = Math.max(1, Number(value) || 0);
  if (current > 100) return Math.max(100, current - 50);
  return [...SOLVE_WINDOW_PRESETS].reverse().find((preset) => preset < current) ?? current;
}

function getNextLargerSolveWindow(value) {
  const current = Math.max(1, Number(value) || 0);
  const largerPreset = SOLVE_WINDOW_PRESETS.find((preset) => preset > current);
  if (largerPreset != null) return largerPreset;
  return current + 50;
}

function getPaletteOptions() {
  return [
    { value: PROFILE_PALETTE, label: "Profile" },
    { value: DEFAULT_HEATMAP_PALETTE, label: "Default" },
    ...Object.entries(COMPARE_PALETTES).map(([value, meta]) => ({
      value,
      label: meta.label,
    })),
  ];
}

function mergeTagOptionMaps(...maps) {
  const mergedFields = new Set();
  maps.forEach((map) => {
    Object.keys(map || {}).forEach((field) => mergedFields.add(field));
  });

  return Object.fromEntries(
    Array.from(mergedFields).map((field) => [
      field,
      Array.from(
        new Set(
          maps.flatMap((map) => (Array.isArray(map?.[field]) ? map[field] : []))
        )
      ).sort((a, b) => a.localeCompare(b)),
    ])
  );
}

function getTagCatalogOptionsForStatsEvent(tagCatalog, eventKey) {
  if (eventKey !== ALL_EVENTS) {
    return getTagCatalogOptionsForEvent(tagCatalog, eventKey);
  }

  const byEvent = tagCatalog?.ByEvent && typeof tagCatalog.ByEvent === "object"
    ? tagCatalog.ByEvent
    : {};

  return mergeTagOptionMaps(
    getTagCatalogOptionsForEvent(tagCatalog, ""),
    ...Object.keys(byEvent).map((key) => getTagCatalogOptionsForEvent(tagCatalog, key))
  );
}

function getSeriesStyle(paletteKey, fallbackKey = DEFAULT_PRIMARY_PALETTE, profileStyle = null) {
  const resolvedKey = paletteKey || fallbackKey || DEFAULT_PRIMARY_PALETTE;
  if (resolvedKey === PROFILE_PALETTE) return profileStyle;
  if (resolvedKey === DEFAULT_HEATMAP_PALETTE) return null;
  return COMPARE_PALETTES[resolvedKey] || null;
}

function interpolateHexColor(a, b, ratio) {
  const safeRatio = clampNumber(Number(ratio) || 0, 0, 1);
  const normalize = (hex) => String(hex || "").replace("#", "");
  const start = normalize(a);
  const end = normalize(b);
  if (start.length !== 6 || end.length !== 6) return a || b || "#ffffff";

  const parts = [0, 2, 4].map((offset) => {
    const av = parseInt(start.slice(offset, offset + 2), 16);
    const bv = parseInt(end.slice(offset, offset + 2), 16);
    const out = Math.round(av + (bv - av) * safeRatio);
    return out.toString(16).padStart(2, "0");
  });

  return `#${parts.join("")}`;
}

function resolveSeriesColor(style, ratio = 0.5, fallback = "#2EC4B6") {
  if (!style) return fallback;
  const meta = style;
  if (meta.mode !== "gradient" || !Array.isArray(meta.stops) || meta.stops.length < 3) {
    return meta.primary || fallback;
  }

  const safeRatio = clampNumber(Number(ratio) || 0, 0, 1);
  if (safeRatio <= 0.5) {
    return interpolateHexColor(meta.stops[0], meta.stops[1], safeRatio / 0.5);
  }
  return interpolateHexColor(meta.stops[1], meta.stops[2], (safeRatio - 0.5) / 0.5);
}

function buildStatCardKey(item) {
  if (!item || typeof item !== "object") return "";
  return [
    String(item.chart || ""),
    String(item.section || ""),
    String(item.event || ""),
    String(item.session || ""),
    String(item.scope || ""),
    String(item.viewMode || ""),
  ].join("::");
}

function buildStatCardTitle(eventLabel, sessionLabel) {
  const eventText = String(eventLabel || "Stats").trim();
  const sessionText = String(sessionLabel || "").trim();
  return sessionText ? `${eventText} · ${sessionText}` : eventText;
}

function getEventDisplayMeta(eventValue) {
  const eventKey = String(eventValue || "").toUpperCase();
  if (eventKey === ALL_EVENTS) return { label: "All Events", puzzleEvent: "" };

  const labelMap = {
    "222": "2x2",
    "333": "3x3",
    "444": "4x4",
    "555": "5x5",
    "666": "6x6",
    "777": "7x7",
    "333OH": "3x3 OH",
    "333BLD": "3x3 BLD",
    "444BLD": "4x4 BLD",
    "555BLD": "5x5 BLD",
    "333MULTIBLD": "3x3 Multi-BLD",
    "333FEW": "3x3 FMC",
    "PYRAMINX": "Pyraminx",
    "SKEWB": "Skewb",
    "SQ1": "Square-1",
    "MEGAMINX": "Megaminx",
    "CLOCK": "Clock",
  };

  return {
    label: labelMap[eventKey] || eventKey,
    puzzleEvent: eventKey,
  };
}

function formatShortDateRangeLabel(startDay, endDay, fallback = "All Dates") {
  const formatDay = (dayKey) => {
    if (!dayKey) return "";
    const date = new Date(`${dayKey}T12:00:00`);
    if (!isFiniteDate(date)) return dayKey;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  };

  if (!startDay && !endDay) return fallback;
  if (startDay && endDay) return `${formatDay(startDay)} → ${formatDay(endDay)}`;
  if (startDay) return `${formatDay(startDay)} →`;
  return `→ ${formatDay(endDay)}`;
}

function parseIsoDayKey(dayKey) {
  if (!dayKey) return null;
  const date = new Date(`${dayKey}T12:00:00`);
  return isFiniteDate(date) ? date : null;
}

function toIsoDayKey(date) {
  if (!isFiniteDate(date)) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  if (!isFiniteDate(date)) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addMonths(date, delta) {
  if (!isFiniteDate(date)) return null;
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
}

function buildCalendarDays(monthDate) {
  if (!isFiniteDate(monthDate)) return [];
  const firstDay = startOfMonth(monthDate);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getPresetRange(presetKey) {
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

  if (presetKey === "today") {
    const day = toIsoDayKey(current);
    return { start: day, end: day };
  }

  if (presetKey === "last7") {
    const start = new Date(current);
    start.setDate(current.getDate() - 6);
    return { start: toIsoDayKey(start), end: toIsoDayKey(current) };
  }

  if (presetKey === "last30") {
    const start = new Date(current);
    start.setDate(current.getDate() - 29);
    return { start: toIsoDayKey(start), end: toIsoDayKey(current) };
  }

  if (presetKey === "month") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1, 12);
    return { start: toIsoDayKey(start), end: toIsoDayKey(current) };
  }

  if (presetKey === "year") {
    const start = new Date(current.getFullYear(), 0, 1, 12);
    return { start: toIsoDayKey(start), end: toIsoDayKey(current) };
  }

  return { start: "", end: "" };
}

function StatsDateRangePicker({ startDay, endDay, accentColor = "#2EC4B6", onApply }) {
  const [draftStart, setDraftStart] = useState(startDay || "");
  const [draftEnd, setDraftEnd] = useState(endDay || "");
  const latestDraftRef = useRef({
    draftStart: startDay || "",
    draftEnd: endDay || "",
    appliedStart: startDay || "",
    appliedEnd: endDay || "",
    onApply,
  });
  const [anchorMonth, setAnchorMonth] = useState(() => {
    const seed = parseIsoDayKey(endDay || startDay || toIsoDayKey(new Date()));
    return startOfMonth(seed || new Date());
  });

  latestDraftRef.current = {
    draftStart,
    draftEnd,
    appliedStart: startDay || "",
    appliedEnd: endDay || "",
    onApply,
  };

  useEffect(() => {
    setDraftStart(startDay || "");
    setDraftEnd(endDay || "");
    const seed = parseIsoDayKey(endDay || startDay || toIsoDayKey(new Date()));
    setAnchorMonth(startOfMonth(seed || new Date()));
  }, [endDay, startDay]);

  useEffect(() => () => {
    const { draftStart: nextStart, draftEnd: nextEnd, appliedStart, appliedEnd, onApply: apply } = latestDraftRef.current;
    if (nextStart === appliedStart && nextEnd === appliedEnd) return;
    apply?.(nextStart, nextEnd);
  }, []);

  const hasDraftChanges = draftStart !== (startDay || "") || draftEnd !== (endDay || "");
  const accentSoft = `${accentColor}22`;
  const accentStrong = `${accentColor}88`;
  const todayKey = toIsoDayKey(new Date());
  const monthCards = [anchorMonth, addMonths(anchorMonth, 1)].filter(Boolean);

  const applyPreset = useCallback((presetKey) => {
    const range = getPresetRange(presetKey);
    setDraftStart(range.start);
    setDraftEnd(range.end);
    const seed = parseIsoDayKey(range.end || range.start || todayKey);
    if (seed) setAnchorMonth(startOfMonth(seed));
  }, [todayKey]);

  const handleDayPick = useCallback((dayKey) => {
    if (!dayKey) return;

    if (!draftStart) {
      setDraftStart(dayKey);
      setDraftEnd("");
      return;
    }

    if (!draftEnd) {
      if (dayKey < draftStart) {
        setDraftStart(dayKey);
        setDraftEnd(draftStart);
      } else {
        setDraftEnd(dayKey);
      }
      return;
    }

    setDraftStart(dayKey);
    setDraftEnd("");
  }, [draftEnd, draftStart]);

  return (
    <div className="statsScopeDatePicker">
      <div className="statsScopeDatePresetRow">
        {[
          { key: "today", label: "Today" },
          { key: "last7", label: "Last 7" },
          { key: "last30", label: "Last 30" },
          { key: "month", label: "This Month" },
          { key: "year", label: "This Year" },
        ].map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="statsScopeDatePreset"
            onClick={() => applyPreset(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="statsScopeCalendarShell">
        <div className="statsScopeCalendarHeader">
          <button
            type="button"
            className="statsScopeCalendarNav"
            onClick={() => setAnchorMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="statsScopeCalendarHeaderMeta">
            <span>{!draftStart ? "Choose a start date" : !draftEnd ? "Choose an end date" : "Range selected"}</span>
            <strong>
              {draftStart || draftEnd
                ? formatShortDateRangeLabel(draftStart, draftEnd, "All Dates")
                : "All Dates"}
            </strong>
          </div>
          <button
            type="button"
            className="statsScopeCalendarNav"
            onClick={() => setAnchorMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="statsScopeCalendarGrid">
          {monthCards.map((monthDate) => {
            const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
            const days = buildCalendarDays(monthDate);

            return (
              <div key={monthKey} className="statsScopeCalendarCard">
                <div className="statsScopeCalendarMonth">
                  {monthDate.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div className="statsScopeCalendarWeekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                    <span key={`${monthKey}-${label}`}>{label}</span>
                  ))}
                </div>
                <div className="statsScopeCalendarDays">
                  {days.map((date) => {
                    const dayKey = toIsoDayKey(date);
                    const isOutsideMonth = date.getMonth() !== monthDate.getMonth();
                    const isStart = !!draftStart && dayKey === draftStart;
                    const isEnd = !!draftEnd && dayKey === draftEnd;
                    const isBetween =
                      !!draftStart && !!draftEnd && dayKey > draftStart && dayKey < draftEnd;
                    const isToday = dayKey === todayKey;

                    return (
                      <button
                        key={dayKey}
                        type="button"
                        className={[
                          "statsScopeCalendarDay",
                          isOutsideMonth ? "is-outside" : "",
                          isStart ? "is-start" : "",
                          isEnd ? "is-end" : "",
                          isBetween ? "is-between" : "",
                          isToday ? "is-today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          isStart || isEnd
                            ? {
                                borderColor: accentStrong,
                                background: accentColor,
                                color: "#041311",
                              }
                            : isBetween
                              ? {
                                  borderColor: `${accentColor}33`,
                                  background: accentSoft,
                                }
                              : undefined
                        }
                        onClick={() => handleDayPick(dayKey)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="statsScopeDateActions">
        <button
          type="button"
          className="statsMiniBtn"
          onClick={() => {
            setDraftStart(startDay || "");
            setDraftEnd(endDay || "");
          }}
          disabled={!hasDraftChanges}
        >
          Reset
        </button>
        <button
          type="button"
          className="statsMiniBtn"
          onClick={() => {
            setDraftStart("");
            setDraftEnd("");
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="statsToggleBtn is-active"
          onClick={() => onApply?.(draftStart, draftEnd)}
          disabled={!hasDraftChanges}
        >
          Apply Dates
        </button>
      </div>
    </div>
  );
}

function getSolveDisplayMs(solve) {
  if (!solve) return null;
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return null;
  const base =
    Number.isFinite(Number(solve?.time)) ? Number(solve.time) :
    Number.isFinite(Number(solve?.finalTimeMs)) ? Number(solve.finalTimeMs) :
    Number.isFinite(Number(solve?.rawTimeMs)) ? Number(solve.rawTimeMs) :
    null;
  if (!Number.isFinite(base)) return null;
  return penalty === "+2" ? base + 2000 : base;
}

function getSolveValueForAverage(solve) {
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return "DNF";
  const value = getSolveDisplayMs(solve);
  return Number.isFinite(value) ? value : "DNF";
}

function computeMo3Average(solves) {
  const values = (Array.isArray(solves) ? solves : []).map(getSolveValueForAverage);
  if (values.length !== 3) return null;
  if (values.some((value) => value === "DNF")) return "DNF";
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (nums.length !== 3) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function computeWindowAverage(solves, spec) {
  const items = Array.isArray(solves) ? solves : [];
  if (items.length !== spec.size) return null;
  if (spec.kind === "mo3") return computeMo3Average(items);
  return calculateAverage(items.map(getSolveValueForAverage), true)?.average ?? null;
}

function findWindowByStartRef(solves, startSolveRef, size) {
  if (!startSolveRef) return null;
  const items = Array.isArray(solves) ? solves : [];
  const startIndex = items.findIndex(
    (solve) => String(solve?.solveRef ?? solve?.SK ?? "") === String(startSolveRef)
  );
  if (startIndex < 0) return null;
  const slice = items.slice(startIndex, startIndex + size);
  return slice.length === size ? slice : null;
}

function findWindowForMetric(solves, spec, variant) {
  const items = Array.isArray(solves) ? solves : [];
  if (items.length < spec.size) return null;
  if (variant === "current") return items.slice(items.length - spec.size);
  if (variant === "strict-best") {
    return findBestStrictWindow(items, spec.size, spec.kind)?.solves ?? null;
  }

  let selected = null;
  let selectedValue = null;

  for (let i = 0; i <= items.length - spec.size; i += 1) {
    const slice = items.slice(i, i + spec.size);
    const value = computeWindowAverage(slice, spec);
    if (!Number.isFinite(value)) continue;

    if (
      selected == null ||
      (variant === "best" && value < selectedValue) ||
      (variant === "worst" && value > selectedValue)
    ) {
      selected = slice;
      selectedValue = value;
    }
  }

  return selected;
}

function findSingleSolve(solves, variant) {
  const items = Array.isArray(solves) ? solves : [];
  if (!items.length) return null;
  if (variant === "current") return items[items.length - 1] || null;

  let selected = null;
  let selectedValue = null;

  items.forEach((solve) => {
    const value = getSolveDisplayMs(solve);
    if (!Number.isFinite(value)) return;
    if (
      selected == null ||
      (variant === "best" && value < selectedValue) ||
      (variant === "worst" && value > selectedValue)
    ) {
      selected = solve;
      selectedValue = value;
    }
  });

  return selected;
}

function buildLineSnapshot(solves) {
  const points = (solves || [])
    .map((solve, index, arr) => {
      const value = getSolveDisplayMs(solve);
      if (!Number.isFinite(value)) return null;

      const rawDate = solve?.datetime || solve?.createdAt || solve?.DateTime || null;
      const date = rawDate ? new Date(rawDate) : null;
      const label =
        date && Number.isFinite(date.getTime())
          ? date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
          : String(arr.length - Math.max(0, arr.length - 24) + index);

      return {
        label,
        value,
      };
    })
    .filter(Boolean)
    .slice(-24);
  return { points };
}

function buildHistogramSnapshot(solves, bucketCount = 8) {
  const values = (solves || [])
    .map(getSolveDisplayMs)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return { buckets: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const size = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, idx) => ({
    label: "",
    count: 0,
  }));
  values.forEach((value) => {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / size));
    buckets[index].count += 1;
  });
  buckets.forEach((bucket, idx) => {
    const start = min + size * idx;
    const end = idx === bucketCount - 1 ? max : start + size;
    bucket.label = `${formatTime(start)}-${formatTime(end)}`;
  });
  return { buckets };
}

function buildRecentTimesSnapshot(solves) {
  const items = (solves || [])
    .slice(-6)
    .map((solve, index) => {
      const value = getSolveDisplayMs(solve);
      const rawDate = solve?.datetime || solve?.createdAt || solve?.DateTime || null;
      const date = rawDate ? new Date(rawDate) : null;
      return {
        label:
          date && Number.isFinite(date.getTime())
            ? date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
            : `Solve ${index + 1}`,
        value: Number.isFinite(value) ? formatTime(value) : "DNF",
        rawValue: value,
        penalty: solve?.penalty ?? solve?.Penalty ?? null,
      };
    });
  return { items };
}

function serializeSharedSolve(solve) {
  if (!solve || typeof solve !== "object") return null;
  return {
    time: solve?.time ?? null,
    penalty: solve?.penalty ?? solve?.Penalty ?? null,
    scramble: solve?.scramble ?? solve?.Scramble ?? "",
    event: solve?.event ?? solve?.Event ?? "",
    datetime: solve?.datetime ?? solve?.createdAt ?? solve?.DateTime ?? null,
    createdAt: solve?.createdAt ?? solve?.datetime ?? solve?.DateTime ?? null,
    fullIndex: solve?.fullIndex ?? null,
    solveRef: solve?.solveRef ?? null,
    rawTime: solve?.rawTime ?? solve?.rawTimeMs ?? solve?.RawTimeMs ?? null,
    rawTimeMs: solve?.rawTimeMs ?? solve?.RawTimeMs ?? solve?.rawTime ?? null,
    finalTimeMs: solve?.finalTimeMs ?? solve?.FinalTimeMs ?? solve?.time ?? null,
    originalTime: solve?.originalTime ?? solve?.rawTime ?? solve?.rawTimeMs ?? null,
    note: solve?.note ?? solve?.Note ?? "",
  };
}

function serializeSharedSolves(solves, limit = null) {
  const items = (Array.isArray(solves) ? solves : [])
    .filter(Boolean)
    .map(serializeSharedSolve)
    .filter(Boolean);
  if (Number.isFinite(limit) && limit > 0 && items.length > limit) {
    return items.slice(items.length - limit);
  }
  return items;
}

function aggregateStatsList(statsList) {
  const items = (statsList || []).filter(Boolean);

  let solveCountTotal = 0;
  let solveCountIncluded = 0;
  let dnfCount = 0;
  let plus2Count = 0;
  let sumFinalTimeMs = 0;

  let bestSingleMs = null;
  let bestMo3Ms = null;
  let bestAo5Ms = null;
  let bestAo12Ms = null;
  let bestAo25Ms = null;
  let bestAo50Ms = null;
  let bestAo100Ms = null;
  let bestAo1000Ms = null;
  let bestSingleSolveSK = null;
  let bestMo3StartSolveSK = null;
  let bestAo5StartSolveSK = null;
  let bestAo12StartSolveSK = null;
  let bestAo25StartSolveSK = null;
  let bestAo50StartSolveSK = null;
  let bestAo100StartSolveSK = null;
  let bestAo1000StartSolveSK = null;

  let bestSingleAt = null;
  let lastSolveAt = null;

  const updateBestMetric = (currentValue, currentRef, nextValue, nextRef) => {
    const curr = Number.isFinite(Number(currentValue)) ? Number(currentValue) : null;
    const next = Number.isFinite(Number(nextValue)) ? Number(nextValue) : null;
    if (next == null) return { value: curr, ref: currentRef ?? null };
    if (curr == null || next < curr) return { value: next, ref: nextRef ?? null };
    return { value: curr, ref: currentRef ?? null };
  };

  for (const s of items) {
    solveCountTotal += num(s.SolveCountTotal);
    solveCountIncluded += num(s.SolveCountIncluded);
    dnfCount += num(s.DNFCount);
    plus2Count += num(s.Plus2Count);
    sumFinalTimeMs += num(s.SumFinalTimeMs);

    ({ value: bestSingleMs, ref: bestSingleSolveSK } = updateBestMetric(
      bestSingleMs,
      bestSingleSolveSK,
      s.BestSingleMs,
      s.BestSingleSolveSK
    ));
    ({ value: bestMo3Ms, ref: bestMo3StartSolveSK } = updateBestMetric(
      bestMo3Ms,
      bestMo3StartSolveSK,
      s.BestMo3Ms,
      s.BestMo3StartSolveSK
    ));
    ({ value: bestAo5Ms, ref: bestAo5StartSolveSK } = updateBestMetric(
      bestAo5Ms,
      bestAo5StartSolveSK,
      s.BestAo5Ms,
      s.BestAo5StartSolveSK
    ));
    ({ value: bestAo12Ms, ref: bestAo12StartSolveSK } = updateBestMetric(
      bestAo12Ms,
      bestAo12StartSolveSK,
      s.BestAo12Ms,
      s.BestAo12StartSolveSK
    ));
    ({ value: bestAo25Ms, ref: bestAo25StartSolveSK } = updateBestMetric(
      bestAo25Ms,
      bestAo25StartSolveSK,
      s.BestAo25Ms,
      s.BestAo25StartSolveSK
    ));
    ({ value: bestAo50Ms, ref: bestAo50StartSolveSK } = updateBestMetric(
      bestAo50Ms,
      bestAo50StartSolveSK,
      s.BestAo50Ms,
      s.BestAo50StartSolveSK
    ));
    ({ value: bestAo100Ms, ref: bestAo100StartSolveSK } = updateBestMetric(
      bestAo100Ms,
      bestAo100StartSolveSK,
      s.BestAo100Ms,
      s.BestAo100StartSolveSK
    ));
    ({ value: bestAo1000Ms, ref: bestAo1000StartSolveSK } = updateBestMetric(
      bestAo1000Ms,
      bestAo1000StartSolveSK,
      s.BestAo1000Ms,
      s.BestAo1000StartSolveSK
    ));

    bestSingleAt = maxIso(bestSingleAt, s.BestSingleAt);
    lastSolveAt = maxIso(lastSolveAt, s.LastSolveAt);
  }

  return {
    SolveCountTotal: solveCountTotal,
    SolveCountIncluded: solveCountIncluded,
    DNFCount: dnfCount,
    Plus2Count: plus2Count,
    SumFinalTimeMs: sumFinalTimeMs,
    MeanMs: solveCountIncluded > 0 ? Math.round(sumFinalTimeMs / solveCountIncluded) : null,
    BestSingleMs: bestSingleMs,
    BestSingleSolveSK: bestSingleSolveSK,
    BestMo3Ms: bestMo3Ms,
    BestMo3StartSolveSK: bestMo3StartSolveSK,
    BestAo5Ms: bestAo5Ms,
    BestAo5StartSolveSK: bestAo5StartSolveSK,
    BestAo12Ms: bestAo12Ms,
    BestAo12StartSolveSK: bestAo12StartSolveSK,
    BestAo25Ms: bestAo25Ms,
    BestAo25StartSolveSK: bestAo25StartSolveSK,
    BestAo50Ms: bestAo50Ms,
    BestAo50StartSolveSK: bestAo50StartSolveSK,
    BestAo100Ms: bestAo100Ms,
    BestAo100StartSolveSK: bestAo100StartSolveSK,
    BestAo1000Ms: bestAo1000Ms,
    BestAo1000StartSolveSK: bestAo1000StartSolveSK,
    BestSingleAt: bestSingleAt,
    LastSolveAt: lastSolveAt,
  };
}

function getSessionStatsFromSessionsList(sessionsList, event, sessionID) {
  return (
    (sessionsList || []).find(
      (s) =>
        String(s?.Event || "").toUpperCase() === String(event || "").toUpperCase() &&
        String(s?.SessionID || "main") === String(sessionID || "main")
    )?.Stats || null
  );
}

function getEventAggregateFromSessionsList(sessionsList, event) {
  const statsList = (sessionsList || [])
    .filter((s) => String(s?.Event || "").toUpperCase() === String(event || "").toUpperCase())
    .map((s) => s?.Stats)
    .filter(Boolean);

  return aggregateStatsList(statsList);
}

function getAllEventsBreakdownFromSessionsList(sessionsList) {
  const map = new Map();

  for (const s of sessionsList || []) {
    const ev = String(s?.Event || "").toUpperCase();
    if (!ev) continue;
    if (!map.has(ev)) map.set(ev, []);
    if (s?.Stats) map.get(ev).push(s.Stats);
  }

  return Array.from(map.entries())
    .map(([event, statsList]) => ({
      event,
      stats: aggregateStatsList(statsList),
    }))
    .sort((a, b) => {
      const ac = num(a?.stats?.SolveCountTotal);
      const bc = num(b?.stats?.SolveCountTotal);
      return bc - ac || String(a.event).localeCompare(String(b.event));
    });
}

function getSolveDate(solve) {
  const raw = solve?.datetime || solve?.createdAt || solve?.DateTime || solve?.dateTime;
  if (!raw) return null;
  const date = new Date(raw);
  return isFiniteDate(date) ? date : null;
}

function getLocalDayKey(date) {
  if (!isFiniteDate(date)) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLocalDayKey() {
  return getLocalDayKey(new Date());
}

function getDayKeyDate(dayKey) {
  if (!dayKey) return null;
  const date = new Date(`${dayKey}T12:00:00`);
  return isFiniteDate(date) ? date : null;
}

function shiftLocalDayKey(dayKey, offsetDays) {
  const base = getDayKeyDate(dayKey);
  if (!base) return "";
  const next = new Date(base);
  next.setDate(next.getDate() + Number(offsetDays || 0));
  return getLocalDayKey(next);
}

function getWeekRangeFromDayKey(dayKey) {
  const base = getDayKeyDate(dayKey);
  if (!base) return { start: "", end: "" };

  const start = new Date(base);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return {
    start: getLocalDayKey(start),
    end: getLocalDayKey(end),
  };
}

function getMonthRangeFromDayKey(dayKey) {
  const base = getDayKeyDate(dayKey);
  if (!base) return { start: "", end: "" };

  const start = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);

  return {
    start: getLocalDayKey(start),
    end: getLocalDayKey(end),
  };
}

function filterSolvesByDateRange(input, startDay, endDay) {
  const items = Array.isArray(input) ? input : [];
  if (!startDay && !endDay) return items;

  return items.filter((solve) => {
    const date = getSolveDate(solve);
    if (!date) return false;
    const key = getLocalDayKey(date);
    if (startDay && key < startDay) return false;
    if (endDay && key > endDay) return false;
    return true;
  });
}

function Stats({
  sessions,
  sessionsList = [],
  tagConfig = DEFAULT_TAG_CONFIG,
  tagCatalog = { Global: {}, ByEvent: {} },
  tagColorCatalog = { Global: {}, ByEvent: {} },
  cubeModelOptions = [],
  sessionStats,
  statsMutationTick = 0,
  setSessions,
  setUser,
  currentEvent,
  currentSession,
  user,
  deleteTime,
  addPost,
  onTagColorsChange = null,
  onSettingsContextChange,
  recomputeRequest = 0,
  importRequest = 0,
}) {
  const { runDb } = useDbStatus();
  const DEFAULT_IN_VIEW = 100;
  const DEFAULT_PAGE_FETCH = 500;

  const [standardSelection, setStandardSelection] = useState({
    event: currentEvent || "333",
    session: currentSession || "main",
  });
  const [timeSelection, setTimeSelection] = useState({
    event: ALL_EVENTS,
    session: ALL_SESSIONS,
  });
  const [primaryPaletteKey, setPrimaryPaletteKey] = useState(DEFAULT_PRIMARY_PALETTE);
  const [statsEvent, setStatsEvent] = useState(currentEvent || "333");
  const [statsSession, setStatsSession] = useState(currentSession || "main");
  const [compareSelection, setCompareSelection] = useState(null);
  const [compareSessionMenuOpen, setCompareSessionMenuOpen] = useState(false);
  const [compareSessionSolves, setCompareSessionSolves] = useState([]);
  const [compareTagScopeSolves, setCompareTagScopeSolves] = useState([]);
  const [compareTagScopeCacheKey, setCompareTagScopeCacheKey] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
const [scopeModalState, setScopeModalState] = useState(null);
const [scopeModalSection, setScopeModalSection] = useState("event");  const compareRequestTokenRef = useRef(0);
  const compareSessionMenuWrapRef = useRef(null);

  const sessionId = useMemo(() => statsSession || "main", [statsSession]);

  const isAllEventsMode = statsEvent === ALL_EVENTS;
  const isAllSessionsMode = statsSession === ALL_SESSIONS;
  const isSolveLevelMode = !isAllEventsMode && !isAllSessionsMode;

  const [tagFilterSelection, setTagFilterSelection] = useState(makeEmptyTagSelection());
  const hasActiveTagFilter = hasActiveTagSelection(tagFilterSelection);

  const [solvesPerPage, setSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [currentPage, setCurrentPage] = useState(0);
  const [linkStatsControls, setLinkStatsControls] = useState(true);
  const [compareSolvesPerPage, setCompareSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [compareCurrentPage, setCompareCurrentPage] = useState(0);

  const [overallStatsForEvent, setOverallStatsForEvent] = useState(null);
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);
  const [recomputeStatusText, setRecomputeStatusText] = useState("");

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves, setLoadingAllSolves] = useState(false);
  const [loadingTimeScope, setLoadingTimeScope] = useState(false);
  const [loadingTagScope, setLoadingTagScope] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const [compareShowAllActive, setCompareShowAllActive] = useState(false);
  const [timeScopeSolves, setTimeScopeSolves] = useState([]);
  const [timeScopeCacheKey, setTimeScopeCacheKey] = useState("");
  const [tagScopeSolves, setTagScopeSolves] = useState([]);
  const [tagScopeCacheKey, setTagScopeCacheKey] = useState("");

  const [pageCursor, setPageCursor] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isAllLoaded, setIsAllLoaded] = useState(false);

  const requestTokenRef = useRef(0);

  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const sessionMenuWrapRef = useRef(null);

  const [showImport, setShowImport] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const recomputeRequestRef = useRef(recomputeRequest);
  const importRequestRef = useRef(importRequest);
  const [statsViewMode, setStatsViewMode] = useState("standard");
  const showSolveCharts = isSolveLevelMode || statsViewMode === "time";
  const [selectedTimeDay, setSelectedTimeDay] = useState("");
  const [dateFilterStart, setDateFilterStart] = useState("");
  const [dateFilterEnd, setDateFilterEnd] = useState("");
  const [focusedCardId, setFocusedCardId] = useState("");
  const [focusActionMessage, setFocusActionMessage] = useState("");
  const [focusActionBusy, setFocusActionBusy] = useState("");
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedAverageDetail, setSelectedAverageDetail] = useState(null);
  const [tableCompareView, setTableCompareView] = useState("primary");
  const profileChartStyle = useMemo(() => getProfileChartStyle(user), [user]);
  const safeTagConfig = useMemo(() => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG), [tagConfig]);
  const paletteOptions = useMemo(() => getPaletteOptions(), []);
  const compareEnabled = !!compareSelection;

  useEffect(() => {
    const onDown = (e) => {
      if (!sessionMenuOpen) return;
      if (!sessionMenuWrapRef.current) return;
      if (!sessionMenuWrapRef.current.contains(e.target)) {
        setSessionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sessionMenuOpen]);

  useEffect(() => {
    const onDown = (e) => {
      if (!compareSessionMenuOpen) return;
      if (!compareSessionMenuWrapRef.current) return;
      if (!compareSessionMenuWrapRef.current.contains(e.target)) {
        setCompareSessionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [compareSessionMenuOpen]);

  useEffect(() => {
    if (statsViewMode === "time") {
      setStatsEvent(timeSelection.event || ALL_EVENTS);
      setStatsSession(timeSelection.session || ALL_SESSIONS);
      return;
    }

    setStatsEvent(standardSelection.event || currentEvent || "333");
    setStatsSession(standardSelection.session || currentSession || "main");
  }, [
    currentEvent,
    currentSession,
    standardSelection.event,
    standardSelection.session,
    statsViewMode,
    timeSelection.event,
    timeSelection.session,
  ]);

  const normalizeSolve = useCallback((item) => {
    if (!item) return null;

    const created =
      item.CreatedAt ||
      (typeof item.SK === "string" && item.SK.startsWith("SOLVE#")
        ? item.SK.slice(6)
        : null);

    const rawCandidate = Number(
      item?.RawTimeMs ??
        item?.rawTimeMs ??
        item?.Time ??
        item?.time ??
        item?.ms ??
        item?.OriginalTime ??
        item?.originalTime
    );
    const rawTimeMs = Number.isFinite(rawCandidate) ? rawCandidate : 0;
    const finalCandidate = Number(item?.FinalTimeMs ?? item?.finalTimeMs);
    const finalTimeMs = Number.isFinite(finalCandidate) ? finalCandidate : rawTimeMs;

    return {
      solveRef: item.SK || item.SolveID || created,
      fullIndex: undefined,
      time: finalTimeMs,
      rawTime: rawTimeMs,
      originalTime: rawTimeMs,
      scramble: item.Scramble || "",
      event: item.Event,
      penalty: item.Penalty || null,
      note: item.Note || "",
      datetime: created,
      tags: item.Tags || {},
      sessionID: item.SessionID || item.SessionId || item.sessionID || sessionId,
    };
  }, [sessionId]);

  const baseEventOptions = useMemo(() => {
    const set = new Set();

    for (const k of Object.keys(sessions || {})) {
      if (k) set.add(String(k).toUpperCase());
    }

    for (const s of sessionsList || []) {
      if (s?.Event) set.add(String(s.Event).toUpperCase());
    }

    const values = Array.from(set).sort((a, b) => a.localeCompare(b));
    return values;
  }, [sessions, sessionsList]);

  const eventOptions = useMemo(() => {
    return statsViewMode === "time" ? [ALL_EVENTS, ...baseEventOptions] : baseEventOptions;
  }, [baseEventOptions, statsViewMode]);

  const solveScopeSessions = useMemo(() => {
    const allSessions = Array.isArray(sessionsList) ? sessionsList : [];

    if (statsViewMode === "time" || isAllEventsMode) {
      return allSessions
        .map((s) => ({
          Event: String(s?.Event || "").toUpperCase(),
          SessionID: String(s?.SessionID || "main"),
        }))
        .filter((s) => s.Event);
    }

    if (isAllSessionsMode) {
      return allSessions
        .filter((s) => String(s?.Event || "").toUpperCase() === String(statsEvent || "").toUpperCase())
        .map((s) => ({
          Event: String(s?.Event || "").toUpperCase(),
          SessionID: String(s?.SessionID || "main"),
        }))
        .filter((s) => s.Event);
    }

    if (!statsEvent) return [];

    return [
      {
        Event: String(statsEvent || "").toUpperCase(),
        SessionID: String(sessionId || "main"),
      },
    ];
  }, [isAllEventsMode, isAllSessionsMode, sessionId, sessionsList, statsEvent, statsViewMode]);

  const solveScopeSessionKey = useMemo(() => {
    return solveScopeSessions
      .map((s) => `${s.Event}|${s.SessionID}`)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
  }, [solveScopeSessions]);

  const sessionCachedSolves = useMemo(() => {
    const out = [];
    for (const eventSolves of Object.values(sessions || {})) {
      if (!Array.isArray(eventSolves)) continue;
      out.push(...eventSolves);
    }
    out.sort((a, b) => {
      const ta = new Date(a?.datetime || "").getTime();
      const tb = new Date(b?.datetime || "").getTime();
      return ta - tb;
    });
    return out;
  }, [sessions]);

  const allLoadedSolves = useMemo(() => {
    if (statsViewMode === "time" && timeScopeSolves.length > 0) {
      return timeScopeSolves;
    }
    return sessionCachedSolves;
  }, [sessionCachedSolves, statsViewMode, timeScopeSolves]);

  const selectedSessionSolves = useMemo(() => {
    if (statsViewMode !== "standard") return [];
    const ev = String(statsEvent || "").toUpperCase();
    const allForEvent = Array.isArray(sessions?.[ev]) ? sessions[ev] : [];

    return allForEvent
      .filter((s) => String(s?.sessionID || s?.SessionID || "main") === String(sessionId || "main"))
      .map((solve, index) => ({
        ...solve,
        fullIndex: index,
      }));
  }, [sessions, statsEvent, sessionId, statsViewMode]);

  const hasScopedSolveCache = useMemo(() => {
    if (!user?.UserID) return false;
    if (!solveScopeSessionKey) return false;
    return timeScopeCacheKey === `${user.UserID}::${solveScopeSessionKey}`;
  }, [solveScopeSessionKey, timeScopeCacheKey, user?.UserID]);

  const activeTagEntries = useMemo(() => {
    return Object.entries(sanitizeTagSelection(tagFilterSelection))
      .map(([field, value]) => [field, String(value || "").trim()])
      .filter(([, value]) => value);
  }, [tagFilterSelection]);

  const singleActiveTagFilter = useMemo(() => {
    if (activeTagEntries.length !== 1) return null;
    const [field, value] = activeTagEntries[0];
    return { field, value };
  }, [activeTagEntries]);

  const indexedTagScope = useMemo(() => {
    if (!singleActiveTagFilter) return null;

    return {
      tagKey: singleActiveTagFilter.field,
      tagValue: singleActiveTagFilter.value,
      event: isAllEventsMode ? "" : String(statsEvent || "").toUpperCase(),
      sessionID:
        isAllEventsMode || isAllSessionsMode ? "" : String(sessionId || "main"),
    };
  }, [isAllEventsMode, isAllSessionsMode, sessionId, singleActiveTagFilter, statsEvent]);

  const indexedTagScopeKey = useMemo(() => {
    if (!user?.UserID || !indexedTagScope) return "";
    return [
      user.UserID,
      indexedTagScope.tagKey,
      indexedTagScope.tagValue,
      indexedTagScope.event || "*",
      indexedTagScope.sessionID || "*",
    ].join("::");
  }, [indexedTagScope, user?.UserID]);

  const canUseIndexedTagScope = !!indexedTagScope;

  const hasIndexedTagScopeCache = useMemo(() => {
    return !!indexedTagScopeKey && tagScopeCacheKey === indexedTagScopeKey;
  }, [indexedTagScopeKey, tagScopeCacheKey]);

  const scopeSolvesForSelection = useMemo(() => {
    const base = hasScopedSolveCache ? timeScopeSolves : sessionCachedSolves;
    return (base || []).filter((solve) => {
      const eventMatches =
        isAllEventsMode ||
        String(solve?.event || solve?.Event || "").toUpperCase() === String(statsEvent || "").toUpperCase();
      if (!eventMatches) return false;

      if (isAllEventsMode || isAllSessionsMode) return true;
      return String(solve?.sessionID || solve?.SessionID || "main") === String(sessionId || "main");
    });
  }, [
    hasScopedSolveCache,
    isAllEventsMode,
    isAllSessionsMode,
    sessionCachedSolves,
    sessionId,
    statsEvent,
    timeScopeSolves,
  ]);

  const activeStandardSolves = useMemo(() => {
    const base = hasActiveTagFilter
      ? canUseIndexedTagScope && hasIndexedTagScopeCache
        ? tagScopeSolves
        : scopeSolvesForSelection
      : selectedSessionSolves;
    const filtered = hasActiveTagFilter
      ? canUseIndexedTagScope && hasIndexedTagScopeCache
        ? base
        : base.filter((solve) => solveMatchesTagSelection(solve, tagFilterSelection))
      : base;

    return filtered.map((solve, index) => ({
      ...solve,
      fullIndex: index,
    }));
  }, [
    canUseIndexedTagScope,
    hasActiveTagFilter,
    hasIndexedTagScopeCache,
    scopeSolvesForSelection,
    selectedSessionSolves,
    tagFilterSelection,
    tagScopeSolves,
  ]);

  const sessionsForEvent = useMemo(() => {
    if (isAllEventsMode) return [];

    const ev = String(statsEvent || "").toUpperCase();

    const list = (sessionsList || [])
      .filter((s) => String(s.Event || "").toUpperCase() === ev)
      .map((s) => ({
        SessionID: s.SessionID || "main",
        SessionName: s.SessionName || s.Name || s.SessionID || "main",
        Stats: s.Stats || null,
      }));

    const seen = new Set();
    const deduped = [];

    for (const s of list) {
      if (seen.has(s.SessionID)) continue;
      seen.add(s.SessionID);
      deduped.push(s);
    }

    deduped.sort((a, b) => {
      if (a.SessionID === "main") return -1;
      if (b.SessionID === "main") return 1;
      return String(a.SessionName).localeCompare(String(b.SessionName));
    });

    if (statsViewMode === "time") {
      return [
        {
          SessionID: ALL_SESSIONS,
          SessionName: "All Sessions",
          Stats: getEventAggregateFromSessionsList(sessionsList, ev),
        },
        ...deduped,
      ];
    }

    return deduped;
  }, [sessionsList, statsEvent, isAllEventsMode, statsViewMode]);

  const compareEvent = String(compareSelection?.event || statsEvent || "").toUpperCase();
  const compareSessionId = String(compareSelection?.session || "main");
  const compareTagSelection = useMemo(
    () => sanitizeTagSelection(compareSelection?.tags || makeEmptyTagSelection()),
    [compareSelection?.tags]
  );
  const compareActiveTagEntries = useMemo(() => {
    return Object.entries(compareTagSelection)
      .map(([field, value]) => [field, String(value || "").trim()])
      .filter(([, value]) => value);
  }, [compareTagSelection]);
  const compareSingleActiveTagFilter = useMemo(() => {
    if (compareActiveTagEntries.length !== 1) return null;
    const [field, value] = compareActiveTagEntries[0];
    return { field, value };
  }, [compareActiveTagEntries]);
  const compareIndexedTagScope = useMemo(() => {
    if (!compareSingleActiveTagFilter) return null;
    return {
      tagKey: compareSingleActiveTagFilter.field,
      tagValue: compareSingleActiveTagFilter.value,
      event: compareEvent === ALL_EVENTS ? "" : String(compareEvent || "").toUpperCase(),
      sessionID:
        compareEvent === ALL_EVENTS || compareSessionId === ALL_SESSIONS
          ? ""
          : String(compareSessionId || "main"),
    };
  }, [compareEvent, compareSessionId, compareSingleActiveTagFilter]);
  const compareIndexedTagScopeKey = useMemo(() => {
    if (!user?.UserID || !compareIndexedTagScope) return "";
    return [
      user.UserID,
      compareIndexedTagScope.tagKey,
      compareIndexedTagScope.tagValue,
      compareIndexedTagScope.event || "*",
      compareIndexedTagScope.sessionID || "*",
    ].join("::");
  }, [compareIndexedTagScope, user?.UserID]);
  const canUseCompareIndexedTagScope = !!compareIndexedTagScope;
  const hasCompareIndexedTagScopeCache = useMemo(() => {
    return !!compareIndexedTagScopeKey && compareTagScopeCacheKey === compareIndexedTagScopeKey;
  }, [compareIndexedTagScopeKey, compareTagScopeCacheKey]);
  const compareStyle = useMemo(
    () =>
      getSeriesStyle(
        compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE,
        DEFAULT_COMPARE_PALETTE,
        profileChartStyle
      ),
    [compareSelection?.paletteKey, profileChartStyle]
  );
  const primaryCompareStyle = useMemo(
    () =>
      getSeriesStyle(
        compareSelection?.primaryPaletteKey ?? primaryPaletteKey,
        DEFAULT_PRIMARY_PALETTE,
        profileChartStyle
      ),
    [compareSelection?.primaryPaletteKey, primaryPaletteKey, profileChartStyle]
  );

  const compareSessionsForEvent = useMemo(() => {
    if (!compareEvent || compareEvent === ALL_EVENTS) return [];

    const list = (sessionsList || [])
      .filter((s) => String(s.Event || "").toUpperCase() === compareEvent)
      .map((s) => ({
        SessionID: s.SessionID || "main",
        SessionName: s.SessionName || s.Name || s.SessionID || "main",
      }));

    const seen = new Set();
    const deduped = [];
    for (const item of list) {
      if (seen.has(item.SessionID)) continue;
      seen.add(item.SessionID);
      deduped.push(item);
    }

    deduped.sort((a, b) => {
      if (a.SessionID === "main") return -1;
      if (b.SessionID === "main") return 1;
      return String(a.SessionName).localeCompare(String(b.SessionName));
    });

    return deduped;
  }, [compareEvent, sessionsList]);

  useEffect(() => {
    if (isAllEventsMode) {
      setStatsSession(ALL_SESSIONS);
      return;
    }

    const valid = sessionsForEvent.some((s) => s.SessionID === statsSession);
    if (!valid) {
      const hasMain = sessionsForEvent.some((s) => s.SessionID === "main");
      setStatsSession(
        hasMain ? "main" : (sessionsForEvent[0]?.SessionID || "main")
      );
    }
  }, [isAllEventsMode, sessionsForEvent, statsSession]);

  useEffect(() => {
    if (!compareSelection) return;
    if (!compareSessionsForEvent.length) return;

    const valid = compareSessionsForEvent.some((s) => s.SessionID === compareSessionId);
    if (valid) return;

    const hasMain = compareSessionsForEvent.some((s) => s.SessionID === "main");
    setCompareSelection((prev) => (
      prev
        ? { ...prev, session: hasMain ? "main" : (compareSessionsForEvent[0]?.SessionID || "main") }
        : prev
    ));
  }, [compareSelection, compareSessionId, compareSessionsForEvent]);

  useEffect(() => {
    setStandardSelection({
      event: currentEvent || "333",
      session: currentSession || "main",
    });

    setSolvesPerPage(DEFAULT_IN_VIEW);
    setCurrentPage(0);
    setPageCursor(null);
    setHasMoreOlder(false);
    setIsAllLoaded(false);
    setShowAllActive(false);

    setTagFilterSelection(makeEmptyTagSelection());
    setSelectedTimeDay("");
  }, [currentEvent, currentSession]);

  useEffect(() => {
    if (scopeModalState === "compare" && !compareEnabled) {
      setScopeModalState(null);
    }
  }, [compareEnabled, scopeModalState]);

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID) {
      setOverallStatsForEvent(null);
      return;
    }

    if (isAllEventsMode) {
      setOverallStatsForEvent(null);
      return;
    }

    if (hasActiveTagFilter) {
      setOverallStatsForEvent(null);
      setLoadingOverallStats(false);
      return;
    }

    if (isAllSessionsMode) {
      const aggregated = getEventAggregateFromSessionsList(sessionsList, statsEvent);
      setOverallStatsForEvent(aggregated || null);
      return;
    }

    const embedded = getSessionStatsFromSessionsList(sessionsList, statsEvent, sessionId);
    if (embedded) {
      setOverallStatsForEvent(embedded);
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingOverallStats(true);
        const item = await getSessionStats(userID, statsEvent, sessionId);
        if (!cancelled) setOverallStatsForEvent(item || null);
      } catch (e) {
        console.error("Failed to load SESSIONSTATS:", e);
        if (!cancelled) setOverallStatsForEvent(null);
      } finally {
        if (!cancelled) setLoadingOverallStats(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    sessionsList,
    isAllEventsMode,
    isAllSessionsMode,
    hasActiveTagFilter,
    statsMutationTick,
  ]);

  const solveStatsRefreshKey = useMemo(() => {
    if (!isSolveLevelMode || !Array.isArray(selectedSessionSolves) || selectedSessionSolves.length === 0) return "";
    const first = selectedSessionSolves[0];
    const latest = selectedSessionSolves[selectedSessionSolves.length - 1];
    const firstKey = String(first?.solveRef || first?.datetime || "");
    const lastKey = String(latest?.solveRef || latest?.datetime || "");
    return `${selectedSessionSolves.length}|${firstKey}|${lastKey}`;
  }, [selectedSessionSolves, isSolveLevelMode]);

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;
    if (hasActiveTagFilter) return;

    let cancelled = false;

    (async () => {
      try {
        const item = await getSessionStats(
          userID,
          String(statsEvent || "").toUpperCase(),
          String(sessionId || "main")
        );
        if (!cancelled) setOverallStatsForEvent(item || null);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to refresh SESSIONSTATS after solve change:", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    solveStatsRefreshKey,
    statsMutationTick,
    isSolveLevelMode,
    hasActiveTagFilter,
  ]);

  const loadInitialSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;

    const myToken = ++requestTokenRef.current;
    setLoadingInitial(true);

    try {
      if (!isSolveLevelMode) {
        setPageCursor(null);
        setHasMoreOlder(false);
        setIsAllLoaded(true);
        setShowAllActive(false);
        setSolvesPerPage(DEFAULT_IN_VIEW);
        setCurrentPage(0);
        return;
      }

      const { items, lastKey } = await getSolvesBySessionPage(
        userID,
        String(statsEvent || "").toUpperCase(),
        sessionId,
        DEFAULT_PAGE_FETCH,
        null
      );

      if (requestTokenRef.current !== myToken) return;

      const normalizedOldestToNewest = (items || [])
        .map(normalizeSolve)
        .reverse();

      setSessions((prev) => {
        const ev = String(statsEvent || "").toUpperCase();
        const existingForEvent = Array.isArray(prev?.[ev]) ? prev[ev] : [];
        const otherSessions = existingForEvent.filter(
          (s) => String(s?.sessionID || s?.SessionID || "main") !== String(sessionId || "main")
        );

        return {
          ...prev,
          [ev]: [...otherSessions, ...normalizedOldestToNewest].sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          }),
        };
      });

      setPageCursor(lastKey || null);
      setHasMoreOlder(!!lastKey);
      setIsAllLoaded(!lastKey);
      setShowAllActive(false);

      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);
    } catch (err) {
      console.error("Failed initial Stats solves load:", err);
    } finally {
      if (requestTokenRef.current === myToken) setLoadingInitial(false);
    }
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    DEFAULT_PAGE_FETCH,
    DEFAULT_IN_VIEW,
    normalizeSolve,
    setSessions,
    isSolveLevelMode,
  ]);

  useEffect(() => {
    if (!user?.UserID) return;
    loadInitialSolves();
  }, [user?.UserID, statsEvent, sessionId, loadInitialSolves]);

  const loadTimeScopeSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return false;
    if (!solveScopeSessionKey) {
      setTimeScopeSolves([]);
      setTimeScopeCacheKey("");
      return false;
    }

    const cacheKey = `${userID}::${solveScopeSessionKey}`;
    if (timeScopeCacheKey === cacheKey && timeScopeSolves.length > 0) return true;

    setLoadingTimeScope(true);

    try {
      const results = await Promise.all(
        solveScopeSessions.map(async (session) => {
          const ev = String(session?.Event || "").toUpperCase();
          const sid = String(session?.SessionID || "main");
          if (!ev) return [];
          const items = await getSolvesBySession(userID, ev, sid);
          return (items || []).map(normalizeSolve).filter(Boolean);
        })
      );

      const deduped = new Map();
      results.flat().forEach((solve) => {
        const key = String(solve?.solveRef || `${solve?.event}|${solve?.sessionID}|${solve?.datetime || ""}`);
        if (!key) return;
        deduped.set(key, solve);
      });

      const merged = Array.from(deduped.values()).sort((a, b) => {
        const ta = new Date(a?.datetime || "").getTime();
        const tb = new Date(b?.datetime || "").getTime();
        return ta - tb;
      });

      setTimeScopeSolves(merged);
      setTimeScopeCacheKey(cacheKey);
      return true;
    } catch (error) {
      console.error("Failed to load time-view solve scope:", error);
      setTimeScopeSolves([]);
      setTimeScopeCacheKey("");
      return false;
    } finally {
      setLoadingTimeScope(false);
    }
  }, [
    normalizeSolve,
    solveScopeSessionKey,
    solveScopeSessions,
    timeScopeCacheKey,
    timeScopeSolves.length,
    user?.UserID,
  ]);

  const loadIndexedTagScopeSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID || !indexedTagScope || !indexedTagScopeKey) {
      setTagScopeSolves([]);
      setTagScopeCacheKey("");
      return false;
    }

    if (tagScopeCacheKey === indexedTagScopeKey && tagScopeSolves.length > 0) return true;

    setLoadingTagScope(true);

    try {
      let cursor = null;
      const items = [];

      do {
        const out = await getSolvesByTag(userID, {
          ...indexedTagScope,
          limit: 500,
          hydrate: true,
          cursor,
        });
        if (Array.isArray(out?.items) && out.items.length) items.push(...out.items);
        cursor = out?.lastKey || null;
      } while (cursor);

      const normalized = items
        .map(normalizeSolve)
        .filter(Boolean)
        .sort((a, b) => {
          const ta = new Date(a?.datetime || "").getTime();
          const tb = new Date(b?.datetime || "").getTime();
          return ta - tb;
        });

      setTagScopeSolves(normalized);
      setTagScopeCacheKey(indexedTagScopeKey);
      return true;
    } catch (error) {
      console.error("Failed to load indexed tag scope:", error);
      setTagScopeSolves([]);
      setTagScopeCacheKey("");
      return false;
    } finally {
      setLoadingTagScope(false);
    }
  }, [
    indexedTagScope,
    indexedTagScopeKey,
    normalizeSolve,
    tagScopeCacheKey,
    tagScopeSolves.length,
    user?.UserID,
  ]);

  useEffect(() => {
    if (statsViewMode !== "time") return;
    loadTimeScopeSolves();
  }, [loadTimeScopeSolves, statsViewMode]);

  useEffect(() => {
    if (!hasActiveTagFilter || !canUseIndexedTagScope) {
      setTagScopeSolves([]);
      setTagScopeCacheKey("");
      setLoadingTagScope(false);
      return;
    }
    loadIndexedTagScopeSolves();
  }, [canUseIndexedTagScope, hasActiveTagFilter, loadIndexedTagScopeSolves]);

  const totalPages = useMemo(() => {
    const per = Math.max(1, solvesPerPage);
    return Math.max(1, Math.ceil((activeStandardSolves.length || 0) / per));
  }, [activeStandardSolves.length, solvesPerPage]);

  const maxPage = totalPages - 1;

  useEffect(() => {
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, maxPage]);

  const startIndex = useMemo(() => {
    return Math.max(0, activeStandardSolves.length - solvesPerPage * (currentPage + 1));
  }, [activeStandardSolves.length, solvesPerPage, currentPage]);

  const endIndex = useMemo(() => {
    return Math.max(
      0,
      Math.min(activeStandardSolves.length, activeStandardSolves.length - solvesPerPage * currentPage)
    );
  }, [activeStandardSolves.length, solvesPerPage, currentPage]);

  const visiblePageRawSolves = useMemo(() => {
    return activeStandardSolves.slice(startIndex, endIndex);
  }, [activeStandardSolves, startIndex, endIndex]);

  const baseTagOptions = useMemo(
    () => collectTagSelectionOptions([], safeTagConfig, cubeModelOptions),
    [cubeModelOptions, safeTagConfig]
  );

  const statsCatalogTagOptions = useMemo(
    () => getTagCatalogOptionsForStatsEvent(tagCatalog, statsEvent),
    [statsEvent, tagCatalog]
  );

  const compareCatalogTagOptions = useMemo(
    () => getTagCatalogOptionsForStatsEvent(tagCatalog, compareEvent),
    [compareEvent, tagCatalog]
  );

  const discoveredTagOptions = useMemo(
    () =>
      mergeTagOptionMaps(
        baseTagOptions,
        statsCatalogTagOptions,
        collectTagSelectionOptions(scopeSolvesForSelection, safeTagConfig, cubeModelOptions)
      ),
    [baseTagOptions, cubeModelOptions, safeTagConfig, scopeSolvesForSelection, statsCatalogTagOptions]
  );

  const compareDiscoveredTagOptions = useMemo(
    () =>
      mergeTagOptionMaps(
        baseTagOptions,
        compareCatalogTagOptions,
        collectTagSelectionOptions(compareSessionSolves, safeTagConfig, cubeModelOptions)
      ),
    [baseTagOptions, compareCatalogTagOptions, compareSessionSolves, cubeModelOptions, safeTagConfig]
  );

  useEffect(() => {
    if (!compareEnabled || statsViewMode !== "standard" || !showSolveCharts || !user?.UserID) {
      setCompareSessionSolves([]);
      setCompareTagScopeSolves([]);
      setCompareTagScopeCacheKey("");
      setCompareLoading(false);
      return;
    }

    if (!compareEvent || compareEvent === ALL_EVENTS || !compareSessionId || compareSessionId === ALL_SESSIONS) {
      setCompareSessionSolves([]);
      return;
    }

    let active = true;
    const requestId = ++compareRequestTokenRef.current;

    const loadCompareSolves = async () => {
      setCompareLoading(true);

      try {
        let items = [];

        if (canUseCompareIndexedTagScope) {
          let cursor = null;
          do {
            const out = await getSolvesByTag(user.UserID, {
              ...compareIndexedTagScope,
              limit: 500,
              hydrate: true,
              cursor,
            });
            if (Array.isArray(out?.items) && out.items.length) items.push(...out.items);
            cursor = out?.lastKey || null;
          } while (cursor);
        } else {
          items = await getSolvesBySession(user.UserID, compareEvent, compareSessionId);
        }
        if (!active || compareRequestTokenRef.current !== requestId) return;

        const normalized = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          });

        if (canUseCompareIndexedTagScope) {
          setCompareTagScopeSolves(normalized);
          setCompareTagScopeCacheKey(compareIndexedTagScopeKey);
        }
        setCompareSessionSolves(normalized);
      } catch (error) {
        if (!active || compareRequestTokenRef.current !== requestId) return;
        console.error("Failed to load compare solves:", error);
        setCompareTagScopeSolves([]);
        setCompareTagScopeCacheKey("");
        setCompareSessionSolves([]);
      } finally {
        if (active && compareRequestTokenRef.current === requestId) {
          setCompareLoading(false);
        }
      }
    };

    loadCompareSolves();

    return () => {
      active = false;
    };
  }, [
    compareEnabled,
    compareEvent,
    compareIndexedTagScope,
    compareIndexedTagScopeKey,
    compareSessionId,
    canUseCompareIndexedTagScope,
    normalizeSolve,
    showSolveCharts,
    statsViewMode,
    user?.UserID,
  ]);

  useEffect(() => {
    if (statsViewMode !== "time") return;
    setSolvesPerPage(DEFAULT_IN_VIEW);
    setCompareSolvesPerPage(DEFAULT_IN_VIEW);
    setCompareCurrentPage(0);
    setShowAllActive(false);
    setCompareShowAllActive(false);
  }, [DEFAULT_IN_VIEW, statsViewMode, dateFilterStart, dateFilterEnd, statsEvent, statsSession]);

  const filterRawSolveList = useCallback(
    (arr) => {
      const input = Array.isArray(arr) ? arr : [];
      if (statsViewMode !== "time" && !isSolveLevelMode) return input;
      if (!hasActiveTagFilter) return input;
      return input.filter((solve) => solveMatchesTagSelection(solve, tagFilterSelection));
    },
    [hasActiveTagFilter, isSolveLevelMode, statsViewMode, tagFilterSelection]
  );

  const hasActiveDateFilter = !!dateFilterStart || !!dateFilterEnd;

  const scopedRawSolves = useMemo(() => {
    let scoped = statsViewMode === "time" ? allLoadedSolves : activeStandardSolves;

    if (statsViewMode === "time") {
      if (!isAllEventsMode) {
        scoped = scoped.filter(
          (solve) => String(solve?.event || solve?.Event || "").toUpperCase() === String(statsEvent || "").toUpperCase()
        );
      }

      if (!isAllSessionsMode) {
        scoped = scoped.filter(
          (solve) => String(solve?.sessionID || solve?.SessionID || "main") === String(sessionId || "main")
        );
      }
    }

    return filterSolvesByDateRange(scoped, dateFilterStart, dateFilterEnd);
  }, [
    allLoadedSolves,
    activeStandardSolves,
    dateFilterEnd,
    dateFilterStart,
    isAllEventsMode,
    isAllSessionsMode,
    sessionId,
    statsEvent,
    statsViewMode,
  ]);

  const allLoadedFilteredRawSolves = useMemo(() => {
    return filterRawSolveList(scopedRawSolves);
  }, [scopedRawSolves, filterRawSolveList]);

  const compareFilteredRawSolves = useMemo(() => {
    if (!compareEnabled) return [];

    const compareBaseSolves =
      canUseCompareIndexedTagScope && hasCompareIndexedTagScopeCache
        ? compareTagScopeSolves
        : compareSessionSolves;
    const dateScoped = filterSolvesByDateRange(compareBaseSolves, dateFilterStart, dateFilterEnd);
    if (!hasActiveTagSelection(compareTagSelection)) return dateScoped;
    if (canUseCompareIndexedTagScope && hasCompareIndexedTagScopeCache) return dateScoped;
    return dateScoped.filter((solve) => solveMatchesTagSelection(solve, compareTagSelection));
  }, [
    canUseCompareIndexedTagScope,
    compareEnabled,
    compareTagScopeSolves,
    compareSessionSolves,
    compareTagSelection,
    dateFilterEnd,
    dateFilterStart,
    hasCompareIndexedTagScopeCache,
  ]);

  const compareStartIndex = useMemo(() => {
    const effectivePerPage = linkStatsControls ? solvesPerPage : compareSolvesPerPage;
    const effectivePage = linkStatsControls ? currentPage : compareCurrentPage;
    return Math.max(0, compareFilteredRawSolves.length - effectivePerPage * (effectivePage + 1));
  }, [
    compareCurrentPage,
    compareFilteredRawSolves.length,
    compareSolvesPerPage,
    currentPage,
    linkStatsControls,
    solvesPerPage,
  ]);

  const compareEndIndex = useMemo(() => {
    const effectivePerPage = linkStatsControls ? solvesPerPage : compareSolvesPerPage;
    const effectivePage = linkStatsControls ? currentPage : compareCurrentPage;
    return Math.max(
      0,
      Math.min(
        compareFilteredRawSolves.length,
        compareFilteredRawSolves.length - effectivePerPage * effectivePage
      )
    );
  }, [
    compareCurrentPage,
    compareFilteredRawSolves.length,
    compareSolvesPerPage,
    currentPage,
    linkStatsControls,
    solvesPerPage,
  ]);

  const effectiveCompareShowAllActive = linkStatsControls ? showAllActive : compareShowAllActive;

  const compareVisiblePageFilteredRawSolves = useMemo(() => {
    if (effectiveCompareShowAllActive) return compareFilteredRawSolves;
    return compareFilteredRawSolves.slice(compareStartIndex, compareEndIndex);
  }, [compareEndIndex, compareFilteredRawSolves, compareStartIndex, effectiveCompareShowAllActive]);

  const visiblePageFilteredRawSolves = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves;
    if (hasActiveDateFilter) return allLoadedFilteredRawSolves;
    return filterRawSolveList(filterSolvesByDateRange(visiblePageRawSolves, dateFilterStart, dateFilterEnd));
  }, [
    allLoadedFilteredRawSolves,
    dateFilterEnd,
    dateFilterStart,
    filterRawSolveList,
    hasActiveDateFilter,
    statsViewMode,
    visiblePageRawSolves,
  ]);

  const barChartSolves = useMemo(() => {
    return visiblePageFilteredRawSolves;
  }, [visiblePageFilteredRawSolves]);

  const pieChartSolves = useMemo(() => {
    return allLoadedFilteredRawSolves;
  }, [allLoadedFilteredRawSolves]);

  const chartVisibleSolves = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves;
    return visiblePageFilteredRawSolves;
  }, [allLoadedFilteredRawSolves, statsViewMode, visiblePageFilteredRawSolves]);

  const timeViewLineSolves = useMemo(() => {
    return statsViewMode === "time" ? allLoadedFilteredRawSolves : chartVisibleSolves;
  }, [allLoadedFilteredRawSolves, chartVisibleSolves, statsViewMode]);

  const summaryCurrentSolves = useMemo(() => {
    return statsViewMode === "time" ? chartVisibleSolves : visiblePageFilteredRawSolves;
  }, [chartVisibleSolves, statsViewMode, visiblePageFilteredRawSolves]);

  const comparisonPrimarySolves = useMemo(() => {
    return compareEnabled ? visiblePageFilteredRawSolves : [];
  }, [compareEnabled, visiblePageFilteredRawSolves]);

  useEffect(() => {
    if (!compareEnabled && tableCompareView !== "primary") {
      setTableCompareView("primary");
    }
  }, [compareEnabled, tableCompareView]);

  useEffect(() => {
    if (!compareEnabled) {
      setLinkStatsControls(true);
      setCompareSolvesPerPage(DEFAULT_IN_VIEW);
      setCompareCurrentPage(0);
      setCompareShowAllActive(false);
    }
  }, [DEFAULT_IN_VIEW, compareEnabled]);

  const fetchNextOlderPage = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;
    if (!hasMoreOlder || !pageCursor || loadingMore) return;

    setLoadingMore(true);
    const myToken = ++requestTokenRef.current;

    try {
      const { items, lastKey } = await getSolvesBySessionPage(
        userID,
        String(statsEvent || "").toUpperCase(),
        sessionId,
        DEFAULT_PAGE_FETCH,
        pageCursor
      );

      if (requestTokenRef.current !== myToken) return;

      const pageOldestToNewest = (items || []).map(normalizeSolve).reverse();

      setSessions((prev) => {
        const ev = String(statsEvent || "").toUpperCase();
        const existingForEvent = Array.isArray(prev?.[ev]) ? prev[ev] : [];
        const thisSessionExisting = existingForEvent.filter(
          (s) => String(s?.sessionID || s?.SessionID || "main") === String(sessionId || "main")
        );
        const otherSessions = existingForEvent.filter(
          (s) => String(s?.sessionID || s?.SessionID || "main") !== String(sessionId || "main")
        );

        return {
          ...prev,
          [ev]: [...otherSessions, ...pageOldestToNewest, ...thisSessionExisting].sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          }),
        };
      });

      setPageCursor(lastKey || null);
      setHasMoreOlder(!!lastKey);
      setIsAllLoaded(!lastKey);
    } catch (err) {
      console.error("Failed to fetch older solves page:", err);
    } finally {
      if (requestTokenRef.current === myToken) setLoadingMore(false);
    }
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    DEFAULT_PAGE_FETCH,
    pageCursor,
    hasMoreOlder,
    loadingMore,
    normalizeSolve,
    setSessions,
    isSolveLevelMode,
  ]);

  const loadAllSessionSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return false;
    if (!isSolveLevelMode) return false;

    setLoadingAllSolves(true);
    const myToken = ++requestTokenRef.current;

    try {
      const fullItems = await getSolvesBySession(
        userID,
        String(statsEvent || "").toUpperCase(),
        String(sessionId || "main")
      );
      if (requestTokenRef.current !== myToken) return false;

      const normalized = (fullItems || []).map(normalizeSolve);

      setSessions((prev) => {
        const ev = String(statsEvent || "").toUpperCase();
        const existingForEvent = Array.isArray(prev?.[ev]) ? prev[ev] : [];
        const otherSessions = existingForEvent.filter(
          (s) => String(s?.sessionID || s?.SessionID || "main") !== String(sessionId || "main")
        );

        return {
          ...prev,
          [ev]: [...otherSessions, ...normalized].sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          }),
        };
      });

      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, normalized.length));
      setCurrentPage(0);
      setIsAllLoaded(true);
      setHasMoreOlder(false);
      setPageCursor(null);
      setShowAllActive(true);
      return true;
    } catch (err) {
      console.error("Failed to load all solves for Stats:", err);
      return false;
    } finally {
      if (requestTokenRef.current === myToken) setLoadingAllSolves(false);
    }
  }, [
    DEFAULT_IN_VIEW,
    isSolveLevelMode,
    normalizeSolve,
    sessionId,
    setSessions,
    statsEvent,
    user?.UserID,
  ]);

  const allEventsBreakdown = useMemo(() => {
    return getAllEventsBreakdownFromSessionsList(sessionsList);
  }, [sessionsList]);

  const allEventsOverall = useMemo(() => {
    return aggregateStatsList(allEventsBreakdown.map((row) => row.stats));
  }, [allEventsBreakdown]);
  const useCachedOverallStats = statsViewMode === "standard" && !hasActiveDateFilter && !hasActiveTagFilter;
  const effectiveOverallStats = useCachedOverallStats ? overallStatsForEvent : null;
  const allowOverallDerivedMetrics =
    statsViewMode === "time" || !effectiveOverallStats || showAllActive || isAllLoaded;

  useEffect(() => {
    if (!hasActiveDateFilter || statsViewMode !== "standard" || !isSolveLevelMode) return;
    if (isAllLoaded || loadingAllSolves) return;
    loadAllSessionSolves();
  }, [
    hasActiveDateFilter,
    isAllLoaded,
    isSolveLevelMode,
    loadAllSessionSolves,
    loadingAllSolves,
    statsViewMode,
  ]);

  useEffect(() => {
    if (!hasActiveTagFilter) return;
    if (canUseIndexedTagScope) return;
    loadTimeScopeSolves();
  }, [canUseIndexedTagScope, hasActiveTagFilter, loadTimeScopeSolves]);

  const loadedSolveCountForSummary =
    statsViewMode === "time" ? summaryCurrentSolves.length : activeStandardSolves.length;

  const overallCount = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves.length;
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? null;
    return effectiveOverallStats?.SolveCountTotal ?? allLoadedFilteredRawSolves.length ?? null;
  }, [statsViewMode, allLoadedFilteredRawSolves.length, isAllEventsMode, allEventsOverall, effectiveOverallStats]);

  const showingCount = useMemo(() => {
    if (statsViewMode === "time") return visiblePageFilteredRawSolves?.length || 0;
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? 0;
    if (isAllSessionsMode) return effectiveOverallStats?.SolveCountTotal ?? (visiblePageFilteredRawSolves?.length || 0);
    return visiblePageFilteredRawSolves?.length || 0;
  }, [statsViewMode, isAllEventsMode, isAllSessionsMode, allEventsOverall, effectiveOverallStats, visiblePageFilteredRawSolves]);

  const dateRangeText = useMemo(() => {
    if (!visiblePageFilteredRawSolves || visiblePageFilteredRawSolves.length === 0) return "";
    const first = visiblePageFilteredRawSolves[0]?.datetime;
    const last = visiblePageFilteredRawSolves[visiblePageFilteredRawSolves.length - 1]?.datetime;
    if (!first || !last) return "";

    const fmt = (iso) => {
      const d = new Date(iso);
      if (!isFiniteDate(d)) return "";
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const a = fmt(first);
    const b = fmt(last);
    if (!a || !b) return "";
    return `${a} - ${b}`;
  }, [visiblePageFilteredRawSolves]);

  const dateFilterLabel = useMemo(() => {
    const formatDay = (dayKey) => {
      if (!dayKey) return "";
      const date = new Date(`${dayKey}T12:00:00`);
      if (!isFiniteDate(date)) return dayKey;
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    if (!dateFilterStart && !dateFilterEnd) return dateRangeText || "All Dates";
    if (dateFilterStart && dateFilterEnd) return `${formatDay(dateFilterStart)} - ${formatDay(dateFilterEnd)}`;
    if (dateFilterStart) return `${formatDay(dateFilterStart)} onward`;
    return `Through ${formatDay(dateFilterEnd)}`;
  }, [dateFilterEnd, dateFilterStart, dateRangeText]);

  const availableTimeDays = useMemo(() => {
    const set = new Set();

    for (const solve of visiblePageFilteredRawSolves || []) {
      const date = new Date(solve?.datetime || "");
      if (!isFiniteDate(date)) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      set.add(key);
    }

    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)));
  }, [visiblePageFilteredRawSolves]);

  useEffect(() => {
    if (!availableTimeDays.length) {
      if (selectedTimeDay) setSelectedTimeDay("");
      return;
    }

    if (selectedTimeDay && availableTimeDays.includes(selectedTimeDay)) return;
    setSelectedTimeDay(availableTimeDays[0]);
  }, [availableTimeDays, selectedTimeDay]);

  const handleEventChange = useCallback(
    (event) => {
      const next = event.target.value;

      setStatsEvent(next);
      setSessionMenuOpen(false);

      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);

      setPageCursor(null);
      setHasMoreOlder(false);
      setIsAllLoaded(false);
      setShowAllActive(false);

      setTagFilterSelection(makeEmptyTagSelection());

      if (statsViewMode === "time") {
        const nextSession = next === ALL_EVENTS ? ALL_SESSIONS : ALL_SESSIONS;
        setTimeSelection({ event: next, session: nextSession });
        setStatsSession(nextSession);
      } else {
        setStatsSession("main");
        setStandardSelection({ event: next, session: "main" });
      }
    },
    [DEFAULT_IN_VIEW, statsViewMode]
  );

  const handlePickSession = useCallback(
    (sid) => {
      setStatsSession(sid);
      setSessionMenuOpen(false);

      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);

      setPageCursor(null);
      setHasMoreOlder(false);
      setIsAllLoaded(false);
      setShowAllActive(false);

      setTagFilterSelection(makeEmptyTagSelection());

      if (statsViewMode === "time") {
        setTimeSelection((prev) => ({ ...prev, session: sid }));
      } else {
        setStandardSelection((prev) => ({ ...prev, session: sid }));
      }
    },
    [DEFAULT_IN_VIEW, statsViewMode]
  );

  const handleAddCompareRow = useCallback(() => {
    setCompareSelection({
      event: statsEvent || currentEvent || "333",
      session: sessionId || "main",
      tags: sanitizeTagSelection(tagFilterSelection),
      paletteKey: DEFAULT_COMPARE_PALETTE,
      primaryPaletteKey,
    });
    setCompareSessionMenuOpen(false);
  }, [currentEvent, primaryPaletteKey, sessionId, statsEvent, tagFilterSelection]);

  const handleRemoveCompareRow = useCallback(() => {
    setCompareSelection(null);
    setCompareSessionMenuOpen(false);
    setCompareSessionSolves([]);
    setCompareTagScopeSolves([]);
    setCompareTagScopeCacheKey("");
    setCompareLoading(false);
  }, []);

  const updateCompareSelection = useCallback((patch) => {
    setCompareSelection((prev) => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const handleSetViewMode = useCallback((nextMode) => {
    setStatsViewMode(nextMode);
    setSessionMenuOpen(false);

    if (nextMode === "time") {
      const latestSolve = [...(sessionCachedSolves || [])]
        .filter(Boolean)
        .sort((a, b) => {
          const ta = new Date(a?.datetime || "").getTime();
          const tb = new Date(b?.datetime || "").getTime();
          return tb - ta;
        })[0];
      const defaultDay = getLocalDayKey(getSolveDate(latestSolve) || new Date()) || getTodayLocalDayKey();

      setDateFilterStart(defaultDay);
      setDateFilterEnd(defaultDay);
      setTimeSelection({
        event: ALL_EVENTS,
        session: ALL_SESSIONS,
      });
      return;
    }

    setStandardSelection((prev) => ({
      event: prev?.event || currentEvent || "333",
      session: prev?.session || currentSession || "main",
    }));
  }, [currentEvent, currentSession, sessionCachedSolves]);

  const handleDeleteSolve = useCallback(
    async (solveRefOrIndex) => {
      if (!isSolveLevelMode) return;
      const solveRef =
        typeof solveRefOrIndex === "string"
          ? solveRefOrIndex
          : Number.isInteger(solveRefOrIndex)
          ? visiblePageFilteredRawSolves?.[solveRefOrIndex]?.solveRef ||
            selectedSessionSolves?.[solveRefOrIndex]?.solveRef ||
            null
          : solveRefOrIndex?.solveRef || null;
      if (!solveRef) return;

      setSessions((prev) => {
        const ev = String(statsEvent || "").toUpperCase();
        const existingForEvent = Array.isArray(prev?.[ev]) ? prev[ev] : [];
        return {
          ...prev,
          [ev]: existingForEvent.filter((s) => String(s?.solveRef || "") !== String(solveRef)).sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          }),
        };
      });

      await deleteTime(statsEvent, solveRef);

      try {
        if (user?.UserID && !isAllEventsMode && !isAllSessionsMode && !hasActiveTagFilter) {
          setLoadingOverallStats(true);
          const item = await getSessionStats(
            user.UserID,
            String(statsEvent || "").toUpperCase(),
            String(sessionId || "main")
          );
          setOverallStatsForEvent(item || null);
        }
      } catch (e) {
        console.error("Failed to refresh overall stats after delete:", e);
      } finally {
        setLoadingOverallStats(false);
      }
    },
    [
      setSessions,
      deleteTime,
      statsEvent,
      sessionId,
      selectedSessionSolves,
      visiblePageFilteredRawSolves,
      isSolveLevelMode,
      user?.UserID,
      isAllEventsMode,
      isAllSessionsMode,
      hasActiveTagFilter,
    ]
  );

  const handlePreviousPage = useCallback(async () => {
    if (!isSolveLevelMode) return;

    if (currentPage < maxPage) {
      setCurrentPage((p) => Math.min(maxPage, p + 1));
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      await fetchNextOlderPage();
      setCurrentPage((p) => p + 1);
    }
  }, [
    currentPage,
    maxPage,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    fetchNextOlderPage,
    isSolveLevelMode,
  ]);

  const handleNextPage = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCurrentPage((p) => Math.max(0, p - 1));
  }, [isSolveLevelMode]);

  const handleZoomIn = useCallback(() => {
    if (!isSolveLevelMode) return;
    setSolvesPerPage((prev) => getNextSmallerSolveWindow(prev));
    setCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleZoomOut = useCallback(async () => {
    if (!isSolveLevelMode) return;

    if (solvesPerPage < activeStandardSolves.length) {
      setSolvesPerPage((prev) => Math.min(getNextLargerSolveWindow(prev), activeStandardSolves.length));
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      await fetchNextOlderPage();
      setSolvesPerPage((prev) => getNextLargerSolveWindow(prev));
      setCurrentPage(0);
    }
  }, [
    solvesPerPage,
    activeStandardSolves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    fetchNextOlderPage,
    isSolveLevelMode,
  ]);

  const handleDecreaseSolveCount = useCallback(() => {
    if (!isSolveLevelMode) return;
    setSolvesPerPage((prev) => Math.max(1, prev - 1));
    setCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleIncreaseSolveCount = useCallback(async () => {
    if (!isSolveLevelMode) return;

    if (solvesPerPage < activeStandardSolves.length) {
      setSolvesPerPage((prev) => Math.min(prev + 1, activeStandardSolves.length));
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      await fetchNextOlderPage();
      setSolvesPerPage((prev) => prev + 1);
      setCurrentPage(0);
    }
  }, [
    solvesPerPage,
    activeStandardSolves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    fetchNextOlderPage,
    isSolveLevelMode,
  ]);

  const handleShowAll = useCallback(async () => {
    if (statsViewMode === "time") {
      await loadTimeScopeSolves();
      setCurrentPage(0);
      setShowAllActive(true);
      return;
    }

    if (!isSolveLevelMode) return;

    if (!hasMoreOlder) {
      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, activeStandardSolves.length));
      setCurrentPage(0);
      setShowAllActive(true);
      return;
    }

    await loadAllSessionSolves();
  }, [
    DEFAULT_IN_VIEW,
    activeStandardSolves.length,
    hasMoreOlder,
    isSolveLevelMode,
    loadTimeScopeSolves,
    loadAllSessionSolves,
    statsViewMode,
  ]);

  const compareTotalPages = useMemo(() => {
    const per = Math.max(1, compareSolvesPerPage);
    return Math.max(1, Math.ceil((compareFilteredRawSolves.length || 0) / per));
  }, [compareFilteredRawSolves.length, compareSolvesPerPage]);

  const compareMaxPage = compareTotalPages - 1;

  useEffect(() => {
    if (compareCurrentPage > compareMaxPage) {
      setCompareCurrentPage(compareMaxPage);
    }
  }, [compareCurrentPage, compareMaxPage]);

  const handleComparePreviousPage = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareCurrentPage((page) => Math.min(compareMaxPage, page + 1));
  }, [compareMaxPage, isSolveLevelMode]);

  const handleCompareNextPage = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareCurrentPage((page) => Math.max(0, page - 1));
  }, [isSolveLevelMode]);

  const handleCompareZoomIn = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareSolvesPerPage((prev) => getNextSmallerSolveWindow(prev));
    setCompareCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleCompareZoomOut = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareSolvesPerPage((prev) => Math.min(getNextLargerSolveWindow(prev), compareFilteredRawSolves.length));
    setCompareCurrentPage(0);
  }, [compareFilteredRawSolves.length, isSolveLevelMode]);

  const handleCompareDecreaseSolveCount = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareSolvesPerPage((prev) => Math.max(1, prev - 1));
    setCompareCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleCompareIncreaseSolveCount = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareSolvesPerPage((prev) => Math.min(prev + 1, compareFilteredRawSolves.length));
    setCompareCurrentPage(0);
  }, [compareFilteredRawSolves.length, isSolveLevelMode]);

  const handleCompareShowAll = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareShowAllActive(true);
    setCompareCurrentPage(0);
    setCompareSolvesPerPage(Math.max(DEFAULT_IN_VIEW, compareFilteredRawSolves.length));
  }, [DEFAULT_IN_VIEW, compareFilteredRawSolves.length, isSolveLevelMode]);

  const timeNavAnchorDay = useMemo(() => {
    if (dateFilterEnd) return dateFilterEnd;
    if (dateFilterStart) return dateFilterStart;

    const latestSolve = [...(allLoadedSolves || [])]
      .filter(Boolean)
      .sort((a, b) => {
        const ta = new Date(a?.datetime || "").getTime();
        const tb = new Date(b?.datetime || "").getTime();
        return tb - ta;
      })[0];

    return getLocalDayKey(getSolveDate(latestSolve) || new Date()) || getTodayLocalDayKey();
  }, [allLoadedSolves, dateFilterEnd, dateFilterStart]);

  const applyTimeRangePreset = useCallback((preset) => {
    if (preset === "all") {
      setDateFilterStart("");
      setDateFilterEnd("");
      return;
    }

    if (preset === "day") {
      setDateFilterStart(timeNavAnchorDay);
      setDateFilterEnd(timeNavAnchorDay);
      return;
    }

    if (preset === "week") {
      const range = getWeekRangeFromDayKey(timeNavAnchorDay);
      setDateFilterStart(range.start);
      setDateFilterEnd(range.end);
      return;
    }

    if (preset === "month") {
      const range = getMonthRangeFromDayKey(timeNavAnchorDay);
      setDateFilterStart(range.start);
      setDateFilterEnd(range.end);
    }
  }, [timeNavAnchorDay]);

  const shiftTimeRangeByDay = useCallback((direction) => {
    const baseDay = timeNavAnchorDay || getTodayLocalDayKey();
    const nextDay = shiftLocalDayKey(baseDay, direction);
    setDateFilterStart(nextDay);
    setDateFilterEnd(nextDay);
  }, [timeNavAnchorDay]);

  const handleRecomputeOverall = useCallback(async () => {
    if (!user?.UserID) return;
    if (isAllEventsMode) return;

    try {
      setLoadingOverallStats(true);
      const scopeLabel = isAllSessionsMode ? `${statsEvent} · all sessions` : `${statsEvent} · ${sessionId}`;
      setRecomputeStatusText(`Recomputing ${scopeLabel}...`);

      let updated = null;

      updated = await runDb("Recomputing stats", () =>
        isAllSessionsMode
          ? recomputeEventStats(user.UserID, statsEvent)
          : recomputeSessionStats(user.UserID, statsEvent, sessionId)
      );

      if (updated) {
        setOverallStatsForEvent(updated);
      } else if (isAllSessionsMode) {
        const item = await getEventStats(user.UserID, statsEvent);
        setOverallStatsForEvent(item || null);
      } else {
        const item = await getSessionStats(user.UserID, statsEvent, sessionId);
        setOverallStatsForEvent(item || null);
      }
      setRecomputeStatusText(`Recomputed ${scopeLabel}.`);
    } catch (e) {
      console.error("Recompute overall stats failed:", e);
      setRecomputeStatusText("Recompute failed.");
      try {
        if (isAllSessionsMode) {
          const item = await getEventStats(user.UserID, statsEvent);
          setOverallStatsForEvent(item || null);
        } else {
          const item = await getSessionStats(user.UserID, statsEvent, sessionId);
          setOverallStatsForEvent(item || null);
        }
      } catch (e2) {
        console.error("Refetch after recompute failed:", e2);
      }
    } finally {
      setLoadingOverallStats(false);
    }
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    isAllEventsMode,
    isAllSessionsMode,
    runDb,
  ]);

  const slugify = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

  const createImportSession = useCallback(
    async (evUpper, desiredName) => {
      const userID = user?.UserID;
      if (!userID) throw new Error("No user");

      const cleanEvent = String(evUpper || "").toUpperCase();
      const baseName = String(desiredName || "").trim() || `Import ${new Date().toLocaleString()}`;
      const sid = `import_${slugify(baseName)}_${Date.now()}`;

      try {
        await runDb("Creating import session", () =>
          createSession(userID, cleanEvent, sid, baseName)
        );
      } catch (e) {
        try {
          await runDb(
            "Creating import session",
            () => createSession(userID, cleanEvent, baseName),
            { minLoadingMs: 400 }
          );
        } catch (e2) {
          console.error("createImportSession failed:", e, e2);
          throw e2;
        }
      }

      return sid;
    },
    [runDb, user?.UserID]
  );

  const handleImportSolves = useCallback(
    async ({ parsedSolves, destination }) => {
      const userID = user?.UserID;
      if (!userID) return;
      if (isAllEventsMode) return;

      const destKind = destination?.kind || "existing";
      const destExistingID = destination?.sessionID ? String(destination.sessionID) : null;
      const destNewName = destination?.sessionName ? String(destination.sessionName) : "";

      const normalized = (parsedSolves || [])
        .map((s) => {
          const ev = String(s.event || statsEvent || "").toUpperCase();
          const time = Number(s.time);
          if (!Number.isFinite(time) || time < 0) return null;

          return {
            time,
            scramble: s.scramble || "",
            event: ev,
            penalty: s.penalty ?? null,
            note: s.note ?? "",
            datetime: s.datetime || new Date().toISOString(),
            tags: {
              SolveSource: String(s?.tags?.SolveSource || "").trim() || "Import",
              ...(s.tags || {}),
            },
            originalTime: s.originalTime ?? undefined,
          };
        })
        .filter(Boolean);

      if (normalized.length === 0) return;

      const byEvent = new Map();
      for (const s of normalized) {
        const ev = s.event;
        if (!byEvent.has(ev)) byEvent.set(ev, []);
        byEvent.get(ev).push(s);
      }

      setImportBusy(true);
      setImportProgress({
        phase: "starting",
        completed: 0,
        total: normalized.length,
        label: `Preparing import (0/${normalized.length})`,
      });
      try {
        await runDb("Importing solves", async () => {
        const results = [];
        let overallCompleted = 0;
        const overallTotal = normalized.length;

        for (const [ev, solvesForEv] of byEvent.entries()) {
          let destSessionForThisEvent = String(sessionId || "main");

          if (destKind === "existing") {
            destSessionForThisEvent = destExistingID || String(sessionId || "main");
          } else {
            destSessionForThisEvent = await createImportSession(ev, destNewName || `Import ${ev}`);
          }

          const completedBeforeEvent = overallCompleted;
          const eventTotal = solvesForEv.length;

          const res = await importSolvesBatch(
            userID,
            ev,
            destSessionForThisEvent,
            solvesForEv,
            {
              onProgress: (p) => {
                const done = completedBeforeEvent + Math.min(eventTotal, Number(p?.completedSolves || 0));
                const phase = String(p?.phase || "writing");
                const label =
                  phase === "recompute"
                    ? `Recomputing stats… (${done}/${overallTotal})`
                    : `Importing solves… (${done}/${overallTotal})`;

                setImportProgress({
                  phase,
                  completed: done,
                  total: overallTotal,
                  label,
                });
              },
            }
          );
          results.push({ ev, destSessionForThisEvent, res });
          overallCompleted += eventTotal;
        }

        setSessions((prev) => {
          const next = { ...(prev || {}) };

          for (const { ev, destSessionForThisEvent, res } of results) {
            const added = (res?.addedSolves || []).map((solve) => ({
              ...solve,
              sessionID: solve?.sessionID || solve?.SessionID || destSessionForThisEvent,
            }));
            const existing = Array.isArray(next[ev]) ? next[ev] : [];
            const merged = [...existing, ...added];

            merged.sort((a, b) => {
              const ta = new Date(a.datetime).getTime();
              const tb = new Date(b.datetime).getTime();
              return ta - tb;
            });

            next[ev] = merged;
          }

          return next;
        });

          try {
            if (!isAllSessionsMode) {
              const item = await getSessionStats(
                userID,
                String(statsEvent || "").toUpperCase(),
                String(sessionId || "main")
              );
              setOverallStatsForEvent(item || null);
            } else {
              const aggregated = getEventAggregateFromSessionsList(sessionsList, statsEvent);
              setOverallStatsForEvent(aggregated || null);
            }
          } catch (_) {}

          setShowImport(false);
        });
      } catch (e) {
        console.error("Import failed:", e);
        alert("Import failed. Check console for details.");
      } finally {
        setImportBusy(false);
        setImportProgress(null);
      }
    },
    [
      user?.UserID,
      statsEvent,
      sessionId,
      setSessions,
      createImportSession,
      isAllEventsMode,
      isAllSessionsMode,
      sessionsList,
      runDb,
    ]
  );

  const canOlder =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    (currentPage < maxPage || (hasMoreOlder && !loadingMore && !isAllLoaded));

  const canNewer = statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && currentPage > 0;
  const canZoomIn = statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && solvesPerPage > 5;
  const canZoomOut =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    ((activeStandardSolves.length > 0 && solvesPerPage < activeStandardSolves.length) ||
      (hasMoreOlder && !loadingMore && !isAllLoaded));
  const canDecreaseSolveCount =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && solvesPerPage > 1;
  const canIncreaseSolveCount =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    ((activeStandardSolves.length > 0 && solvesPerPage < activeStandardSolves.length) ||
      (hasMoreOlder && !loadingMore && !isAllLoaded));
  const canShowAll =
    statsViewMode === "time"
      ? false
      : isSolveLevelMode && !!user?.UserID && !loadingAllSolves && !showAllActive;

  const compareCanOlder =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    compareCurrentPage < compareMaxPage;
  const compareCanNewer =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && compareCurrentPage > 0;
  const compareCanZoomIn =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && compareSolvesPerPage > 5;
  const compareCanZoomOut =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    compareSolvesPerPage < compareFilteredRawSolves.length;
  const compareCanDecreaseSolveCount =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && compareSolvesPerPage > 1;
  const compareCanIncreaseSolveCount =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    compareSolvesPerPage < compareFilteredRawSolves.length;
  const compareCanShowAll =
    statsViewMode === "time"
      ? false
      : isSolveLevelMode &&
        !!user?.UserID &&
        !compareLoading &&
        !compareShowAllActive &&
        compareFilteredRawSolves.length > 0;

  const canRecomputeOverall =
    statsViewMode === "standard" &&
    !!user?.UserID &&
    !loadingOverallStats &&
    !isAllEventsMode &&
    !hasActiveDateFilter &&
    !hasActiveTagFilter;

  const primaryStatsLoading = loadingInitial || loadingTimeScope || loadingTagScope;
  const primarySummaryLoading = primaryStatsLoading;
  const primaryOverallSummaryLoading = primaryStatsLoading || loadingOverallStats;
  const compareSummaryLoading = compareEnabled && compareLoading;
  const chartCardsLoading = primaryStatsLoading || compareSummaryLoading;

  const headerStatusText = useMemo(() => {
    if (compareEnabled && statsViewMode === "standard") {
      if (compareLoading) return "Loading compare solves…";
      return "";
    }
    if (statsViewMode === "time") {
      if (loadingTimeScope) return "Loading solves for time view…";
      return hasActiveDateFilter
        ? `Showing all ${allLoadedFilteredRawSolves.length} solves in the selected date range`
        : `Showing all ${allLoadedFilteredRawSolves.length} solves across all dates`;
    }
    if (loadingTagScope) return "Loading solves for selected tag…";
    if (loadingInitial) return "Loading solves…";
    if (loadingAllSolves) return "Loading ALL solves…";
    if (hasActiveTagFilter) return "Showing solves for the selected shared tag filters";
    if (hasActiveDateFilter) return "Showing all solves in the selected date range";
    if (loadingMore) return "Loading older solves…";
    if (isAllEventsMode) return "Cached overall stats for all events";
    if (isAllSessionsMode) return `Cached overall stats for ${statsEvent}`;
    if (showAllActive) return "All solves loaded";
    if (isAllLoaded) return "Loaded solves currently in memory for this session";
    if (hasMoreOlder) return "";
    return "";
  }, [compareEnabled, compareLoading, statsViewMode, loadingTimeScope, loadingTagScope, allLoadedFilteredRawSolves.length, hasActiveTagFilter, hasActiveDateFilter, loadingInitial, loadingAllSolves, loadingMore, isAllEventsMode, isAllSessionsMode, statsEvent, showAllActive, isAllLoaded, hasMoreOlder]);

  const eventSelectLabel = useMemo(() => {
    if (statsEvent === ALL_EVENTS) return "All Events";
    if (statsEvent === "333") return "3x3";
    return statsEvent;
  }, [statsEvent]);

  const selectedSessionDisplay = useMemo(() => {
    if (statsSession === ALL_SESSIONS) return "All Sessions";
    const found = sessionsForEvent.find((s) => s.SessionID === statsSession);
    return found?.SessionName || statsSession || "main";
  }, [statsSession, sessionsForEvent]);

  const selectedTagLabel = useMemo(() => {
    return hasActiveTagFilter ? summarizeTagSelection(tagFilterSelection, safeTagConfig) : "";
  }, [hasActiveTagFilter, safeTagConfig, tagFilterSelection]);

  const compareSessionDisplay = useMemo(() => {
    const found = compareSessionsForEvent.find((s) => s.SessionID === compareSessionId);
    return found?.SessionName || compareSessionId || "main";
  }, [compareSessionId, compareSessionsForEvent]);

  const compareEventLabel = useMemo(() => {
    if (!compareEvent) return "";
    return compareEvent === "333" ? "3x3" : compareEvent;
  }, [compareEvent]);

  const compareTagLabel = useMemo(() => {
    if (!compareSelection) return "All shared tags";
    return summarizeTagSelection(compareTagSelection, safeTagConfig);
  }, [compareSelection, compareTagSelection, safeTagConfig]);

  const compareLegendItems = useMemo(() => {
    if (!compareEnabled) return [];
    return [
      {
        id: "primary",
        label: `${eventSelectLabel} · ${selectedSessionDisplay}${selectedTagLabel ? ` · ${selectedTagLabel}` : ""}`,
        color: resolveSeriesColor(primaryCompareStyle, 0.5, profileChartStyle?.primary || "#2EC4B6"),
      },
      {
        id: "compare",
        label: `${compareEventLabel} · ${compareSessionDisplay}${compareTagLabel ? ` · ${compareTagLabel}` : ""}`,
        color: resolveSeriesColor(compareStyle, 0.5, "#7c8cff"),
      },
    ];
  }, [
    compareEnabled,
    compareEventLabel,
    compareSessionDisplay,
    compareStyle,
    compareTagLabel,
    eventSelectLabel,
    profileChartStyle,
    primaryCompareStyle,
    selectedSessionDisplay,
    selectedTagLabel,
  ]);

  const primaryAccentColor = compareEnabled
    ? resolveSeriesColor(primaryCompareStyle, 0.5, profileChartStyle?.primary || "#2EC4B6")
    : profileChartStyle?.primary || "#2EC4B6";
  const compareAccentColor = resolveSeriesColor(compareStyle, 0.5, "#7c8cff");

  const compareSelectedTagSummaryLabel = useMemo(() => {
    if (!compareSelection || !hasActiveTagSelection(compareTagSelection)) return "";
    return compareTagLabel;
  }, [compareSelection, compareTagLabel, compareTagSelection]);

  const primaryPaletteLabel = useMemo(() => {
    return paletteOptions.find((option) => option.value === primaryPaletteKey)?.label || "Default";
  }, [paletteOptions, primaryPaletteKey]);

  const comparePaletteLabel = useMemo(() => {
    return (
      paletteOptions.find((option) => option.value === (compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE))
        ?.label || "Default"
    );
  }, [compareSelection?.paletteKey, paletteOptions]);

  const showEventBreakdownCard = statsViewMode === "time" && isAllEventsMode;

  const summaryMode =
    statsViewMode === "time"
      ? "session"
      : isAllEventsMode
        ? "all-events"
        : isAllSessionsMode
          ? "event-overall"
          : "session";

  const currentSummaryStatShare = useMemo(() => {
    const bestVisibleSingle =
      visiblePageFilteredRawSolves
        ?.map((solve) => Number(solve?.time))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b)?.[0] ?? null;

    return {
      title: statsViewMode === "time" && isAllEventsMode
        ? "Time View Summary"
        : isAllEventsMode
          ? "All Events Summary"
          : `${eventSelectLabel} Current Summary`,
      contextLabel: isAllEventsMode && statsViewMode !== "time"
        ? "Across all tracked events"
        : isAllSessionsMode
          ? `${eventSelectLabel} · visible solves`
          : `${eventSelectLabel} · ${selectedSessionDisplay}`,
      highlightValue:
        bestVisibleSingle != null ? `Best ${formatShareTime(bestVisibleSingle)}` : `${showingCount} solves`,
      detailLines: [`${showingCount} visible solves`, headerStatusText || null].filter(Boolean),
    };
  }, [
    eventSelectLabel,
    headerStatusText,
    isAllEventsMode,
    isAllSessionsMode,
    statsViewMode,
    selectedSessionDisplay,
    showingCount,
    visiblePageFilteredRawSolves,
  ]);

  const overallSummaryStatShare = useMemo(() => {
    const bestOverallSingle =
      effectiveOverallStats?.BestSingleMs ??
      allLoadedFilteredRawSolves
        ?.map((solve) => Number(solve?.time))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b)?.[0] ??
      null;

    return {
      title: `${eventSelectLabel} Overall Summary`,
      contextLabel: isAllSessionsMode
        ? `${eventSelectLabel} · all sessions`
        : `${eventSelectLabel} · ${selectedSessionDisplay}`,
      highlightValue:
        bestOverallSingle != null ? `Best ${formatShareTime(bestOverallSingle)}` : `${overallCount} solves`,
      detailLines: [
        overallCount != null ? `${overallCount} total solves` : null,
        headerStatusText || null,
      ].filter(Boolean),
    };
  }, [
    allLoadedFilteredRawSolves,
    eventSelectLabel,
    headerStatusText,
    isAllSessionsMode,
    overallCount,
    effectiveOverallStats,
    selectedSessionDisplay,
  ]);

  const cardDefinitions = useMemo(() => {
    const sharedScope = isAllEventsMode ? "all-events" : isAllSessionsMode ? "all-sessions" : "session";
    const baseSummaryRender = {
      solves: serializeSharedSolves(visiblePageFilteredRawSolves, 500),
      overallSolves: serializeSharedSolves(allLoadedFilteredRawSolves, 1000),
      overallStats: effectiveOverallStats || null,
      allEventsBreakdown: statsViewMode === "time" ? null : isAllEventsMode ? allEventsBreakdown : null,
      mode: summaryMode,
      selectedEvent: eventSelectLabel,
      selectedSession: selectedSessionDisplay,
      loadedSolveCount: loadedSolveCountForSummary,
      showCurrentMetrics: currentPage === 0,
      viewMode: statsViewMode,
      selectedDay: selectedTimeDay || "",
    };
    const compareSummaryRender = {
      solves: serializeSharedSolves(compareVisiblePageFilteredRawSolves, 500),
      overallSolves: serializeSharedSolves(compareFilteredRawSolves, 1000),
      overallStats: null,
      allEventsBreakdown: null,
      mode: "session",
      selectedEvent: compareEventLabel,
      selectedSession: compareSessionDisplay,
      selectedTagLabel: compareSelectedTagSummaryLabel,
      loadedSolveCount: compareFilteredRawSolves.length,
      showCurrentMetrics: currentPage === 0,
      viewMode: "standard",
      selectedDay: "",
    };
    const currentSummaryConfig = isAllEventsMode && statsViewMode !== "time"
      ? { chart: "statsSummary", scope: "all-events", viewMode: statsViewMode }
      : {
          chart: "statsSummary",
          section: "current",
          event: statsEvent,
          session: isAllSessionsMode ? "all" : sessionId,
          scope: sharedScope,
          viewMode: statsViewMode,
        };
    const overallSummaryConfig = {
      chart: "statsSummary",
      section: "overall",
      event: statsEvent,
      session: isAllSessionsMode ? "all" : sessionId,
      scope: sharedScope,
      viewMode: statsViewMode,
    };

    const cards = [];

    if (compareEnabled && !isAllEventsMode && statsViewMode !== "time") {
      cards.push(
        {
          id: "summary-compare-primary-current",
          key: "summary-compare-primary-current",
          title: `${eventSelectLabel} Current Summary`,
          subtitle: `${selectedSessionDisplay}${selectedTagLabel ? ` · ${selectedTagLabel}` : ""}`,
          profileConfig: currentSummaryConfig,
          statShare: {
            ...currentSummaryStatShare,
            cardKey: "summary-compare-primary-current",
            render: {
              cardKey: "summary-compare-primary-current",
              ...baseSummaryRender,
            },
            kind: "summary",
            snapshot: {
              metrics: [
                { label: "Visible", value: showingCount },
                { label: "Best", value: currentSummaryStatShare.highlightValue },
              ],
            },
          },
        },
        {
          id: "summary-compare-primary-overall",
          key: "summary-compare-primary-overall",
          title: `${eventSelectLabel} Overall Summary`,
          subtitle: `${selectedSessionDisplay}${selectedTagLabel ? ` · ${selectedTagLabel}` : ""}`,
          profileConfig: overallSummaryConfig,
          statShare: {
            ...overallSummaryStatShare,
            cardKey: "summary-compare-primary-overall",
            render: {
              cardKey: "summary-compare-primary-overall",
              ...baseSummaryRender,
            },
            kind: "summary",
            snapshot: {
              metrics: [
                { label: "Total", value: overallCount ?? showingCount },
                { label: "Best", value: overallSummaryStatShare.highlightValue },
              ],
            },
          },
        },
        {
          id: "summary-compare-secondary-current",
          key: "summary-compare-secondary-current",
          title: `${compareEventLabel} Current Summary`,
          subtitle: `${compareSessionDisplay}${compareSelectedTagSummaryLabel ? ` · ${compareSelectedTagSummaryLabel}` : ""}`,
          profileConfig: {
            chart: "statsSummary",
            section: "compare-current",
            event: compareEvent,
            session: compareSessionId,
            scope: "session",
            viewMode: "standard",
          },
          statShare: {
            title: `${compareEventLabel} Current Summary`,
            contextLabel: `${compareSessionDisplay}${compareSelectedTagSummaryLabel ? ` · ${compareSelectedTagSummaryLabel}` : ""}`,
            highlightValue: `${compareVisiblePageFilteredRawSolves.length} solves`,
            detailLines: [`${compareVisiblePageFilteredRawSolves.length} visible solves`],
            cardKey: "summary-compare-secondary-current",
            render: {
              cardKey: "summary-compare-secondary-current",
              ...compareSummaryRender,
            },
            kind: "summary",
            snapshot: {
              metrics: [
                { label: "Visible", value: compareVisiblePageFilteredRawSolves.length },
                { label: "Total", value: compareFilteredRawSolves.length },
              ],
            },
          },
        },
        {
          id: "summary-compare-secondary-overall",
          key: "summary-compare-secondary-overall",
          title: `${compareEventLabel} Overall Summary`,
          subtitle: `${compareSessionDisplay}${compareSelectedTagSummaryLabel ? ` · ${compareSelectedTagSummaryLabel}` : ""}`,
          profileConfig: {
            chart: "statsSummary",
            section: "compare-overall",
            event: compareEvent,
            session: compareSessionId,
            scope: "session",
            viewMode: "standard",
          },
          statShare: {
            title: `${compareEventLabel} Overall Summary`,
            contextLabel: `${compareSessionDisplay}${compareSelectedTagSummaryLabel ? ` · ${compareSelectedTagSummaryLabel}` : ""}`,
            highlightValue: `${compareFilteredRawSolves.length} solves`,
            detailLines: [`${compareFilteredRawSolves.length} total solves`],
            cardKey: "summary-compare-secondary-overall",
            render: {
              cardKey: "summary-compare-secondary-overall",
              ...compareSummaryRender,
            },
            kind: "summary",
            snapshot: {
              metrics: [
                { label: "Visible", value: compareVisiblePageFilteredRawSolves.length },
                { label: "Total", value: compareFilteredRawSolves.length },
              ],
            },
          },
        }
      );
    } else {
      cards.push({
        id: buildStatCardKey(currentSummaryConfig),
        key: isAllEventsMode ? "summary" : "summary-current",
        title: currentSummaryStatShare.title,
        subtitle: currentSummaryStatShare.contextLabel,
        profileConfig: currentSummaryConfig,
        statShare: {
          ...currentSummaryStatShare,
          cardKey: isAllEventsMode ? "summary" : "summary-current",
          render: {
            cardKey: isAllEventsMode ? "summary" : "summary-current",
            ...baseSummaryRender,
          },
          kind: "summary",
          snapshot: {
            metrics: [
              { label: "Visible", value: showingCount },
              { label: "Best", value: currentSummaryStatShare.highlightValue },
            ],
          },
        },
      });
    }

    if (!compareEnabled && !isAllEventsMode && statsViewMode !== "time") {
      cards.push({
        id: buildStatCardKey(overallSummaryConfig),
        key: "summary-overall",
        title: overallSummaryStatShare.title,
        subtitle: overallSummaryStatShare.contextLabel,
        profileConfig: overallSummaryConfig,
        statShare: {
          ...overallSummaryStatShare,
          cardKey: "summary-overall",
          render: {
            cardKey: "summary-overall",
            ...baseSummaryRender,
          },
          kind: "summary",
          snapshot: {
            metrics: [
              { label: "Total", value: overallCount ?? showingCount },
              { label: "Best", value: overallSummaryStatShare.highlightValue },
            ],
          },
        },
      });
    }

    if (isSolveLevelMode) {
      cards.push(
        {
          id: buildStatCardKey({
            chart: "lineChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "line",
          title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
          subtitle: "Line Chart",
          profileConfig: {
            chart: "lineChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            subtitle: "Line Chart",
            seriesStyle: primaryCompareStyle,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "line",
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            contextLabel: "Line Chart",
            highlightValue: dateRangeText || `${showingCount} solves`,
            detailLines: [`${showingCount} visible solves`, headerStatusText].filter(Boolean),
            render: {
              cardKey: "line",
              solves: serializeSharedSolves(visiblePageFilteredRawSolves, 500),
              seriesStyle: primaryCompareStyle,
              legendItems: compareLegendItems,
              currentEvent: statsEvent,
              currentSession: sessionId,
              eventKey: statsEvent,
              viewMode: statsViewMode,
              selectedDay: selectedTimeDay || "",
            },
            kind: "line",
            snapshot: buildLineSnapshot(visiblePageFilteredRawSolves),
          },
        },
        {
          id: buildStatCardKey({
            chart: "percentBar",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "percent",
          title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
          subtitle: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution",
          profileConfig: {
            chart: "percentBar",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            subtitle: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution",
            legendItems: compareLegendItems,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "percent",
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            contextLabel: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution",
            highlightValue: `${pieChartSolves?.length || 0} solves`,
            detailLines: [showEventBreakdownCard ? "Breakdown by event" : "Distribution by solve time", headerStatusText].filter(Boolean),
            render: {
              cardKey: "percent",
              solves: serializeSharedSolves(pieChartSolves, 500),
              legendItems: compareLegendItems,
              title: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution by Time",
            },
            kind: showEventBreakdownCard ? "event-breakdown" : "distribution",
            snapshot: buildHistogramSnapshot(pieChartSolves, 7),
          },
        },
        {
          id: buildStatCardKey({
            chart: "barChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "bar",
          title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
          subtitle: "Bar Chart",
          profileConfig: {
            chart: "barChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            subtitle: "Bar Chart",
            seriesStyle: primaryCompareStyle,
            legendItems: compareLegendItems,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "bar",
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            contextLabel: "Bar Chart",
            highlightValue: `${barChartSolves?.length || 0} solves`,
            detailLines: ["Solve-time histogram", headerStatusText].filter(Boolean),
            render: {
              cardKey: "bar",
              solves: serializeSharedSolves(barChartSolves, 500),
              seriesStyle: primaryCompareStyle,
              legendItems: compareLegendItems,
            },
            kind: "bar",
            snapshot: buildHistogramSnapshot(barChartSolves, 10),
          },
        },
        {
          id: buildStatCardKey({
            chart: "timeTable",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "table",
          title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
          subtitle: "Time Table",
          profileConfig: {
            chart: "timeTable",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            subtitle: "Time Table",
            seriesStyle: primaryCompareStyle,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "table",
            title: buildStatCardTitle(eventSelectLabel, selectedSessionDisplay),
            contextLabel: "Time Table",
            highlightValue: `${allLoadedFilteredRawSolves?.length || 0} loaded solves`,
            detailLines: ["Recent solve list and averages", headerStatusText].filter(Boolean),
            render: {
              cardKey: "table",
              solves: serializeSharedSolves(allLoadedFilteredRawSolves, 1000),
              seriesStyle: primaryCompareStyle,
              currentEvent: statsEvent,
              currentSession: sessionId,
              eventKey: statsEvent,
            },
            kind: "table",
            snapshot: buildRecentTimesSnapshot(allLoadedFilteredRawSolves),
          },
        }
      );
    }

    return cards;
  }, [
    allLoadedFilteredRawSolves,
    barChartSolves,
    compareEnabled,
    compareEvent,
    compareEventLabel,
    compareFilteredRawSolves,
    compareSelectedTagSummaryLabel,
    compareSessionDisplay,
    compareSessionId,
    compareLegendItems,
    compareVisiblePageFilteredRawSolves,
    dateRangeText,
    eventSelectLabel,
    headerStatusText,
    isAllEventsMode,
    isAllSessionsMode,
    isSolveLevelMode,
    pieChartSolves,
    selectedTagLabel,
    selectedSessionDisplay,
    sessionId,
    showEventBreakdownCard,
    showingCount,
    loadedSolveCountForSummary,
    summaryMode,
    statsEvent,
    statsViewMode,
    visiblePageFilteredRawSolves,
    allEventsBreakdown,
    overallCount,
    effectiveOverallStats,
    currentPage,
    primaryCompareStyle,
    selectedTimeDay,
    currentSummaryStatShare,
    overallSummaryStatShare,
  ]);

  const focusedCard = useMemo(
    () => cardDefinitions.find((item) => item.id === focusedCardId) || null,
    [cardDefinitions, focusedCardId]
  );

  const favoriteKeys = useMemo(() => {
    const items = Array.isArray(user?.FavoriteStats) ? user.FavoriteStats : [];
    return new Set(items.map((item) => buildStatCardKey(item)).filter(Boolean));
  }, [user?.FavoriteStats]);

  const isFocusedCardFavorited = focusedCard ? favoriteKeys.has(focusedCard.id) : false;

  const openCardFocus = useCallback((cardId) => {
    setFocusedCardId(cardId);
    setFocusActionMessage("");
  }, []);

  const closeCardFocus = useCallback(() => {
    setFocusedCardId("");
    setFocusActionMessage("");
    setFocusActionBusy("");
  }, []);

  const openSolveDetail = useCallback(
    (solve) => {
      if (!solve) return;
      setSelectedSolve({ ...solve, userID: user?.UserID });
    },
    [user?.UserID]
  );

  const handleSummaryStatSelect = useCallback(
    async (selection) => {
      if (!selection) return;

      if (selection.kind === "single") {
        const sourceSolves =
          selection.scope === "overall" ? allLoadedFilteredRawSolves : summaryCurrentSolves;
        let solve = null;

        if (selection.scope === "overall" && selection.variant === "best") {
          const bestSolveRef = overallStatsForEvent?.BestSingleSolveSK || null;
          solve =
            sourceSolves.find(
              (item) => String(item?.solveRef ?? item?.SK ?? "") === String(bestSolveRef)
            ) || null;

          if (!solve && user?.UserID && bestSolveRef) {
            try {
              const items = await getSolveWindowFromStart(
                user.UserID,
                String(statsEvent || "").toUpperCase(),
                String(sessionId || "main"),
                bestSolveRef,
                1
              );
              solve = normalizeSolve((items || [])[0]);
            } catch (error) {
              console.warn("Failed to load exact best single:", error);
            }
          }

          if (bestSolveRef && !solve) {
            return;
          }
        }

        if (!solve) {
          solve = findSingleSolve(sourceSolves, selection.variant);
        }

        if (solve) openSolveDetail(solve);
        return;
      }

      if (selection.kind !== "window") return;

      const spec = WINDOW_SPECS[selection.metricKey];
      if (!spec) return;

      const sourceSolves =
        selection.scope === "overall" ? allLoadedFilteredRawSolves : summaryCurrentSolves;

      let solvesForWindow = null;
      const startSolveRef =
        selection.scope === "overall" &&
        (selection.variant === "best" || selection.variant === "strict-best")
          ? overallStatsForEvent?.[
              selection.variant === "strict-best"
                ? `${spec.startField.replace("StartSolveSK", "StrictStartSolveSK")}`
                : spec.startField
            ] ?? null
          : null;

      if (startSolveRef) {
        solvesForWindow = findWindowByStartRef(
          sourceSolves,
          startSolveRef,
          spec.size
        );
      }

      if (!solvesForWindow && startSolveRef && user?.UserID) {
        try {
          const items = await getSolveWindowFromStart(
            user.UserID,
            String(statsEvent || "").toUpperCase(),
            String(sessionId || "main"),
            startSolveRef,
            spec.size
          );
          const normalized = (items || []).map(normalizeSolve).filter(Boolean);
          if (normalized.length === spec.size) {
            solvesForWindow = normalized;
          }
        } catch (error) {
          console.warn(`Failed to load exact ${selection.label} window:`, error);
        }
      }

      if (startSolveRef && !solvesForWindow) {
        return;
      }

      if (!solvesForWindow) {
        solvesForWindow = findWindowForMetric(sourceSolves, spec, selection.variant);
      }

      if (!solvesForWindow?.length) return;

      setSelectedAverageDetail({
        title: `${selection.label} ${selection.variant}`,
        subtitle:
          selection.scope === "overall"
            ? `${eventSelectLabel} · ${selectedSessionDisplay} · overall`
            : `${eventSelectLabel} · ${selectedSessionDisplay}`,
        solves: solvesForWindow,
      });
    },
    [
      allLoadedFilteredRawSolves,
      eventSelectLabel,
      normalizeSolve,
      openSolveDetail,
      overallStatsForEvent,
      selectedSessionDisplay,
      sessionId,
      statsEvent,
      user?.UserID,
      summaryCurrentSolves,
    ]
  );

  const persistUserCollection = useCallback(
    async (field, nextValue) => {
      if (!user?.UserID) throw new Error("Missing user");
      await runDb("Saving stats preferences", () =>
        updateUser(user.UserID, { [field]: nextValue })
      );
      setUser?.((prev) => ({ ...(prev || {}), [field]: nextValue }));
    },
    [runDb, setUser, user?.UserID]
  );

  const handleShareFocusedCard = useCallback(async () => {
    if (!focusedCard || typeof addPost !== "function") return;

    setFocusActionBusy("share");
    setFocusActionMessage("");

    try {
      const shared = await addPost({
        note: "",
        event: statsEvent === ALL_EVENTS ? "333" : statsEvent,
        solveList: [],
        comments: [],
        postType: "stat-share",
        statShare: focusedCard.statShare,
      });
      setFocusActionMessage(shared ? "Shared to social." : "");
    } catch (error) {
      console.error("Failed to share stat card:", error);
      setFocusActionMessage("Failed to share to social.");
    } finally {
      setFocusActionBusy("");
    }
  }, [addPost, focusedCard, statsEvent]);

  const handleShareFocusedCardToProfile = useCallback(async () => {
    if (!focusedCard?.profileConfig || !user?.UserID) return;

    const current = Array.isArray(user?.VisibleStats) ? user.VisibleStats : [];
    const exists = current.some((item) => buildStatCardKey(item) === focusedCard.id);
    if (exists) {
      setFocusActionMessage("Already added to your profile.");
      return;
    }

    const next = [...current, focusedCard.profileConfig];
    setFocusActionBusy("profile");
    setFocusActionMessage("");

    try {
      await persistUserCollection("VisibleStats", next);
      setFocusActionMessage("Added to your profile stats.");
    } catch (error) {
      console.error("Failed to add stat card to profile:", error);
      setFocusActionMessage("Failed to update your profile.");
    } finally {
      setFocusActionBusy("");
    }
  }, [focusedCard, persistUserCollection, user?.UserID, user?.VisibleStats]);

  const handleToggleFocusedFavorite = useCallback(async () => {
    if (!focusedCard?.profileConfig || !user?.UserID) return;

    const current = Array.isArray(user?.FavoriteStats) ? user.FavoriteStats : [];
    const next = isFocusedCardFavorited
      ? current.filter((item) => buildStatCardKey(item) !== focusedCard.id)
      : [...current, focusedCard.profileConfig];

    setFocusActionBusy("favorite");
    setFocusActionMessage("");

    try {
      await persistUserCollection("FavoriteStats", next);
      setFocusActionMessage(isFocusedCardFavorited ? "Removed from favorites." : "Added to favorites.");
    } catch (error) {
      console.error("Failed to update favorites:", error);
      setFocusActionMessage("Failed to update favorites.");
    } finally {
      setFocusActionBusy("");
    }
  }, [focusedCard, isFocusedCardFavorited, persistUserCollection, user?.FavoriteStats, user?.UserID]);

  const renderFocusedCardBody = useCallback(
    (card) => {
      if (!card) return null;

      if (
        card.key === "summary" ||
        card.key === "summary-current" ||
        card.key === "summary-compare-primary-current"
      ) {
        return (
          <StatsSummaryCurrent
            solves={visiblePageFilteredRawSolves}
            overallStats={effectiveOverallStats}
            allEventsBreakdown={statsViewMode === "time" ? null : isAllEventsMode ? allEventsBreakdown : null}
            mode={summaryMode}
            loadedSolveCount={loadedSolveCountForSummary}
            showCurrentMetrics={currentPage === 0}
            viewMode={statsViewMode}
            selectedDay={selectedTimeDay}
            onStatSelect={handleSummaryStatSelect}
            loading={primarySummaryLoading}
          />
        );
      }

      if (card.key === "summary-overall" || card.key === "summary-compare-primary-overall") {
        return (
          <StatsSummaryOverall
            solves={visiblePageFilteredRawSolves}
            overallSolves={allLoadedFilteredRawSolves}
            overallStats={effectiveOverallStats}
            allowOverallDerived={allowOverallDerivedMetrics}
            mode={summaryMode}
            selectedEvent={eventSelectLabel}
            selectedSession={selectedSessionDisplay}
            selectedTagLabel={selectedTagLabel}
            loadedSolveCount={loadedSolveCountForSummary}
            onStatSelect={handleSummaryStatSelect}
            profileColor={user?.Color || user?.color || "#50B6FF"}
            loading={primaryOverallSummaryLoading}
          />
        );
      }

      if (card.key === "summary-compare-secondary-current") {
        return (
          <StatsSummaryCurrent
            solves={compareVisiblePageFilteredRawSolves}
            overallStats={null}
            allEventsBreakdown={null}
            mode="session"
            loadedSolveCount={compareFilteredRawSolves.length}
            showCurrentMetrics={currentPage === 0}
            viewMode="standard"
            selectedDay=""
            onStatSelect={null}
            loading={compareSummaryLoading}
          />
        );
      }

      if (card.key === "summary-compare-secondary-overall") {
        return (
          <StatsSummaryOverall
            solves={compareVisiblePageFilteredRawSolves}
            overallSolves={compareFilteredRawSolves}
            overallStats={null}
            allowOverallDerived={true}
            mode="session"
            selectedEvent={compareEventLabel}
            selectedSession={compareSessionDisplay}
            selectedTagLabel={compareSelectedTagSummaryLabel}
            loadedSolveCount={compareFilteredRawSolves.length}
            onStatSelect={null}
            profileColor={compareStyle?.primary || "#7c8cff"}
            loading={compareSummaryLoading}
          />
        );
      }

      if (card.key === "line") {
        return (
          <LineChart
            user={user}
            solves={compareEnabled ? comparisonPrimarySolves : timeViewLineSolves}
            comparisonSeries={
              compareEnabled
                ? [
                    {
                      id: "compare",
                      label: compareLegendItems[1]?.label || "Compare",
                      solves: compareVisiblePageFilteredRawSolves,
                      style: compareStyle,
                    },
                  ]
                : []
            }
            seriesStyle={primaryCompareStyle}
            legendItems={compareLegendItems}
            title={`Line: ${statsEvent}`}
            deleteTime={handleDeleteSolve}
            addPost={addPost}
            setSessions={setSessions}
            sessionsList={sessionsList}
            currentEvent={statsEvent}
            currentSession={sessionId}
            eventKey={statsEvent}
            practiceMode={false}
            viewMode={statsViewMode}
            selectedDay={selectedTimeDay}
            onSelectedDayChange={setSelectedTimeDay}
            onSolveOpen={openSolveDetail}
          />
        );
      }

      if (card.key === "percent") {
        return showEventBreakdownCard
          ? <PieChart solves={pieChartSolves} title="Event Breakdown" />
          : (
            <PercentBar
              solves={compareEnabled ? comparisonPrimarySolves : chartVisibleSolves}
              seriesStyle={primaryCompareStyle}
              comparisonSeries={
                compareEnabled
                  ? [
                      {
                        id: "compare",
                        label: compareLegendItems[1]?.label || "Compare",
                        solves: compareVisiblePageFilteredRawSolves,
                        style: compareStyle,
                      },
                    ]
                  : []
              }
              legendItems={compareLegendItems}
              title="Solves Distribution by Time"
            />
          );
      }

      if (card.key === "bar") {
        return (
          <BarChart
            solves={compareEnabled ? comparisonPrimarySolves : barChartSolves}
            comparisonSeries={
              compareEnabled
                ? [
                    {
                      id: "compare",
                      label: compareLegendItems[1]?.label || "Compare",
                      solves: compareVisiblePageFilteredRawSolves,
                      style: compareStyle,
                    },
                  ]
                : []
            }
            seriesStyle={primaryCompareStyle}
            legendItems={compareLegendItems}
          />
        );
      }

      if (card.key === "table") {
        return (
          <TimeTable
            user={user}
            solves={compareEnabled && tableCompareView === "compare" ? compareVisiblePageFilteredRawSolves : chartVisibleSolves}
            seriesStyle={compareEnabled && tableCompareView === "compare" ? compareStyle : primaryCompareStyle}
            deleteTime={handleDeleteSolve}
            addPost={addPost}
            setSessions={setSessions}
            sessionsList={sessionsList}
            currentEvent={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
            currentSession={compareEnabled && tableCompareView === "compare" ? compareSessionId : sessionId}
            eventKey={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
            practiceMode={false}
          />
        );
      }

      return null;
    },
    [
      addPost,
      allEventsBreakdown,
      allLoadedFilteredRawSolves,
      barChartSolves,
      chartVisibleSolves,
      compareEnabled,
      compareVisiblePageFilteredRawSolves,
      compareEventLabel,
      compareLegendItems,
      compareFilteredRawSolves,
      compareSelectedTagSummaryLabel,
      compareSessionDisplay,
      compareStyle,
      compareSessionId,
      compareEvent,
      comparisonPrimarySolves,
      currentPage,
      eventSelectLabel,
      handleDeleteSolve,
      allowOverallDerivedMetrics,
      isAllEventsMode,
      summaryMode,
      effectiveOverallStats,
      handleSummaryStatSelect,
      pieChartSolves,
      primaryCompareStyle,
      primaryOverallSummaryLoading,
      primarySummaryLoading,
      showEventBreakdownCard,
      selectedSessionDisplay,
      selectedTagLabel,
      selectedTimeDay,
      sessionId,
      sessionsList,
      setSessions,
      loadedSolveCountForSummary,
      statsEvent,
      statsViewMode,
      tableCompareView,
      timeViewLineSolves,
      openSolveDetail,
      user,
      visiblePageFilteredRawSolves,
      compareSummaryLoading,
    ]
  );

  const isInteractiveTarget = (target) =>
    !!target?.closest?.(
      "button, select, input, textarea, a, [data-interactive='solve-point'], [data-interactive='summary-stat'], [data-interactive='percent-bar-control'], .lineChartDot, svg .timeLineSegment, .timeLineSegment"
    );

  useEffect(() => {
    onSettingsContextChange?.({
      eventLabel: eventSelectLabel,
      sessionLabel: isAllEventsMode ? "Pick a specific event first" : selectedSessionDisplay,
      isAllEventsMode,
      canRecomputeOverall,
      canImport: !!user?.UserID && !importBusy && !isAllEventsMode,
      loadingOverallStats,
      recomputeStatusText,
      importBusy,
      isStatsRouteActive: true,
    });

    return () => {
      onSettingsContextChange?.((prev) => ({
        ...(prev || {}),
        isStatsRouteActive: false,
      }));
    };
  }, [
    onSettingsContextChange,
    eventSelectLabel,
    selectedSessionDisplay,
    isAllEventsMode,
    canRecomputeOverall,
    user?.UserID,
    importBusy,
    loadingOverallStats,
    recomputeStatusText,
  ]);

  useEffect(() => {
    if (recomputeRequest === recomputeRequestRef.current) return;
    recomputeRequestRef.current = recomputeRequest;
    handleRecomputeOverall();
  }, [recomputeRequest, handleRecomputeOverall]);

  useEffect(() => {
    if (importRequest === importRequestRef.current) return;
    importRequestRef.current = importRequest;
    if (!user?.UserID || importBusy || isAllEventsMode) return;
    setShowImport(true);
  }, [importRequest, user?.UserID, importBusy, isAllEventsMode]);

  const bindCardFocus = (cardId) => ({
    role: "button",
    tabIndex: 0,
    onClick: (event) => {
      if (isInteractiveTarget(event.target)) return;
      openCardFocus(cardId);
    },
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCardFocus(cardId);
      }
    },
  });

  const canCompare = statsViewMode === "standard" && showSolveCharts;

  const closeScopeModal = useCallback(() => {
    setScopeModalState(null);
  }, []);

    const openScopeModal = useCallback((scopeKey, section = "event") => {
    setScopeModalState(scopeKey);
    setScopeModalSection(section);
  }, []);

  const getTagFieldForSection = useCallback((section) => {
    if (section === "tag-cube-model") return "CubeModel";
    if (section === "tag-cross-color") return "CrossColor";
    if (section === "tag-solve-source") return "SolveSource";
    if (section === "tag-time-input") return "TimeInput";
    return "CubeModel";
  }, []);

  useEffect(() => {
    if (!scopeModalState) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeScopeModal();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [closeScopeModal, scopeModalState]);

    const renderTagScopeModal = ({
    isOpen,
    title,
    subtitle,
    scopeKey,
    eventValue,
    onEventChange,
    eventItems,
    sessionValue,
    sessionItems,
    onPickSession,
    tagSelection,
    onTagSelectionChange,
    discoveredOptions,
    paletteValue,
    paletteLabel,
    onPaletteChange,
    accentColor,
    dateLabel,
  }) => {
    if (!isOpen) return null;

    const sectionButtons = [
      { key: "event", label: "Event" },
      { key: "session", label: "Session" },
      { key: "tags", label: "Tags" },
      ...(typeof onPaletteChange === "function" ? [{ key: "color", label: "Color" }] : []),
      { key: "date", label: "Date" },
    ];

    const activeTagField = getTagFieldForSection(scopeModalSection);
    const resolvedTagEvent =
      eventValue && eventValue !== ALL_EVENTS ? String(eventValue || "").toUpperCase() : "";
    const scopeTagColors = getTagColorMapForEvent(tagColorCatalog, resolvedTagEvent);
    const handleScopeTagColorsChange =
      typeof onTagColorsChange === "function" && resolvedTagEvent
        ? (next) => onTagColorsChange(resolvedTagEvent, next)
        : null;

    return (
      <div
        className="detailPopup"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => {
          if (event.target.classList?.contains("detailPopup")) closeScopeModal();
        }}
      >
        <div className="detailPopupContent statsScopeModal">
          <button
            type="button"
            className="closePopup statsScopeModalClose"
            onClick={closeScopeModal}
          >
            x
          </button>

          <div className="statsScopeModalHeader">
            <p className="statsScopeModalEyebrow">{title}</p>
            <h3>{subtitle}</h3>
            <p>Adjust event, session, shared tags, color style, and date range for this stats scope.</p>
          </div>

          <div className="statsScopeModalNav">
            {sectionButtons.map((item) => (
              <button
                key={`${scopeKey}-${item.key}`}
                type="button"
                className={`statsScopeNavBtn ${scopeModalSection === item.key ? "active" : ""}`}
                onClick={() => setScopeModalSection(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="statsScopeModalSection">
            <button
              type="button"
              className={`statsScopeSectionHeader ${scopeModalSection === "event" ? "active" : ""}`}
              onClick={() => setScopeModalSection("event")}
            >
              <span>Event</span>
              <span>{eventValue === ALL_EVENTS ? "All Events" : eventValue === "333" ? "3x3" : eventValue}</span>
            </button>

            {scopeModalSection === "event" && (
              <div className="statsScopeChipGrid">
                {eventItems.map((eventKey) => {
                  const label =
                    eventKey === ALL_EVENTS ? "All Events" : eventKey === "333" ? "3x3" : eventKey;
                  const active = eventValue === eventKey;
                  return (
                    <button
                      key={`${scopeKey}-event-${eventKey}`}
                      type="button"
                      className={`statsScopeChip ${active ? "active" : ""}`}
                      style={
                        active
                          ? { borderColor: accentColor, background: `${accentColor}22` }
                          : undefined
                      }
                      onClick={() => onEventChange(eventKey)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="statsScopeModalSection">
            <button
              type="button"
              className={`statsScopeSectionHeader ${scopeModalSection === "session" ? "active" : ""}`}
              onClick={() => setScopeModalSection("session")}
            >
              <span>Session</span>
              <span>
                {sessionValue === ALL_SESSIONS
                  ? "All Sessions"
                  : sessionItems.find((s) => s.SessionID === sessionValue)?.SessionName || sessionValue}
              </span>
            </button>

            {scopeModalSection === "session" && (
              <div className="statsScopeChipGrid">
                {sessionItems.map((s) => {
                  const sid = s.SessionID || "main";
                  const label = s.SessionName || sid;
                  const active = sid === sessionValue;

                  return (
                    <button
                      key={`${scopeKey}-session-${sid}`}
                      type="button"
                      className={`statsScopeChip ${active ? "active" : ""}`}
                      style={
                        active
                          ? { borderColor: accentColor, background: `${accentColor}22` }
                          : undefined
                      }
                      onClick={() => onPickSession(sid)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="statsScopeModalSection">
            <button
              type="button"
              className={`statsScopeSectionHeader ${scopeModalSection === "tags" ? "active" : ""}`}
              onClick={() => setScopeModalSection("tags")}
            >
              <span>Shared Tags</span>
              <span>{summarizeTagSelection(tagSelection, safeTagConfig)}</span>
            </button>

            {scopeModalSection === "tags" && (
              <>
                <div className="statsScopeTagQuickNav">
                  {[
                    { key: "tag-cube-model", label: "Cube Model" },
                    { key: "tag-cross-color", label: "Cross Color" },
                    { key: "tag-solve-source", label: "Solve Source" },
                    { key: "tag-time-input", label: "Time Input" },
                  ].map((item) => (
                    <button
                      key={`${scopeKey}-${item.key}`}
                      type="button"
                      className={`statsScopeMiniPill ${scopeModalSection === item.key ? "active" : ""}`}
                      onClick={() => setScopeModalSection(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <TagBar
                  tags={tagSelection}
                  tagColors={scopeTagColors}
                  onChange={onTagSelectionChange}
                  onTagColorsChange={handleScopeTagColorsChange}
                  tagConfig={safeTagConfig}
                  cubeModelOptions={cubeModelOptions}
                  discoveredOptions={discoveredOptions}
                  profileColor={user?.Color || user?.color || "#2EC4B6"}
                  variant="stats"
                  allowAdditions
                />
              </>
            )}

            {String(scopeModalSection || "").startsWith("tag-") && (
              <>
                <div className="statsScopeTagQuickNav">
                  {[
                    { key: "tag-cube-model", label: "Cube Model" },
                    { key: "tag-cross-color", label: "Cross Color" },
                    { key: "tag-solve-source", label: "Solve Source" },
                    { key: "tag-time-input", label: "Time Input" },
                  ].map((item) => (
                    <button
                      key={`${scopeKey}-nav-${item.key}`}
                      type="button"
                      className={`statsScopeMiniPill ${scopeModalSection === item.key ? "active" : ""}`}
                      onClick={() => setScopeModalSection(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <TagBar
                  tags={tagSelection}
                  tagColors={scopeTagColors}
                  onChange={onTagSelectionChange}
                  onTagColorsChange={handleScopeTagColorsChange}
                  tagConfig={safeTagConfig}
                  cubeModelOptions={cubeModelOptions}
                  discoveredOptions={discoveredOptions}
                  profileColor={user?.Color || user?.color || "#2EC4B6"}
                  variant="stats"
                  allowAdditions
                  activeField={activeTagField}
                />
              </>
            )}
          </div>

          {typeof onPaletteChange === "function" && (
            <div className="statsScopeModalSection">
              <button
                type="button"
                className={`statsScopeSectionHeader ${scopeModalSection === "color" ? "active" : ""}`}
                onClick={() => setScopeModalSection("color")}
              >
                <span>Color</span>
                <span>{paletteLabel}</span>
              </button>

              {scopeModalSection === "color" && (
                <>
                  <div className="statsScopeChipGrid">
                    {paletteOptions.map((option) => {
                      const active = option.value === paletteValue;
                      return (
                        <button
                          key={`${scopeKey}-palette-${option.value}`}
                          type="button"
                          className={`statsScopeChip ${active ? "active" : ""}`}
                          style={
                            active
                              ? { borderColor: accentColor, background: `${accentColor}22` }
                              : undefined
                          }
                          onClick={() => onPaletteChange(option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="statsScopeModalMeta">Selected style: {paletteLabel}</div>
                </>
              )}
            </div>
          )}

          <div className="statsScopeModalSection">
            <button
              type="button"
              className={`statsScopeSectionHeader ${scopeModalSection === "date" ? "active" : ""}`}
              onClick={() => setScopeModalSection("date")}
            >
              <span>Date</span>
              <span>{dateLabel}</span>
            </button>

            {scopeModalSection === "date" && (
              <StatsDateRangePicker
                startDay={dateFilterStart}
                endDay={dateFilterEnd}
                accentColor={accentColor}
                onApply={(nextStart, nextEnd) => {
                  setDateFilterStart(nextStart);
                  setDateFilterEnd(nextEnd);
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderViewportControls = (scopeKey = "primary") => {
    const useCompareControls =
      scopeKey === "compare" && compareEnabled && statsViewMode === "standard" && !linkStatsControls;
    const controls = useCompareControls
      ? {
          previous: handleComparePreviousPage,
          next: handleCompareNextPage,
          zoomIn: handleCompareZoomIn,
          zoomOut: handleCompareZoomOut,
          decrease: handleCompareDecreaseSolveCount,
          increase: handleCompareIncreaseSolveCount,
          showAll: handleCompareShowAll,
          canOlder: compareCanOlder,
          canNewer: compareCanNewer,
          canZoomIn: compareCanZoomIn,
          canZoomOut: compareCanZoomOut,
          canDecreaseSolveCount: compareCanDecreaseSolveCount,
          canIncreaseSolveCount: compareCanIncreaseSolveCount,
          canShowAll: compareCanShowAll,
          loadingShowAll: compareLoading,
          showAllActive: compareShowAllActive,
        }
      : {
          previous: handlePreviousPage,
          next: handleNextPage,
          zoomIn: handleZoomIn,
          zoomOut: handleZoomOut,
          decrease: handleDecreaseSolveCount,
          increase: handleIncreaseSolveCount,
          showAll: handleShowAll,
          canOlder,
          canNewer,
          canZoomIn,
          canZoomOut,
          canDecreaseSolveCount,
          canIncreaseSolveCount,
          canShowAll,
          loadingShowAll: loadingAllSolves,
          showAllActive,
        };

    return (
      <div className="statsScopeControls" onClick={(e) => e.stopPropagation()}>
      {statsViewMode === "time" ? (
        <>
          <button type="button" onClick={() => shiftTimeRangeByDay(-1)} title="Previous day">
            Day -
          </button>

          <button type="button" onClick={() => shiftTimeRangeByDay(1)} title="Next day">
            Day +
          </button>

          <button type="button" onClick={() => applyTimeRangePreset("week")} title="Show week range">
            Week
          </button>

          <button type="button" onClick={() => applyTimeRangePreset("month")} title="Show month range">
            Month
          </button>

          <button type="button" onClick={() => applyTimeRangePreset("all")} title="Show all dates">
            All
          </button>
        </>
      ) : (
        <>
      <button onClick={controls.previous} disabled={!controls.canOlder} title="Older page">
        {loadingMore && !useCompareControls ? "Loading…" : "▲"}
      </button>

      <button onClick={controls.next} disabled={!controls.canNewer} title="Newer page">
        ▼
      </button>

      <button onClick={controls.zoomIn} disabled={!controls.canZoomIn} title="Zoom in">
        +
      </button>

      <button onClick={controls.zoomOut} disabled={!controls.canZoomOut} title="Zoom out">
        -
      </button>

      <button
        onClick={controls.decrease}
        disabled={!controls.canDecreaseSolveCount}
        className="statsTopStepBtn"
        title="Show fewer solves"
      >
        -1
      </button>

      <button
        onClick={controls.increase}
        disabled={!controls.canIncreaseSolveCount}
        className="statsTopStepBtn"
        title="Show more solves"
      >
        +1
      </button>

      <button onClick={controls.showAll} disabled={!controls.canShowAll} title="Load all solves">
        {controls.loadingShowAll ? "Loading…" : controls.showAllActive ? "All Loaded" : "Show All"}
      </button>
        </>
      )}
      </div>
    );
  };

  const renderScopeRow = ({
    rowLabel,
    rowAccentColor = "rgba(255,255,255,0.22)",
    eventValue,
    sessionValue,
    sessionDisplay,
    tagSummary,
    loading = false,
    scopeModalKey,
  }) => {
    const { label: eventLabel, puzzleEvent } = getEventDisplayMeta(eventValue);

    return (
      <div
        className={`statsScopeRow statsScopeRow--clickable ${loading ? "is-loading" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => openScopeModal(scopeModalKey, "event")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openScopeModal(scopeModalKey, "event");
          }
        }}
      >
        <button
          type="button"
          className="statsScopeLabel statsScopeLabelBtn"
          style={{
            borderColor: rowAccentColor,
            boxShadow: `inset 0 0 0 1px ${rowAccentColor}33`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            openScopeModal(scopeModalKey, "color");
          }}
        >
          {rowLabel}
        </button>

        <div className="statsScopeSummary">
          {puzzleEvent ? (
            <button
              type="button"
              className="statsScopeSummaryChip statsScopeSummaryChip--eventIcon"
              onClick={(e) => {
                e.stopPropagation();
                openScopeModal(scopeModalKey, "event");
              }}
              aria-label={`${eventLabel} icon`}
            >
              <span className="statsScopeEventIcon" aria-hidden="true">
                <PuzzleSVG event={puzzleEvent} scramble="" isStatsHeaderIcon />
              </span>
            </button>
          ) : null}

          <button
            type="button"
            className="statsScopeSummaryChip statsScopeSummaryChip--event"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "event");
            }}
          >
            <span className="statsScopeSummaryChipValue statsScopeSummaryChipValue--event">
              {eventLabel}
            </span>
          </button>

          <button
            type="button"
            className="statsScopeSummaryChip"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "session");
            }}
          >
            <span className="statsScopeSummaryChipValue">
              {sessionValue === ALL_SESSIONS ? "All Sessions" : sessionDisplay}
            </span>
          </button>

          <button
            type="button"
            className="statsScopeSummaryChip"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "tags");
            }}
          >
            <span className="statsScopeSummaryChipValue">{tagSummary}</span>
          </button>

          <button
            type="button"
            className="statsScopeSummaryChip"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "date");
            }}
          >
            <span className="statsScopeSummaryChipValue">{dateFilterLabel}</span>
          </button>
        </div>

        <div className="statsScopeRowActions">
          {renderViewportControls(scopeModalKey)}
        </div>
      </div>
    );
  };

  const useSharedCompareRail = compareEnabled && statsViewMode === "standard";

  return (
    <div
      className="Page statsPageRoot"
      style={{
        "--stats-profile-accent": profileChartStyle?.primary || "#2EC4B6",
        "--stats-profile-accent-soft": `${profileChartStyle?.primary || "#2EC4B6"}22`,
        "--stats-profile-accent-strong": `${profileChartStyle?.primary || "#2EC4B6"}7a`,
      }}
    >
      <div className={`statsTopBar ${statsViewMode === "standard" ? "statsTopBar--standard" : ""}`}>
        <div className={`statsTopLeft ${statsViewMode === "standard" ? "statsTopLeft--standard" : ""}`}>
          <div className="statsTopIdentity">
            <NameTag
              isSignedIn={!!user}
              user={user}
              to="/profile"
            />

            <div className="statsViewToggle" role="group" aria-label="Stats view">
              <button
                type="button"
                className={`statsToggleBtn ${statsViewMode === "standard" ? "is-active" : ""}`}
                onClick={() => handleSetViewMode("standard")}
              >
                Index
              </button>
              <span className="statsViewToggleDivider" aria-hidden="true">|</span>
              <button
                type="button"
                className={`statsToggleBtn ${statsViewMode === "time" ? "is-active" : ""}`}
                onClick={() => handleSetViewMode("time")}
              >
                Time
              </button>
            </div>
          </div>

          <div className={`statsCompareShell ${useSharedCompareRail ? "statsCompareShell--linked" : ""}`}>
            <div
              className={`statsCompareControls ${statsViewMode === "standard" ? "statsCompareControls--standard" : ""}`}
              aria-label="Stats settings"
            >
              {renderScopeRow({
                rowLabel: compareEnabled ? "A" : "Scope",
                rowAccentColor: primaryAccentColor,
                eventValue: statsEvent,
                sessionValue: statsSession,
                sessionDisplay: selectedSessionDisplay,
                tagSummary: summarizeTagSelection(tagFilterSelection, safeTagConfig),
                scopeModalKey: "primary",
              })}

              {compareEnabled &&
                renderScopeRow({
                  rowLabel: "B",
                  rowAccentColor: compareAccentColor,
                  eventValue: compareEvent,
                  sessionValue: compareSessionId,
                  sessionDisplay: compareSessionDisplay,
                  tagSummary: summarizeTagSelection(compareTagSelection, safeTagConfig),
                  loading: compareLoading,
                  scopeModalKey: "compare",
                })}

              {canCompare && !compareEnabled && (
                <div className="statsAddCompareRow">
                  <button
                    type="button"
                    className="statsAddCompareBtn"
                    onClick={handleAddCompareRow}
                    aria-label="Add another stat group"
                    title="Add another stat group"
                  >
                    +
                  </button>
                  <span className="statsAddCompareHint">Add stat group</span>
                </div>
              )}
            </div>

            {useSharedCompareRail ? (
              <div className="statsCompareSharedRail" aria-label="Shared comparison controls">
                <button
                  type="button"
                  className={`statsCompareLinkBtn ${linkStatsControls ? "is-active" : ""}`}
                  onClick={() => setLinkStatsControls((prev) => !prev)}
                  aria-pressed={linkStatsControls}
                  title={linkStatsControls ? "Unlink stat row controls" : "Link stat row controls"}
                >
                  <img src={PtsLinkStatsIcon} alt="" className="statsCompareLinkIcon" />
                </button>
                <div className="statsCompareSharedRemove">
                  <button
                    type="button"
                    className="statsMiniBtn statsCompareRemoveBtn statsCompareRemoveBtn--outside"
                    onClick={handleRemoveCompareRow}
                    aria-label="Remove stat group B"
                    title="Remove stat group B"
                  >
                    x
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

      </div>

            {renderTagScopeModal({
        isOpen: scopeModalState === "primary",
        title: compareEnabled ? "Scope A" : "Scope",
        subtitle: `${eventSelectLabel} · ${selectedSessionDisplay}`,
        scopeKey: "primary",
        eventValue: statsEvent,
        onEventChange: (next) =>
          handleEventChange({
            target: { value: next },
          }),
        eventItems: eventOptions,
        sessionValue: statsSession,
        sessionItems: sessionsForEvent,
        onPickSession: handlePickSession,
        tagSelection: tagFilterSelection,
        onTagSelectionChange: (next) => setTagFilterSelection(sanitizeTagSelection(next)),
        discoveredOptions: discoveredTagOptions,
        paletteValue: compareSelection?.primaryPaletteKey ?? primaryPaletteKey,
        paletteLabel: primaryPaletteLabel,
        onPaletteChange: showSolveCharts
          ? (value) => {
              setPrimaryPaletteKey(value);
              setCompareSelection((prev) =>
                prev ? { ...prev, primaryPaletteKey: value } : prev
              );
            }
          : null,
        accentColor: primaryAccentColor,
        dateLabel: formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel),
      })}

            {renderTagScopeModal({
        isOpen: scopeModalState === "compare" && compareEnabled,
        title: "Scope B",
        subtitle: `${compareEventLabel} · ${compareSessionDisplay}`,
        scopeKey: "compare",
        eventValue: compareEvent,
        onEventChange: (next) => {
          updateCompareSelection({
            event: next,
            session: "main",
            tags: makeEmptyTagSelection(),
          });
        },
        eventItems: eventOptions.filter((item) => item !== ALL_EVENTS),
        sessionValue: compareSessionId,
        sessionItems: compareSessionsForEvent,
        onPickSession: (sid) => updateCompareSelection({ session: sid }),
        tagSelection: compareTagSelection,
        onTagSelectionChange: (next) =>
          updateCompareSelection({ tags: sanitizeTagSelection(next) }),
        discoveredOptions: compareDiscoveredTagOptions,
        paletteValue: compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE,
        paletteLabel: comparePaletteLabel,
        onPaletteChange: showSolveCharts
          ? (value) => updateCompareSelection({ paletteKey: value })
          : null,
        accentColor: compareAccentColor,
        dateLabel: formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel),
      })}

      <div className="stats-page">
        <div className="stats-grid stats-grid--figma">
          <div
            className={`stats-item stats-item--header stats-item--minh stats-item--headerSplit${
              isAllEventsMode ? " stats-item--headerSplitSingle" : ""
            }${compareEnabled ? " stats-item--headerSplitSingle" : ""}`}
          >
            {!compareEnabled ? (
              isAllEventsMode ? (
                <div
                  className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                  aria-busy={primaryOverallSummaryLoading}
                  {...bindCardFocus(cardDefinitions[0]?.id)}
                >
                  <StatsSummary
                    solves={summaryCurrentSolves}
                    overallSolves={allLoadedFilteredRawSolves}
                    overallStats={effectiveOverallStats}
                    allEventsBreakdown={statsViewMode === "time" ? null : isAllEventsMode ? allEventsBreakdown : null}
                    allowOverallDerived={allowOverallDerivedMetrics}
                    mode={summaryMode}
                    selectedEvent={eventSelectLabel}
                    selectedSession={selectedSessionDisplay}
                    selectedTagLabel={selectedTagLabel}
                    loadedSolveCount={loadedSolveCountForSummary}
                    showCurrentMetrics={currentPage === 0}
                    viewMode={statsViewMode}
                    selectedDay={selectedTimeDay}
                    onStatSelect={handleSummaryStatSelect}
                    loading={primaryOverallSummaryLoading}
                  />
                </div>
              ) : (
                <>
                  <div
                    className={`statsSummaryPanel statsCardShell ${primarySummaryLoading ? "is-loading" : ""}`}
                    aria-busy={primarySummaryLoading}
                    {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-current")?.id)}
                  >
                    <StatsSummaryCurrent
                      solves={summaryCurrentSolves}
                      overallStats={effectiveOverallStats}
                      allEventsBreakdown={null}
                      mode={summaryMode}
                      loadedSolveCount={loadedSolveCountForSummary}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={statsViewMode}
                      selectedDay={selectedTimeDay}
                      onStatSelect={handleSummaryStatSelect}
                      loading={primarySummaryLoading}
                    />
                  </div>
                  <div
                    className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                    aria-busy={primaryOverallSummaryLoading}
                    {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-overall")?.id)}
                  >
                    <StatsSummaryOverall
                      solves={summaryCurrentSolves}
                      overallSolves={allLoadedFilteredRawSolves}
                      overallStats={effectiveOverallStats}
                      allowOverallDerived={allowOverallDerivedMetrics}
                      mode={summaryMode}
                      selectedEvent={eventSelectLabel}
                      selectedSession={selectedSessionDisplay}
                      selectedTagLabel={selectedTagLabel}
                      loadedSolveCount={loadedSolveCountForSummary}
                      onStatSelect={handleSummaryStatSelect}
                      profileColor={user?.Color || user?.color || "#50B6FF"}
                      loading={primaryOverallSummaryLoading}
                    />
                  </div>
                </>
              )
            ) : (
              <div className="statsSummaryRows is-compare">
                <div className="statsSummaryRow">
                  <div
                    className="statsSummaryRowLabel"
                    style={{
                      borderColor: primaryAccentColor,
                      boxShadow: `inset 0 0 0 1px ${primaryAccentColor}33`,
                    }}
                  >
                    A
                  </div>
                  <div className="statsSummaryRowPanels">
                    <div
                      className={`statsSummaryPanel statsCardShell ${primarySummaryLoading ? "is-loading" : ""}`}
                      aria-busy={primarySummaryLoading}
                      {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-current")?.id)}
                    >
                      <StatsSummaryCurrent
                        solves={summaryCurrentSolves}
                        overallStats={effectiveOverallStats}
                        allEventsBreakdown={null}
                        mode={summaryMode}
                        loadedSolveCount={loadedSolveCountForSummary}
                        showCurrentMetrics={currentPage === 0}
                        viewMode={statsViewMode}
                        selectedDay={selectedTimeDay}
                        onStatSelect={handleSummaryStatSelect}
                        loading={primarySummaryLoading}
                      />
                    </div>
                    <div
                      className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                      aria-busy={primaryOverallSummaryLoading}
                      {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-overall")?.id)}
                    >
                      <StatsSummaryOverall
                        solves={summaryCurrentSolves}
                        overallSolves={allLoadedFilteredRawSolves}
                        overallStats={effectiveOverallStats}
                        allowOverallDerived={allowOverallDerivedMetrics}
                        mode={summaryMode}
                        selectedEvent={eventSelectLabel}
                        selectedSession={selectedSessionDisplay}
                        selectedTagLabel={selectedTagLabel}
                        loadedSolveCount={loadedSolveCountForSummary}
                        onStatSelect={handleSummaryStatSelect}
                        profileColor={user?.Color || user?.color || "#50B6FF"}
                        loading={primaryOverallSummaryLoading}
                      />
                    </div>
                  </div>
                </div>

                {!isAllEventsMode && (
                  <div className="statsSummaryRow">
                    <div
                      className="statsSummaryRowLabel"
                      style={{
                        borderColor: compareAccentColor,
                        boxShadow: `inset 0 0 0 1px ${compareAccentColor}33`,
                      }}
                    >
                      B
                    </div>
                    <div className="statsSummaryRowPanels">
                      <div
                        className={`statsSummaryPanel statsCardShell ${compareSummaryLoading ? "is-loading" : ""}`}
                        aria-busy={compareSummaryLoading}
                        {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-secondary-current")?.id)}
                      >
                        <StatsSummaryCurrent
                          solves={compareVisiblePageFilteredRawSolves}
                          overallStats={null}
                          allEventsBreakdown={null}
                          mode="session"
                          loadedSolveCount={compareFilteredRawSolves.length}
                          showCurrentMetrics={currentPage === 0}
                          viewMode="standard"
                          selectedDay=""
                          onStatSelect={null}
                          loading={compareSummaryLoading}
                        />
                      </div>
                      <div
                        className={`statsSummaryPanel statsCardShell ${compareSummaryLoading ? "is-loading" : ""}`}
                        aria-busy={compareSummaryLoading}
                        {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-secondary-overall")?.id)}
                      >
                        <StatsSummaryOverall
                          solves={compareVisiblePageFilteredRawSolves}
                          overallSolves={compareFilteredRawSolves}
                          overallStats={null}
                          allowOverallDerived={true}
                          mode="session"
                          selectedEvent={compareEventLabel}
                          selectedSession={compareSessionDisplay}
                          selectedTagLabel={compareSelectedTagSummaryLabel}
                          loadedSolveCount={compareFilteredRawSolves.length}
                          onStatSelect={null}
                          profileColor={compareStyle?.primary || "#7c8cff"}
                          loading={compareSummaryLoading}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showSolveCharts && (
            <>
              <div
                className={`stats-item stats-item--line stats-item--minh statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                aria-busy={chartCardsLoading}
                {...bindCardFocus(cardDefinitions.find((item) => item.key === "line")?.id)}
              >
                <LineChart
                  user={user}
                  solves={compareEnabled ? comparisonPrimarySolves : timeViewLineSolves}
                  comparisonSeries={
                    compareEnabled
                      ? [
                          {
                            id: "compare",
                            label: compareLegendItems[1]?.label || "Compare",
                            solves: compareVisiblePageFilteredRawSolves,
                            style: compareStyle,
                          },
                        ]
                      : []
                  }
                  seriesStyle={primaryCompareStyle}
                  legendItems={compareLegendItems}
                  title={`Line: ${statsEvent}`}
                  deleteTime={handleDeleteSolve}
                  addPost={addPost}
                  setSessions={setSessions}
                  sessionsList={sessionsList}
                  currentEvent={statsEvent}
                  currentSession={sessionId}
                  eventKey={statsEvent}
                  practiceMode={false}
                  viewMode={statsViewMode}
                  selectedDay={selectedTimeDay}
                  onSelectedDayChange={setSelectedTimeDay}
                  onSolveOpen={openSolveDetail}
                />
              </div>

              <div
                className={`stats-item stats-item--percent stats-item--minh statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                aria-busy={chartCardsLoading}
                {...bindCardFocus(cardDefinitions.find((item) => item.key === "percent")?.id)}
              >
                {showEventBreakdownCard ? (
                  <PieChart solves={pieChartSolves} title="Event Breakdown" />
                ) : (
                  <PercentBar
                    solves={compareEnabled ? comparisonPrimarySolves : chartVisibleSolves}
                    seriesStyle={primaryCompareStyle}
                    comparisonSeries={
                      compareEnabled
                        ? [
                            {
                              id: "compare",
                              label: compareLegendItems[1]?.label || "Compare",
                              solves: compareVisiblePageFilteredRawSolves,
                              style: compareStyle,
                            },
                          ]
                        : []
                    }
                    legendItems={compareLegendItems}
                    title="Solves Distribution by Time"
                  />
                )}
              </div>

              <div
                className={`stats-item stats-item--bar stats-item--minh statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                aria-busy={chartCardsLoading}
                {...bindCardFocus(cardDefinitions.find((item) => item.key === "bar")?.id)}
              >
                <BarChart
                  solves={compareEnabled ? comparisonPrimarySolves : barChartSolves}
                  comparisonSeries={
                    compareEnabled
                      ? [
                          {
                            id: "compare",
                            label: compareLegendItems[1]?.label || "Compare",
                            solves: compareVisiblePageFilteredRawSolves,
                            style: compareStyle,
                          },
                        ]
                      : []
                  }
                  seriesStyle={primaryCompareStyle}
                  legendItems={compareLegendItems}
                />
              </div>

              <div
                className={`stats-item stats-item--table statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                aria-busy={chartCardsLoading}
                {...bindCardFocus(cardDefinitions.find((item) => item.key === "table")?.id)}
              >
                {compareEnabled && (
                  <div className="lineChartControls">
                    <button
                      type="button"
                      className={`statsToggleBtn ${tableCompareView === "primary" ? "is-active" : ""}`}
                      onClick={() => setTableCompareView("primary")}
                    >
                      A Table
                    </button>
                    <button
                      type="button"
                      className={`statsToggleBtn ${tableCompareView === "compare" ? "is-active" : ""}`}
                      onClick={() => setTableCompareView("compare")}
                    >
                      B Table
                    </button>
                  </div>
                )}
                <TimeTable
                  user={user}
                  solves={compareEnabled && tableCompareView === "compare" ? compareVisiblePageFilteredRawSolves : chartVisibleSolves}
                  seriesStyle={compareEnabled && tableCompareView === "compare" ? compareStyle : primaryCompareStyle}
                  deleteTime={handleDeleteSolve}
                  addPost={addPost}
                  setSessions={setSessions}
                  sessionsList={sessionsList}
                  currentEvent={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
                  currentSession={compareEnabled && tableCompareView === "compare" ? compareSessionId : sessionId}
                  eventKey={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
                  practiceMode={false}
                />
              </div>
            </>
          )}

          {!showSolveCharts && (
            <div className="stats-item stats-item--table">
              <div className="statsSummaryEmpty">
                Cached overall mode is active. Pick a single session to see solve-level charts.
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          userID={user?.UserID}
          profileColor={user?.Color || user?.color || "#2EC4B6"}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => {
            const solveRef = selectedSolve?.solveRef || null;
            if (solveRef) handleDeleteSolve(solveRef);
          }}
          addPost={addPost}
          setSessions={setSessions}
          sessionsList={sessionsList}
        />
      )}

      <AverageDetailModal
        isOpen={!!selectedAverageDetail}
        title={selectedAverageDetail?.title || ""}
        subtitle={selectedAverageDetail?.subtitle || ""}
        solves={selectedAverageDetail?.solves || []}
        onClose={() => setSelectedAverageDetail(null)}
        onSolveOpen={openSolveDetail}
      />

      <StatFocusModal
        isOpen={!!focusedCard}
        title={focusedCard?.title}
        subtitle={focusedCard?.subtitle}
        actionMessage={focusActionMessage}
        onClose={closeCardFocus}
        actionButtons={[
          {
            key: "share-social",
            label: focusActionBusy === "share" ? "Sharing..." : "Share to Social",
            onClick: handleShareFocusedCard,
            disabled: !focusedCard || focusActionBusy !== "",
          },
          {
            key: "share-profile",
            label: focusActionBusy === "profile" ? "Saving..." : "Share to Profile",
            onClick: handleShareFocusedCardToProfile,
            disabled: !focusedCard?.profileConfig || !user?.UserID || focusActionBusy !== "",
          },
          {
            key: "favorite",
            label:
              focusActionBusy === "favorite"
                ? "Saving..."
                : isFocusedCardFavorited
                  ? "Unfavorite"
                  : "Favorite",
            onClick: handleToggleFocusedFavorite,
            disabled: !focusedCard?.profileConfig || !user?.UserID || focusActionBusy !== "",
            tone: isFocusedCardFavorited ? "active" : "",
          },
        ]}
      >
        <div
          className={`statFocusCanvas ${focusedCard?.key === "summary" ? "is-summary" : ""} ${
            focusedCard?.key === "line" ? "is-line" : ""
          }`}
        >
          {renderFocusedCardBody(focusedCard)}
        </div>
      </StatFocusModal>

      {showImport && (
        <ImportSolvesModal
          event={String(statsEvent || "").toUpperCase()}
          sessionID={String(sessionId || "main")}
          onClose={() => setShowImport(false)}
          onImport={handleImportSolves}
          busy={importBusy}
          importProgress={importProgress}
          sessionsForEvent={sessionsForEvent.filter((s) => s.SessionID !== ALL_SESSIONS)}
          defaultDestination={{ kind: "new", sessionName: "" }}
        />
      )}
    </div>
  );
}

export default Stats;
