import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary, { StatsSummaryCurrent, StatsSummaryOverall } from "./StatsSummary";
import BarChart from "./BarChart";
import BucketTable from "./BucketTable";
import PieChart from "./PieChart";
import TagBreakdownPie from "./TagBreakdownPie";
import StatFocusModal from "./StatFocusModal";
import AllEventsTimeMatrix from "./AllEventsTimeMatrix";
import Detail from "../Detail/Detail";
import AverageDetailModal from "../Detail/AverageDetailModal";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import TagBar from "../TagBar/TagBar";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import StatsIcon from "../../assets/Stats.svg";
import PtsLinkStatsIcon from "../../assets/ptsLinkStats.svg";
import tagBadge from "../../assets/Tag.svg";

import { getSolvesBySession, getSolvesBySessionPage } from "../../services/getSolvesBySession";
import { getSolvesByTag } from "../../services/getSolvesByTag";
import { getSessionStats } from "../../services/getSessionStats";
import { getEventStats } from "../../services/getEventStats";
import { getDayBuckets } from "../../services/getDayBuckets";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";
import { recomputeEventStats } from "../../services/recomputeEventStats";
import { updateUser } from "../../services/updateUser";
import { getSolveWindowFromStart } from "../../services/getSolveWindow";

import ImportSolvesModal from "./ImportSolvesModal";
import ExportDataModal from "./ExportDataModal";
import {
  appendImportJobChunk,
  createImportJob,
  finalizeImportJob,
  getImportJob,
} from "../../services/importJobs";
import { createSession } from "../../services/createSession";
import { getUser } from "../../services/getUser";
import { getCustomEvents } from "../../services/getCustomEvents";
import { getSessions as fetchSessionsList } from "../../services/getSessions";
import { useDbStatus } from "../../contexts/DbStatusContext";
import { findBestStrictWindow } from "../../utils/strictAverageUtils";
import { getProfileChartStyle } from "../../utils/profileChartStyle";
import {
  collectTagSelectionOptions,
  DEFAULT_TAG_CONFIG,
  getTagColorMapForEvent,
  getTagCatalogOptionsForEvent,
  getSharedTagLabels,
  getVisibleSharedTagFields,
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
const ALL_TIME_START_DAY = "1900-01-01";
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
const MAX_RAW_INDEX_RANGE_DAYS = 7;
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

function minIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return String(a) < String(b) ? a : b;
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

function buildImportSourceKey({
  detectedFormat = "unknown",
  destinationKind = "existing",
  destinationSessionID = "",
  destinationSessionName = "",
  solves = [],
}) {
  let hash = 2166136261;
  const push = (value) => {
    const text = String(value ?? "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  push(detectedFormat);
  push(destinationKind);
  push(destinationSessionID);
  push(destinationSessionName);
  push(Array.isArray(solves) ? solves.length : 0);

  for (const solve of Array.isArray(solves) ? solves : []) {
    push(solve?.event || "");
    push(solve?.sessionID || solve?._importSessionID || "");
    push(solve?.datetime || "");
    push(solve?.time ?? solve?.originalTime ?? "");
    push(solve?.penalty ?? "");
    push(solve?.scramble || "");
    push(solve?.note || "");
    const tags = solve?.tags && typeof solve.tags === "object" ? solve.tags : {};
    for (const key of Object.keys(tags).sort((a, b) => a.localeCompare(b))) {
      push(key);
      push(tags[key]);
    }
  }

  return `src_${String(hash >>> 0).padStart(10, "0")}`;
}

function stripDbKeys(record) {
  if (!record || typeof record !== "object") return record;
  const next = { ...record };
  delete next.PK;
  delete next.SK;
  delete next.GSI1PK;
  delete next.GSI1SK;
  delete next.GSI2PK;
  delete next.GSI2SK;
  return next;
}

function normalizeSessionLabel(sessionID, sessionName) {
  const sid = String(sessionID || "").trim();
  const label = String(sessionName || "").trim();

  if (sid === "main" && (!label || label === "Main Session")) return "Main";
  return label || sid || "main";
}

function resolveHeaderCrossColorTone(value, fallback = "#2EC4B6") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "white") return "#f4f1e8";
  if (normalized === "yellow") return "#f2c94c";
  if (normalized === "red") return "#eb5757";
  if (normalized === "orange") return "#f2994a";
  if (normalized === "blue") return "#4a90e2";
  if (normalized === "green") return "#27ae60";
  return fallback;
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

function getTagSelectionAccentColor(activeEntries, eventKey, tagColorCatalog, fallbackColor) {
  const entries = Array.isArray(activeEntries) ? activeEntries : [];
  if (!entries.length) return "";

  const [field, value] = entries[0] || [];
  const safeField = String(field || "").trim();
  const safeValue = String(value || "").trim();
  if (!safeField || !safeValue) return "";

  const tagColors = getTagColorMapForEvent(tagColorCatalog, eventKey || "");
  return (
    tagColors?.[safeField]?.[safeValue] ||
    (safeField === "CrossColor"
      ? resolveHeaderCrossColorTone(safeValue, fallbackColor)
      : fallbackColor)
  );
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

function buildTagSelectionSeriesStyle(color) {
  if (!color) return null;
  const style = getProfileChartStyle({ Color: color });
  if (!(style?.mode === "gradient") || !Array.isArray(style?.stops) || style.stops.length < 3) {
    return style;
  }

  // Selected-tag heatmaps rank faster solves toward lower ratios, so flip the
  // tag palette to keep the lighter end aligned with faster times.
  return {
    ...style,
    stops: [...style.stops].reverse(),
  };
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
  if (eventKey === String(ALL_EVENTS).toUpperCase()) return { label: "All Events", puzzleEvent: "" };

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

const TIME_VIEW_EVENT_MATRIX_ORDER = [
  "222",
  "333",
  "444",
  "555",
  "666",
  "777",
  "PYRAMINX",
  "CLOCK",
  "SKEWB",
  "SQ1",
  "MEGAMINX",
  "333OH",
  "333FEW",
  "333BLD",
  "444BLD",
  "555BLD",
  "333MULTIBLD",
];

const TIME_VIEW_EVENT_MATRIX_ORDER_INDEX = new Map(
  TIME_VIEW_EVENT_MATRIX_ORDER.map((event, index) => [event, index])
);

function compareTimeViewEventMatrixItems(a, b) {
  const aEvent = String(a?.event || "").trim().toUpperCase();
  const bEvent = String(b?.event || "").trim().toUpperCase();
  const aRank = TIME_VIEW_EVENT_MATRIX_ORDER_INDEX.get(aEvent);
  const bRank = TIME_VIEW_EVENT_MATRIX_ORDER_INDEX.get(bEvent);

  if (aRank != null && bRank != null) return aRank - bRank;
  if (aRank != null) return -1;
  if (bRank != null) return 1;

  return aEvent.localeCompare(bEvent);
}

function toFiniteMatrixMetric(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatShortDateRangeLabel(startDay, endDay, fallback = "All Dates") {
  if (String(startDay || "") === ALL_TIME_START_DAY && !!endDay) return "All Time";

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

  if (presetKey === "all") {
    return { start: ALL_TIME_START_DAY, end: toIsoDayKey(current) };
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
        { key: "all", label: "All Time" },
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

function getSolveIdentityKey(solve) {
  if (!solve || typeof solve !== "object") return "";
  const solveRef = String(solve?.solveRef || solve?.SK || solve?.SolveID || "").trim();
  if (solveRef) return solveRef;

  return [
    String(solve?.event || solve?.Event || "").trim().toUpperCase(),
    String(solve?.sessionID || solve?.SessionID || "main").trim(),
    String(solve?.datetime || solve?.DateTime || solve?.CreatedAt || "").trim(),
    String(solve?.scramble || solve?.Scramble || "").trim(),
    String(solve?.rawTime ?? solve?.RawTimeMs ?? "").trim(),
    String(solve?.time ?? solve?.FinalTimeMs ?? "").trim(),
  ].join("::");
}

function withSolveFullIndices(solves, referenceSolves = solves) {
  const reference = Array.isArray(referenceSolves) ? referenceSolves : [];
  const indexMap = new Map();

  reference.forEach((solve, index) => {
    const key = getSolveIdentityKey(solve);
    if (key && !indexMap.has(key)) {
      indexMap.set(key, index);
    }
  });

  return (Array.isArray(solves) ? solves : []).map((solve, index) => {
    const key = getSolveIdentityKey(solve);
    const resolvedIndex =
      (key && indexMap.has(key) ? indexMap.get(key) : null) ??
      solve?.fullIndex ??
      index;

    return {
      ...solve,
      fullIndex: resolvedIndex,
    };
  });
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
  let sumFinalTimeSqMs = 0;
  let plus2BestMs = null;

  let bestSingleMs = null;
  let bestMo3Ms = null;
  let bestAo5Ms = null;
  let bestAo12Ms = null;
  let bestAo25Ms = null;
  let bestAo50Ms = null;
  let bestAo100Ms = null;
  let bestAo1000Ms = null;
  let worstSingleMs = null;
  let worstMo3Ms = null;
  let worstAo5Ms = null;
  let worstAo12Ms = null;
  let bestSingleSolveSK = null;
  let bestMo3StartSolveSK = null;
  let bestAo5StartSolveSK = null;
  let bestAo12StartSolveSK = null;
  let bestAo25StartSolveSK = null;
  let bestAo50StartSolveSK = null;
  let bestAo100StartSolveSK = null;
  let bestAo1000StartSolveSK = null;
  let worstSingleSolveSK = null;
  let worstMo3StartSolveSK = null;
  let worstAo5StartSolveSK = null;
  let worstAo12StartSolveSK = null;

  let bestSingleAt = null;
  let firstSolveAt = null;
  let lastSolveAt = null;

  const toFiniteMetricOrNull = (value) => {
    if (value == null || value === "") return null;
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  };

  const updateBestMetric = (currentValue, currentRef, nextValue, nextRef) => {
    const curr = toFiniteMetricOrNull(currentValue);
    const next = toFiniteMetricOrNull(nextValue);
    if (next == null) return { value: curr, ref: currentRef ?? null };
    if (curr == null || next < curr) return { value: next, ref: nextRef ?? null };
    return { value: curr, ref: currentRef ?? null };
  };

  const updateWorstMetric = (currentValue, currentRef, nextValue, nextRef) => {
    const curr = toFiniteMetricOrNull(currentValue);
    const next = toFiniteMetricOrNull(nextValue);
    if (next == null) return { value: curr, ref: currentRef ?? null };
    if (curr == null || next > curr) return { value: next, ref: nextRef ?? null };
    return { value: curr, ref: currentRef ?? null };
  };

  for (const s of items) {
    solveCountTotal += num(s.SolveCountTotal);
    solveCountIncluded += num(s.SolveCountIncluded);
    dnfCount += num(s.DNFCount);
    plus2Count += num(s.Plus2Count);
    sumFinalTimeMs += num(s.SumFinalTimeMs);
    sumFinalTimeSqMs += num(s.SumFinalTimeSqMs);
    plus2BestMs = updateBestMetric(plus2BestMs, null, s.Plus2BestMs, null).value;

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
    ({ value: worstSingleMs, ref: worstSingleSolveSK } = updateWorstMetric(
      worstSingleMs,
      worstSingleSolveSK,
      s.WorstSingleMs,
      s.WorstSingleSolveSK
    ));
    ({ value: worstMo3Ms, ref: worstMo3StartSolveSK } = updateWorstMetric(
      worstMo3Ms,
      worstMo3StartSolveSK,
      s.WorstMo3Ms,
      s.WorstMo3StartSolveSK
    ));
    ({ value: worstAo5Ms, ref: worstAo5StartSolveSK } = updateWorstMetric(
      worstAo5Ms,
      worstAo5StartSolveSK,
      s.WorstAo5Ms,
      s.WorstAo5StartSolveSK
    ));
    ({ value: worstAo12Ms, ref: worstAo12StartSolveSK } = updateWorstMetric(
      worstAo12Ms,
      worstAo12StartSolveSK,
      s.WorstAo12Ms,
      s.WorstAo12StartSolveSK
    ));

    bestSingleAt = maxIso(bestSingleAt, s.BestSingleAt);
    firstSolveAt = minIso(firstSolveAt, s.FirstSolveAt);
    lastSolveAt = maxIso(lastSolveAt, s.LastSolveAt);
  }

  return {
    SolveCountTotal: solveCountTotal,
    SolveCountIncluded: solveCountIncluded,
    DNFCount: dnfCount,
    Plus2Count: plus2Count,
    SumFinalTimeMs: sumFinalTimeMs,
    SumFinalTimeSqMs: sumFinalTimeSqMs,
    MeanMs: solveCountIncluded > 0 ? Math.round(sumFinalTimeMs / solveCountIncluded) : null,
    Plus2BestMs: plus2BestMs,
    BestSingleMs: bestSingleMs,
    BestSingleSolveSK: bestSingleSolveSK,
    WorstSingleMs: worstSingleMs,
    WorstSingleSolveSK: worstSingleSolveSK,
    BestMo3Ms: bestMo3Ms,
    BestMo3StartSolveSK: bestMo3StartSolveSK,
    WorstMo3Ms: worstMo3Ms,
    WorstMo3StartSolveSK: worstMo3StartSolveSK,
    BestAo5Ms: bestAo5Ms,
    BestAo5StartSolveSK: bestAo5StartSolveSK,
    WorstAo5Ms: worstAo5Ms,
    WorstAo5StartSolveSK: worstAo5StartSolveSK,
    BestAo12Ms: bestAo12Ms,
    BestAo12StartSolveSK: bestAo12StartSolveSK,
    WorstAo12Ms: worstAo12Ms,
    WorstAo12StartSolveSK: worstAo12StartSolveSK,
    BestAo25Ms: bestAo25Ms,
    BestAo25StartSolveSK: bestAo25StartSolveSK,
    BestAo50Ms: bestAo50Ms,
    BestAo50StartSolveSK: bestAo50StartSolveSK,
    BestAo100Ms: bestAo100Ms,
    BestAo100StartSolveSK: bestAo100StartSolveSK,
    BestAo1000Ms: bestAo1000Ms,
    BestAo1000StartSolveSK: bestAo1000StartSolveSK,
    BestSingleAt: bestSingleAt,
    FirstSolveAt: firstSolveAt,
    LastSolveAt: lastSolveAt,
  };
}

function buildEventMatrixStatsFromSolves(solves) {
  const items = Array.isArray(solves) ? solves : [];
  const singleBestSolve = findSingleSolve(items, "best");
  const singleWorstSolve = findSingleSolve(items, "worst");
  const ao5BestWindow = findWindowForMetric(items, WINDOW_SPECS.ao5, "best");
  const ao5WorstWindow = findWindowForMetric(items, WINDOW_SPECS.ao5, "worst");
  const ao12BestWindow = findWindowForMetric(items, WINDOW_SPECS.ao12, "best");
  const ao12WorstWindow = findWindowForMetric(items, WINDOW_SPECS.ao12, "worst");

  return {
    SolveCountTotal: items.length,
    BestSingleMs: getSolveDisplayMs(singleBestSolve),
    BestSingleSolveSK: singleBestSolve?.solveRef || singleBestSolve?.SK || null,
    WorstSingleMs: getSolveDisplayMs(singleWorstSolve),
    WorstSingleSolveSK: singleWorstSolve?.solveRef || singleWorstSolve?.SK || null,
    BestAo5Ms: computeWindowAverage(ao5BestWindow, WINDOW_SPECS.ao5),
    BestAo5StartSolveSK: ao5BestWindow?.[0]?.solveRef || ao5BestWindow?.[0]?.SK || null,
    WorstAo5Ms: computeWindowAverage(ao5WorstWindow, WINDOW_SPECS.ao5),
    WorstAo5StartSolveSK: ao5WorstWindow?.[0]?.solveRef || ao5WorstWindow?.[0]?.SK || null,
    BestAo12Ms: computeWindowAverage(ao12BestWindow, WINDOW_SPECS.ao12),
    BestAo12StartSolveSK: ao12BestWindow?.[0]?.solveRef || ao12BestWindow?.[0]?.SK || null,
    WorstAo12Ms: computeWindowAverage(ao12WorstWindow, WINDOW_SPECS.ao12),
    WorstAo12StartSolveSK: ao12WorstWindow?.[0]?.solveRef || ao12WorstWindow?.[0]?.SK || null,
  };
}

function canUseDayBucketScope({
  userID,
  hasActiveTagFilter,
  statsViewMode,
  hasActiveDateFilter,
  isAllEventsMode,
  isAllSessionsMode,
  sessionId,
}) {
  if (!userID) return false;
  if (hasActiveTagFilter) return false;
  if (statsViewMode !== "time" && !hasActiveDateFilter) return false;
  return isAllEventsMode || isAllSessionsMode || String(sessionId || "main") === "main";
}

function buildDayBucketScopeQuery({ isAllEventsMode, isAllSessionsMode, statsEvent, sessionId }) {
  if (isAllEventsMode) {
    return { event: "", mainOnly: false, scopeLabel: "all-events" };
  }

  if (isAllSessionsMode) {
    return {
      event: String(statsEvent || "").toUpperCase(),
      mainOnly: false,
      scopeLabel: "event",
    };
  }

  return {
    event: String(statsEvent || "").toUpperCase(),
    mainOnly: String(sessionId || "main") === "main",
    scopeLabel: "event-main",
  };
}

function buildPenaltyPieData(summary) {
  if (!summary) return [];
  const total = Number(summary?.SolveCountTotal || 0);
  const plus2 = Number(summary?.Plus2Count || 0);
  const dnf = Number(summary?.DNFCount || 0);
  const clean = Math.max(0, total - plus2 - dnf);
  return [
    { label: "Clean", value: clean },
    { label: "+2", value: plus2 },
    { label: "DNF", value: dnf },
  ].filter((entry) => entry.value > 0);
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

function estimateSolveCountForScope(sessionsList, { event, sessionID } = {}) {
  const ev = String(event || "").trim().toUpperCase();
  const sid = String(sessionID || "").trim() || "main";
  const items = Array.isArray(sessionsList) ? sessionsList : [];

  return items
    .filter((session) => {
      const sessionEvent = String(session?.Event || "").trim().toUpperCase();
      const sessionKey = String(session?.SessionID || "main");
      if (ev && ev !== ALL_EVENTS && sessionEvent !== ev) return false;
      if (sid && sid !== ALL_SESSIONS && sessionKey !== sid) return false;
      return !!sessionEvent;
    })
    .reduce((sum, session) => sum + Number(session?.Stats?.SolveCountTotal || 0), 0);
}

function describeStatsScope({ event, sessionID } = {}) {
  const ev = String(event || "").trim().toUpperCase();
  const sid = String(sessionID || "").trim() || "main";

  if (!ev || ev === ALL_EVENTS) return "all events";
  if (!sid || sid === ALL_SESSIONS) return `${ev} across all sessions`;
  if (sid === "main") return `${ev} main session`;
  return `${ev} ${sid}`;
}

function formatSolveEstimate(count) {
  const safe = Number(count || 0);
  return safe > 0 ? safe.toLocaleString() : "an unknown number of";
}

function formatDayEstimate(count) {
  const safe = Number(count || 0);
  return safe > 0 ? safe.toLocaleString() : "an unknown number of";
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

function getEffectiveTimeZone(user) {
  return String(
    user?.Settings?.timeZone ||
      user?.Settings?.TimeZone ||
      user?.Settings?.timezone ||
      user?.Settings?.Timezone ||
      ""
  ).trim();
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

function getInclusiveDaySpan(startDay, endDay) {
  const start = getDayKeyDate(startDay);
  const end = getDayKeyDate(endDay);
  if (!start || !end) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / 86400000)) + 1;
}

function clampRangeEndToToday(startDay, endDay) {
  const today = getTodayLocalDayKey();
  if (!startDay || !endDay || !today) return { start: startDay, end: endDay };
  if (String(endDay) <= String(today)) return { start: startDay, end: endDay };

  const span = Math.max(1, getInclusiveDaySpan(startDay, endDay));
  return {
    end: today,
    start: shiftLocalDayKey(today, -(span - 1)),
  };
}

function shouldPreferRawRangeView(dayCount, currentlyPreferred = false) {
  const safeDayCount = Math.max(0, Number(dayCount) || 0);
  if (safeDayCount <= 1) return true;
  if (!currentlyPreferred) return false;
  return safeDayCount <= MAX_RAW_INDEX_RANGE_DAYS;
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
  settings = {},
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
  viewerUser = null,
  readOnly = false,
  deleteTime,
  addPost,
  saveToProfile,
  onTagColorsChange = null,
  onSettingsContextChange,
  recomputeRequest = 0,
  importRequest = 0,
  exportRequest = 0,
  forceShowImportModal = false,
  forceShowExportModal = false,
  onImportModalOpenHandled = null,
  onExportModalOpenHandled = null,
  onSessionsListRefresh = null,
  onOverallStatsRecomputed = null,
}) {
  const { runDb } = useDbStatus();
  const viewerDisplayName = viewerUser?.Name || viewerUser?.UserID || "you";
  const statsOwnerDisplayName = user?.Name || user?.UserID || "this user";
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
  const effectiveTimeZone = useMemo(() => getEffectiveTimeZone(user), [user]);

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
  const [cachedEventMatrixStats, setCachedEventMatrixStats] = useState({});
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);
  const [overallStatsLoadSettledKey, setOverallStatsLoadSettledKey] = useState("");
  const [loadingEventMatrixStats, setLoadingEventMatrixStats] = useState(false);
  const [recomputeStatusText, setRecomputeStatusText] = useState("");

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves] = useState(false);
  const [loadingTimeScope, setLoadingTimeScope] = useState(false);
  const [loadingDayBuckets, setLoadingDayBuckets] = useState(false);
  const [loadingCompareDayBuckets, setLoadingCompareDayBuckets] = useState(false);
  const [loadingTagScope, setLoadingTagScope] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const [compareShowAllActive, setCompareShowAllActive] = useState(false);
  const [timeScopeSolves, setTimeScopeSolves] = useState([]);
  const [timeScopeCacheKey, setTimeScopeCacheKey] = useState("");
  const [overallScopeSolves, setOverallScopeSolves] = useState([]);
  const [overallScopeCacheKey, setOverallScopeCacheKey] = useState("");
  const [sessionOverallFallbackSolves, setSessionOverallFallbackSolves] = useState([]);
  const [sessionOverallFallbackCacheKey, setSessionOverallFallbackCacheKey] = useState("");
  const [tagScopeSolves, setTagScopeSolves] = useState([]);
  const [tagScopeCacheKey, setTagScopeCacheKey] = useState("");
  const [dateScopedSessionSolves, setDateScopedSessionSolves] = useState([]);
  const [dateScopedSessionCacheKey, setDateScopedSessionCacheKey] = useState("");
  const [loadingDateScopedSolves, setLoadingDateScopedSolves] = useState(false);
  const [dayBucketRangeData, setDayBucketRangeData] = useState({ items: [], aggregateSummary: null, scope: "" });
  const [dayBucketRangeKey, setDayBucketRangeKey] = useState("");
  const [compareDayBucketRangeData, setCompareDayBucketRangeData] = useState({
    items: [],
    aggregateSummary: null,
    scope: "",
  });
  const [compareDayBucketRangeKey, setCompareDayBucketRangeKey] = useState("");

  const [pageCursor, setPageCursor] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isAllLoaded, setIsAllLoaded] = useState(false);

  const requestTokenRef = useRef(0);
  const previousHasActiveTagFilterRef = useRef(false);
  const summaryFallbackDecisionRef = useRef(new Map());

  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const sessionMenuWrapRef = useRef(null);

  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const recomputeRequestRef = useRef(null);
  const importRequestRef = useRef(null);
  const exportRequestRef = useRef(null);
  const [statsViewMode, setStatsViewMode] = useState("standard");
  const [standardSubview, setStandardSubview] = useState("solves");
  const [timeViewMainSessionsOnly, setTimeViewMainSessionsOnly] = useState(true);
  const summaryLayout = "row";
  const showSolveCharts = isSolveLevelMode || statsViewMode === "time";
  const [selectedTimeDay, setSelectedTimeDay] = useState("");
  const [dateFilterStart, setDateFilterStart] = useState("");
  const [dateFilterEnd, setDateFilterEnd] = useState("");
  const [preferRawDateRangeView, setPreferRawDateRangeView] = useState(false);
  const [compareDateFilterStart, setCompareDateFilterStart] = useState("");
  const [compareDateFilterEnd, setCompareDateFilterEnd] = useState("");
  const hasActiveDateFilter = !!dateFilterStart || !!dateFilterEnd;
  const effectiveCompareDateFilterStart = linkStatsControls ? dateFilterStart : compareDateFilterStart;
  const effectiveCompareDateFilterEnd = linkStatsControls ? dateFilterEnd : compareDateFilterEnd;
  const hasActiveCompareDateFilter = !!effectiveCompareDateFilterStart || !!effectiveCompareDateFilterEnd;
  const dateScopedSessionKey = useMemo(() => {
    if (!user?.UserID || !isSolveLevelMode) return "";
    if (!dateFilterStart && !dateFilterEnd) return "";
    return [
      user.UserID,
      String(statsEvent || "").toUpperCase(),
      String(sessionId || "main"),
      dateFilterStart || "*",
      dateFilterEnd || "*",
      effectiveTimeZone || "*",
    ].join("::");
  }, [dateFilterEnd, dateFilterStart, effectiveTimeZone, isSolveLevelMode, sessionId, statsEvent, user?.UserID]);
  const dateRangeQueryOpts = useMemo(
    () => ({
      ...(dateFilterStart ? { startDay: dateFilterStart } : {}),
      ...(dateFilterEnd ? { endDay: dateFilterEnd } : {}),
      ...(effectiveTimeZone ? { timeZone: effectiveTimeZone } : {}),
    }),
    [dateFilterEnd, dateFilterStart, effectiveTimeZone]
  );
  const compareDateRangeQueryOpts = useMemo(
    () => ({
      ...(effectiveCompareDateFilterStart ? { startDay: effectiveCompareDateFilterStart } : {}),
      ...(effectiveCompareDateFilterEnd ? { endDay: effectiveCompareDateFilterEnd } : {}),
      ...(effectiveTimeZone ? { timeZone: effectiveTimeZone } : {}),
    }),
    [effectiveCompareDateFilterEnd, effectiveCompareDateFilterStart, effectiveTimeZone]
  );
  const compareEnabled = !!compareSelection;
  const canUseBucketRange = useMemo(
    () =>
      canUseDayBucketScope({
        userID: user?.UserID,
        hasActiveTagFilter,
        statsViewMode,
        hasActiveDateFilter,
        isAllEventsMode,
        isAllSessionsMode,
        sessionId,
      }),
    [
      hasActiveDateFilter,
      hasActiveTagFilter,
      isAllEventsMode,
      isAllSessionsMode,
      sessionId,
      statsViewMode,
      user?.UserID,
    ]
  );
  const canUseCompareBucketRange = useMemo(
    () =>
      compareEnabled &&
      canUseDayBucketScope({
        userID: user?.UserID,
        hasActiveTagFilter: hasActiveTagSelection(
          sanitizeTagSelection(compareSelection?.tags || makeEmptyTagSelection())
        ),
        statsViewMode,
        hasActiveDateFilter: hasActiveCompareDateFilter,
        isAllEventsMode: String(compareSelection?.event || "").toUpperCase() === ALL_EVENTS,
        isAllSessionsMode: String(compareSelection?.session || "main") === ALL_SESSIONS,
        sessionId: String(compareSelection?.session || "main"),
      }),
    [
      compareEnabled,
      hasActiveCompareDateFilter,
      compareSelection?.event,
      compareSelection?.session,
      compareSelection?.tags,
      statsViewMode,
      user?.UserID,
    ]
  );
  const bucketScopeQuery = useMemo(
    () => buildDayBucketScopeQuery({ isAllEventsMode, isAllSessionsMode, statsEvent, sessionId }),
    [isAllEventsMode, isAllSessionsMode, sessionId, statsEvent]
  );
  const compareBucketScopeQuery = useMemo(
    () =>
      buildDayBucketScopeQuery({
        isAllEventsMode: String(compareSelection?.event || "").toUpperCase() === ALL_EVENTS,
        isAllSessionsMode: String(compareSelection?.session || "main") === ALL_SESSIONS,
        statsEvent: String(compareSelection?.event || "").toUpperCase(),
        sessionId: String(compareSelection?.session || "main"),
      }),
    [compareSelection?.event, compareSelection?.session]
  );
  const dayBucketRangeRequestKey = useMemo(() => {
    if (!canUseBucketRange || !user?.UserID) return "";
    return [
      user.UserID,
      bucketScopeQuery.scopeLabel,
      bucketScopeQuery.event || "*",
      bucketScopeQuery.mainOnly ? "main" : "all",
      dateFilterStart || "*",
      dateFilterEnd || "*",
      effectiveTimeZone || "*",
    ].join("::");
  }, [
    bucketScopeQuery.event,
    bucketScopeQuery.mainOnly,
    bucketScopeQuery.scopeLabel,
    canUseBucketRange,
    dateFilterEnd,
    dateFilterStart,
    effectiveTimeZone,
    user?.UserID,
  ]);
  const compareDayBucketRangeRequestKey = useMemo(() => {
    if (!canUseCompareBucketRange || !user?.UserID) return "";
    return [
      user.UserID,
      compareBucketScopeQuery.scopeLabel,
      compareBucketScopeQuery.event || "*",
      compareBucketScopeQuery.mainOnly ? "main" : "all",
      effectiveCompareDateFilterStart || "*",
      effectiveCompareDateFilterEnd || "*",
      effectiveTimeZone || "*",
    ].join("::");
  }, [
    canUseCompareBucketRange,
    compareBucketScopeQuery.event,
    compareBucketScopeQuery.mainOnly,
    compareBucketScopeQuery.scopeLabel,
    effectiveCompareDateFilterEnd,
    effectiveCompareDateFilterStart,
    effectiveTimeZone,
    user?.UserID,
  ]);
  const [focusedCardId, setFocusedCardId] = useState("");
  const [focusActionMessage, setFocusActionMessage] = useState("");
  const [focusActionBusy, setFocusActionBusy] = useState("");
  const [shareIncludeChartControls, setShareIncludeChartControls] = useState(false);
  const [focusedLineChartControls, setFocusedLineChartControls] = useState(null);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedAverageDetail, setSelectedAverageDetail] = useState(null);
  const [expensiveStatsPrompt, setExpensiveStatsPrompt] = useState(null);
  const [tableCompareView, setTableCompareView] = useState("primary");
  const expensiveStatsPromptResolverRef = useRef(null);
  const profileChartStyle = useMemo(() => getProfileChartStyle(user), [user]);
  const safeTagConfig = useMemo(() => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG), [tagConfig]);
  const paletteOptions = useMemo(() => getPaletteOptions(), []);
  const resolveExpensiveStatsPrompt = useCallback((approved) => {
    const resolver = expensiveStatsPromptResolverRef.current;
    expensiveStatsPromptResolverRef.current = null;
    setExpensiveStatsPrompt(null);
    if (typeof resolver === "function") resolver(Boolean(approved));
  }, []);

  const requestExpensiveStatsPrompt = useCallback(({ title, subtitle = "", lines = [], confirmLabel = "Continue" }) => {
    return new Promise((resolve) => {
      expensiveStatsPromptResolverRef.current = resolve;
      setExpensiveStatsPrompt({
        title,
        subtitle,
        lines: (Array.isArray(lines) ? lines : []).filter(Boolean),
        confirmLabel,
      });
    });
  }, []);

  const warnBeforeSolveScan = useCallback(
    async ({
      title,
      intro,
      event = statsEvent,
      sessionID = sessionId,
      extraLines = [],
      confirmLabel = "Continue",
      estimateLabel = "Estimated solves touched",
      subtitle = "",
      estimateValue,
    }) => {
      const resolvedEstimate =
        estimateValue == null
          ? formatSolveEstimate(estimateSolveCountForScope(sessionsList, { event, sessionID }))
          : String(estimateValue || "").trim() || "an unknown number of";
      return requestExpensiveStatsPrompt({
        title,
        subtitle,
        confirmLabel,
        lines: [
          intro,
          `Scope: ${describeStatsScope({ event, sessionID })}.`,
          `${estimateLabel}: ${resolvedEstimate}.`,
          ...extraLines,
        ],
      });
    },
    [requestExpensiveStatsPrompt, sessionId, sessionsList, statsEvent]
  );

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
    const normalizedFullIndex = Number(item?.fullIndex ?? item?.FullIndex);

    return {
      solveRef: item.SK || item.SolveID || created,
      fullIndex: Number.isFinite(normalizedFullIndex) ? normalizedFullIndex : undefined,
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

  const timeScopeCacheIdentity = useMemo(() => {
    return [
      solveScopeSessionKey || "*",
      dateFilterStart || "*",
      dateFilterEnd || "*",
      effectiveTimeZone || "*",
    ].join("::");
  }, [dateFilterEnd, dateFilterStart, effectiveTimeZone, solveScopeSessionKey]);
  const overallScopeCacheIdentity = useMemo(
    () => [solveScopeSessionKey || "*", effectiveTimeZone || "*"].join("::"),
    [effectiveTimeZone, solveScopeSessionKey]
  );

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
    const sessionReference = allForEvent.filter(
      (s) => String(s?.sessionID || s?.SessionID || "main") === String(sessionId || "main")
    );

    return withSolveFullIndices(sessionReference, sessionReference);
  }, [sessions, statsEvent, sessionId, statsViewMode]);

  const hasDateScopedSessionCache = useMemo(() => {
    return !!dateScopedSessionKey && dateScopedSessionCacheKey === dateScopedSessionKey;
  }, [dateScopedSessionCacheKey, dateScopedSessionKey]);

  const hasScopedSolveCache = useMemo(() => {
    if (!user?.UserID) return false;
    if (!solveScopeSessionKey) return false;
    return timeScopeCacheKey === `${user.UserID}::${timeScopeCacheIdentity}`;
  }, [solveScopeSessionKey, timeScopeCacheIdentity, timeScopeCacheKey, user?.UserID]);

  const activeTagEntries = useMemo(() => {
    return Object.entries(sanitizeTagSelection(tagFilterSelection))
      .map(([field, value]) => [field, String(value || "").trim()])
      .filter(([, value]) => value);
  }, [tagFilterSelection]);

  const primaryIndexedTagFilter = useMemo(() => {
    if (activeTagEntries.length === 0) return null;
    const [field, value] = activeTagEntries[0];
    return { field, value };
  }, [activeTagEntries]);

  const indexedTagScope = useMemo(() => {
    if (!primaryIndexedTagFilter) return null;

    return {
      tagKey: primaryIndexedTagFilter.field,
      tagValue: primaryIndexedTagFilter.value,
      event: isAllEventsMode ? "" : String(statsEvent || "").toUpperCase(),
      sessionID:
        isAllEventsMode || isAllSessionsMode ? "" : String(sessionId || "main"),
    };
  }, [isAllEventsMode, isAllSessionsMode, primaryIndexedTagFilter, sessionId, statsEvent]);

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

  const canUseIndexedTagScope = !!indexedTagScope && !hasActiveDateFilter;

  const hasIndexedTagScopeCache = useMemo(() => {
    return !!indexedTagScopeKey && tagScopeCacheKey === indexedTagScopeKey;
  }, [indexedTagScopeKey, tagScopeCacheKey]);

  const scopeSolvesForSelection = useMemo(() => {
    const base =
      hasActiveDateFilter && isSolveLevelMode
        ? hasDateScopedSessionCache
          ? dateScopedSessionSolves
          : []
        : hasScopedSolveCache
        ? timeScopeSolves
        : sessionCachedSolves;
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
    hasActiveDateFilter,
    hasDateScopedSessionCache,
    dateScopedSessionSolves,
    isAllEventsMode,
    isAllSessionsMode,
    isSolveLevelMode,
    sessionCachedSolves,
    sessionId,
    statsEvent,
    timeScopeSolves,
  ]);

  const activeStandardSolves = useMemo(() => {
    const standardBaseSolves =
      hasActiveDateFilter && isSolveLevelMode
        ? hasDateScopedSessionCache
          ? dateScopedSessionSolves
          : []
        : selectedSessionSolves;
    const base = hasActiveTagFilter
      ? canUseIndexedTagScope && hasIndexedTagScopeCache
        ? tagScopeSolves
        : scopeSolvesForSelection
      : standardBaseSolves;
    const filtered = hasActiveTagFilter
      ? base.filter((solve) => solveMatchesTagSelection(solve, tagFilterSelection))
      : base;

    return withSolveFullIndices(filtered, standardBaseSolves);
  }, [
    canUseIndexedTagScope,
    dateScopedSessionSolves,
    hasActiveTagFilter,
    hasActiveDateFilter,
    hasDateScopedSessionCache,
    hasIndexedTagScopeCache,
    isSolveLevelMode,
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
        SessionName: normalizeSessionLabel(
          s.SessionID || "main",
          s.SessionName || s.Name || s.SessionID || "main"
        ),
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
  const comparePrimaryIndexedTagFilter = useMemo(() => {
    if (compareActiveTagEntries.length === 0) return null;
    const [field, value] = compareActiveTagEntries[0];
    return { field, value };
  }, [compareActiveTagEntries]);
  const compareIndexedTagScope = useMemo(() => {
    if (!comparePrimaryIndexedTagFilter) return null;
    return {
      tagKey: comparePrimaryIndexedTagFilter.field,
      tagValue: comparePrimaryIndexedTagFilter.value,
      event: compareEvent === ALL_EVENTS ? "" : String(compareEvent || "").toUpperCase(),
      sessionID:
        compareEvent === ALL_EVENTS || compareSessionId === ALL_SESSIONS
          ? ""
          : String(compareSessionId || "main"),
    };
  }, [compareEvent, comparePrimaryIndexedTagFilter, compareSessionId]);
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
  const canUseCompareIndexedTagScope = !!compareIndexedTagScope && !hasActiveCompareDateFilter;
  const hasCompareIndexedTagScopeCache = useMemo(() => {
    return !!compareIndexedTagScopeKey && compareTagScopeCacheKey === compareIndexedTagScopeKey;
  }, [compareIndexedTagScopeKey, compareTagScopeCacheKey]);
  const baseCompareStyle = useMemo(
    () =>
      getSeriesStyle(
        compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE,
        DEFAULT_COMPARE_PALETTE,
        profileChartStyle
      ),
    [compareSelection?.paletteKey, profileChartStyle]
  );
  const basePrimaryCompareStyle = useMemo(
    () =>
      getSeriesStyle(
        compareSelection?.primaryPaletteKey ?? primaryPaletteKey,
        DEFAULT_PRIMARY_PALETTE,
        profileChartStyle
      ),
    [compareSelection?.primaryPaletteKey, primaryPaletteKey, profileChartStyle]
  );
  const primaryTagAccentColor = useMemo(
    () =>
      getTagSelectionAccentColor(
        activeTagEntries,
        statsEvent === ALL_EVENTS ? "" : String(statsEvent || "").toUpperCase(),
        tagColorCatalog,
        basePrimaryCompareStyle?.primary || profileChartStyle?.primary || "#2EC4B6"
      ),
    [activeTagEntries, basePrimaryCompareStyle?.primary, profileChartStyle?.primary, statsEvent, tagColorCatalog]
  );
  const compareTagAccentColor = useMemo(
    () =>
      getTagSelectionAccentColor(
        compareActiveTagEntries,
        compareEvent === ALL_EVENTS ? "" : String(compareEvent || "").toUpperCase(),
        tagColorCatalog,
        baseCompareStyle?.primary || "#7c8cff"
      ),
    [baseCompareStyle?.primary, compareActiveTagEntries, compareEvent, tagColorCatalog]
  );
  const compareStyle = useMemo(
    () =>
      compareTagAccentColor
        ? buildTagSelectionSeriesStyle(compareTagAccentColor)
        : baseCompareStyle,
    [baseCompareStyle, compareTagAccentColor]
  );
  const primaryCompareStyle = useMemo(
    () =>
      primaryTagAccentColor
        ? buildTagSelectionSeriesStyle(primaryTagAccentColor)
        : basePrimaryCompareStyle,
    [basePrimaryCompareStyle, primaryTagAccentColor]
  );

  const compareSessionsForEvent = useMemo(() => {
    if (!compareEvent || compareEvent === ALL_EVENTS) return [];

    const list = (sessionsList || [])
      .filter((s) => String(s.Event || "").toUpperCase() === compareEvent)
      .map((s) => ({
        SessionID: s.SessionID || "main",
        SessionName: normalizeSessionLabel(
          s.SessionID || "main",
          s.SessionName || s.Name || s.SessionID || "main"
        ),
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
      if (statsViewMode === "time") {
        setTimeSelection((prev) =>
          prev?.session === ALL_SESSIONS ? prev : { ...prev, session: ALL_SESSIONS }
        );
      }
      return;
    }

    const valid = sessionsForEvent.some((s) => s.SessionID === statsSession);
    if (!valid) {
      const hasMain = sessionsForEvent.some((s) => s.SessionID === "main");
      const fallbackSession = hasMain ? "main" : (sessionsForEvent[0]?.SessionID || "main");
      if (statsViewMode === "time") {
        setTimeSelection((prev) =>
          prev?.session === fallbackSession ? prev : { ...prev, session: fallbackSession }
        );
      } else {
        setStandardSelection((prev) =>
          prev?.session === fallbackSession ? prev : { ...prev, session: fallbackSession }
        );
      }
    }
  }, [isAllEventsMode, sessionsForEvent, statsSession, statsViewMode]);

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
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    sessionsList,
    isAllEventsMode,
    isAllSessionsMode,
    hasActiveTagFilter,
  ]);

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID) {
      setLoadingOverallStats(false);
      setOverallStatsLoadSettledKey("");
      return;
    }

    if (isAllEventsMode || hasActiveTagFilter) {
      setLoadingOverallStats(false);
      setOverallStatsLoadSettledKey("");
      return;
    }

    const loadScopeKey = `${userID}::${String(statsEvent || "").toUpperCase()}::${String(
      isAllSessionsMode ? ALL_SESSIONS : sessionId || "main"
    )}`;
    let cancelled = false;

    (async () => {
      try {
        setLoadingOverallStats(true);
        setOverallStatsLoadSettledKey("");

        if (isAllSessionsMode) {
          const item = await getEventStats(userID, statsEvent);
          if (!cancelled) setOverallStatsForEvent((prev) => item || prev || null);
          return;
        }

        const item = await getSessionStats(userID, statsEvent, sessionId);
        if (!cancelled) setOverallStatsForEvent(item || null);
      } catch (e) {
        if (!cancelled) {
          console.error(isAllSessionsMode ? "Failed to load EVENTSTATS:" : "Failed to load SESSIONSTATS:", e);
          if (!isAllSessionsMode) setOverallStatsForEvent(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingOverallStats(false);
          setOverallStatsLoadSettledKey(loadScopeKey);
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
    isAllEventsMode,
    isAllSessionsMode,
    hasActiveTagFilter,
    statsMutationTick,
  ]);

  const timeViewMatrixEvents = useMemo(() => {
    if (statsViewMode !== "time") return [];

    const filteredSessions = (sessionsList || []).filter((session) => {
      const event = String(session?.Event || "").trim().toUpperCase();
      if (!event) return false;
      if (timeViewMainSessionsOnly) {
        return String(session?.SessionID || "main") === "main";
      }
      return true;
    });

    return Array.from(
      new Set(
        filteredSessions
          .map((session) => String(session?.Event || "").trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [sessionsList, statsViewMode, timeViewMainSessionsOnly]);

  const timeViewMatrixEventsKey = useMemo(
    () => timeViewMatrixEvents.join(","),
    [timeViewMatrixEvents]
  );

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID || statsViewMode !== "time") {
      setCachedEventMatrixStats({});
      setLoadingEventMatrixStats(false);
      return;
    }

    if (!timeViewMatrixEvents.length) {
      setCachedEventMatrixStats({});
      setLoadingEventMatrixStats(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingEventMatrixStats(true);
        const items = await Promise.all(
          timeViewMatrixEvents.map(async (event) => {
            const stats = timeViewMainSessionsOnly
              ? await getSessionStats(userID, event, "main")
              : await getEventStats(userID, event);
            return [event, stats || null];
          })
        );

        if (cancelled) return;
        setCachedEventMatrixStats(Object.fromEntries(items));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load cached event matrix stats:", error);
          setCachedEventMatrixStats({});
        }
      } finally {
        if (!cancelled) setLoadingEventMatrixStats(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.UserID, statsViewMode, timeViewMainSessionsOnly, timeViewMatrixEvents, timeViewMatrixEventsKey]);

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

  const loadDateScopedSessionSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID || !dateScopedSessionKey || !isSolveLevelMode) {
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
      return false;
    }

    if (dateScopedSessionCacheKey === dateScopedSessionKey) {
      return true;
    }

    setLoadingDateScopedSolves(true);
    const myToken = ++requestTokenRef.current;

    try {
      let cursor = null;
      let accumulated = [];
      let pageCount = 0;
      const seenCursors = new Set();
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey(dateScopedSessionKey);

      do {
        const { items, lastKey } = await getSolvesBySessionPage(
          userID,
          String(statsEvent || "").toUpperCase(),
          String(sessionId || "main"),
          1000,
          cursor,
          dateRangeQueryOpts
        );

        if (requestTokenRef.current !== myToken) return false;

        const pageOldestToNewest = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .reverse();

        accumulated = [...pageOldestToNewest, ...accumulated];
        setDateScopedSessionSolves(
          withSolveFullIndices(
            accumulated,
            Array.isArray(selectedSessionSolves) && selectedSessionSolves.length
              ? selectedSessionSolves
              : accumulated
          )
        );

        pageCount += 1;
        if (pageCount > 100) {
          console.warn("Aborting date-scoped session load after 100 pages", {
            userID,
            statsEvent,
            sessionId,
            dateRangeQueryOpts,
          });
          break;
        }

        const nextCursorKey = lastKey ? JSON.stringify(lastKey) : "";
        if (nextCursorKey && seenCursors.has(nextCursorKey)) {
          console.warn("Aborting date-scoped session load after repeated cursor", {
            userID,
            statsEvent,
            sessionId,
            dateRangeQueryOpts,
          });
          break;
        }
        if (nextCursorKey) seenCursors.add(nextCursorKey);
        cursor = lastKey || null;
      } while (cursor);

      return true;
    } catch (error) {
      console.error("Failed to load date-scoped session solves:", error);
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
      return false;
    } finally {
      if (requestTokenRef.current === myToken) {
        setLoadingDateScopedSolves(false);
      }
    }
  }, [
    dateRangeQueryOpts,
    dateScopedSessionCacheKey,
    dateScopedSessionKey,
    isSolveLevelMode,
    normalizeSolve,
    selectedSessionSolves,
    sessionId,
    statsEvent,
    user?.UserID,
  ]);

  useEffect(() => {
    if (!hasActiveDateFilter || statsViewMode !== "standard" || !isSolveLevelMode) {
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
      setLoadingDateScopedSolves(false);
      return;
    }

    loadDateScopedSessionSolves();
  }, [hasActiveDateFilter, isSolveLevelMode, loadDateScopedSessionSolves, statsViewMode]);

  useEffect(() => {
    if (!canUseBucketRange || !dayBucketRangeRequestKey) {
      setDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
      setDayBucketRangeKey("");
      setLoadingDayBuckets(false);
      return;
    }

    if (dayBucketRangeKey === dayBucketRangeRequestKey) return;

    let cancelled = false;
    setLoadingDayBuckets(true);

    (async () => {
      try {
        const data = await getDayBuckets(user.UserID, {
          event: bucketScopeQuery.event,
          mainOnly: bucketScopeQuery.mainOnly,
          startDay: dateFilterStart,
          endDay: dateFilterEnd,
          timeZone: effectiveTimeZone,
        });
        if (cancelled) return;
        setDayBucketRangeData({
          items: Array.isArray(data?.items) ? data.items : [],
          aggregateSummary: data?.aggregateSummary || null,
          scope: data?.scope || bucketScopeQuery.scopeLabel,
        });
        setDayBucketRangeKey(dayBucketRangeRequestKey);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load day buckets:", error);
        setDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
        setDayBucketRangeKey("");
      } finally {
        if (!cancelled) setLoadingDayBuckets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bucketScopeQuery.event,
    bucketScopeQuery.mainOnly,
    bucketScopeQuery.scopeLabel,
    canUseBucketRange,
    dateFilterEnd,
    dateFilterStart,
    dayBucketRangeKey,
    dayBucketRangeRequestKey,
    effectiveTimeZone,
    user?.UserID,
  ]);

  useEffect(() => {
    if (!canUseCompareBucketRange || !compareDayBucketRangeRequestKey) {
      setCompareDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
      setCompareDayBucketRangeKey("");
      setLoadingCompareDayBuckets(false);
      return;
    }

    if (compareDayBucketRangeKey === compareDayBucketRangeRequestKey) return;

    let cancelled = false;
    setLoadingCompareDayBuckets(true);

    (async () => {
      try {
        const data = await getDayBuckets(user.UserID, {
          event: compareBucketScopeQuery.event,
          mainOnly: compareBucketScopeQuery.mainOnly,
          startDay: effectiveCompareDateFilterStart,
          endDay: effectiveCompareDateFilterEnd,
          timeZone: effectiveTimeZone,
        });
        if (cancelled) return;
        setCompareDayBucketRangeData({
          items: Array.isArray(data?.items) ? data.items : [],
          aggregateSummary: data?.aggregateSummary || null,
          scope: data?.scope || compareBucketScopeQuery.scopeLabel,
        });
        setCompareDayBucketRangeKey(compareDayBucketRangeRequestKey);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load compare day buckets:", error);
        setCompareDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
        setCompareDayBucketRangeKey("");
      } finally {
        if (!cancelled) setLoadingCompareDayBuckets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canUseCompareBucketRange,
    compareBucketScopeQuery.event,
    compareBucketScopeQuery.mainOnly,
    compareBucketScopeQuery.scopeLabel,
    compareDayBucketRangeKey,
    compareDayBucketRangeRequestKey,
    effectiveCompareDateFilterEnd,
    effectiveCompareDateFilterStart,
    effectiveTimeZone,
    user?.UserID,
  ]);

  const loadTimeScopeSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return false;
    if (!solveScopeSessionKey) {
      setTimeScopeSolves([]);
      setTimeScopeCacheKey("");
      return false;
    }

    const cacheKey = `${userID}::${timeScopeCacheIdentity}`;
    if (timeScopeCacheKey === cacheKey && timeScopeSolves.length > 0) return true;

    setLoadingTimeScope(true);

    try {
      const results = await Promise.all(
        solveScopeSessions.map(async (session) => {
          const ev = String(session?.Event || "").toUpperCase();
          const sid = String(session?.SessionID || "main");
          if (!ev) return [];
          const items = await getSolvesBySession(
            userID,
            ev,
            sid,
            hasActiveDateFilter ? dateRangeQueryOpts : {}
          );
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
    timeScopeCacheIdentity,
    dateRangeQueryOpts,
    hasActiveDateFilter,
    timeScopeCacheKey,
    timeScopeSolves.length,
    user?.UserID,
  ]);

  const loadOverallScopeSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID || !solveScopeSessionKey || hasActiveTagFilter) {
      setOverallScopeSolves([]);
      setOverallScopeCacheKey("");
      return null;
    }

    const cacheKey = `${userID}::${overallScopeCacheIdentity}`;
    if (overallScopeCacheKey === cacheKey && overallScopeSolves.length > 0) {
      return overallScopeSolves;
    }

    try {
      const results = await Promise.all(
        solveScopeSessions.map(async (session) => {
          const ev = String(session?.Event || "").toUpperCase();
          const sid = String(session?.SessionID || "main");
          if (!ev) return [];
          const items = await getSolvesBySession(userID, ev, sid, effectiveTimeZone ? { timeZone: effectiveTimeZone } : {});
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

      setOverallScopeSolves(merged);
      setOverallScopeCacheKey(cacheKey);
      return merged;
    } catch (error) {
      console.error("Failed to load overall scope solves:", error);
      setOverallScopeSolves([]);
      setOverallScopeCacheKey("");
      return null;
    }
  }, [
    effectiveTimeZone,
    hasActiveTagFilter,
    normalizeSolve,
    overallScopeCacheIdentity,
    overallScopeCacheKey,
    overallScopeSolves.length,
    solveScopeSessionKey,
    solveScopeSessions,
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

  const wantsPeriodAwareEventMatrix =
    statsViewMode === "time" && isAllEventsMode && hasActiveDateFilter && !compareEnabled;
  const wantsRawTimeScope =
    statsViewMode === "time" &&
    (preferRawDateRangeView || hasActiveTagFilter || wantsPeriodAwareEventMatrix);

  useEffect(() => {
    if (!wantsRawTimeScope) return;
    loadTimeScopeSolves();
  }, [loadTimeScopeSolves, wantsRawTimeScope]);

  useEffect(() => {
    if (hasActiveTagFilter) {
      setOverallScopeSolves([]);
      setOverallScopeCacheKey("");
    }
  }, [hasActiveTagFilter]);

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
  const selectedSolveDiscoveredTagOptions = useMemo(() => {
    const selectedSolveEvent = String(
      selectedSolve?.event || selectedSolve?.Event || statsEvent || ""
    ).toUpperCase();

    return mergeTagOptionMaps(
      baseTagOptions,
      getTagCatalogOptionsForStatsEvent(tagCatalog, selectedSolveEvent || statsEvent),
      discoveredTagOptions,
      compareDiscoveredTagOptions,
      collectTagSelectionOptions(
        selectedSolve ? [selectedSolve] : [],
        safeTagConfig,
        cubeModelOptions
      )
    );
  }, [
    baseTagOptions,
    compareDiscoveredTagOptions,
    cubeModelOptions,
    discoveredTagOptions,
    safeTagConfig,
    selectedSolve,
    statsEvent,
    tagCatalog,
  ]);
  const selectedSolveTagEvent = useMemo(
    () => String(selectedSolve?.event || selectedSolve?.Event || statsEvent || "").toUpperCase(),
    [selectedSolve, statsEvent]
  );
  const selectedSolveTagColors = useMemo(
    () => getTagColorMapForEvent(tagColorCatalog, selectedSolveTagEvent),
    [selectedSolveTagEvent, tagColorCatalog]
  );
  const handleSelectedSolveTagColorsChange = useMemo(
    () =>
      typeof onTagColorsChange === "function" && selectedSolveTagEvent
        ? (next) => onTagColorsChange(selectedSolveTagEvent, next)
        : null,
    [onTagColorsChange, selectedSolveTagEvent]
  );

  useEffect(() => {
    if (!compareEnabled || statsViewMode !== "standard" || !showSolveCharts || !user?.UserID) {
      setCompareSessionSolves([]);
      setCompareTagScopeSolves([]);
      setCompareTagScopeCacheKey("");
      setCompareLoading(false);
      return;
    }

    if (canUseCompareBucketRange) {
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
        } else if (!hasActiveCompareDateFilter) {
          const out = await getSolvesBySessionPage(
            user.UserID,
            compareEvent,
            compareSessionId,
            DEFAULT_IN_VIEW
          );
          items = out?.items || [];
        } else {
          items = await getSolvesBySession(
            user.UserID,
            compareEvent,
            compareSessionId,
            hasActiveCompareDateFilter ? compareDateRangeQueryOpts : {}
          );
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
    DEFAULT_IN_VIEW,
    canUseCompareIndexedTagScope,
    canUseCompareBucketRange,
    compareDateRangeQueryOpts,
    hasActiveCompareDateFilter,
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
    const dateScoped = filterSolvesByDateRange(
      compareBaseSolves,
      effectiveCompareDateFilterStart,
      effectiveCompareDateFilterEnd
    );
    if (!hasActiveTagSelection(compareTagSelection)) {
      return withSolveFullIndices(dateScoped, compareBaseSolves);
    }
    return withSolveFullIndices(
      dateScoped.filter((solve) => solveMatchesTagSelection(solve, compareTagSelection)),
      compareBaseSolves
    );
  }, [
    compareEnabled,
    compareTagScopeSolves,
    compareSessionSolves,
    compareTagSelection,
    effectiveCompareDateFilterEnd,
    effectiveCompareDateFilterStart,
    hasCompareIndexedTagScopeCache,
    canUseCompareIndexedTagScope,
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
  }, [
    compareEndIndex,
    compareFilteredRawSolves,
    compareStartIndex,
    effectiveCompareShowAllActive,
  ]);

  const visiblePageFilteredRawSolves = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves;
    return filterRawSolveList(filterSolvesByDateRange(visiblePageRawSolves, dateFilterStart, dateFilterEnd));
  }, [
    allLoadedFilteredRawSolves,
    dateFilterEnd,
    dateFilterStart,
    filterRawSolveList,
    statsViewMode,
    visiblePageRawSolves,
  ]);

  const pieChartSolves = useMemo(() => {
    return allLoadedFilteredRawSolves;
  }, [allLoadedFilteredRawSolves]);

  const chartVisibleSolves = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves;
    return visiblePageFilteredRawSolves;
  }, [allLoadedFilteredRawSolves, statsViewMode, visiblePageFilteredRawSolves]);

  const timeViewFocusedSolves = useMemo(() => {
    if (statsViewMode !== "time") return chartVisibleSolves;
    if (hasActiveDateFilter) return allLoadedFilteredRawSolves;

    const latestSolve = allLoadedFilteredRawSolves[allLoadedFilteredRawSolves.length - 1] || null;
    const focusDay = String(
      selectedTimeDay || getLocalDayKey(getSolveDate(latestSolve)) || ""
    ).trim();
    if (!focusDay) return allLoadedFilteredRawSolves;

    return allLoadedFilteredRawSolves.filter((solve) => {
      const date = getSolveDate(solve);
      return getLocalDayKey(date) === focusDay;
    });
  }, [
    allLoadedFilteredRawSolves,
    chartVisibleSolves,
    hasActiveDateFilter,
    selectedTimeDay,
    statsViewMode,
  ]);

  const barChartSolves = useMemo(() => {
    if (statsViewMode === "time") return timeViewFocusedSolves;
    return visiblePageFilteredRawSolves;
  }, [statsViewMode, timeViewFocusedSolves, visiblePageFilteredRawSolves]);

  const timeViewLineSolves = useMemo(() => {
    return statsViewMode === "time" ? timeViewFocusedSolves : chartVisibleSolves;
  }, [chartVisibleSolves, statsViewMode, timeViewFocusedSolves]);

  const summaryCurrentSolves = useMemo(() => {
    return statsViewMode === "time" ? chartVisibleSolves : visiblePageFilteredRawSolves;
  }, [chartVisibleSolves, statsViewMode, visiblePageFilteredRawSolves]);

  const comparisonPrimarySolves = useMemo(() => {
    return compareEnabled ? visiblePageFilteredRawSolves : [];
  }, [compareEnabled, visiblePageFilteredRawSolves]);
  const isTagBreakdownView = statsViewMode === "standard" && standardSubview === "tags";

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

  const appendOlderSessionPages = useCallback(async ({ maxPages = 1, minSolveCount = null } = {}) => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;
    if (!hasMoreOlder || !pageCursor || loadingMore) return;

    setLoadingMore(true);
    const myToken = ++requestTokenRef.current;

    try {
      let cursor = pageCursor;
      let lastKey = pageCursor;
      let pagesLoaded = 0;
      const accumulated = [];
      const targetCount =
        minSolveCount == null ? null : Math.max(0, Number(minSolveCount) || 0);

      while (cursor && pagesLoaded < Math.max(1, Number(maxPages) || 1)) {
        const out = await getSolvesBySessionPage(
          userID,
          String(statsEvent || "").toUpperCase(),
          sessionId,
          DEFAULT_PAGE_FETCH,
          cursor
        );

        if (requestTokenRef.current !== myToken) return { addedCount: 0, lastKey: cursor, hasMore: true };

        const pageOldestToNewest = (out?.items || []).map(normalizeSolve).reverse();
        if (pageOldestToNewest.length) accumulated.push(...pageOldestToNewest);

        lastKey = out?.lastKey || null;
        cursor = lastKey;
        pagesLoaded += 1;

        if (targetCount != null && activeStandardSolves.length + accumulated.length >= targetCount) {
          break;
        }

        if (!cursor) break;
      }

      if (requestTokenRef.current !== myToken) return;

      const pageOldestToNewest = accumulated;

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
      return {
        addedCount: pageOldestToNewest.length,
        lastKey: lastKey || null,
        hasMore: !!lastKey,
      };
    } catch (err) {
      console.error("Failed to fetch older solves page:", err);
      return { addedCount: 0, lastKey: pageCursor, hasMore: hasMoreOlder };
    } finally {
      if (requestTokenRef.current === myToken) setLoadingMore(false);
    }
  }, [
    activeStandardSolves.length,
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

  const fetchNextOlderPage = useCallback(async () => {
    return appendOlderSessionPages({ maxPages: 1 });
  }, [appendOlderSessionPages]);

  const allEventsBreakdown = useMemo(() => {
    return getAllEventsBreakdownFromSessionsList(sessionsList);
  }, [sessionsList]);

  const allEventsOverall = useMemo(() => {
    return aggregateStatsList(allEventsBreakdown.map((row) => row.stats));
  }, [allEventsBreakdown]);
  const timeViewEventMatrixItems = useMemo(() => {
    if (hasActiveDateFilter) {
      const solvesByEvent = new Map();

      for (const solve of allLoadedFilteredRawSolves || []) {
        const event = String(solve?.event || solve?.Event || "").trim().toUpperCase();
        if (!event) continue;
        if (timeViewMainSessionsOnly && String(solve?.sessionID || solve?.SessionID || "main") !== "main") {
          continue;
        }
        if (!solvesByEvent.has(event)) solvesByEvent.set(event, []);
        solvesByEvent.get(event).push(solve);
      }

      return Array.from(solvesByEvent.entries())
        .map(([event, solves]) => {
          const aggregate = buildEventMatrixStatsFromSolves(solves);
          return {
            event,
            mainOnly: timeViewMainSessionsOnly,
            solveCount: Number(aggregate?.SolveCountTotal || 0),
            singleBest: toFiniteMatrixMetric(aggregate?.BestSingleMs),
            singleWorst: toFiniteMatrixMetric(aggregate?.WorstSingleMs),
            ao5Best: toFiniteMatrixMetric(aggregate?.BestAo5Ms),
            ao5Worst: toFiniteMatrixMetric(aggregate?.WorstAo5Ms),
            ao12Best: toFiniteMatrixMetric(aggregate?.BestAo12Ms),
            ao12Worst: toFiniteMatrixMetric(aggregate?.WorstAo12Ms),
            refs: {
              singleBest: aggregate?.BestSingleSolveSK || null,
              singleWorst: aggregate?.WorstSingleSolveSK || null,
              ao5Best: aggregate?.BestAo5StartSolveSK || null,
              ao5Worst: aggregate?.WorstAo5StartSolveSK || null,
              ao12Best: aggregate?.BestAo12StartSolveSK || null,
              ao12Worst: aggregate?.WorstAo12StartSolveSK || null,
            },
          };
        })
        .filter((item) => item.solveCount > 0)
        .sort(compareTimeViewEventMatrixItems);
    }

    const filteredSessions = (sessionsList || []).filter((session) => {
      const event = String(session?.Event || "").trim().toUpperCase();
      if (!event) return false;
      if (timeViewMainSessionsOnly) {
        return String(session?.SessionID || "main") === "main";
      }
      return true;
    });

    const statsByEvent = new Map();
    for (const session of filteredSessions) {
      const event = String(session?.Event || "").trim().toUpperCase();
      if (!event) continue;
      if (!statsByEvent.has(event)) statsByEvent.set(event, []);
      if (session?.Stats) statsByEvent.get(event).push(session.Stats);
    }

    return Array.from(statsByEvent.entries())
      .map(([event, statsList]) => {
        const fallbackAggregate = aggregateStatsList(statsList);
        const aggregate = cachedEventMatrixStats[event] || fallbackAggregate;
        return {
          event,
          mainOnly: timeViewMainSessionsOnly,
          solveCount: Number(aggregate?.SolveCountTotal || 0),
          singleBest: toFiniteMatrixMetric(aggregate?.BestSingleMs),
          singleWorst: toFiniteMatrixMetric(aggregate?.WorstSingleMs),
          ao5Best: toFiniteMatrixMetric(aggregate?.BestAo5Ms),
          ao5Worst: toFiniteMatrixMetric(aggregate?.WorstAo5Ms),
          ao12Best: toFiniteMatrixMetric(aggregate?.BestAo12Ms),
          ao12Worst: toFiniteMatrixMetric(aggregate?.WorstAo12Ms),
          refs: {
            singleBest: aggregate?.BestSingleSolveSK || null,
            singleWorst: aggregate?.WorstSingleSolveSK || null,
            ao5Best: aggregate?.BestAo5StartSolveSK || null,
            ao5Worst: aggregate?.WorstAo5StartSolveSK || null,
            ao12Best: aggregate?.BestAo12StartSolveSK || null,
            ao12Worst: aggregate?.WorstAo12StartSolveSK || null,
          },
        };
      })
      .filter((item) => item.solveCount > 0)
      .sort(compareTimeViewEventMatrixItems);
  }, [allLoadedFilteredRawSolves, cachedEventMatrixStats, hasActiveDateFilter, sessionsList, timeViewMainSessionsOnly]);
  const useCachedOverallStats = statsViewMode === "standard" && !hasActiveDateFilter && !hasActiveTagFilter;
  const effectiveOverallStats = useCachedOverallStats ? overallStatsForEvent : null;
  const activeBucketItems = useMemo(
    () =>
      canUseBucketRange && dayBucketRangeKey === dayBucketRangeRequestKey
        ? dayBucketRangeData.items || []
        : [],
    [canUseBucketRange, dayBucketRangeData.items, dayBucketRangeKey, dayBucketRangeRequestKey]
  );
  const activeBucketSummary = useMemo(
    () =>
      canUseBucketRange && dayBucketRangeKey === dayBucketRangeRequestKey
        ? dayBucketRangeData.aggregateSummary || null
        : null,
    [
      canUseBucketRange,
      dayBucketRangeData.aggregateSummary,
      dayBucketRangeKey,
      dayBucketRangeRequestKey,
    ]
  );
  const timeViewEventBreakdownData = useMemo(() => {
    if (!isAllEventsMode) return [];

    if (!hasActiveDateFilter) {
      return (allEventsBreakdown || []).map((row) => ({
        label: String(row?.event || "Unknown"),
        value: Number(row?.stats?.SolveCountTotal || 0),
        solves: [],
      }));
    }

    if (activeBucketSummary && Array.isArray(activeBucketItems) && activeBucketItems.length > 0) {
      const grouped = new Map();
      for (const item of activeBucketItems) {
        const event = String(item?.Event || "").trim().toUpperCase() || "Unknown";
        const count = Number(item?.SolveCountTotal || 0);
        if (count <= 0) continue;
        grouped.set(event, (grouped.get(event) || 0) + count);
      }
      const rows = Array.from(grouped.entries())
        .map(([label, value]) => ({ label, value, solves: [] }))
        .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
      if (rows.some((row) => row.label !== "Unknown")) return rows;
    }

    const grouped = new Map();
    for (const solve of pieChartSolves || []) {
      const event = String(solve?.event || solve?.Event || "").trim().toUpperCase() || "Unknown";
      grouped.set(event, (grouped.get(event) || 0) + 1);
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value, solves: [] }))
      .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
  }, [activeBucketItems, activeBucketSummary, allEventsBreakdown, hasActiveDateFilter, isAllEventsMode, pieChartSolves]);
  const activeCompareBucketItems = useMemo(
    () =>
      canUseCompareBucketRange && compareDayBucketRangeKey === compareDayBucketRangeRequestKey
        ? compareDayBucketRangeData.items || []
        : [],
    [
      canUseCompareBucketRange,
      compareDayBucketRangeData.items,
      compareDayBucketRangeKey,
      compareDayBucketRangeRequestKey,
    ]
  );
  const activeCompareBucketSummary = useMemo(
    () =>
      canUseCompareBucketRange && compareDayBucketRangeKey === compareDayBucketRangeRequestKey
        ? compareDayBucketRangeData.aggregateSummary || null
        : null,
    [
      canUseCompareBucketRange,
      compareDayBucketRangeData.aggregateSummary,
      compareDayBucketRangeKey,
      compareDayBucketRangeRequestKey,
    ]
  );
  const isSingleDayDateFilter = !!dateFilterStart && !!dateFilterEnd && dateFilterStart === dateFilterEnd;
  const useBucketBackedRange = !!activeBucketSummary && !preferRawDateRangeView;
  const isAllTimeBucketOverview = useBucketBackedRange &&
    statsViewMode === "standard" &&
    dateFilterStart === ALL_TIME_START_DAY &&
    !!dateFilterEnd;
  const bucketSourceLabel = useMemo(() => {
    if (!useBucketBackedRange) return "";
    if (statsViewMode === "time") return "Aggregated days";
    return "Bucketed range";
  }, [statsViewMode, useBucketBackedRange]);
  const canonicalOverallStats = useMemo(() => {
    if (hasActiveTagFilter) return null;
    if (isAllEventsMode) {
      return useCachedOverallStats || isAllTimeBucketOverview ? allEventsOverall : null;
    }
    return overallStatsForEvent || null;
  }, [
    allEventsOverall,
    hasActiveTagFilter,
    isAllTimeBucketOverview,
    isAllEventsMode,
    overallStatsForEvent,
    useCachedOverallStats,
  ]);
  const renderedOverallStats =
    useBucketBackedRange
      ? isAllTimeBucketOverview
        ? canonicalOverallStats || activeBucketSummary
        : activeBucketSummary
      : effectiveOverallStats;
  const allowOverallDerivedMetrics =
    (statsViewMode === "time" && !useBucketBackedRange) || !effectiveOverallStats || showAllActive || isAllLoaded;
  const stableOverallStats = useMemo(() => {
    if (hasActiveTagFilter) return null;
    if (useBucketBackedRange) {
      return isAllTimeBucketOverview ? canonicalOverallStats || activeBucketSummary : activeBucketSummary;
    }
    if (useCachedOverallStats) {
      if (isAllEventsMode) return allEventsOverall;
      return overallStatsForEvent;
    }
    return null;
  }, [
    activeBucketSummary,
    allEventsOverall,
    canonicalOverallStats,
    hasActiveTagFilter,
    isAllTimeBucketOverview,
    isAllEventsMode,
    overallStatsForEvent,
    useBucketBackedRange,
    useCachedOverallStats,
  ]);
  const stableOverallSolves = useMemo(() => {
    if (statsViewMode === "time") return allLoadedFilteredRawSolves;
    if (hasActiveTagFilter) return activeStandardSolves || [];
    if (!isAllEventsMode && !isAllSessionsMode && sessionOverallFallbackSolves.length > 0) {
      return withSolveFullIndices(sessionOverallFallbackSolves);
    }
    if (overallScopeSolves.length > 0) return overallScopeSolves;
    if (isAllEventsMode) return allLoadedSolves || [];
    if (isAllSessionsMode) {
      return (sessionCachedSolves || []).filter(
        (solve) => String(solve?.event || solve?.Event || "").toUpperCase() === String(statsEvent || "").toUpperCase()
      );
    }
    return selectedSessionSolves || [];
  }, [
    activeStandardSolves,
    allLoadedFilteredRawSolves,
    allLoadedSolves,
    hasActiveTagFilter,
    isAllEventsMode,
    isAllSessionsMode,
    overallScopeSolves,
    sessionOverallFallbackSolves,
    selectedSessionSolves,
    sessionCachedSolves,
    statsEvent,
    statsViewMode,
  ]);

  useEffect(() => {
    if (!hasActiveTagFilter) return;
    if (canUseIndexedTagScope) return;
    loadTimeScopeSolves();
  }, [canUseIndexedTagScope, hasActiveTagFilter, loadTimeScopeSolves]);

  const loadedSolveCountForSummary =
    useBucketBackedRange
      ? Number(activeBucketSummary?.SolveCountTotal || 0)
      : statsViewMode === "time"
        ? summaryCurrentSolves.length
        : activeStandardSolves.length;
  const overallStatsSolveCount = Number(overallStatsForEvent?.SolveCountTotal || 0);
  const overallStatsMissingPlus2Best = useMemo(() => {
    if (!overallStatsForEvent) return false;
    if (overallStatsSolveCount <= 0) return false;
    const plus2Count = Number(overallStatsForEvent?.Plus2Count || 0);
    if (plus2Count <= 0) return false;
    return !Number.isFinite(Number(overallStatsForEvent?.Plus2BestMs));
  }, [overallStatsForEvent, overallStatsSolveCount]);
  const overallStatsMissingFirstSolveAt = useMemo(() => {
    if (!overallStatsForEvent) return false;
    if (overallStatsSolveCount <= 0) return false;
    return !String(overallStatsForEvent?.FirstSolveAt || "").trim();
  }, [overallStatsForEvent, overallStatsSolveCount]);
  const overallStatsNeedsTopSinglesRepair = useMemo(() => {
    if (!overallStatsForEvent) return false;
    if (overallStatsSolveCount <= 0) return false;
    return overallStatsForEvent?.NeedsTopSinglesRepair === true;
  }, [overallStatsForEvent, overallStatsSolveCount]);

  const overallCount = useMemo(() => {
    if (canonicalOverallStats?.SolveCountTotal != null) return canonicalOverallStats.SolveCountTotal;
    if (statsViewMode === "time") return stableOverallSolves.length;
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? null;
    return stableOverallSolves.length ?? null;
  }, [allEventsOverall, canonicalOverallStats, isAllEventsMode, stableOverallSolves.length, statsViewMode]);
  const showingCount = useMemo(() => {
    if (useBucketBackedRange) return activeBucketSummary?.SolveCountTotal ?? 0;
    if (statsViewMode === "time") return visiblePageFilteredRawSolves?.length || 0;
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? 0;
    if (isAllSessionsMode) return effectiveOverallStats?.SolveCountTotal ?? (visiblePageFilteredRawSolves?.length || 0);
    return visiblePageFilteredRawSolves?.length || 0;
  }, [activeBucketSummary, allEventsOverall, effectiveOverallStats, isAllEventsMode, isAllSessionsMode, statsViewMode, useBucketBackedRange, visiblePageFilteredRawSolves]);

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
  const compareDateRangeText = useMemo(() => {
    if (!compareVisiblePageFilteredRawSolves || compareVisiblePageFilteredRawSolves.length === 0) return "";
    const first = compareVisiblePageFilteredRawSolves[0]?.datetime;
    const last = compareVisiblePageFilteredRawSolves[compareVisiblePageFilteredRawSolves.length - 1]?.datetime;
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
  }, [compareVisiblePageFilteredRawSolves]);

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

    if (dateFilterStart === ALL_TIME_START_DAY && !!dateFilterEnd) return "All Time";
    if (!dateFilterStart && !dateFilterEnd) return dateRangeText || "All Dates";
    if (dateFilterStart && dateFilterEnd) return `${formatDay(dateFilterStart)} - ${formatDay(dateFilterEnd)}`;
    if (dateFilterStart) return `${formatDay(dateFilterStart)} onward`;
    return `Through ${formatDay(dateFilterEnd)}`;
  }, [dateFilterEnd, dateFilterStart, dateRangeText]);
  const compareDateFilterLabel = useMemo(() => {
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

    if (effectiveCompareDateFilterStart === ALL_TIME_START_DAY && !!effectiveCompareDateFilterEnd) return "All Time";
    if (!effectiveCompareDateFilterStart && !effectiveCompareDateFilterEnd) {
      return linkStatsControls ? dateFilterLabel : compareDateRangeText || "All Dates";
    }
    if (effectiveCompareDateFilterStart && effectiveCompareDateFilterEnd) {
      return `${formatDay(effectiveCompareDateFilterStart)} - ${formatDay(effectiveCompareDateFilterEnd)}`;
    }
    if (effectiveCompareDateFilterStart) return `${formatDay(effectiveCompareDateFilterStart)} onward`;
    return `Through ${formatDay(effectiveCompareDateFilterEnd)}`;
  }, [
    compareDateRangeText,
    dateFilterLabel,
    effectiveCompareDateFilterEnd,
    effectiveCompareDateFilterStart,
    linkStatsControls,
  ]);

  const availableTimeDays = useMemo(() => {
    const set = new Set();

    const bucketDays = useBucketBackedRange
      ? activeBucketItems
          .map((item) => String(item?.BucketDay || "").trim())
          .filter(Boolean)
      : [];

    for (const key of bucketDays) {
      set.add(key);
    }

    if (set.size === 0) {
      for (const solve of visiblePageFilteredRawSolves || []) {
        const date = new Date(solve?.datetime || "");
        if (!isFiniteDate(date)) continue;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;
        set.add(key);
      }
    }

    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)));
  }, [activeBucketItems, useBucketBackedRange, visiblePageFilteredRawSolves]);

  useEffect(() => {
    const hadActiveTagFilter = previousHasActiveTagFilterRef.current;
    previousHasActiveTagFilterRef.current = hasActiveTagFilter;

    if (!hadActiveTagFilter || hasActiveTagFilter) return;
    if (!canUseBucketRange) return;

    setPreferRawDateRangeView(false);
    setShowAllActive(false);
    setCurrentPage(0);
  }, [canUseBucketRange, hasActiveTagFilter]);

  useEffect(() => {
    if (!preferRawDateRangeView) return;
    if (statsViewMode !== "standard" || !hasActiveDateFilter) {
      setPreferRawDateRangeView(false);
    }
  }, [hasActiveDateFilter, preferRawDateRangeView, statsViewMode]);

  useEffect(() => {
    if (!availableTimeDays.length) {
      if (selectedTimeDay) setSelectedTimeDay("");
      return;
    }

    if (selectedTimeDay && availableTimeDays.includes(selectedTimeDay)) return;
    setSelectedTimeDay(availableTimeDays[0]);
  }, [availableTimeDays, selectedTimeDay]);

  const dateWindowDayCount = useMemo(() => {
    if (!dateFilterStart || !dateFilterEnd) return 0;
    return getInclusiveDaySpan(dateFilterStart, dateFilterEnd);
  }, [dateFilterEnd, dateFilterStart]);

  const applyPrimaryDateRange = useCallback(
    async (nextStart, nextEnd, options = {}) => {
      const start = String(nextStart || "").trim();
      const end = String(nextEnd || "").trim();
      if (start === String(dateFilterStart || "") && end === String(dateFilterEnd || "")) return true;
      const requiresRawLoad = options?.requiresRawLoad === true;
      const bucketBackedDateRange = canUseDayBucketScope({
        userID: user?.UserID,
        hasActiveTagFilter,
        statsViewMode,
        hasActiveDateFilter: !!(start || end),
        isAllEventsMode,
        isAllSessionsMode,
        sessionId,
      });
      const dayEstimate = start && end ? formatDayEstimate(getInclusiveDaySpan(start, end)) : "";

      if (statsViewMode === "time" && requiresRawLoad) {
        const approved = await warnBeforeSolveScan({
          title: "Reload time range?",
          intro: "Changing the time-view date range reloads every solve in that time scope for the selected dates.",
          event: statsEvent,
          sessionID: statsSession,
          extraLines: [
            `Date filter: ${formatShortDateRangeLabel(start, end, start || end ? "" : "All Dates")}.`,
          ],
          confirmLabel: "Reload Time Range",
        });
        if (!approved) return false;
      } else if (isSolveLevelMode && (start || end)) {
        const approved = await warnBeforeSolveScan({
          title: "Load date-filtered solve scope?",
          intro: bucketBackedDateRange
            ? "Applying this date range loads aggregated day summaries for the selected scope so the stats can update."
            : "Applying this index date range loads every matching solve in the selected session so the charts and tables can update.",
          event: statsEvent,
          sessionID: sessionId,
          estimateLabel: bucketBackedDateRange
            ? "Estimated day summaries touched"
            : "Estimated solves touched",
          estimateValue: bucketBackedDateRange ? dayEstimate : undefined,
          extraLines: [
            `Date filter: ${formatShortDateRangeLabel(start, end, start || end ? "" : "All Dates")}.`,
          ],
          confirmLabel: "Load Date Range",
        });
        if (!approved) return false;
      }

      setDateFilterStart(start);
      setDateFilterEnd(end);
      if (!start && !end) {
        setPreferRawDateRangeView(false);
      }
      return true;
    },
    [
      dateFilterEnd,
      dateFilterStart,
      hasActiveTagFilter,
      isAllEventsMode,
      isAllSessionsMode,
      isSolveLevelMode,
      sessionId,
      statsEvent,
      statsSession,
      statsViewMode,
      user?.UserID,
      warnBeforeSolveScan,
    ]
  );

  const applyPrimaryTagSelection = useCallback(
    async (nextSelection) => {
      const sanitized = sanitizeTagSelection(nextSelection);
      if (!hasActiveTagSelection(sanitized)) {
        setTagFilterSelection(sanitized);
        return true;
      }

      const nextActiveTagEntries = Object.entries(sanitized).filter(([, value]) => String(value || "").trim());
      const willUseDateScopedLocalFilter = hasActiveDateFilter;
      const willUseIndexedTagLoad = !hasActiveDateFilter && nextActiveTagEntries.length > 0;

      if (willUseDateScopedLocalFilter || willUseIndexedTagLoad) {
        setTagFilterSelection(sanitized);
        return true;
      }

      const isDateScopedTagLoad = hasActiveDateFilter;
      const scopedSolveEstimate = hasActiveDateFilter
        ? formatSolveEstimate(scopeSolvesForSelection.length)
        : undefined;

      const approved = await warnBeforeSolveScan({
        title: "Load solves with this tag?",
        subtitle: "",
        intro: isDateScopedTagLoad
          ? "We'll filter the solves already loaded for this date range to the selected tag."
          : "We'll load the solves in this scope that match this tag.",
        event: statsEvent,
        sessionID: isAllEventsMode ? ALL_SESSIONS : sessionId,
        estimateLabel: isDateScopedTagLoad ? "Solves in selected date range" : "Solves in this scope",
        estimateValue: scopedSolveEstimate,
        extraLines: [
          isDateScopedTagLoad ? "Only the current date-range scope is scanned." : "Only matching solves are loaded.",
        ],
        confirmLabel: "Apply Tag Filter",
      });
      if (!approved) return false;

      setTagFilterSelection(sanitized);
      return true;
    },
    [hasActiveDateFilter, isAllEventsMode, scopeSolvesForSelection.length, sessionId, statsEvent, warnBeforeSolveScan]
  );

  const shiftDateWindow = useCallback((offsetDays) => {
    if (!dateFilterStart || !dateFilterEnd) return;
    const nextStart = shiftLocalDayKey(dateFilterStart, offsetDays);
    const nextEnd = shiftLocalDayKey(dateFilterEnd, offsetDays);
    const clamped = clampRangeEndToToday(nextStart, nextEnd);
    setPreferRawDateRangeView((prev) =>
      shouldPreferRawRangeView(getInclusiveDaySpan(clamped.start, clamped.end), prev)
    );
    setDateFilterStart(clamped.start);
    setDateFilterEnd(clamped.end);
  }, [dateFilterEnd, dateFilterStart]);

  const resizeDateWindow = useCallback((nextDayCount) => {
    if (!dateFilterEnd) return;
    const safeCount = Math.max(1, Math.floor(Number(nextDayCount) || 1));
    setPreferRawDateRangeView((prev) => shouldPreferRawRangeView(safeCount, prev));
    setDateFilterStart(shiftLocalDayKey(dateFilterEnd, -(safeCount - 1)));
    setDateFilterEnd(dateFilterEnd);
  }, [dateFilterEnd]);

  // eslint-disable-next-line no-use-before-define
  const handleBucketDaySelect = useCallback(async (dayKey) => {
    const nextDay = String(dayKey || "").trim();
    if (!nextDay) return;

    setCurrentPage(0);

    if (dateFilterStart === nextDay && dateFilterEnd === nextDay) {
      setPreferRawDateRangeView(true);
      return;
    }

    setPreferRawDateRangeView(true);
    // eslint-disable-next-line no-use-before-define
    const applied = await applyPrimaryDateRange(nextDay, nextDay, { requiresRawLoad: true });
    if (applied) setSelectedTimeDay(nextDay);
  }, [applyPrimaryDateRange, dateFilterEnd, dateFilterStart]);

  const handleEventChange = useCallback(
    async (event) => {
      const next = event.target.value;

      if (statsViewMode === "time" && wantsRawTimeScope) {
        const approved = await warnBeforeSolveScan({
          title: "Load new time scope?",
          intro: "Changing the time-view scope loads every solve in that scope so the time charts can rebuild.",
          event: next,
          sessionID: ALL_SESSIONS,
          extraLines:
            dateFilterStart || dateFilterEnd
              ? [`Date filter: ${formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel)}.`]
              : [],
          confirmLabel: "Load Time Scope",
        });
        if (!approved) return;
      }

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
    [DEFAULT_IN_VIEW, dateFilterEnd, dateFilterLabel, dateFilterStart, statsViewMode, wantsRawTimeScope, warnBeforeSolveScan]
  );

  const handlePickSession = useCallback(
    async (sid) => {
      if (statsViewMode === "time" && wantsRawTimeScope) {
        const approved = await warnBeforeSolveScan({
          title: "Load new time scope?",
          intro: "Changing the time-view session loads every solve in that scope so the time charts can rebuild.",
          event: statsEvent,
          sessionID: sid,
          extraLines:
            dateFilterStart || dateFilterEnd
              ? [`Date filter: ${formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel)}.`]
              : [],
          confirmLabel: "Load Time Scope",
        });
        if (!approved) return;
      }

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
    [DEFAULT_IN_VIEW, dateFilterEnd, dateFilterLabel, dateFilterStart, statsEvent, statsViewMode, wantsRawTimeScope, warnBeforeSolveScan]
  );

  const handleAddCompareRow = useCallback(() => {
    setCompareSelection({
      event: statsEvent || currentEvent || "333",
      session: sessionId || "main",
      tags: makeEmptyTagSelection(),
      paletteKey: DEFAULT_COMPARE_PALETTE,
      primaryPaletteKey,
    });
    setCompareDateFilterStart("");
    setCompareDateFilterEnd("");
    setLinkStatsControls(false);
    setCompareSessionMenuOpen(false);
  }, [currentEvent, primaryPaletteKey, sessionId, statsEvent]);

  const handleRemoveCompareRow = useCallback(() => {
    setCompareSelection(null);
    setCompareSessionMenuOpen(false);
    setCompareSessionSolves([]);
    setCompareTagScopeSolves([]);
    setCompareTagScopeCacheKey("");
    setCompareDateFilterStart("");
    setCompareDateFilterEnd("");
    setCompareLoading(false);
  }, []);

  const handlePromoteCompareRow = useCallback(() => {
    if (!compareSelection) return;

    const promotedEvent = String(compareEvent || statsEvent || currentEvent || "333");
    const promotedSession = String(compareSessionId || "main");
    const promotedTags = sanitizeTagSelection(compareTagSelection);
    const promotedPaletteKey = compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE;
    const promotedDateStart = effectiveCompareDateFilterStart;
    const promotedDateEnd = effectiveCompareDateFilterEnd;
    const promotedSolvesPerPage = linkStatsControls ? solvesPerPage : compareSolvesPerPage;
    const promotedCurrentPage = linkStatsControls ? currentPage : compareCurrentPage;
    const promotedShowAllActive = linkStatsControls ? showAllActive : compareShowAllActive;

    setStatsEvent(promotedEvent);
    setStatsSession(promotedSession);
    setStandardSelection({
      event: promotedEvent,
      session: promotedSession,
    });
    setTagFilterSelection(promotedTags);
    setPrimaryPaletteKey(promotedPaletteKey);
    setDateFilterStart(promotedDateStart);
    setDateFilterEnd(promotedDateEnd);
    setSolvesPerPage(promotedSolvesPerPage);
    setCurrentPage(promotedCurrentPage);
    setShowAllActive(promotedShowAllActive);
    setPageCursor(null);
    setHasMoreOlder(false);
    setIsAllLoaded(promotedShowAllActive);
    setTableCompareView("primary");

    setSessions((prev) => {
      const ev = String(promotedEvent || "").toUpperCase();
      const existingForEvent = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      const promotedSessionSolves = Array.isArray(compareSessionSolves) ? compareSessionSolves : [];
      const otherSessions = existingForEvent.filter(
        (s) => String(s?.sessionID || s?.SessionID || "main") !== promotedSession
      );

      return {
        ...prev,
        [ev]: [...otherSessions, ...promotedSessionSolves].sort((a, b) => {
          const ta = new Date(a?.datetime || "").getTime();
          const tb = new Date(b?.datetime || "").getTime();
          return ta - tb;
        }),
      };
    });

    if (promotedDateStart || promotedDateEnd) {
      const promotedDateScopedKey =
        user?.UserID && promotedEvent
          ? [
              user.UserID,
              String(promotedEvent || "").toUpperCase(),
              promotedSession,
              promotedDateStart || "*",
              promotedDateEnd || "*",
              effectiveTimeZone || "*",
            ].join("::")
          : "";
      setDateScopedSessionSolves(compareFilteredRawSolves);
      setDateScopedSessionCacheKey(promotedDateScopedKey);
    } else {
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
    }

    setCompareSelection(null);
    setCompareSessionMenuOpen(false);
    setCompareSessionSolves([]);
    setCompareTagScopeSolves([]);
    setCompareTagScopeCacheKey("");
    setCompareDateFilterStart("");
    setCompareDateFilterEnd("");
    setCompareLoading(false);
    setCompareSolvesPerPage(DEFAULT_IN_VIEW);
    setCompareCurrentPage(0);
    setCompareShowAllActive(false);
    setLinkStatsControls(true);
  }, [
    DEFAULT_IN_VIEW,
    compareCurrentPage,
    compareEvent,
    compareFilteredRawSolves,
    compareSelection,
    compareSessionId,
    compareSessionSolves,
    compareShowAllActive,
    compareSolvesPerPage,
    compareTagSelection,
    currentEvent,
    currentPage,
    effectiveCompareDateFilterEnd,
    effectiveCompareDateFilterStart,
    effectiveTimeZone,
    linkStatsControls,
    setSessions,
    showAllActive,
    solvesPerPage,
    statsEvent,
    user?.UserID,
  ]);

  const updateCompareSelection = useCallback((patch) => {
    setCompareSelection((prev) => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const handleSetViewMode = useCallback(async (nextMode) => {
    if (nextMode === statsViewMode) return;

    setStatsViewMode(nextMode);
    setSessionMenuOpen(false);

    if (nextMode === "time") {
      setPreferRawDateRangeView(false);
      setDateFilterStart("");
      setDateFilterEnd("");
      setTimeSelection({
        event: ALL_EVENTS,
        session: ALL_SESSIONS,
      });
      return;
    }

    setPreferRawDateRangeView(false);
    setDateFilterStart("");
    setDateFilterEnd("");
    setSelectedTimeDay("");
    setStandardSelection((prev) => ({
      event: prev?.event || currentEvent || "333",
      session: prev?.session || currentSession || "main",
    }));
  }, [currentEvent, currentSession, statsViewMode]);

  const handleSetStatsDisplayMode = useCallback(
    async (nextMode) => {
      if (nextMode === "time") {
        setStandardSubview("solves");
        await handleSetViewMode("time");
        return;
      }

      setStandardSubview(nextMode === "tags" ? "tags" : "solves");
      if (statsViewMode !== "standard") {
        await handleSetViewMode("standard");
      }
    },
    [handleSetViewMode, statsViewMode]
  );

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
    const target = getNextLargerSolveWindow(solvesPerPage);

    if (target <= activeStandardSolves.length) {
      setSolvesPerPage(target);
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      const result = await appendOlderSessionPages({ minSolveCount: target });
      const loadedCount = activeStandardSolves.length + Number(result?.addedCount || 0);
      setSolvesPerPage(Math.min(target, Math.max(activeStandardSolves.length, loadedCount)));
      setCurrentPage(0);
    }
  }, [
    solvesPerPage,
    activeStandardSolves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    appendOlderSessionPages,
    isSolveLevelMode,
  ]);

  const handleDecreaseSolveCount = useCallback(() => {
    if (!isSolveLevelMode) return;
    setSolvesPerPage((prev) => Math.max(1, prev - 1));
    setCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleIncreaseSolveCount = useCallback(async () => {
    if (!isSolveLevelMode) return;
    const target = solvesPerPage + 1;

    if (target <= activeStandardSolves.length) {
      setSolvesPerPage(target);
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      const result = await appendOlderSessionPages({ minSolveCount: target });
      const loadedCount = activeStandardSolves.length + Number(result?.addedCount || 0);
      setSolvesPerPage(Math.min(target, Math.max(activeStandardSolves.length, loadedCount)));
      setCurrentPage(0);
    }
  }, [
    solvesPerPage,
    activeStandardSolves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    appendOlderSessionPages,
    isSolveLevelMode,
  ]);

  const handleShowAll = useCallback(async () => {
    if (statsViewMode === "time") {
      const approved = await warnBeforeSolveScan({
        title: "Load full time scope?",
        intro: "This loads every solve in the current time-view scope so the full table and charts can render.",
        event: statsEvent,
        sessionID: statsSession,
        extraLines:
          dateFilterStart || dateFilterEnd
            ? [`Date filter: ${formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel)}.`]
            : [],
        confirmLabel: "Load Time Scope",
      });
      if (!approved) return;

      await loadTimeScopeSolves();
      setCurrentPage(0);
      setShowAllActive(true);
      return;
    }

    if (!isSolveLevelMode) return;

    const appliedAllTimeRange = await applyPrimaryDateRange(
      ALL_TIME_START_DAY,
      getTodayLocalDayKey()
    );
    if (appliedAllTimeRange) {
      setPreferRawDateRangeView(false);
      setCurrentPage(0);
    }
    return;

  }, [
    applyPrimaryDateRange,
    dateFilterEnd,
    dateFilterLabel,
    dateFilterStart,
    isSolveLevelMode,
    loadTimeScopeSolves,
    statsEvent,
    statsSession,
    statsViewMode,
    warnBeforeSolveScan,
  ]);

  const canUseDateWindowControls =
    statsViewMode === "standard" && isSolveLevelMode && hasActiveDateFilter && !compareEnabled;
  const canDateWindowOlder = canUseDateWindowControls && !!dateFilterStart && !!dateFilterEnd;
  const canDateWindowNewer =
    canUseDateWindowControls &&
    !!dateFilterStart &&
    !!dateFilterEnd &&
    String(dateFilterEnd) < String(getTodayLocalDayKey());
  const canDateWindowZoomIn = canUseDateWindowControls && (!!useBucketBackedRange || preferRawDateRangeView);
  const canDateWindowZoomOut = canUseDateWindowControls;
  const canDateWindowDecrease = canUseDateWindowControls && dateWindowDayCount > 1;
  const canDateWindowIncrease = canUseDateWindowControls && !!dateFilterEnd;
  const canDateWindowShowAll = canUseDateWindowControls;

  const handleDateWindowShowAll = useCallback(async () => {
    if (!canUseDateWindowControls) return;
    const appliedAllTimeRange = await applyPrimaryDateRange(
      ALL_TIME_START_DAY,
      getTodayLocalDayKey()
    );
    if (!appliedAllTimeRange) return;
    setPreferRawDateRangeView(false);
    setCurrentPage(0);
  }, [applyPrimaryDateRange, canUseDateWindowControls]);

  const handleDateWindowPrevious = useCallback(() => {
    if (!canUseDateWindowControls || dateWindowDayCount <= 0) return;
    shiftDateWindow(-dateWindowDayCount);
  }, [canUseDateWindowControls, dateWindowDayCount, shiftDateWindow]);

  const handleDateWindowNext = useCallback(() => {
    if (!canUseDateWindowControls || dateWindowDayCount <= 0) return;
    shiftDateWindow(dateWindowDayCount);
  }, [canUseDateWindowControls, dateWindowDayCount, shiftDateWindow]);

  const handleDateWindowZoomIn = useCallback(() => {
    if (!canUseDateWindowControls) return;
    if (isSingleDayDateFilter) {
      setPreferRawDateRangeView(true);
      return;
    }
    resizeDateWindow(Math.max(1, Math.ceil(dateWindowDayCount / 2)));
  }, [canUseDateWindowControls, dateWindowDayCount, isSingleDayDateFilter, resizeDateWindow]);

  const handleDateWindowZoomOut = useCallback(() => {
    if (!canUseDateWindowControls) return;
    if (preferRawDateRangeView) {
      setPreferRawDateRangeView(false);
      return;
    }
    resizeDateWindow(Math.max(2, dateWindowDayCount * 2));
  }, [canUseDateWindowControls, dateWindowDayCount, preferRawDateRangeView, resizeDateWindow]);

  const handleDateWindowDecrease = useCallback(() => {
    if (!canUseDateWindowControls || dateWindowDayCount <= 1) return;
    resizeDateWindow(dateWindowDayCount - 1);
  }, [canUseDateWindowControls, dateWindowDayCount, resizeDateWindow]);

  const handleDateWindowIncrease = useCallback(() => {
    if (!canUseDateWindowControls || !dateFilterEnd) return;
    resizeDateWindow(dateWindowDayCount + 1);
  }, [canUseDateWindowControls, dateFilterEnd, dateWindowDayCount, resizeDateWindow]);

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
    if (availableTimeDays.length > 0) return availableTimeDays[0];

    const latestSolve = [...(allLoadedSolves || [])]
      .filter(Boolean)
      .sort((a, b) => {
        const ta = new Date(a?.datetime || "").getTime();
        const tb = new Date(b?.datetime || "").getTime();
        return tb - ta;
      })[0];

    return getLocalDayKey(getSolveDate(latestSolve) || new Date()) || getTodayLocalDayKey();
  }, [allLoadedSolves, availableTimeDays, dateFilterEnd, dateFilterStart]);

  const applyTimeRangePreset = useCallback(async (preset) => {
    if (preset === "all") {
      await applyPrimaryDateRange("", "");
      return;
    }

    if (preset === "day") {
      const applied = await applyPrimaryDateRange(timeNavAnchorDay, timeNavAnchorDay, {
        requiresRawLoad: true,
      });
      if (applied) setSelectedTimeDay(timeNavAnchorDay);
      return;
    }

    if (preset === "week") {
      const range = getWeekRangeFromDayKey(timeNavAnchorDay);
      await applyPrimaryDateRange(range.start, range.end);
      return;
    }

    if (preset === "month") {
      const range = getMonthRangeFromDayKey(timeNavAnchorDay);
      await applyPrimaryDateRange(range.start, range.end);
    }
  }, [applyPrimaryDateRange, timeNavAnchorDay]);

  const isTimeViewSingleDay = useMemo(() => {
    return statsViewMode === "time" && !!dateFilterStart && !!dateFilterEnd && dateFilterStart === dateFilterEnd;
  }, [dateFilterEnd, dateFilterStart, statsViewMode]);

  const canShiftTimeRangeNewer = useMemo(() => {
    if (!isTimeViewSingleDay) return false;
    return String(dateFilterEnd || "") < String(getTodayLocalDayKey());
  }, [dateFilterEnd, isTimeViewSingleDay]);

  const shiftTimeRangeByDay = useCallback(async (direction) => {
    const baseDay = timeNavAnchorDay || getTodayLocalDayKey();
    const nextDay = shiftLocalDayKey(baseDay, direction);
    const applied = await applyPrimaryDateRange(nextDay, nextDay, { requiresRawLoad: true });
    if (applied) setSelectedTimeDay(nextDay);
  }, [applyPrimaryDateRange, timeNavAnchorDay]);

  const runOverallRecompute = useCallback(async () => {
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
        onOverallStatsRecomputed?.({
          scope: isAllSessionsMode ? "event" : "session",
          event: statsEvent,
          sessionID: isAllSessionsMode ? null : sessionId,
          item: updated,
        });
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
    onOverallStatsRecomputed,
    runDb,
  ]);

  useEffect(() => {
    const userID = user?.UserID;
    const repairScopeKey =
      !!userID
        ? `${userID}::${String(statsEvent || "").toUpperCase()}::${String(sessionId || "main")}`
        : "";
    const shouldRepairCachedOverviewStats =
      !!userID &&
      statsViewMode === "standard" &&
      !hasActiveTagFilter &&
      !hasActiveDateFilter &&
      !isAllEventsMode &&
      !isAllSessionsMode &&
      (
        overallStatsMissingPlus2Best ||
        overallStatsMissingFirstSolveAt ||
        overallStatsNeedsTopSinglesRepair
      );

    if (!shouldRepairCachedOverviewStats) {
      setSessionOverallFallbackSolves([]);
      setSessionOverallFallbackCacheKey("");
      return;
    }

    if (overallStatsLoadSettledKey !== repairScopeKey) return;

    const cacheKey = repairScopeKey;
    if (sessionOverallFallbackCacheKey === cacheKey && sessionOverallFallbackSolves.length > 0) return;
    const priorDecision = summaryFallbackDecisionRef.current.get(cacheKey);
    if (priorDecision === false) return;

    let cancelled = false;

    (async () => {
      try {
        if (priorDecision !== true) {
          const approved = await warnBeforeSolveScan({
            title: "Repair cached overview stats?",
            intro: "Overview is missing cached fields like top singles, the first solve date, or +2 best.",
            event: statsEvent,
            sessionID: sessionId,
            confirmLabel: "Recompute Stats",
            estimateLabel: "Estimated solves to rescan",
            extraLines: [
              "This will recompute the stored session stats record so the fix persists on future visits.",
              "If you decline, overview will keep using cached values and may omit those fields.",
            ],
          });
          if (cancelled) return;
          summaryFallbackDecisionRef.current.set(cacheKey, approved);
          if (!approved) return;
        }

        await runOverallRecompute();
        if (cancelled) return;
        setSessionOverallFallbackSolves([]);
        setSessionOverallFallbackCacheKey("");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to repair cached overview stats:", error);
        setSessionOverallFallbackSolves([]);
        setSessionOverallFallbackCacheKey("");
        summaryFallbackDecisionRef.current.delete(cacheKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasActiveDateFilter,
    hasActiveTagFilter,
    isAllEventsMode,
    isAllSessionsMode,
    overallStatsLoadSettledKey,
    overallStatsMissingFirstSolveAt,
    overallStatsMissingPlus2Best,
    overallStatsNeedsTopSinglesRepair,
    runOverallRecompute,
    sessionId,
    sessionOverallFallbackCacheKey,
    sessionOverallFallbackSolves.length,
    statsEvent,
    statsViewMode,
    user?.UserID,
    warnBeforeSolveScan,
  ]);

  const handleRecomputeOverall = useCallback(async () => {
    if (!user?.UserID) return;
    if (isAllEventsMode) return;

    const approved = await warnBeforeSolveScan({
      title: "Recompute cached stats?",
      intro: "Recomputing cached stats rescans every solve in this scope and rewrites the aggregate record.",
      event: statsEvent,
      sessionID: isAllSessionsMode ? ALL_SESSIONS : sessionId,
      confirmLabel: "Recompute Stats",
    });
    if (!approved) return;

    await runOverallRecompute();
  }, [
    isAllEventsMode,
    isAllSessionsMode,
    runOverallRecompute,
    sessionId,
    statsEvent,
    user?.UserID,
    warnBeforeSolveScan,
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
    async ({ parsedSolves, destination, detectedFormat }) => {
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
            _importSessionID: s?._importSessionID ? String(s._importSessionID) : undefined,
            _importSessionName: s?._importSessionName ? String(s._importSessionName) : undefined,
            _importSessionOpts:
              s?._importSessionOpts && typeof s._importSessionOpts === "object"
                ? s._importSessionOpts
                : undefined,
          };
        })
        .filter(Boolean);

      if (normalized.length === 0) return;

      const isPtsExportImport = detectedFormat === "pts-export";
      const IMPORT_CHUNK_SIZE = 1500;

      const importGroups = new Map();
      for (const s of normalized) {
        const ev = s.event;
        const importSessionID =
          isPtsExportImport && s._importSessionID ? String(s._importSessionID) : String(sessionId || "main");
        const importSessionName =
          isPtsExportImport && s._importSessionName ? String(s._importSessionName) : "";
        const key = isPtsExportImport ? `${ev}::${importSessionID}` : ev;
        if (!importGroups.has(key)) {
          importGroups.set(key, {
            ev,
            importSessionID,
            importSessionName,
            importSessionOpts: s._importSessionOpts || {},
            solves: [],
          });
        }
        importGroups.get(key).solves.push(s);
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
          const sourceKey = buildImportSourceKey({
            detectedFormat: detectedFormat || "unknown",
            destinationKind: destKind,
            destinationSessionID: destExistingID || String(sessionId || "main"),
            destinationSessionName: destNewName || "",
            solves: normalized,
          });

          const sessionTargetCache = new Map();
          const preparedGroups = [];
          const overallTotal = normalized.length;
          let totalChunks = 0;

          for (const group of importGroups.values()) {
            const { ev, solves: solvesForEv, importSessionID, importSessionName, importSessionOpts } = group;
            let destSessionForThisEvent = String(sessionId || "main");

            if (isPtsExportImport) {
              const cacheKey = `${ev}::${importSessionID}`;
              if (!sessionTargetCache.has(cacheKey)) {
                const existingSession = (sessionsList || []).find(
                  (session) =>
                    String(session?.Event || "").toUpperCase() === ev &&
                    String(session?.SessionID || "main") === importSessionID
                );

                if (!existingSession && importSessionID && importSessionName) {
                  await runDb("Creating import session", () =>
                    createSession(userID, ev, importSessionID, importSessionName, importSessionOpts || {})
                  );
                }

                sessionTargetCache.set(cacheKey, importSessionID || "main");
              }

              destSessionForThisEvent = sessionTargetCache.get(cacheKey) || "main";
            } else if (destKind === "existing") {
              destSessionForThisEvent = destExistingID || String(sessionId || "main");
            } else {
              destSessionForThisEvent = await createImportSession(ev, destNewName || `Import ${ev}`);
            }

            const cleanSolves = solvesForEv.map((solve, index) => {
              const clean = { ...solve };
              delete clean._importSessionID;
              delete clean._importSessionName;
              delete clean._importSessionOpts;
              clean.event = ev;
              clean.sessionID = destSessionForThisEvent;
              clean.importOrdinal = index;
              return clean;
            });

            totalChunks += Math.max(1, Math.ceil(cleanSolves.length / IMPORT_CHUNK_SIZE));
            preparedGroups.push({
              ev,
              destSessionForThisEvent,
              solves: cleanSolves,
            });
          }

          const createRes = await createImportJob({
            userID,
            format: detectedFormat || "unknown",
            sourceKey,
            totalSolves: overallTotal,
            totalChunks,
            label: `Import ${detectedFormat || "solves"}`,
            metadata: {
              destinationKind: destKind,
              sourceFormat: detectedFormat || "unknown",
              scope: isPtsExportImport ? "pts-export" : "single-target",
            },
          });

          const jobID = createRes?.job?.jobID;
          if (!jobID) throw new Error("Failed to create import job");

          let overallCompleted = 0;
          for (const group of preparedGroups) {
            const eventTotal = group.solves.length;
            for (let i = 0; i < group.solves.length; i += IMPORT_CHUNK_SIZE) {
              const chunk = group.solves.slice(i, i + IMPORT_CHUNK_SIZE);
              await appendImportJobChunk(userID, jobID, {
                sourceKey,
                solves: chunk,
              });
              overallCompleted += chunk.length;
              setImportProgress({
                phase: "writing",
                completed: overallCompleted,
                total: overallTotal,
                label: `Importing solves... (${overallCompleted}/${overallTotal})`,
              });
            }

            if (eventTotal === 0) {
              setImportProgress({
                phase: "writing",
                completed: overallCompleted,
                total: overallTotal,
                label: `Importing solves... (${overallCompleted}/${overallTotal})`,
              });
            }
          }

          setImportProgress({
            phase: "finalizing",
            completed: overallCompleted,
            total: overallTotal,
            label: `Finalizing import... (${overallCompleted}/${overallTotal})`,
          });

          await finalizeImportJob(userID, jobID);

          const pollStartedAt = Date.now();
          while (true) {
            const statusRes = await getImportJob(userID, jobID);
            const job = statusRes?.job || null;
            const status = String(job?.status || "").toUpperCase();
            const recompute = job?.recompute || {};
            const recomputeTotal =
              Number(recompute.totalSessions || 0) + Number(recompute.totalEvents || 0);
            const recomputeDone =
              Number(recompute.sessionsCompleted || 0) + Number(recompute.eventsCompleted || 0);

            setImportProgress({
              phase: status.toLowerCase() || "finalizing",
              completed: overallCompleted,
              total: overallTotal,
              label:
                status === "COMPLETED"
                  ? `Import complete (${overallCompleted}/${overallTotal})`
                  : recomputeTotal > 0
                    ? `Finalizing import... (${recomputeDone}/${recomputeTotal})`
                    : `Finalizing import... (${overallCompleted}/${overallTotal})`,
            });

            if (status === "COMPLETED") break;
            if (status === "FAILED" || status === "CANCELED") {
              throw new Error(job?.error || `Import job ${status.toLowerCase()}`);
            }

            if (Date.now() - pollStartedAt > 30 * 60 * 1000) {
              throw new Error("Import finalization timed out");
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          try {
            const refreshedSessions = await fetchSessionsList(userID);
            onSessionsListRefresh?.(refreshedSessions);
          } catch (err) {
            console.warn("Failed to refresh sessions list after import", err);
          }

          try {
            if (!isAllSessionsMode) {
              const item = await getSessionStats(
                userID,
                String(statsEvent || "").toUpperCase(),
                String(sessionId || "main")
              );
              setOverallStatsForEvent(item || null);
            } else {
              const refreshedSessions = await fetchSessionsList(userID);
              onSessionsListRefresh?.(refreshedSessions);
              const aggregated = getEventAggregateFromSessionsList(refreshedSessions, statsEvent);
              setOverallStatsForEvent(aggregated || null);
            }
          } catch (_) {}

          await loadInitialSolves();
          setShowImport(false);
        });
      } catch (e) {
        console.error("Import failed:", e);
        alert(String(e?.message || "Import failed."));
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
      loadInitialSolves,
      onSessionsListRefresh,
      sessionsList,
      runDb,
    ]
  );

  const downloadJsonFile = useCallback((filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const handleExportData = useCallback(
    async ({ mode, selectedEvents = [] }) => {
      const userID = String(user?.UserID || "").trim();
      if (!userID || exportBusy) return;

      const normalizedMode = mode === "selected" ? "selected" : "whole-user";

      const chosenSessions = (sessionsList || []).filter((session) => {
        const event = String(session?.Event || "").toUpperCase();
        const sessionID = String(session?.SessionID || "main");

        if (normalizedMode === "whole-user") return true;

        const selected = selectedEvents.find((item) => String(item?.event || "").toUpperCase() === event);
        if (!selected) return false;
        if (selected.includeAllSessions) return true;
        return Array.isArray(selected.sessionIDs) && selected.sessionIDs.includes(sessionID);
      });

      if (chosenSessions.length === 0) return;

      setExportBusy(true);
      setExportProgress({
        phase: "starting",
        completed: 0,
        total: chosenSessions.length,
        label: `Preparing export (0/${chosenSessions.length} sessions)`,
        sessionsCompleted: 0,
        totalSessions: chosenSessions.length,
        solvesExported: 0,
      });

      try {
        const [profile, allCustomEvents] = await Promise.all([
          getUser(userID),
          getCustomEvents(userID),
        ]);

        const customEvents =
          normalizedMode === "whole-user"
            ? allCustomEvents
            : (allCustomEvents || []).filter((item) =>
                chosenSessions.some(
                  (session) =>
                    String(session?.Event || "").toUpperCase() ===
                    String(
                      item?.EventID ||
                        item?.eventID ||
                        item?.id ||
                        item?.Event ||
                        item?.event ||
                        item?.EventName ||
                        item?.name ||
                        ""
                    ).toUpperCase()
                )
              );

        const sessionExports = [];
        let solvesExported = 0;
        let sessionsCompleted = 0;
        for (const session of chosenSessions) {
          const event = String(session?.Event || "").toUpperCase();
          const sessionID = String(session?.SessionID || "main");
          const solves = await getSolvesBySession(userID, event, sessionID);
          solvesExported += Array.isArray(solves) ? solves.length : 0;
          sessionsCompleted += 1;

          setExportProgress({
            phase: "fetching",
            completed: sessionsCompleted,
            total: chosenSessions.length,
            label: `Collecting sessions (${sessionsCompleted}/${chosenSessions.length})`,
            sessionsCompleted,
            totalSessions: chosenSessions.length,
            solvesExported,
            currentSessionLabel: `${event} / ${sessionID}`,
          });

          sessionExports.push({
            session: stripDbKeys(session),
            solves: (solves || []).map((solve) => stripDbKeys(solve)),
          });
        }

        const solveCount = sessionExports.reduce(
          (total, item) => total + (Array.isArray(item?.solves) ? item.solves.length : 0),
          0
        );

        const selectedEventSet = new Set(
          sessionExports.map((item) => String(item?.session?.Event || "").toUpperCase()).filter(Boolean)
        );

        const exportedAt = new Date().toISOString();
        const safeUserName = String(profile?.Username || profile?.Name || userID)
          .trim()
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase();

        const payload = {
          format: "pts-export",
          version: 1,
          exportedAt,
          scope: normalizedMode,
          selection:
            normalizedMode === "whole-user"
              ? { type: "whole-user" }
              : {
                  type: "selected",
                  events: selectedEvents.map((item) => ({
                    event: String(item?.event || "").toUpperCase(),
                    includeAllSessions: !!item?.includeAllSessions,
                    sessionIDs: Array.isArray(item?.sessionIDs) ? item.sessionIDs : [],
                  })),
                },
          user: (() => {
            const clean = stripDbKeys(profile);
            delete clean.Settings;
            delete clean.TagConfig;
            return clean;
          })(),
          settings: settings || {},
          tagConfig: tagConfig || DEFAULT_TAG_CONFIG,
          customEvents: (customEvents || []).map((item) => stripDbKeys(item)),
          totals: {
            events: selectedEventSet.size,
            sessions: sessionExports.length,
            solves: solveCount,
          },
          data: {
            sessions: sessionExports,
          },
        };

        const filename = `${safeUserName || "pts-user"}-${
          normalizedMode === "whole-user" ? "full-export" : "selected-export"
        }-${exportedAt.slice(0, 10)}.json`;

        setExportProgress({
          phase: "packaging",
          completed: chosenSessions.length,
          total: chosenSessions.length,
          label: `Building download (${solveCount} solves)`,
          sessionsCompleted: chosenSessions.length,
          totalSessions: chosenSessions.length,
          solvesExported: solveCount,
        });

        downloadJsonFile(filename, payload);
        setShowExport(false);
      } catch (e) {
        console.error("Export failed:", e);
        alert("Export failed. Check console for details.");
      } finally {
        setExportBusy(false);
        setExportProgress(null);
      }
    },
    [user?.UserID, exportBusy, sessionsList, settings, tagConfig, downloadJsonFile]
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
      : isSolveLevelMode && !!user?.UserID && !hasActiveDateFilter && !loadingAllSolves && !showAllActive;

  const compareCanOlder =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveCompareDateFilter &&
    compareCurrentPage < compareMaxPage;
  const compareCanNewer =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareCurrentPage > 0;
  const compareCanZoomIn =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareSolvesPerPage > 5;
  const compareCanZoomOut =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveCompareDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    compareSolvesPerPage < compareFilteredRawSolves.length;
  const compareCanDecreaseSolveCount =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareSolvesPerPage > 1;
  const compareCanIncreaseSolveCount =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveCompareDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    compareSolvesPerPage < compareFilteredRawSolves.length;
  const compareCanShowAll =
    statsViewMode === "time"
      ? false
      : isSolveLevelMode &&
        !!user?.UserID &&
        !hasActiveCompareDateFilter &&
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

  const primaryStatsLoading =
    loadingInitial ||
    (wantsRawTimeScope ? loadingTimeScope : false) ||
    loadingTagScope ||
    loadingDateScopedSolves ||
    loadingDayBuckets;
  const primarySummaryLoading =
    statsViewMode === "time" && useBucketBackedRange
      ? loadingDayBuckets || loadingTagScope || loadingDateScopedSolves
      : primaryStatsLoading;
  const primaryOverallSummaryLoading =
    statsViewMode === "time" && isAllEventsMode
      ? primarySummaryLoading
      : primaryStatsLoading || loadingOverallStats;
  const compareSummaryLoading = compareEnabled && (compareLoading || loadingCompareDayBuckets);
  const chartCardsLoading = primaryStatsLoading || compareSummaryLoading;

  const headerStatusText = useMemo(() => {
    if (compareEnabled && statsViewMode === "standard") {
      if (loadingCompareDayBuckets) return "Loading compare bucketed stats…";
      if (compareLoading) return "Loading compare solves…";
      return "";
    }
    if (statsViewMode === "time" && !wantsRawTimeScope && canUseBucketRange) {
      if (loadingDayBuckets) return "Loading bucketed stats for time view…";
      return "Showing aggregated day buckets across the selected scope";
    }
    if (useBucketBackedRange && statsViewMode === "time") {
      return "Showing aggregated day buckets across the selected scope";
    }
    if (statsViewMode === "time") {
      if (loadingTimeScope) return "Loading solves for time view…";
      if (loadingDayBuckets) return "Loading bucketed stats for time view…";
      return hasActiveDateFilter
        ? `Showing all ${allLoadedFilteredRawSolves.length} solves in the selected date range`
        : `Showing all ${allLoadedFilteredRawSolves.length} solves across all dates`;
    }
    if (useBucketBackedRange) return "Showing aggregated day buckets for the selected date range";
    if (loadingDayBuckets) return "Loading bucketed stats for selected date range…";
    if (loadingDateScopedSolves) return "Loading solves for selected date range…";
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
  }, [canUseBucketRange, compareEnabled, compareLoading, loadingCompareDayBuckets, statsViewMode, useBucketBackedRange, loadingTimeScope, loadingDayBuckets, loadingDateScopedSolves, loadingTagScope, allLoadedFilteredRawSolves.length, hasActiveTagFilter, hasActiveDateFilter, loadingInitial, loadingAllSolves, loadingMore, isAllEventsMode, isAllSessionsMode, statsEvent, showAllActive, isAllLoaded, hasMoreOlder, wantsRawTimeScope]);

  const eventSelectLabel = useMemo(() => {
    if (statsEvent === ALL_EVENTS) return "All Events";
    if (statsEvent === "333") return "3x3";
    return statsEvent;
  }, [statsEvent]);

  const selectedSessionDisplay = useMemo(() => {
    if (statsSession === ALL_SESSIONS) return "All Sessions";
    const found = sessionsForEvent.find((s) => s.SessionID === statsSession);
    return normalizeSessionLabel(statsSession, found?.SessionName || statsSession || "main");
  }, [statsSession, sessionsForEvent]);

  const selectedTagLabel = useMemo(() => {
    return hasActiveTagFilter ? summarizeTagSelection(tagFilterSelection, safeTagConfig) : "";
  }, [hasActiveTagFilter, safeTagConfig, tagFilterSelection]);
  const selectedTagPills = useMemo(() => {
    const tagLabels = getSharedTagLabels(safeTagConfig);
    const tagColors = getTagColorMapForEvent(tagColorCatalog, statsEvent === ALL_EVENTS ? "" : statsEvent);
    return activeTagEntries.map(([field, value]) => ({
      field,
      value,
      label: tagLabels?.[field] || field,
      color:
        tagColors?.[field]?.[value] ||
        (field === "CrossColor"
          ? resolveHeaderCrossColorTone(value, user?.Color || user?.color || "#2EC4B6")
          : user?.Color || user?.color || "#2EC4B6"),
    }));
  }, [activeTagEntries, safeTagConfig, tagColorCatalog, statsEvent, user]);

  const compareSessionDisplay = useMemo(() => {
    const found = compareSessionsForEvent.find((s) => s.SessionID === compareSessionId);
    return normalizeSessionLabel(
      compareSessionId,
      found?.SessionName || compareSessionId || "main"
    );
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

  const primaryAccentColor = resolveSeriesColor(
    primaryCompareStyle,
    0.5,
    profileChartStyle?.primary || "#2EC4B6"
  );
  const compareAccentColor = resolveSeriesColor(compareStyle, 0.5, "#7c8cff");

  const compareSelectedTagSummaryLabel = useMemo(() => {
    if (!compareSelection || !hasActiveTagSelection(compareTagSelection)) return "";
    return compareTagLabel;
  }, [compareSelection, compareTagLabel, compareTagSelection]);
  const compareSelectedTagPills = useMemo(() => {
    const tagLabels = getSharedTagLabels(safeTagConfig);
    const tagColors = getTagColorMapForEvent(tagColorCatalog, compareEvent === ALL_EVENTS ? "" : compareEvent);
    return compareActiveTagEntries.map(([field, value]) => ({
      field,
      value,
      label: tagLabels?.[field] || field,
      color:
        tagColors?.[field]?.[value] ||
        (field === "CrossColor"
          ? resolveHeaderCrossColorTone(value, compareAccentColor || user?.Color || user?.color || "#2EC4B6")
          : compareAccentColor || user?.Color || user?.color || "#2EC4B6"),
    }));
  }, [compareActiveTagEntries, safeTagConfig, tagColorCatalog, compareEvent, compareAccentColor, user]);

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
  const showAllEventsTimeMatrixCard = statsViewMode === "time" && isAllEventsMode && !compareEnabled;
  const percentCardLoading =
    compareSummaryLoading ||
    (showEventBreakdownCard
      ? (useBucketBackedRange ? loadingDayBuckets : false)
      : primaryStatsLoading);

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
      canonicalOverallStats?.BestSingleMs ??
      stableOverallSolves
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
    eventSelectLabel,
    headerStatusText,
    isAllSessionsMode,
    overallCount,
    canonicalOverallStats,
    stableOverallSolves,
    selectedSessionDisplay,
  ]);

  const cardDefinitions = useMemo(() => {
    const sharedScope = isAllEventsMode ? "all-events" : isAllSessionsMode ? "all-sessions" : "session";
    const baseSummaryRender = {
      solves: serializeSharedSolves(visiblePageFilteredRawSolves, 500),
      overallSolves: serializeSharedSolves(stableOverallSolves, 1000),
      overallStats: canonicalOverallStats || null,
      bucketSummary: useBucketBackedRange ? activeBucketSummary : null,
      bucketItems: useBucketBackedRange ? activeBucketItems : [],
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
      bucketSummary: useBucketBackedRange ? activeCompareBucketSummary : null,
      bucketItems: useBucketBackedRange ? activeCompareBucketItems : [],
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
    canonicalOverallStats,
    stableOverallSolves,
    stableOverallStats,
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
    activeBucketItems,
    activeBucketSummary,
    activeCompareBucketItems,
    activeCompareBucketSummary,
    useBucketBackedRange,
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

  const updateFocusedLineChartControls = useCallback((nextValue) => {
    setFocusedLineChartControls((current) => {
      const prev = current || {};
      const next = nextValue || {};
      const keys = [
        "showAo5",
        "showAo12",
        "showMean",
        "showGrid",
        "groupMode",
        "xScaleMode",
        "dotSize",
        "useTightAutoScale",
        "yMinInput",
        "yMaxInput",
      ];

      if (keys.every((key) => prev[key] === next[key])) return current;
      return nextValue;
    });
  }, []);

  const openCardFocus = useCallback((cardId) => {
    const nextCard = cardDefinitions.find((item) => item.id === cardId) || null;
    setFocusedCardId(cardId);
    setFocusActionMessage("");
    setShareIncludeChartControls(Boolean(nextCard?.statShare?.render?.showControls));
    setFocusedLineChartControls(nextCard?.statShare?.render?.chartControls || null);
  }, [cardDefinitions]);

  const closeCardFocus = useCallback(() => {
    setFocusedCardId("");
    setFocusActionMessage("");
    setFocusActionBusy("");
    setShareIncludeChartControls(false);
    setFocusedLineChartControls(null);
  }, []);

  const openSolveDetail = useCallback(
    (solve) => {
      if (!solve) return;
      setSelectedSolve({ ...solve, userID: user?.UserID, __readOnly: readOnly });
    },
    [readOnly, user?.UserID]
  );

  const handleEventMatrixStatSelect = useCallback(
    async (selection) => {
      if (!selection || !user?.UserID) return;

      const event = String(selection?.event || "").trim().toUpperCase();
      const variant = String(selection?.variant || "").trim().toLowerCase();
      const metricKey = String(selection?.metricKey || "").trim().toLowerCase();
      const mainOnly = selection?.mainOnly !== false;
      if (!event || !["best", "worst"].includes(variant)) return;

      const sourceItem =
        timeViewEventMatrixItems.find((item) => String(item?.event || "").trim().toUpperCase() === event) || null;
      const refKey = `${metricKey}${variant === "best" ? "Best" : "Worst"}`;
      const startSolveRef = sourceItem?.refs?.[refKey] || null;
      const scopeSessions = (sessionsList || [])
        .filter((session) => String(session?.Event || "").trim().toUpperCase() === event)
        .filter((session) => (mainOnly ? String(session?.SessionID || "main") === "main" : true))
        .map((session) => String(session?.SessionID || "main"));

      if (!scopeSessions.length) return;

      const results = await Promise.all(
        scopeSessions.map(async (scopeSessionID) => {
          const items = await getSolvesBySession(
            user.UserID,
            event,
            scopeSessionID,
            effectiveTimeZone ? { timeZone: effectiveTimeZone } : {}
          );
          return (items || []).map(normalizeSolve).filter(Boolean);
        })
      );

      const deduped = new Map();
      results.flat().forEach((solve) => {
        const key = String(solve?.solveRef || `${solve?.event}|${solve?.sessionID}|${solve?.datetime || ""}`);
        if (!key) return;
        deduped.set(key, solve);
      });

      const mergedSolves = Array.from(deduped.values()).sort((a, b) => {
        const ta = new Date(a?.datetime || "").getTime();
        const tb = new Date(b?.datetime || "").getTime();
        return ta - tb;
      });

      if (!mergedSolves.length) return;

      const eventLabel = getEventDisplayMeta(event)?.label || event;
      const scopeLabel = mainOnly ? "Main Sessions" : "All Sessions";

      if (metricKey === "single") {
        const solve =
          (startSolveRef
            ? mergedSolves.find((item) => String(item?.solveRef || "") === String(startSolveRef))
            : null) || findSingleSolve(mergedSolves, variant);
        if (solve) openSolveDetail(solve);
        return;
      }

      const spec = WINDOW_SPECS[metricKey];
      if (!spec) return;

      const solvesForWindow =
        (startSolveRef ? findWindowByStartRef(mergedSolves, startSolveRef, spec.size) : null) ||
        findWindowForMetric(mergedSolves, spec, variant);

      if (!solvesForWindow?.length) return;

      setSelectedAverageDetail({
        title: `${spec.label} ${variant}`,
        subtitle: `${eventLabel} · ${scopeLabel}`,
        solves: solvesForWindow,
      });
    },
    [
      effectiveTimeZone,
      normalizeSolve,
      openSolveDetail,
      sessionsList,
      timeViewEventMatrixItems,
      user?.UserID,
    ]
  );

  const handleSummaryStatSelect = useCallback(
    async (selection) => {
      if (!selection) return;
      const isCompareSource = selection.source === "compare";
      const canUseCachedOverallRefs =
        selection.scope === "overall" &&
        !isCompareSource &&
        useCachedOverallStats &&
        !!overallStatsForEvent;
      const cachedOverallSolveCount = Number(overallStatsForEvent?.SolveCountTotal);
      const hasFullLoadedOverallScope =
        selection.scope === "overall" &&
        !isCompareSource &&
        Number.isFinite(cachedOverallSolveCount) &&
        cachedOverallSolveCount >= 0 &&
        stableOverallSolves.length >= cachedOverallSolveCount;
      const needsFullOverallScopeForCachedRefs =
        selection.scope === "overall" &&
        !isCompareSource &&
        isAllSessionsMode &&
        !overallScopeSolves.length;
      const missingExactOverallSingleRef =
        selection.scope === "overall" &&
        selection.kind === "single" &&
        !isCompareSource &&
        canUseCachedOverallRefs &&
        !(
          selection.variant === "worst"
            ? overallStatsForEvent?.WorstSingleSolveSK
            : overallStatsForEvent?.BestSingleSolveSK
        ) &&
        !hasFullLoadedOverallScope &&
        !overallScopeSolves.length;
      const missingExactOverallWindowRef =
        selection.scope === "overall" &&
        selection.kind === "window" &&
        !isCompareSource &&
        canUseCachedOverallRefs &&
        !(
          selection.variant === "strict-best"
            ? overallStatsForEvent?.[
                `${(WINDOW_SPECS[selection.metricKey]?.startField || "").replace(
                  "StartSolveSK",
                  "StrictStartSolveSK"
                )}`
              ]
            : selection.variant === "worst"
              ? overallStatsForEvent?.[
                  (WINDOW_SPECS[selection.metricKey]?.startField || "").replace("Best", "Worst")
                ]
              : overallStatsForEvent?.[WINDOW_SPECS[selection.metricKey]?.startField]
        ) &&
        !hasFullLoadedOverallScope &&
        !overallScopeSolves.length;
      let loadedOverallSolves = null;

      if (
        selection.scope === "overall" &&
        !isCompareSource &&
        statsViewMode === "standard" &&
        !hasActiveDateFilter &&
        !hasActiveTagFilter &&
        !overallScopeSolves.length &&
        (!canUseCachedOverallRefs || needsFullOverallScopeForCachedRefs)
      ) {
        const approved = await warnBeforeSolveScan({
          title: "Load full overall solve scope?",
          intro: "This action needs the full overall solve history to locate the exact stat window.",
          event: statsEvent,
          sessionID: isAllSessionsMode ? ALL_SESSIONS : sessionId,
          confirmLabel: "Load Solve Scope",
        });
        if (!approved) return;

        loadedOverallSolves = await loadOverallScopeSolves();
        if (!loadedOverallSolves?.length) return;
      }

      const overallSourceSolves =
        !isCompareSource && loadedOverallSolves?.length
          ? loadedOverallSolves
          : stableOverallSolves;

      if (selection.kind === "single") {
      const sourceSolves =
        selection.scope === "overall"
          ? isCompareSource
            ? compareFilteredRawSolves
            : overallSourceSolves
          : isCompareSource
            ? compareVisiblePageFilteredRawSolves
            : summaryCurrentSolves;
      const solveWindowSessionScope =
        selection.scope === "overall"
          ? ""
          : String(isCompareSource ? compareSessionId : sessionId || "main");
      let solve = null;

        if (missingExactOverallSingleRef) {
          return;
        }

        if ((selection.variant === "best" || selection.variant === "worst") && canUseCachedOverallRefs) {
          const bestSolveRef =
            selection.variant === "worst"
              ? overallStatsForEvent?.WorstSingleSolveSK || null
              : overallStatsForEvent?.BestSingleSolveSK || null;
          solve =
            sourceSolves.find(
              (item) => String(item?.solveRef ?? item?.SK ?? "") === String(bestSolveRef)
            ) || null;

          if (!solve && user?.UserID && bestSolveRef) {
            try {
              const items = await getSolveWindowFromStart(
                user.UserID,
                String(statsEvent || "").toUpperCase(),
                solveWindowSessionScope,
                bestSolveRef,
                1
              );
              solve = normalizeSolve((items || [])[0]);
            } catch (error) {
              console.warn(`Failed to load exact ${selection.variant} single:`, error);
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
        selection.scope === "overall"
          ? isCompareSource
            ? compareFilteredRawSolves
            : overallSourceSolves
          : isCompareSource
            ? compareVisiblePageFilteredRawSolves
            : summaryCurrentSolves;
      const solveWindowSessionScope =
        selection.scope === "overall"
          ? ""
          : String(isCompareSource ? compareSessionId : sessionId || "main");

      if (missingExactOverallWindowRef) {
        return;
      }

      let solvesForWindow = null;
      const startSolveRef =
        canUseCachedOverallRefs &&
        (selection.variant === "best" ||
          selection.variant === "strict-best" ||
          selection.variant === "worst")
          ? overallStatsForEvent?.[
              selection.variant === "strict-best"
                ? `${spec.startField.replace("StartSolveSK", "StrictStartSolveSK")}`
                : selection.variant === "worst"
                  ? spec.startField.replace("Best", "Worst")
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
            String(isCompareSource ? compareEvent : statsEvent || "").toUpperCase(),
            solveWindowSessionScope,
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
            ? isCompareSource
              ? `${compareEventLabel} · ${compareSessionDisplay} · overall`
              : `${eventSelectLabel} · ${selectedSessionDisplay} · overall`
            : isCompareSource
              ? `${compareEventLabel} · ${compareSessionDisplay}`
              : `${eventSelectLabel} · ${selectedSessionDisplay}`,
        solves: solvesForWindow,
      });
    },
    [
      compareEvent,
      compareEventLabel,
      compareFilteredRawSolves,
      compareSessionDisplay,
      compareSessionId,
      compareVisiblePageFilteredRawSolves,
      eventSelectLabel,
      hasActiveDateFilter,
      hasActiveTagFilter,
      isAllSessionsMode,
      useCachedOverallStats,
      loadOverallScopeSolves,
      normalizeSolve,
      openSolveDetail,
      overallScopeSolves.length,
      overallStatsForEvent,
      stableOverallSolves,
      selectedSessionDisplay,
      sessionId,
      statsEvent,
      user?.UserID,
      summaryCurrentSolves,
      statsViewMode,
      warnBeforeSolveScan,
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
      const nextStatShare =
        focusedCard?.key === "line"
          ? {
              ...focusedCard.statShare,
              render: {
                ...(focusedCard.statShare?.render || {}),
                showControls: shareIncludeChartControls,
                chartControls:
                  focusedLineChartControls || focusedCard.statShare?.render?.chartControls || null,
              },
            }
          : focusedCard.statShare;

      const shared = await addPost({
        note: "",
        event: statsEvent === ALL_EVENTS ? "333" : statsEvent,
        solveList: [],
        comments: [],
        postType: "stat-share",
        statShare: nextStatShare,
      });
      setFocusActionMessage(shared ? "Shared." : "");
    } catch (error) {
      console.error("Failed to share stat card:", error);
      setFocusActionMessage("Failed to share.");
    } finally {
      setFocusActionBusy("");
    }
  }, [addPost, focusedCard, focusedLineChartControls, shareIncludeChartControls, statsEvent]);

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
            overallStats={renderedOverallStats}
            bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
            bucketItems={useBucketBackedRange ? activeBucketItems : []}
            allEventsBreakdown={statsViewMode === "time" ? null : isAllEventsMode ? allEventsBreakdown : null}
            eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
            mode={summaryMode}
            loadedSolveCount={loadedSolveCountForSummary}
            showCurrentMetrics={currentPage === 0}
            viewMode={statsViewMode}
            summaryLayout={summaryLayout}
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
            overallSolves={stableOverallSolves}
            overallStats={canonicalOverallStats}
            allowOverallDerived={allowOverallDerivedMetrics}
            mode={summaryMode}
            selectedEvent={eventSelectLabel}
            selectedSession={selectedSessionDisplay}
            selectedTagLabel={selectedTagLabel}
            selectedTagPills={selectedTagPills}
            loadedSolveCount={loadedSolveCountForSummary}
            onStatSelect={handleSummaryStatSelect}
            profileColor={primaryAccentColor}
            loading={primaryOverallSummaryLoading}
            showWorstOverview={showAllActive}
          />
        );
      }

      if (card.key === "summary-compare-secondary-current") {
        return (
                      <StatsSummaryCurrent
                        solves={compareVisiblePageFilteredRawSolves}
                        overallStats={useBucketBackedRange ? activeCompareBucketSummary : null}
                        bucketSummary={useBucketBackedRange ? activeCompareBucketSummary : null}
                        bucketItems={useBucketBackedRange ? activeCompareBucketItems : []}
                        allEventsBreakdown={null}
                        mode="session"
                        loadedSolveCount={compareFilteredRawSolves.length}
            showCurrentMetrics={currentPage === 0}
            viewMode="standard"
            summaryLayout={summaryLayout}
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
                        overallStats={useBucketBackedRange ? activeCompareBucketSummary : null}
                        allowOverallDerived={true}
                        mode="session"
            selectedEvent={compareEventLabel}
            selectedSession={compareSessionDisplay}
            selectedTagLabel={compareSelectedTagSummaryLabel}
            selectedTagPills={compareSelectedTagPills}
            loadedSolveCount={compareFilteredRawSolves.length}
            onStatSelect={null}
            profileColor={compareStyle?.primary || "#7c8cff"}
            loading={compareSummaryLoading}
            showWorstOverview={effectiveCompareShowAllActive}
          />
        );
      }

      if (card.key === "line") {
        return (
          <LineChart
            user={user}
            solves={compareEnabled ? comparisonPrimarySolves : timeViewLineSolves}
            bucketItems={useBucketBackedRange ? activeBucketItems : []}
            comparisonSeries={
              compareEnabled
                ? [
                    {
                      id: "compare",
                      label: compareLegendItems[1]?.label || "Compare",
                      solves: useBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                      bucketItems: useBucketBackedRange ? activeCompareBucketItems : [],
                      style: compareStyle,
                    },
                  ]
                : []
            }
            seriesStyle={primaryCompareStyle}
            legendItems={compareLegendItems}
            title={buildStatCardTitle(eventSelectLabel, selectedSessionDisplay)}
            deleteTime={handleDeleteSolve}
            addPost={addPost}
            setSessions={setSessions}
            sessionsList={sessionsList}
            currentEvent={statsEvent}
            currentSession={sessionId}
            eventKey={statsEvent}
            practiceMode={false}
            controlsSyncKey={focusedCardId || card.id}
            initialControlState={focusedLineChartControls || card.statShare?.render?.chartControls || null}
            viewMode={statsViewMode}
            selectedDay={selectedTimeDay}
            onSelectedDayChange={setSelectedTimeDay}
            onSolveOpen={openSolveDetail}
            onControlsChange={updateFocusedLineChartControls}
            onBucketSelect={handleBucketDaySelect}
          />
        );
      }

      if (card.key === "percent") {
        return showEventBreakdownCard
          ? <PieChart
              data={timeViewEventBreakdownData}
              title="Event Breakdown"
              profileColor={primaryAccentColor}
              centerFillColor={settings?.primaryColor}
            />
          : (
            useBucketBackedRange ? (
              <PieChart
                data={buildPenaltyPieData(activeBucketSummary)}
                title="Penalty Breakdown"
                profileColor={primaryAccentColor}
                centerFillColor={settings?.primaryColor}
              />
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
            )
          );
      }

      if (card.key === "bar") {
        return (
          <BarChart
            solves={compareEnabled ? comparisonPrimarySolves : barChartSolves}
            histogramCounts={compareEnabled ? null : activeBucketSummary?.HistogramBySecond || null}
            comparisonSeries={
              compareEnabled
                ? [
                    {
                      id: "compare",
                      label: compareLegendItems[1]?.label || "Compare",
                      solves: useBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                      histogramCounts: useBucketBackedRange
                        ? activeCompareBucketSummary?.HistogramBySecond || null
                        : null,
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
        if (useBucketBackedRange) {
          return (
            <BucketTable
              bucketItems={
                compareEnabled && tableCompareView === "compare"
                  ? activeCompareBucketItems
                  : activeBucketItems
              }
              selectedDay={
                compareEnabled && tableCompareView === "compare"
                  ? (effectiveCompareDateFilterStart === effectiveCompareDateFilterEnd
                      ? effectiveCompareDateFilterStart
                      : "")
                  : (dateFilterStart === dateFilterEnd ? dateFilterStart : "")
              }
              onBucketSelect={handleBucketDaySelect}
            />
          );
        }
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
      activeBucketItems,
      activeBucketSummary,
      activeCompareBucketItems,
      activeCompareBucketSummary,
      allEventsBreakdown,
      allLoadedFilteredRawSolves,
      barChartSolves,
      chartVisibleSolves,
      compareEnabled,
      compareVisiblePageFilteredRawSolves,
      compareEventLabel,
      compareLegendItems,
      compareFilteredRawSolves,
      compareSelectedTagPills,
      compareSelectedTagSummaryLabel,
      compareSessionDisplay,
      compareStyle,
      compareSessionId,
      compareEvent,
      comparisonPrimarySolves,
      currentPage,
      dateFilterEnd,
      dateFilterStart,
      eventSelectLabel,
      focusedCardId,
      focusedLineChartControls,
      handleDeleteSolve,
      handleBucketDaySelect,
      updateFocusedLineChartControls,
      allowOverallDerivedMetrics,
      isAllEventsMode,
      summaryMode,
      effectiveOverallStats,
      renderedOverallStats,
      handleSummaryStatSelect,
      pieChartSolves,
      primaryCompareStyle,
      primaryOverallSummaryLoading,
      primarySummaryLoading,
      showEventBreakdownCard,
      useBucketBackedRange,
      selectedSessionDisplay,
      selectedTagLabel,
      selectedTimeDay,
      sessionId,
      sessionsList,
      setSessions,
      loadedSolveCountForSummary,
      canonicalOverallStats,
      stableOverallSolves,
      stableOverallStats,
      statsEvent,
      statsViewMode,
      tableCompareView,
      timeViewLineSolves,
      openSolveDetail,
      user,
      visiblePageFilteredRawSolves,
      compareSummaryLoading,
      effectiveCompareDateFilterEnd,
      effectiveCompareDateFilterStart,
      selectedTagPills,
      timeViewEventBreakdownData,
    ]
  );

  const focusedCardBody = useMemo(() => {
    return renderFocusedCardBody(focusedCard);
  }, [focusedCard, renderFocusedCardBody]);

  const focusedCardFrameClassName = useMemo(() => {
    const key = String(focusedCard?.key || "");

    if (key === "line") return "statFocusFrame stats-item stats-item--line";
    if (key === "percent") return "statFocusFrame stats-item stats-item--percent";
    if (key === "bar") return "statFocusFrame stats-item stats-item--bar";
    if (key === "table") return "statFocusFrame stats-item stats-item--table";
    if (key.startsWith("summary")) {
      return `statFocusFrame statsSummaryPanel ${
        key.includes("overall")
          ? "statFocusFrame--summaryOverall"
          : "statFocusFrame--summaryCurrent"
      }`;
    }

    return "statFocusFrame";
  }, [focusedCard?.key]);

  const focusOptionsContent = useMemo(() => {
    if (focusedCard?.key !== "line") return null;

    return (
      <label className="statFocusOptionCard">
        <input
          type="checkbox"
          checked={shareIncludeChartControls}
          onChange={(event) => setShareIncludeChartControls(event.target.checked)}
        />
        <span className="statFocusOptionText">
          <span className="statFocusOptionTitle">Let viewers use chart controls</span>
          <span className="statFocusOptionHint">
            Shared charts stay clickable either way. This only shows or hides the graph buttons.
          </span>
        </span>
      </label>
    );
  }, [focusedCard?.key, shareIncludeChartControls]);

  const isInteractiveTarget = (target) =>
    !!target?.closest?.(
      "button, select, input, textarea, a, [data-interactive='solve-point'], [data-interactive='summary-stat'], [data-interactive='percent-bar-control'], .lineChartDot, svg .timeLineSegment, .timeLineSegment"
    );

  useEffect(() => {
    onSettingsContextChange?.({
      eventLabel: eventSelectLabel,
      sessionLabel: isAllEventsMode ? "Pick a specific event first" : selectedSessionDisplay,
      isAllEventsMode,
      canRecomputeOverall: readOnly ? false : canRecomputeOverall,
      canImport: !readOnly && !!user?.UserID && !importBusy && !isAllEventsMode,
      canExport: !readOnly && !!user?.UserID && !exportBusy,
      loadingOverallStats,
      recomputeStatusText,
      importBusy,
      exportBusy,
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
    readOnly,
    user?.UserID,
    importBusy,
    exportBusy,
    loadingOverallStats,
    recomputeStatusText,
  ]);

  useEffect(() => {
    if (!(Number(recomputeRequest) > 0)) return;
    if (recomputeRequest === recomputeRequestRef.current) return;
    recomputeRequestRef.current = recomputeRequest;
    handleRecomputeOverall();
  }, [recomputeRequest, handleRecomputeOverall]);

  useEffect(() => {
    if (!(Number(importRequest) > 0)) return;
    if (importRequest === importRequestRef.current) return;
    importRequestRef.current = importRequest;
    if (!user?.UserID || importBusy || isAllEventsMode) return;
    setShowImport(true);
  }, [importRequest, user?.UserID, importBusy, isAllEventsMode]);

  useEffect(() => {
    if (!forceShowImportModal) return;
    if (!user?.UserID || importBusy || isAllEventsMode) return;
    setShowImport(true);
    onImportModalOpenHandled?.();
  }, [
    forceShowImportModal,
    user?.UserID,
    importBusy,
    isAllEventsMode,
    onImportModalOpenHandled,
  ]);

  useEffect(() => {
    if (!(Number(exportRequest) > 0)) return;
    if (exportRequest === exportRequestRef.current) return;
    exportRequestRef.current = exportRequest;
    if (!user?.UserID || exportBusy) return;
    setShowExport(true);
  }, [exportRequest, user?.UserID, exportBusy]);

  useEffect(() => {
    if (!forceShowExportModal) return;
    if (!user?.UserID || exportBusy) return;
    setShowExport(true);
    onExportModalOpenHandled?.();
  }, [
    forceShowExportModal,
    user?.UserID,
    exportBusy,
    onExportModalOpenHandled,
  ]);

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
  const showStatsSummaryHeader = !isTagBreakdownView;

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
    if (section === "tag-method") return "Method";
    if (section === "tag-solve-source") return "SolveSource";
    if (section === "tag-time-input") return "TimerInput";
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
    dateStartDay,
    dateEndDay,
    onDateApply,
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
    const quickTagFields = getVisibleSharedTagFields(tagSelection, resolvedTagEvent);
    const hasMethodOrAlgorithms = quickTagFields.some((field) =>
      ["Method", "Alg_PLL", "Alg_OLL", "Alg_CMLL", "Alg_CLL"].includes(field)
    );
    const quickTagNavItems = [
      quickTagFields.includes("CubeModel") ? { key: "tag-cube-model", label: "Cube Model" } : null,
      quickTagFields.includes("CrossColor") ? { key: "tag-cross-color", label: "Start Color" } : null,
      hasMethodOrAlgorithms ? { key: "tag-method", label: "Method + Algorithms" } : null,
      quickTagFields.includes("SolveSource") ? { key: "tag-solve-source", label: "Solve Source" } : null,
      quickTagFields.includes("TimerInput") ? { key: "tag-time-input", label: "Time Input" } : null,
    ].filter(Boolean);
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
                  : normalizeSessionLabel(
                      sessionValue,
                      sessionItems.find((s) => s.SessionID === sessionValue)?.SessionName || sessionValue
                    )}
              </span>
            </button>

            {scopeModalSection === "session" && (
              <div className="statsScopeChipGrid">
                {sessionItems.map((s) => {
                  const sid = s.SessionID || "main";
                  const label = normalizeSessionLabel(sid, s.SessionName || sid);
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
                  {quickTagNavItems.map((item) => (
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
                  eventKey={resolvedTagEvent}
                  tagColors={scopeTagColors}
                  onChange={onTagSelectionChange}
                  onTagColorsChange={handleScopeTagColorsChange}
                  tagConfig={safeTagConfig}
                  cubeModelOptions={cubeModelOptions}
                  discoveredOptions={discoveredOptions}
                  profileColor={user?.Color || user?.color || "#2EC4B6"}
                  variant="stats"
                  algorithmGrouping="method"
                  showEventScopedAlgorithmFields
                  expandMethodAlgorithms
                  allowAdditions
                />
              </>
            )}

            {String(scopeModalSection || "").startsWith("tag-") && (
              <>
                <div className="statsScopeTagQuickNav">
                  {quickTagNavItems.map((item) => (
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
                  eventKey={resolvedTagEvent}
                  tagColors={scopeTagColors}
                  onChange={onTagSelectionChange}
                  onTagColorsChange={handleScopeTagColorsChange}
                  tagConfig={safeTagConfig}
                  cubeModelOptions={cubeModelOptions}
                  discoveredOptions={discoveredOptions}
                  profileColor={user?.Color || user?.color || "#2EC4B6"}
                  variant="stats"
                  algorithmGrouping="method"
                  showEventScopedAlgorithmFields
                  expandMethodAlgorithms
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
                startDay={dateStartDay}
                endDay={dateEndDay}
                accentColor={accentColor}
                onApply={onDateApply}
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
    const controls = !useCompareControls && canUseDateWindowControls
      ? {
          previous: handleDateWindowPrevious,
          next: handleDateWindowNext,
          zoomIn: handleDateWindowZoomIn,
          zoomOut: handleDateWindowZoomOut,
          decrease: handleDateWindowDecrease,
          increase: handleDateWindowIncrease,
          showAll: handleDateWindowShowAll,
          canOlder: canDateWindowOlder,
          canNewer: canDateWindowNewer,
          canZoomIn: canDateWindowZoomIn,
          canZoomOut: canDateWindowZoomOut,
          canDecreaseSolveCount: canDateWindowDecrease,
          canIncreaseSolveCount: canDateWindowIncrease,
          canShowAll: canDateWindowShowAll,
          loadingShowAll: false,
          showAllActive: false,
        }
      : useCompareControls
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
      <div
        className={`statsScopeControls ${statsViewMode === "time" ? "statsScopeControls--time" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
      {statsViewMode === "time" ? (
        <>
          {isTimeViewSingleDay ? (
            <>
              <button type="button" onClick={() => shiftTimeRangeByDay(-1)} title="Previous day">
                Day -
              </button>

              <button
                type="button"
                onClick={() => {
                  void applyTimeRangePreset("day");
                }}
                title="Jump to today"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => shiftTimeRangeByDay(1)}
                title="Next day"
                disabled={!canShiftTimeRangeNewer}
              >
                Day +
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                void applyTimeRangePreset("day");
              }}
              title="Show today"
            >
              Today
            </button>
          )}

          <button type="button" onClick={() => void applyTimeRangePreset("week")} title="Show week range">
            Week
          </button>

          <button type="button" onClick={() => void applyTimeRangePreset("month")} title="Show month range">
            Month
          </button>

          <button type="button" onClick={() => void applyTimeRangePreset("all")} title="Show all dates">
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

      <button
        onClick={controls.showAll}
        disabled={!controls.canShowAll}
        className="statsToggleBtn statsTopOverviewBtn"
        title="Load all solves"
      >
        {controls.loadingShowAll ? "Loading…" : controls.showAllActive ? "All Loaded" : "Overview"}
      </button>
        </>
      )}
      </div>
    );
  };

  const renderScopeRow = ({
    rowAccentColor = "rgba(255,255,255,0.22)",
    eventValue,
    sessionValue,
    sessionDisplay,
    tagSelection,
    tagPills = [],
    dateSummary,
    loading = false,
    scopeModalKey,
    leadContent = null,
    sourceSummary = "",
  }) => {
    const { label: eventLabel, puzzleEvent } = getEventDisplayMeta(eventValue);
    const hasActiveTags = Object.values(sanitizeTagSelection(tagSelection)).some((value) =>
      String(value || "").trim()
    );
    const activeTone = hasActiveTags ? tagPills[0]?.color || rowAccentColor : rowAccentColor;

    return (
      <div
        className={`statsScopeRow statsScopeRow--clickable ${
          statsViewMode === "time" ? "statsScopeRow--time" : ""
        } ${loading ? "is-loading" : ""}`}
        role="button"
        tabIndex={0}
        style={{
          "--stats-scope-active-accent": activeTone,
          "--stats-scope-active-accent-soft": `${activeTone}22`,
          "--stats-scope-active-accent-strong": `${activeTone}66`,
          borderColor: loading ? undefined : `${activeTone}66`,
          background:
            loading || !hasActiveTags
              ? undefined
              : `color-mix(in srgb, ${activeTone} 16%, rgba(255,255,255,0.06))`,
          boxShadow: loading ? undefined : `inset 0 0 0 1px ${activeTone}22`,
        }}
        onClick={() => openScopeModal(scopeModalKey, "event")}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openScopeModal(scopeModalKey, "event");
          }
        }}
      >
        {leadContent ? <div className="statsScopeLead">{leadContent}</div> : null}

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
            className="statsScopeSummaryChip statsScopeSummaryChip--session"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "session");
            }}
          >
            <span className="statsScopeSummaryChipValue">
              {sessionValue === ALL_SESSIONS ? "All Sessions" : sessionDisplay}
            </span>
          </button>

          {hasActiveTags ? (
            <button
              type="button"
              className="statsScopeSummaryChip statsScopeSummaryChip--tags"
              onClick={(e) => {
                e.stopPropagation();
                openScopeModal(scopeModalKey, "tags");
              }}
              aria-label="Edit tag filters"
              title="Edit tag filters"
            >
              <span className="statsScopeTagList">
                {tagPills.map((tag) => (
                  <span
                    key={`${scopeModalKey}-${tag.field}-${tag.value}`}
                    className="statsScopeTagPill"
                    style={{
                      "--tag-chip-color": tag.color,
                      "--tag-chip-border": tag.color,
                      "--tag-chip-bg": `${tag.color}22`,
                    }}
                    title={`${tag.label}: ${tag.value}`}
                  >
                    <span className="statsScopeTagPillIconWrap" aria-hidden="true">
                      <img src={tagBadge} alt="" className="statsScopeTagPillIcon" />
                    </span>
                    <span className="statsScopeTagPillText">{tag.value}</span>
                  </span>
                ))}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="statsScopeSummaryChip statsScopeSummaryChip--tagIcon"
              onClick={(e) => {
                e.stopPropagation();
                openScopeModal(scopeModalKey, "tags");
              }}
              aria-label="Add tag filter"
              title="Add tag filter"
            >
              <img src={tagBadge} alt="" className="statsScopeTagIconButtonImg" />
            </button>
          )}

          {sourceSummary ? (
            <div
              className="statsScopeSummaryChip statsScopeSummaryChip--source"
              aria-label={`Data source: ${sourceSummary}`}
            >
              <span className="statsScopeSummaryChipLabel">Source</span>
              <span className="statsScopeSummaryChipValue">{sourceSummary}</span>
            </div>
          ) : null}
        </div>

        <div className="statsScopeRowActions">
          <button
            type="button"
            className="statsScopeSummaryChip statsScopeSummaryChip--date"
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "date");
            }}
          >
            <span className="statsScopeSummaryChipValue">{dateSummary}</span>
          </button>
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
      {readOnly ? (
        <div className="statsSharedBanner">
          Viewing {statsOwnerDisplayName}'s shared stats. Editing is disabled for this view.
          {viewerUser?.UserID ? ` Shared with ${viewerDisplayName}.` : ""}
        </div>
      ) : null}
      <div className={`statsTopBar ${statsViewMode === "standard" ? "statsTopBar--standard" : ""}`}>
        <div
          className={`statsTopLeft ${statsViewMode === "standard" ? "statsTopLeft--standard" : "statsTopLeft--time"}`}
        >
          <div
            className={`statsCompareShell ${
              useSharedCompareRail ? "statsCompareShell--linked" : ""
            } ${statsViewMode === "time" ? "statsCompareShell--time" : ""}`}
          >
            <div
              className={`statsCompareControls ${
                statsViewMode === "standard" ? "statsCompareControls--standard" : "statsCompareControls--time"
              } ${compareEnabled ? "statsCompareControls--dual" : "statsCompareControls--single"} ${
                canCompare && !compareEnabled ? "statsCompareControls--singleAddable" : ""
              }`}
              aria-label="Stats settings"
            >
              {renderScopeRow({
                rowAccentColor: primaryAccentColor,
                eventValue: statsEvent,
                sessionValue: statsSession,
                sessionDisplay: selectedSessionDisplay,
                tagSelection: tagFilterSelection,
                tagPills: selectedTagPills,
                dateSummary: dateFilterLabel,
                sourceSummary: !compareEnabled && useBucketBackedRange ? bucketSourceLabel : "",
                scopeModalKey: "primary",
              })}

              {compareEnabled &&
                renderScopeRow({
                  rowAccentColor: compareAccentColor,
                  eventValue: compareEvent,
                  sessionValue: compareSessionId,
                  sessionDisplay: compareSessionDisplay,
                  tagSelection: compareTagSelection,
                  tagPills: compareSelectedTagPills,
                  dateSummary: compareDateFilterLabel,
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
                    <span className="statsAddComparePlus" aria-hidden="true">+</span>
                    <span className="statsAddCompareLabel" aria-hidden="true">Add stat group</span>
                  </button>
                  <span className="statsAddCompareHint">Add stat group</span>
                </div>
              )}
            </div>

            {useSharedCompareRail ? (
              <div className="statsCompareSharedRail" aria-label="Comparison controls">
                <button
                  type="button"
                  className="statsMiniBtn statsCompareRemoveBtn statsCompareRemoveBtn--outside"
                  onClick={handlePromoteCompareRow}
                  aria-label="Remove stat group A and promote stat group B"
                  title="Remove stat group A and promote stat group B"
                >
                  x
                </button>
                <button
                  type="button"
                  className={`statsCompareLinkBtn ${linkStatsControls ? "is-active" : ""}`}
                  onClick={() => setLinkStatsControls((prev) => !prev)}
                  aria-pressed={linkStatsControls}
                  title={linkStatsControls ? "Unlink stat row controls" : "Link stat row controls"}
                >
                  <img src={PtsLinkStatsIcon} alt="" className="statsCompareLinkIcon" />
                </button>
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
            ) : null}
          </div>
        </div>

        <div className="statsTopIdentity statsTopIdentity--header">
          <div className="statsViewToggle statsViewToggle--modeGrid" role="group" aria-label="Stats view">
            <div className="statsViewToggleStack">
              <button
                type="button"
                className={`statsToggleBtn ${
                  statsViewMode === "standard" && standardSubview === "solves" ? "is-active" : ""
                }`}
                onClick={() => void handleSetStatsDisplayMode("solves")}
              >
                Solves
              </button>
              <button
                type="button"
                className={`statsToggleBtn ${statsViewMode === "time" ? "is-active" : ""}`}
                onClick={() => void handleSetStatsDisplayMode("time")}
              >
                Time
              </button>
            </div>
            <button
              type="button"
              className={`statsToggleBtn statsToggleBtn--iconOnly ${
                statsViewMode === "standard" && standardSubview === "tags" ? "is-active" : ""
              }`}
              onClick={() => void handleSetStatsDisplayMode("tags")}
              aria-label="Tags"
              title="Tags"
            >
              <span className="statsToggleBtnIconStack" aria-hidden="true">
                <img
                  src={StatsIcon}
                  alt=""
                  className="statsToggleBtnIcon statsToggleBtnIcon--background"
                />
                <img src={tagBadge} alt="" className="statsToggleBtnIcon statsToggleBtnIcon--foreground" />
              </span>
            </button>
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
        onTagSelectionChange: (next) => {
          void applyPrimaryTagSelection(next);
        },
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
        dateStartDay: dateFilterStart,
        dateEndDay: dateFilterEnd,
        onDateApply: (nextStart, nextEnd) => {
          void applyPrimaryDateRange(nextStart, nextEnd);
        },
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
        dateLabel: compareDateFilterLabel,
        dateStartDay: effectiveCompareDateFilterStart,
        dateEndDay: effectiveCompareDateFilterEnd,
        onDateApply: (nextStart, nextEnd) => {
          if (linkStatsControls) {
            setDateFilterStart(nextStart);
            setDateFilterEnd(nextEnd);
            return;
          }
          setCompareDateFilterStart(nextStart);
          setCompareDateFilterEnd(nextEnd);
        },
      })}

      <div className="stats-page">
        <div
          className={`stats-grid stats-grid--figma ${statsViewMode === "time" ? "stats-grid--time" : ""} ${
            showAllEventsTimeMatrixCard ? "" : "stats-grid--noEventMatrix"
          } ${showStatsSummaryHeader ? "" : "stats-grid--tagBreakdownOnly"}`}
        >
          {showStatsSummaryHeader && (
          <div
            className={`stats-item stats-item--header stats-item--minh stats-item--headerSplit${
              isAllEventsMode || (!compareEnabled && statsViewMode === "time") || (!compareEnabled && summaryLayout === "row")
                ? " stats-item--headerSplitSingle"
                : ""
            }${compareEnabled ? " stats-item--headerSplitSingle" : ""}`}
          >
            {!compareEnabled ? (
              statsViewMode === "time" ? (
                <div
                  className={`statsSummaryPanel statsCardShell ${primarySummaryLoading ? "is-loading" : ""}`}
                  aria-busy={primarySummaryLoading}
                  {...bindCardFocus(cardDefinitions[0]?.id)}
                >
                  <StatsSummaryCurrent
                    solves={summaryCurrentSolves}
                    overallStats={renderedOverallStats}
                    bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                    bucketItems={useBucketBackedRange ? activeBucketItems : []}
                    allEventsBreakdown={null}
                    eventBreakdownData={timeViewEventBreakdownData}
                    mode={summaryMode}
                    loadedSolveCount={loadedSolveCountForSummary}
                    showCurrentMetrics={currentPage === 0}
                    viewMode={statsViewMode}
                    summaryLayout={summaryLayout}
                    selectedDay={selectedTimeDay}
                    selectedTagPills={selectedTagPills}
                    summarySource="primary"
                    onStatSelect={handleSummaryStatSelect}
                    loading={primarySummaryLoading}
                  />
                </div>
              ) : isAllEventsMode ? (
                <div
                  className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                  aria-busy={primaryOverallSummaryLoading}
                  {...bindCardFocus(cardDefinitions[0]?.id)}
                >
                  <StatsSummary
                    solves={summaryCurrentSolves}
                    overallSolves={stableOverallSolves}
                    overallStats={canonicalOverallStats}
                    overviewOnly={isAllTimeBucketOverview}
                    bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                    bucketItems={useBucketBackedRange ? activeBucketItems : []}
                    allEventsBreakdown={statsViewMode === "time" ? null : isAllEventsMode ? allEventsBreakdown : null}
                    eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
                    allowOverallDerived={allowOverallDerivedMetrics}
                    mode={summaryMode}
                    selectedEvent={eventSelectLabel}
                    selectedSession={selectedSessionDisplay}
                    selectedTagLabel={selectedTagLabel}
                    selectedTagPills={selectedTagPills}
                    loadedSolveCount={loadedSolveCountForSummary}
                    showCurrentMetrics={currentPage === 0}
                    viewMode={statsViewMode}
                    summaryLayout={summaryLayout}
                    selectedDay={selectedTimeDay}
                    profileColor={primaryAccentColor}
                    onStatSelect={handleSummaryStatSelect}
                    loading={primaryOverallSummaryLoading}
                  />
                </div>
              ) : (
                summaryLayout === "row" ? (
                  <div
                    className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                    aria-busy={primaryOverallSummaryLoading}
                    {...bindCardFocus(cardDefinitions[0]?.id)}
                  >
                    <StatsSummary
                      solves={summaryCurrentSolves}
                      overallSolves={stableOverallSolves}
                      overallStats={canonicalOverallStats}
                      overviewOnly={isAllTimeBucketOverview}
                      bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                      bucketItems={useBucketBackedRange ? activeBucketItems : []}
                      allEventsBreakdown={null}
                      eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
                      allowOverallDerived={allowOverallDerivedMetrics}
                      mode={summaryMode}
                      selectedEvent={eventSelectLabel}
                      selectedSession={selectedSessionDisplay}
                      selectedTagLabel={selectedTagLabel}
                      selectedTagPills={selectedTagPills}
                      loadedSolveCount={loadedSolveCountForSummary}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={statsViewMode}
                      summaryLayout={summaryLayout}
                      selectedDay={selectedTimeDay}
                      profileColor={primaryAccentColor}
                      summarySource="primary"
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
            overallStats={renderedOverallStats}
            bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
            bucketItems={useBucketBackedRange ? activeBucketItems : []}
                      allEventsBreakdown={null}
                      eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
                      mode={summaryMode}
            loadedSolveCount={loadedSolveCountForSummary}
            showCurrentMetrics={currentPage === 0}
            viewMode={statsViewMode}
            summaryLayout={summaryLayout}
            selectedDay={selectedTimeDay}
            selectedTagPills={selectedTagPills}
            summarySource="primary"
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
            overallSolves={stableOverallSolves}
            overallStats={canonicalOverallStats}
                      allowOverallDerived={allowOverallDerivedMetrics}
                      mode={summaryMode}
                      selectedEvent={eventSelectLabel}
                      selectedSession={selectedSessionDisplay}
            selectedTagLabel={selectedTagLabel}
            selectedTagPills={selectedTagPills}
            summarySource="primary"
            loadedSolveCount={loadedSolveCountForSummary}
            onStatSelect={handleSummaryStatSelect}
            profileColor={primaryAccentColor}
                      loading={primaryOverallSummaryLoading}
            showWorstOverview={showAllActive}
                    />
                  </div>
                </>
                )
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
                  <div className={`statsSummaryRowPanels ${summaryLayout === "row" ? "statsSummaryRowPanels--single" : ""}`}>
                    {summaryLayout === "row" ? (
                      <div
                        className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                        aria-busy={primaryOverallSummaryLoading}
                        {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-current")?.id)}
                      >
                        <StatsSummary
                        solves={summaryCurrentSolves}
                        overallSolves={stableOverallSolves}
                        overallStats={canonicalOverallStats}
                        overviewOnly={isAllTimeBucketOverview}
                        bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                        bucketItems={useBucketBackedRange ? activeBucketItems : []}
                        allEventsBreakdown={null}
                        eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
                        allowOverallDerived={allowOverallDerivedMetrics}
                        mode={summaryMode}
                        selectedEvent={eventSelectLabel}
                        selectedSession={selectedSessionDisplay}
                        selectedTagLabel={selectedTagLabel}
                        selectedTagPills={selectedTagPills}
                        loadedSolveCount={loadedSolveCountForSummary}
                        showCurrentMetrics={currentPage === 0}
                        viewMode={statsViewMode}
                        summaryLayout={summaryLayout}
                        selectedDay={selectedTimeDay}
                        summarySource="primary"
                        onStatSelect={handleSummaryStatSelect}
                        profileColor={primaryAccentColor}
                        loading={primaryOverallSummaryLoading}
                        showWorstOverview={showAllActive}
                      />
                      </div>
                    ) : (
                      <>
                    <div
                      className={`statsSummaryPanel statsCardShell ${primarySummaryLoading ? "is-loading" : ""}`}
                      aria-busy={primarySummaryLoading}
                      {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-current")?.id)}
                    >
                      <StatsSummaryCurrent
                        solves={summaryCurrentSolves}
                        overallStats={renderedOverallStats}
                        bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                        bucketItems={useBucketBackedRange ? activeBucketItems : []}
                        allEventsBreakdown={null}
                        eventBreakdownData={statsViewMode === "time" ? timeViewEventBreakdownData : []}
                        mode={summaryMode}
                      loadedSolveCount={loadedSolveCountForSummary}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={statsViewMode}
                      summaryLayout={summaryLayout}
                      selectedDay={selectedTimeDay}
                      selectedTagPills={selectedTagPills}
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
                        overallSolves={stableOverallSolves}
                        overallStats={canonicalOverallStats}
                        allowOverallDerived={allowOverallDerivedMetrics}
                        mode={summaryMode}
                        selectedEvent={eventSelectLabel}
                        selectedSession={selectedSessionDisplay}
                        selectedTagLabel={selectedTagLabel}
                        selectedTagPills={selectedTagPills}
                        loadedSolveCount={loadedSolveCountForSummary}
                        onStatSelect={handleSummaryStatSelect}
                        profileColor={primaryAccentColor}
                        loading={primaryOverallSummaryLoading}
                        showWorstOverview={showAllActive}
                      />
                    </div>
                      </>
                    )}
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
                    <div className={`statsSummaryRowPanels ${summaryLayout === "row" ? "statsSummaryRowPanels--single" : ""}`}>
                      {summaryLayout === "row" ? (
                        <div
                          className={`statsSummaryPanel statsCardShell ${compareSummaryLoading ? "is-loading" : ""}`}
                          aria-busy={compareSummaryLoading}
                          {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-secondary-current")?.id)}
                        >
                          <StatsSummary
                          solves={compareVisiblePageFilteredRawSolves}
                          overallSolves={compareFilteredRawSolves}
                          overallStats={useBucketBackedRange ? activeCompareBucketSummary : null}
                          bucketSummary={useBucketBackedRange ? activeCompareBucketSummary : null}
                          bucketItems={useBucketBackedRange ? activeCompareBucketItems : []}
                          allEventsBreakdown={null}
                          eventBreakdownData={[]}
                          allowOverallDerived={true}
                          mode="session"
                          loadedSolveCount={compareFilteredRawSolves.length}
                          showCurrentMetrics={currentPage === 0}
                          viewMode="standard"
                          summaryLayout={summaryLayout}
                          selectedDay=""
                          selectedEvent={compareEventLabel}
                          selectedSession={compareSessionDisplay}
                          selectedTagLabel={compareSelectedTagSummaryLabel}
                          selectedTagPills={compareSelectedTagPills}
                          summarySource="compare"
                          onStatSelect={handleSummaryStatSelect}
                          profileColor={compareStyle?.primary || "#7c8cff"}
                          loading={compareSummaryLoading}
                          showWorstOverview={effectiveCompareShowAllActive}
                        />
                        </div>
                      ) : (
                        <>
                        <div
                          className={`statsSummaryPanel statsCardShell ${compareSummaryLoading ? "is-loading" : ""}`}
                          aria-busy={compareSummaryLoading}
                          {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-secondary-current")?.id)}
                        >
                          <StatsSummaryCurrent
                            solves={compareVisiblePageFilteredRawSolves}
                            overallStats={useBucketBackedRange ? activeCompareBucketSummary : null}
                            bucketSummary={useBucketBackedRange ? activeCompareBucketSummary : null}
                            bucketItems={useBucketBackedRange ? activeCompareBucketItems : []}
                            allEventsBreakdown={null}
                            mode="session"
                            loadedSolveCount={compareFilteredRawSolves.length}
                            showCurrentMetrics={currentPage === 0}
                            viewMode="standard"
                            summaryLayout={summaryLayout}
                            selectedDay=""
                            selectedTagPills={compareSelectedTagPills}
                            summarySource="compare"
                            onStatSelect={handleSummaryStatSelect}
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
                            overallStats={useBucketBackedRange ? activeCompareBucketSummary : null}
                            allowOverallDerived={true}
                            mode="session"
                            selectedEvent={compareEventLabel}
                            selectedSession={compareSessionDisplay}
                            selectedTagLabel={compareSelectedTagSummaryLabel}
                            selectedTagPills={compareSelectedTagPills}
                            summarySource="compare"
                            loadedSolveCount={compareFilteredRawSolves.length}
                            onStatSelect={handleSummaryStatSelect}
                            profileColor={compareStyle?.primary || "#7c8cff"}
                            loading={compareSummaryLoading}
                            showWorstOverview={effectiveCompareShowAllActive}
                          />
                        </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {showAllEventsTimeMatrixCard && (
            <div className="stats-item stats-item--eventMatrix statsCardShell">
              <AllEventsTimeMatrix
                items={timeViewEventMatrixItems}
                loading={
                  hasActiveDateFilter
                    ? loadingTimeScope
                    : loadingEventMatrixStats
                }
                mainOnly={timeViewMainSessionsOnly}
                onToggleMainOnly={setTimeViewMainSessionsOnly}
                onStatSelect={handleEventMatrixStatSelect}
              />
            </div>
          )}

          {showSolveCharts && isTagBreakdownView && (
            <div
              className={`stats-item stats-item--tagBreakdown statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
              aria-busy={chartCardsLoading}
            >
              <TagBreakdownPie
                solves={visiblePageFilteredRawSolves}
                tagConfig={safeTagConfig}
                eventKey={statsEvent}
                onSolveOpen={openSolveDetail}
              />
            </div>
          )}

          {showSolveCharts && !isTagBreakdownView && (
            <>
              <div
                className={`stats-item stats-item--line stats-item--minh statsCardShell ${statsViewMode === "time" ? "stats-item--lineWide" : ""} ${chartCardsLoading ? "is-loading" : ""}`}
                aria-busy={chartCardsLoading}
                {...bindCardFocus(cardDefinitions.find((item) => item.key === "line")?.id)}
              >
                <LineChart
                  user={user}
                  solves={compareEnabled ? comparisonPrimarySolves : timeViewLineSolves}
                  bucketItems={useBucketBackedRange ? activeBucketItems : []}
                  comparisonSeries={
                    compareEnabled
                      ? [
                          {
                            id: "compare",
                            label: compareLegendItems[1]?.label || "Compare",
                            solves: useBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                            bucketItems: useBucketBackedRange ? activeCompareBucketItems : [],
                            style: compareStyle,
                          },
                        ]
                      : []
                  }
                  seriesStyle={primaryCompareStyle}
                  legendItems={compareLegendItems}
                  title={buildStatCardTitle(eventSelectLabel, selectedSessionDisplay)}
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
                  onBucketSelect={handleBucketDaySelect}
                />
              </div>

              {!showEventBreakdownCard && (
                <div
                  className={`stats-item stats-item--percent stats-item--minh statsCardShell ${percentCardLoading ? "is-loading" : ""}`}
                  aria-busy={percentCardLoading}
                  {...bindCardFocus(cardDefinitions.find((item) => item.key === "percent")?.id)}
                >
                  {useBucketBackedRange ? (
                    <PieChart
                      data={buildPenaltyPieData(activeBucketSummary)}
                      title="Penalty Breakdown"
                      profileColor={primaryAccentColor}
                      centerFillColor={settings?.primaryColor}
                    />
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
              )}

              {statsViewMode !== "time" && (
                <div
                  className={`stats-item stats-item--bar stats-item--minh statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                  aria-busy={chartCardsLoading}
                  {...bindCardFocus(cardDefinitions.find((item) => item.key === "bar")?.id)}
                >
                  <BarChart
                    solves={compareEnabled ? comparisonPrimarySolves : barChartSolves}
                    histogramCounts={compareEnabled ? null : activeBucketSummary?.HistogramBySecond || null}
                    comparisonSeries={
                      compareEnabled
                        ? [
                            {
                              id: "compare",
                              label: compareLegendItems[1]?.label || "Compare",
                              solves: useBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                              histogramCounts: useBucketBackedRange
                                ? activeCompareBucketSummary?.HistogramBySecond || null
                                : null,
                              style: compareStyle,
                            },
                          ]
                        : []
                    }
                    seriesStyle={primaryCompareStyle}
                    legendItems={compareLegendItems}
                  />
                </div>
              )}

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
                {useBucketBackedRange ? (
                  <BucketTable
                    bucketItems={
                      compareEnabled && tableCompareView === "compare"
                        ? activeCompareBucketItems
                        : activeBucketItems
                    }
                    selectedDay={
                      compareEnabled && tableCompareView === "compare"
                        ? (effectiveCompareDateFilterStart === effectiveCompareDateFilterEnd
                            ? effectiveCompareDateFilterStart
                            : "")
                        : (dateFilterStart === dateFilterEnd ? dateFilterStart : "")
                    }
                    onBucketSelect={handleBucketDaySelect}
                  />
                ) : (
                  <TimeTable
                    user={user}
                    solves={
                      compareEnabled && tableCompareView === "compare"
                        ? compareVisiblePageFilteredRawSolves
                        : statsViewMode === "time"
                          ? timeViewFocusedSolves
                          : chartVisibleSolves
                    }
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
                )}
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
          saveToProfile={saveToProfile}
          setSessions={setSessions}
          sessionsList={sessionsList}
          tagConfig={safeTagConfig}
          cubeModelOptions={cubeModelOptions}
          discoveredTagOptions={selectedSolveDiscoveredTagOptions}
          tagColors={selectedSolveTagColors}
          onTagColorsChange={handleSelectedSolveTagColorsChange}
        />
      )}

      <AverageDetailModal
        isOpen={!!selectedAverageDetail}
        title={selectedAverageDetail?.title || ""}
        subtitle={selectedAverageDetail?.subtitle || ""}
        solves={selectedAverageDetail?.solves || []}
        addPost={addPost}
        saveToProfile={saveToProfile}
        tagConfig={safeTagConfig}
        tagColors={selectedSolveTagColors}
        profileColor={user?.Color || user?.color || "#2EC4B6"}
        onClose={() => setSelectedAverageDetail(null)}
        onSolveOpen={openSolveDetail}
      />

      <StatFocusModal
        isOpen={!!expensiveStatsPrompt}
        title={expensiveStatsPrompt?.title || "Heavy Stats Action"}
        subtitle={
          expensiveStatsPrompt?.subtitle || "This action can scan or recompute a large solve scope."
        }
        modalClassName="statsWarningModal"
        bodyClassName="statsWarningPromptBody"
        onClose={() => resolveExpensiveStatsPrompt(false)}
        actionButtons={[
          {
            key: "cancel",
            label: "Cancel",
            onClick: () => resolveExpensiveStatsPrompt(false),
          },
          {
            key: "confirm",
            label: expensiveStatsPrompt?.confirmLabel || "Continue",
            onClick: () => resolveExpensiveStatsPrompt(true),
            tone: "active",
          },
        ]}
      >
        <div className="statsWarningPrompt">
          {(expensiveStatsPrompt?.lines || []).map((line, index) => (
            <p key={`stats-warning-${index}`} className="statsWarningPromptLine">
              {line}
            </p>
          ))}
        </div>
      </StatFocusModal>

      <StatFocusModal
        key={focusedCard?.id || "no-focused-card"}
        isOpen={!!focusedCard}
        title={focusedCard?.title}
        subtitle={focusedCard?.subtitle}
        actionMessage={focusActionMessage}
        optionsContent={focusOptionsContent}
        modalClassName={
          focusedCard?.key?.startsWith("summary")
            ? focusedCard?.key?.includes("overall")
              ? "statFocusModal--summary statFocusModal--summaryOverall"
              : "statFocusModal--summary statFocusModal--summaryCurrent"
            : ""
        }
        bodyClassName={
          focusedCard?.key?.startsWith("summary")
            ? focusedCard?.key?.includes("overall")
              ? "statFocusBody--summary statFocusBody--summaryOverall"
              : "statFocusBody--summary statFocusBody--summaryCurrent"
            : ""
        }
        onClose={closeCardFocus}
        actionButtons={[
          {
            key: "share-social",
            label: focusActionBusy === "share" ? "Sharing..." : "Share",
            onClick: handleShareFocusedCard,
            disabled: !focusedCard || focusActionBusy !== "" || typeof addPost !== "function",
          },
          {
            key: "share-profile",
            label: focusActionBusy === "profile" ? "Saving..." : "Share to Profile",
            onClick: handleShareFocusedCardToProfile,
            disabled: readOnly || !focusedCard?.profileConfig || !user?.UserID || focusActionBusy !== "",
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
            disabled: readOnly || !focusedCard?.profileConfig || !user?.UserID || focusActionBusy !== "",
            tone: isFocusedCardFavorited ? "active" : "",
          },
        ]}
        >
        <div
          key={focusedCard?.id || focusedCard?.key || "stat-focus-canvas"}
          className={`statFocusCanvas ${focusedCard?.key === "summary" ? "is-summary" : ""} ${
            focusedCard?.key === "line" ? "is-line" : ""
          } ${
            focusedCard?.key?.startsWith("summary")
              ? focusedCard?.key?.includes("overall")
                ? "is-summary-overall"
                : "is-summary-current"
              : ""
          }`}
        >
          <div
            key={focusedCard?.id || focusedCard?.key || "stat-focus-frame"}
            className={focusedCardFrameClassName}
          >
            {focusedCardBody}
          </div>
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

      {showExport && (
        <ExportDataModal
          sessionsList={sessionsList}
          defaultEvent={String(statsEvent || "").toUpperCase()}
          defaultSessionID={String(sessionId || "main")}
          busy={exportBusy}
          exportProgress={exportProgress}
          onClose={() => setShowExport(false)}
          onExport={handleExportData}
        />
      )}
    </div>
  );
}

export default Stats;
