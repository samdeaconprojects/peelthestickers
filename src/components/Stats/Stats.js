import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary, {
  StatsSummaryCurrent,
  StatsSummaryOverall,
  StatsSummaryOverviewMini,
} from "./StatsSummary";
import BarChart from "./BarChart";
import BucketTable from "./BucketTable";
import PieChart from "./PieChart";
import { PENALTY_SLICE_COLORS } from "./PieChartBuilder";
import TagBreakdownPie from "./TagBreakdownPie";
import StatFocusModal from "./StatFocusModal";
import { computeSolveIndexOffset } from "./solveIndexOffset";
import AllEventsTimeMatrix from "./AllEventsTimeMatrix";
import Detail from "../Detail/Detail";
import AverageDetailModal from "../Detail/AverageDetailModal";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import TagBar from "../TagBar/TagBar";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import PtsLinkStatsIcon from "../../assets/ptsLinkStats.svg";
import tagBadge from "../../assets/Tag.svg";

import { forEachSolvesPage, getSolvesBySession, getSolvesBySessionPage } from "../../services/getSolvesBySession";
import { getSolvesByTag } from "../../services/getSolvesByTag";
import { getLastNSolvesScoped } from "../../services/getSolvesScoped";
import { getSessionStats } from "../../services/getSessionStats";
import { getEventStats } from "../../services/getEventStats";
import { getDayBuckets } from "../../services/getDayBuckets";
import { getWcaCompetitions } from "../../services/getWcaCompetitions";
import { getTagStatsList } from "../../services/getTagStatsList";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";
import { recomputeEventStats } from "../../services/recomputeEventStats";
import { updateUser } from "../../services/updateUser";
import { getSolveWindowFromStart } from "../../services/getSolveWindow";

import ImportSolvesModal from "./ImportSolvesModal";
import { chunkImportSolves } from "../../utils/importParsers";
import { buildExportJsonParts, serializeSolvesPage } from "../../utils/exportJson";
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
import { getStatsContainerVars } from "../../utils/statsContainerVars";
import { getProfileEventScramble } from "../../utils/profileEventSolves";
import {
  collectTagSelectionOptions,
  DEFAULT_TAG_CONFIG,
  getTagColorMapForEvent,
  getTagCatalogOptionsForEvent,
  getSharedTagLabels,
  getSolveTagValue,
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
    push(solve?._importSessionName || "");
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

const DATE_SCOPED_COMMIT_INTERVAL_MS = 3000;

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

// Page that keeps a resized solve window at the same distance from the newest solve.
function getAnchoredSolvePage(perPage, page, nextPerPage) {
  const newerSolveCount = Math.max(0, Number(perPage) || 0) * Math.max(0, Number(page) || 0);
  return Math.floor(newerSolveCount / Math.max(1, Number(nextPerPage) || 1));
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

// Compact, adaptive label for the selector date chip: a single day collapses to
// "Oct 12", a same-month range to "Oct 7–12", and the year only shows when it
// isn't the current one.
function formatCompactDateRange(startValue, endValue) {
  const toDate = (value) => {
    if (!value) return null;
    const date =
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
    return isFiniteDate(date) ? date : null;
  };
  const start = toDate(startValue);
  const end = toDate(endValue) || start;
  const first = start || end;
  if (!first) return "";

  // A filter covering whole calendar months/years reads as "Aug 2026" / "2026".
  const isDayKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (isDayKey(startValue) && isDayKey(endValue) && first.getFullYear() === end.getFullYear()) {
    const lastDayOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    if (first.getDate() === 1 && end.getDate() === lastDayOfEndMonth) {
      if (first.getMonth() === 0 && end.getMonth() === 11) return String(first.getFullYear());
      if (first.getMonth() === end.getMonth()) {
        return first.toLocaleDateString(undefined, { month: "short", year: "numeric" });
      }
    }
  }

  const thisYear = new Date().getFullYear();
  const monthDay = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const shortYear = (d) => `'${String(d.getFullYear()).slice(-2)}`;
  const sameYear = first.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && first.getMonth() === end.getMonth();
  const yearSuffix = first.getFullYear() === thisYear ? "" : ` ${shortYear(first)}`;

  if (sameMonth && first.getDate() === end.getDate()) return `${monthDay(first)}${yearSuffix}`;
  if (sameMonth) {
    const month = first.toLocaleDateString(undefined, { month: "short" });
    return `${month} ${first.getDate()}–${end.getDate()}${yearSuffix}`;
  }
  if (sameYear) return `${monthDay(first)} – ${monthDay(end)}${yearSuffix}`;
  return `${monthDay(first)} ${shortYear(first)} – ${monthDay(end)} ${shortYear(end)}`;
}

function formatLongOrdinalDay(dayKey) {
  if (!dayKey) return "";
  const date = new Date(`${dayKey}T12:00:00`);
  if (!isFiniteDate(date)) return "";
  const day = date.getDate();
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ["th", "st", "nd", "rd"][day % 10] || "th";
  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${month} ${day}${suffix} ${date.getFullYear()}`;
}

function formatChartTitleDate(startDay, endDay) {
  if (!startDay && !endDay) return "";
  if (String(startDay || "") === ALL_TIME_START_DAY) return "All Time";
  if (startDay && endDay && startDay !== endDay) {
    return `${formatLongOrdinalDay(startDay)} – ${formatLongOrdinalDay(endDay)}`;
  }
  return formatLongOrdinalDay(startDay || endDay);
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
    if (
      variant === "plus2-best" &&
      String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase() !== "+2"
    ) {
      return;
    }
    const value = getSolveDisplayMs(solve);
    if (!Number.isFinite(value)) return;
    if (
      selected == null ||
      ((variant === "best" || variant === "plus2-best") && value < selectedValue) ||
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

function buildDayBucketScopeQuery({ isAllEventsMode, isAllSessionsMode, statsEvent, sessionId, scope = null }) {
  // Primary scope: an event subset, or "main sessions only" across events, needs
  // the per-event bucket merge. Returns null when buckets can't represent it
  // (custom session picks beyond main), so the page falls back to raw solves.
  if (scope) {
    const { events, sessions, pairs } = scope;
    const multiSession = sessions?.mode !== "main" && (pairs || []).length > 1;
    if (events === ALL_EVENTS && sessions?.mode === "all") {
      return { event: "", events: [], mainOnly: false, scopeLabel: "all-events" };
    }
    if (events === ALL_EVENTS || (Array.isArray(events) && events.length > 1) || multiSession) {
      const list = Array.from(new Set((pairs || []).map((p) => p.Event)));
      // Sessions not loaded yet: no events to ask for (mainOnly needs at least one).
      if (!list.length) return null;
      if (sessions?.mode === "custom") {
        if (!(pairs || []).every((p) => p.SessionID === "main")) return null;
        return { event: "", events: list, mainOnly: true, scopeLabel: "events-main" };
      }
      const mainOnly = sessions?.mode === "main";
      if (list.length === 1 && !mainOnly) {
        return { event: list[0], events: [], mainOnly: false, scopeLabel: "event" };
      }
      return { event: "", events: list, mainOnly, scopeLabel: mainOnly ? "events-main" : "events" };
    }
  }

  if (isAllEventsMode) {
    return { event: "", events: [], mainOnly: false, scopeLabel: "all-events" };
  }

  if (isAllSessionsMode) {
    return {
      event: String(statsEvent || "").toUpperCase(),
      events: [],
      mainOnly: false,
      scopeLabel: "event",
    };
  }

  return {
    event: String(statsEvent || "").toUpperCase(),
    events: [],
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
    { label: "+2", value: plus2, color: PENALTY_SLICE_COLORS["+2"] },
    { label: "DNF", value: dnf, color: PENALTY_SLICE_COLORS.DNF },
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

// "3x3", "3x3 + 4x4", "3x3 +2", "All events", "All but 2x2".
function getScopeEventsLabel(scopeEvents, allEvents) {
  if (scopeEvents === ALL_EVENTS) return "All events";
  const list = scopeEvents || [];
  const names = list.map((ev) => getEventDisplayMeta(ev).label);
  const total = (allEvents || []).length;
  if (total > 3 && list.length >= total - 2 && list.length < total) {
    const missing = (allEvents || []).filter((ev) => !list.includes(ev));
    return `All but ${missing.map((ev) => getEventDisplayMeta(ev).label).join(", ")}`;
  }
  if (total > 0 && list.length === total && total > 1) return "All events";
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} +${names.length - 1}`;
}

// "Main", "Main sessions", "All sessions", "Main, OH practice", "Main, A +2".
function getScopeSessionsLabel(scopeSessions, pairs, sessionsList, isMultiEvent) {
  const mode = scopeSessions?.mode || "main";
  if (mode === "all") return "All sessions";
  if (mode === "main") return isMultiEvent ? "Main sessions" : "Main";
  const names = (pairs || []).map((p) => {
    const found = (sessionsList || []).find(
      (s) =>
        String(s?.Event || "").toUpperCase() === p.Event && String(s?.SessionID || "main") === p.SessionID
    );
    const name = normalizeSessionLabel(p.SessionID, found?.SessionName || found?.Name || p.SessionID);
    return isMultiEvent ? `${getEventDisplayMeta(p.Event).label} ${name}` : name;
  });
  const totalForScope = new Set(
    (sessionsList || [])
      .filter((s) => (pairs || []).some((p) => p.Event === String(s?.Event || "").toUpperCase()))
      .map((s) => `${String(s?.Event || "").toUpperCase()}|${s?.SessionID || "main"}`)
  ).size;
  if (totalForScope > 1 && names.length >= totalForScope) return "All sessions";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function makeInitialScopeSessions(event, session) {
  const sid = String(session || "main");
  if (sid === "main" || sid === ALL_SESSIONS) return { mode: sid === ALL_SESSIONS ? "all" : "main", keys: [] };
  return { mode: "custom", keys: [`${String(event || "333").toUpperCase()}|${sid}`] };
}

function getEventsFromSessionsList(sessionsList) {
  const set = new Set();
  for (const s of sessionsList || []) {
    const ev = String(s?.Event || "").trim().toUpperCase();
    if (ev) set.add(ev);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getSessionIdsForEvent(sessionsList, event) {
  const ev = String(event || "").toUpperCase();
  const ids = [];
  for (const s of sessionsList || []) {
    if (String(s?.Event || "").toUpperCase() !== ev) continue;
    const sid = String(s?.SessionID || "main");
    if (!ids.includes(sid)) ids.push(sid);
  }
  return ids;
}

// Expands the scope into the {Event, SessionID} pairs whose solves are in view.
// "main" falls back to an event's first session when it has no main; a custom
// pick that names nothing for an event uses that event's main.
function resolveScopePairs(events, scopeSessions, sessionsList) {
  const out = [];
  const mode = scopeSessions?.mode || "main";
  const keys = new Set(scopeSessions?.keys || []);
  for (const rawEvent of events || []) {
    const ev = String(rawEvent || "").toUpperCase();
    if (!ev) continue;
    const ids = getSessionIdsForEvent(sessionsList, ev);
    const mainId = ids.includes("main") || !ids.length ? "main" : ids[0];
    let picked;
    if (mode === "all") picked = ids.length ? ids : ["main"];
    else if (mode === "custom") {
      // Before the sessions list loads, trust the keys as given.
      const fromKeys = [...keys].filter((k) => k.startsWith(`${ev}|`)).map((k) => k.slice(ev.length + 1));
      picked = ids.length ? ids.filter((sid) => keys.has(`${ev}|${sid}`)) : fromKeys;
      if (!picked.length) picked = [mainId];
    } else picked = [mainId];
    for (const sid of picked) out.push({ Event: ev, SessionID: sid });
  }
  return out;
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

// Day summaries only exist for days that have solves, so the calendar span is
// an upper bound. An all-time range starts at the first solve when it is known.
function formatBucketDayEstimate(startDay, endDay, firstSolveAt = "") {
  const firstDay = firstSolveAt ? getLocalDayKey(new Date(firstSolveAt)) : "";
  const start = firstDay && firstDay > String(startDay || "") ? firstDay : startDay;
  if (!start || !endDay) return "";
  if (start === ALL_TIME_START_DAY) return "one per day with solves";
  return `up to ${formatDayEstimate(getInclusiveDaySpan(start, endDay))}`;
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

// The stats scope lives in the URL so browser back / forward step between views:
//   ?ev=all | ev=333,444   events (omitted = the timer's current event)
//   &ss=all | ss=333:oh,…  sessions (omitted = main)
//   &from=&to=&raw=1       date range. All Time is from=all with no end, so a
//                          bookmark always runs through today.
// Old links with view=time open as all events, main sessions.
const STATS_RANGE_PARAMS = ["view", "ev", "ss", "from", "to", "raw"];

function encodeScopeEvents(scopeEvents) {
  if (scopeEvents === ALL_EVENTS) return "all";
  return (scopeEvents || []).join(",");
}

function encodeScopeSessions(scopeSessions) {
  if (scopeSessions?.mode === "all") return "all";
  if (scopeSessions?.mode === "custom") return (scopeSessions.keys || []).map((k) => k.replace("|", ":")).join(",");
  return "";
}

// scope: { events, sessions, defaultEvent } — the event param is only written
// when it differs from the timer's event, so a plain /stats link stays clean.
function buildStatsRangeParams(start, end, raw, scope = null) {
  const params = new URLSearchParams();
  if (scope) {
    const ev = encodeScopeEvents(scope.events);
    const defaultEv = String(scope.defaultEvent || "").toUpperCase();
    if (ev && ev !== defaultEv) params.set("ev", ev);
    const ss = encodeScopeSessions(scope.sessions);
    if (ss) params.set("ss", ss);
  }
  if (start === ALL_TIME_START_DAY) {
    params.set("from", "all");
    return params;
  }
  if (start) params.set("from", start);
  if (end) params.set("to", end);
  if (raw && start && end) params.set("raw", "1");
  return params;
}

// events: null (not in URL), ALL_EVENTS, or [event]; sessions: null or a scopeSessions object.
function parseStatsRangeSearch(search) {
  const params = new URLSearchParams(search || "");
  const legacyTime = params.get("view") === "time";
  const evRaw = String(params.get("ev") || "").trim();
  const ssRaw = String(params.get("ss") || "").trim();
  let events = null;
  if (evRaw === "all" || (legacyTime && !evRaw)) events = ALL_EVENTS;
  else if (evRaw) {
    const list = evRaw.split(",").map((e) => e.trim().toUpperCase()).filter(Boolean);
    if (list.length) events = list;
  }
  let sessions = null;
  if (ssRaw === "all") sessions = { mode: "all", keys: [] };
  else if (ssRaw) {
    const keys = ssRaw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.includes(":"))
      .map((k) => {
        const i = k.indexOf(":");
        return `${k.slice(0, i).toUpperCase()}|${k.slice(i + 1)}`;
      });
    if (keys.length) sessions = { mode: "custom", keys };
  }
  const multi = events === ALL_EVENTS || (Array.isArray(events) && events.length > 1);
  const from = params.get("from") || "";
  if (from === "all") return { events, sessions, start: ALL_TIME_START_DAY, end: getTodayLocalDayKey(), raw: false };
  const isDayKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const start = isDayKey(from) ? from : "";
  const to = params.get("to") || "";
  const end = isDayKey(to) ? to : "";
  return { events, sessions, start, end, raw: !multi && params.get("raw") === "1" && !!start && !!end };
}

// The URL's scope/range params rebuilt in canonical form, comparable to a
// buildStatsRangeParams(...).toString() key.
function urlStatsRangeKey(search, defaultEvent) {
  const parsed = parseStatsRangeSearch(search);
  return buildStatsRangeParams(parsed.start, parsed.end, parsed.raw, {
    events: parsed.events || [String(defaultEvent || "333").toUpperCase()],
    sessions: parsed.sessions || { mode: "main", keys: [] },
    defaultEvent: defaultEvent || "333",
  }).toString();
}

function withStatsRangeParams(search, rangeParams) {
  const params = new URLSearchParams(search || "");
  STATS_RANGE_PARAMS.forEach((key) => params.delete(key));
  rangeParams.forEach((value, key) => params.set(key, value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

// The Overall view opens on the current month. Small accounts (few solves in
// total) get the whole year instead, so the view isn't nearly empty.
const OVERALL_YEAR_MAX_SOLVES = 2000;
function getDefaultOverallRange(sessionsList) {
  const today = getTodayLocalDayKey();
  const total = (sessionsList || []).reduce((sum, s) => sum + (Number(s?.Stats?.SolveCountTotal) || 0), 0);
  if (total > 0 && total <= OVERALL_YEAR_MAX_SOLVES) {
    const year = String(today).slice(0, 4);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return getMonthRangeFromDayKey(today);
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

// Runs a sessions-map update (the shape bulk actions and Detail hand to
// setSessions) over a flat solve list, so lists cached outside the sessions map
// pick up the same edits, moves and deletes.
function replaySessionsUpdate(list, update, fallbackEvent = "") {
  const solves = Array.isArray(list) ? list : [];
  if (typeof update !== "function" || !solves.length) return list;
  const fallback = String(fallbackEvent || "").toUpperCase();
  const byEvent = {};
  for (const solve of solves) {
    const ev = String(solve?.event || solve?.Event || fallback).toUpperCase();
    (byEvent[ev] ||= []).push(solve);
  }
  const next = update(byEvent) || {};
  return Object.keys(byEvent).flatMap((ev) => (Array.isArray(next[ev]) ? next[ev] : byEvent[ev]));
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
  saveStatToProfile = null,
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
  const location = useLocation();
  const navigate = useNavigate();
  const isStatsRoute = location.pathname === "/stats";
  // Solves in view when stats opens or the scope changes (setting: statsDefaultSolveCount).
  const DEFAULT_IN_VIEW = Math.max(5, Math.round(Number(settings?.statsDefaultSolveCount)) || 100);
  const DEFAULT_PAGE_FETCH = 500;

  // Stats scope: which events and sessions are in view. There is no separate
  // "time view" any more: more than one event (or merged sessions) uses the
  // multi-event layout, a single event + session uses the per-solve layout.
  //   scopeEvents: [event, ...] or ALL_EVENTS
  //   scopeSessions.mode: "main" (main session of each event), "all", or
  //     "custom" (only the "EVENT|sid" keys in scopeSessions.keys)
  const [scopeEvents, setScopeEvents] = useState(() => [String(currentEvent || "333").toUpperCase()]);
  const [scopeSessions, setScopeSessions] = useState(() =>
    makeInitialScopeSessions(currentEvent, currentSession)
  );
  const [primaryPaletteKey, setPrimaryPaletteKey] = useState(DEFAULT_PRIMARY_PALETTE);
  const [compareSelection, setCompareSelection] = useState(null);
  const [compareSessionMenuOpen, setCompareSessionMenuOpen] = useState(false);
  const [compareSessionSolves, setCompareSessionSolves] = useState([]);
  const [compareSessionCursor, setCompareSessionCursor] = useState(null);
  const [loadingCompareMore, setLoadingCompareMore] = useState(false);
  const [compareTagScopeSolves, setCompareTagScopeSolves] = useState([]);
  const [compareTagScopeCacheKey, setCompareTagScopeCacheKey] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
const [scopeModalState, setScopeModalState] = useState(null);
const [scopeModalSection, setScopeModalSection] = useState("event");  const compareRequestTokenRef = useRef(0);
  const compareSessionMenuWrapRef = useRef(null);

  const scopeEventList = useMemo(
    () => (scopeEvents === ALL_EVENTS ? getEventsFromSessionsList(sessionsList) : scopeEvents),
    [scopeEvents, sessionsList]
  );
  const isMultiEventScope = scopeEvents === ALL_EVENTS || scopeEventList.length > 1;
  // null = every event; otherwise the chosen subset (used to filter multi-event data).
  const scopeEventSet = useMemo(
    () => (scopeEvents === ALL_EVENTS ? null : new Set(scopeEventList)),
    [scopeEventList, scopeEvents]
  );
  const scopePairs = useMemo(
    () => resolveScopePairs(scopeEventList, scopeSessions, sessionsList),
    [scopeEventList, scopeSessions, sessionsList]
  );
  // null = no session restriction beyond the main/all mode; otherwise "EVENT|sid" keys.
  const scopePairSet = useMemo(
    () => (scopeSessions.mode === "all" ? null : new Set(scopePairs.map((p) => `${p.Event}|${p.SessionID}`))),
    [scopePairs, scopeSessions.mode]
  );
  // Legacy single-value view of the scope; most of the page still reads these.
  const statsEvent = isMultiEventScope ? ALL_EVENTS : scopeEventList[0] || String(currentEvent || "333").toUpperCase();
  const statsSession = !isMultiEventScope && scopePairs.length === 1 ? scopePairs[0].SessionID : ALL_SESSIONS;
  const statsViewMode = isMultiEventScope || scopePairs.length > 1 ? "time" : "standard";
  const timeViewMainSessionsOnly = scopeSessions.mode === "main";
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
  // Range control under the pointer ({ scopeKey, action }); its row's range chip previews the click.
  const [scopeControlHover, setScopeControlHover] = useState(null);
  const [compareSolvesPerPage, setCompareSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [compareCurrentPage, setCompareCurrentPage] = useState(0);

  const [overallStatsForEvent, setOverallStatsForEvent] = useState(null);
  const [cachedEventMatrixStats, setCachedEventMatrixStats] = useState({});
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);
  // Written to track which scope's overall-stats load has settled; the only
  // reader was the cached-stats repair effect, which is gone.
  const [, setOverallStatsLoadSettledKey] = useState("");
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
  // Index frame for multi-event / merged-session scopes: the last N solves,
  // either combined across the scope or N per event.
  const [multiIndexCount, setMultiIndexCount] = useState(null); // null = DEFAULT_IN_VIEW
  const [multiIndexSplit, setMultiIndexSplit] = useState("combined");
  const [multiIndexSolves, setMultiIndexSolves] = useState([]);
  const [multiIndexKey, setMultiIndexKey] = useState("");
  const [loadingMultiIndex, setLoadingMultiIndex] = useState(false);
  const [multiIndexError, setMultiIndexError] = useState(false);
  const [timeScopeCacheKey, setTimeScopeCacheKey] = useState("");
  const [overallScopeSolves, setOverallScopeSolves] = useState([]);
  const [overallScopeCacheKey, setOverallScopeCacheKey] = useState("");
  const [tagScopeSolves, setTagScopeSolves] = useState([]);
  const [tagScopeCacheKey, setTagScopeCacheKey] = useState("");
  const [dateScopedSessionSolves, setDateScopedSessionSolves] = useState([]);
  const [dateScopedSessionCacheKey, setDateScopedSessionCacheKey] = useState("");
  const [loadingDateScopedSolves, setLoadingDateScopedSolves] = useState(false);
  const [dayBucketRangeData, setDayBucketRangeData] = useState({ items: [], aggregateSummary: null, scope: "" });
  const [dayBucketRangeKey, setDayBucketRangeKey] = useState("");
  // Bumped after bulk solve edits so bucket and tag totals refetch in place.
  const [aggregateRefreshNonce, setAggregateRefreshNonce] = useState(0);
  const dayBucketLoadedNonceRef = useRef(0);
  // setSessions for edits made on this page: the solve lists the page loaded
  // itself (date ranges, tag scopes, time view) get the same update, and the
  // bucket/tag totals refetch.
  const statsSetSessions = useCallback(
    (update) => {
      setSessions(update);
      if (typeof update !== "function") return;
      const replay = (list) => replaySessionsUpdate(list, update, statsEvent);
      setDateScopedSessionSolves(replay);
      setTagScopeSolves(replay);
      setTimeScopeSolves(replay);
      setOverallScopeSolves(replay);
      setCompareSessionSolves(replay);
      setCompareTagScopeSolves(replay);
      setAggregateRefreshNonce((n) => n + 1);
    },
    [setSessions, statsEvent]
  );
  const [dayBucketRangeFailedKey, setDayBucketRangeFailedKey] = useState("");
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
  // Date-scoped loads get their own token so they can't cancel (and strand) session paging.
  const dateScopedTokenRef = useRef(0);
  const previousHasActiveTagFilterRef = useRef(false);

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
  const summaryLayout = "row";
  const showSolveCharts = isSolveLevelMode || statsViewMode === "time";
  const [selectedTimeDay, setSelectedTimeDay] = useState("");
  // Setting statsDefaultFrameKind "date": open on the last N days instead of the
  // last N solves. A range in the URL still wins (applied by the URL effect).
  const [initialDateFrame] = useState(() => {
    if (settings?.statsDefaultFrameKind !== "date") return null;
    const days = Math.max(1, Math.round(Number(settings?.statsDefaultDays)) || 7);
    const end = getTodayLocalDayKey();
    return { start: shiftLocalDayKey(end, -(days - 1)), end, raw: days <= MAX_RAW_INDEX_RANGE_DAYS };
  });
  const [dateFilterStart, setDateFilterStart] = useState(initialDateFrame?.start || "");
  const [dateFilterEnd, setDateFilterEnd] = useState(initialDateFrame?.end || "");
  const [preferRawDateRangeView, setPreferRawDateRangeView] = useState(!!initialDateFrame?.raw);
  // Raw (every-solve) range views are only ever allowed for short windows.
  // A wide range with the raw flag set would page in every solve in it, so
  // anything past MAX_RAW_INDEX_RANGE_DAYS stays on day buckets instead.
  const rawRangeViewActive = useMemo(() => {
    if (!preferRawDateRangeView) return false;
    const span = getInclusiveDaySpan(dateFilterStart, dateFilterEnd);
    return span > 0 && span <= MAX_RAW_INDEX_RANGE_DAYS;
  }, [dateFilterEnd, dateFilterStart, preferRawDateRangeView]);
  // Solves in this event/session older than the raw range's first day, so a
  // drilled-in day numbers its solves by their real position (e.g. 41,203)
  // instead of from 1. null until known.
  const [rawRangeIndexOffset, setRawRangeIndexOffset] = useState(null);
  // Set by a day drill-down so the page grows to fit every solve of that day
  // once they've loaded, rather than stopping at the default 100.
  const fitRawRangeToViewRef = useRef(false);
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
  const primaryBucketScopeQuery = useMemo(
    () =>
      buildDayBucketScopeQuery({
        isAllEventsMode,
        isAllSessionsMode,
        statsEvent,
        sessionId,
        scope: { events: scopeEvents, sessions: scopeSessions, pairs: scopePairs },
      }),
    [isAllEventsMode, isAllSessionsMode, scopeEvents, scopePairs, scopeSessions, sessionId, statsEvent]
  );
  const bucketScopeQuery = primaryBucketScopeQuery || { event: "", events: [], mainOnly: false, scopeLabel: "" };
  const bucketScopeEventsKey = (bucketScopeQuery.events || []).join(",");
  const canUseBucketRange = useMemo(
    () =>
      !!primaryBucketScopeQuery &&
      // Multi scopes with no date range are a "last N solves" frame, never buckets.
      !(statsViewMode === "time" && !hasActiveDateFilter) &&
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
      primaryBucketScopeQuery,
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
      bucketScopeEventsKey || "*",
      bucketScopeQuery.mainOnly ? "main" : "all",
      dateFilterStart || "*",
      dateFilterEnd || "*",
      effectiveTimeZone || "*",
    ].join("::");
  }, [
    bucketScopeEventsKey,
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

  const eventOptions = baseEventOptions;
  const scopeAllEvents = baseEventOptions;
  const scopeEventsLabel = getScopeEventsLabel(scopeEvents, scopeAllEvents);
  const scopeSessionsLabel = getScopeSessionsLabel(scopeSessions, scopePairs, sessionsList, isMultiEventScope);
  // Card titles: multi scopes (no compare) name the whole scope, e.g. "3x3 + 4x4 · Main sessions".
  const cardTitleEventLabel = statsViewMode === "time" ? scopeEventsLabel : null;
  const cardTitleSessionLabel = statsViewMode === "time" ? scopeSessionsLabel : null;

  // Every {Event, SessionID} pair in scope; raw scope loads fan out over these.
  const solveScopeSessions = scopePairs;

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

  const multiIndexN = multiIndexCount || DEFAULT_IN_VIEW;
  const multiIndexActive = statsViewMode === "time" && !hasActiveDateFilter && !hasActiveTagFilter;
  const multiIndexRequestKey = multiIndexActive
    ? [solveScopeSessionKey, scopeSessions.mode, multiIndexN, multiIndexSplit, statsMutationTick].join("::")
    : "";
  const hasMultiIndexSolves = multiIndexActive && multiIndexKey === multiIndexRequestKey;

  const allLoadedSolves = useMemo(() => {
    // A multi-scope "last N" frame shows only its scoped fetch: never fall back
    // to the app's solve cache, which can hold an event's entire history.
    if (multiIndexActive) return hasMultiIndexSolves ? multiIndexSolves : [];
    if (statsViewMode === "time" && timeScopeSolves.length > 0) {
      return timeScopeSolves;
    }
    return sessionCachedSolves;
  }, [hasMultiIndexSolves, multiIndexActive, multiIndexSolves, sessionCachedSolves, statsViewMode, timeScopeSolves]);

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID || !multiIndexRequestKey || multiIndexKey === multiIndexRequestKey) return undefined;
    let cancelled = false;
    setLoadingMultiIndex(true);
    const pairs = scopeSessions.mode === "custom" ? scopePairs.map((p) => ({ event: p.Event, sessionID: p.SessionID })) : null;
    const base = {
      pairs,
      sessionsMode: scopeSessions.mode === "main" ? "main" : "",
      timeZone: effectiveTimeZone,
    };
    const requests =
      multiIndexSplit === "perEvent"
        ? scopeEventList.map((ev) =>
            getLastNSolvesScoped(userID, {
              ...base,
              events: [ev],
              pairs: pairs ? pairs.filter((p) => p.event === ev) : null,
              n: multiIndexN,
              isCancelled: () => cancelled,
            })
          )
        : [
            getLastNSolvesScoped(userID, {
              ...base,
              events: scopeEvents === ALL_EVENTS ? "all" : scopeEventList,
              n: multiIndexN,
              isCancelled: () => cancelled,
            }),
          ];
    Promise.all(requests)
      .then((results) => {
        if (cancelled) return;
        const solves = results
          .flat()
          .map(normalizeSolve)
          .filter(Boolean)
          .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
        setMultiIndexSolves(solves);
        setMultiIndexError(false);
        setMultiIndexKey(multiIndexRequestKey);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load scoped solves:", error);
        setMultiIndexSolves([]);
        setMultiIndexError(true);
        setMultiIndexKey(multiIndexRequestKey);
      })
      .finally(() => {
        if (!cancelled) setLoadingMultiIndex(false);
      });
    return () => {
      cancelled = true;
    };
    // multiIndexRequestKey captures the scope, N, split and mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiIndexRequestKey, user?.UserID]);

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

  const activeTagFilterFields = useMemo(
    () => activeTagEntries.map(([field]) => field),
    [activeTagEntries]
  );

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

  // An all-time range covers every tagged solve, so the tag index can serve it
  // without paging through the whole session history.
  const isAllTimeDateFilter = dateFilterStart === ALL_TIME_START_DAY && !!dateFilterEnd;
  const canUseIndexedTagScope = !!indexedTagScope && (!hasActiveDateFilter || isAllTimeDateFilter);

  const hasIndexedTagScopeCache = useMemo(() => {
    return !!indexedTagScopeKey && tagScopeCacheKey === indexedTagScopeKey;
  }, [indexedTagScopeKey, tagScopeCacheKey]);

  const scopeSolvesForSelection = useMemo(() => {
    const base =
      hasActiveDateFilter && isSolveLevelMode
        ? hasDateScopedSessionCache
          ? dateScopedSessionSolves
          : []
        : multiIndexActive
        ? multiIndexSolves
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
    multiIndexActive,
    multiIndexSolves,
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

    return deduped;
  }, [sessionsList, statsEvent, isAllEventsMode]);

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
  // The tag index returns newest-first within one session, so a single-tag scope
  // can load just the latest solves and page older ones on demand. Extra tags are
  // filtered client-side and need the full set.
  const canPageCompareTagScope =
    canUseCompareIndexedTagScope &&
    !!compareIndexedTagScope?.sessionID &&
    compareActiveTagEntries.length === 1;
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

  // The timer event/session the scope was last reset to. On the render where
  // the timer's event changes (e.g. an event key binding), the scope still
  // names the old event until the reset below lands; the URL writer must not
  // record that stale scope, or the URL reader would restore the old event.
  const timerScopeKey = `${String(currentEvent || "333").toUpperCase()}|${currentSession || "main"}`;
  const lastTimerScopeKeyRef = useRef(timerScopeKey);
  // The session scope the Overall view was opened from, so "Session" returns to it.
  const zoomOutScopeRef = useRef(null);
  const timerScopeResetPending = lastTimerScopeKeyRef.current !== timerScopeKey;

  useEffect(() => {
    lastTimerScopeKeyRef.current = timerScopeKey;
    zoomOutScopeRef.current = null;
    setScopeEvents([String(currentEvent || "333").toUpperCase()]);
    setScopeSessions(makeInitialScopeSessions(currentEvent, currentSession));

    setSolvesPerPage(DEFAULT_IN_VIEW);
    setCurrentPage(0);
    setPageCursor(null);
    setHasMoreOlder(false);
    setIsAllLoaded(false);
    setShowAllActive(false);

    setTagFilterSelection(makeEmptyTagSelection());
    setSelectedTimeDay("");
  }, [DEFAULT_IN_VIEW, currentEvent, currentSession]);

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
      if (scopeEventSet && !scopeEventSet.has(event)) return false;
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
  }, [scopeEventSet, sessionsList, statsViewMode, timeViewMainSessionsOnly]);

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
      dateScopedTokenRef.current += 1; // cancel any in-flight load for the old scope
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
      return false;
    }

    if (dateScopedSessionCacheKey === dateScopedSessionKey) {
      return true;
    }

    setLoadingDateScopedSolves(true);
    const myToken = ++dateScopedTokenRef.current;

    try {
      let cursor = null;
      const pages = [];
      let lastCommitAt = 0;
      const seenCursors = new Set();
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey(dateScopedSessionKey);
      const commitAccumulated = () => {
        lastCommitAt = Date.now();
        const accumulated = pages.slice().reverse().flat();
        setDateScopedSessionSolves(
          withSolveFullIndices(
            accumulated,
            Array.isArray(selectedSessionSolves) && selectedSessionSolves.length
              ? selectedSessionSolves
              : accumulated
          )
        );
      };

      do {
        const { items, lastKey } = await getSolvesBySessionPage(
          userID,
          String(statsEvent || "").toUpperCase(),
          String(sessionId || "main"),
          1000,
          cursor,
          dateRangeQueryOpts
        );

        if (dateScopedTokenRef.current !== myToken) return false;

        const pageOldestToNewest = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .reverse();

        pages.push(pageOldestToNewest);
        // With a tag filter these solves are only the index reference behind the
        // tag-scoped list, so commit them once at the end instead of re-rendering
        // every chart after each page. Without one, show progress, but a long
        // history can't afford to re-render its charts after every page.
        const nextCursor = lastKey || null;
        if (nextCursor && !hasActiveTagFilter && Date.now() - lastCommitAt >= DATE_SCOPED_COMMIT_INTERVAL_MS) {
          commitAccumulated();
        }

        const nextCursorKey = lastKey ? JSON.stringify(lastKey) : "";
        if (nextCursorKey && seenCursors.has(nextCursorKey)) {
          throw new Error("Date-scoped session load got a repeated cursor");
        }
        if (nextCursorKey) seenCursors.add(nextCursorKey);
        cursor = nextCursor;
      } while (cursor);

      commitAccumulated();
      return true;
    } catch (error) {
      console.error("Failed to load date-scoped session solves:", error);
      setDateScopedSessionSolves([]);
      setDateScopedSessionCacheKey("");
      return false;
    } finally {
      if (dateScopedTokenRef.current === myToken) {
        setLoadingDateScopedSolves(false);
      }
    }
  }, [
    dateRangeQueryOpts,
    hasActiveTagFilter,
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

    // Day buckets render this range on their own, so paging in every raw solve
    // behind them is wasted work. Fall back to raw solves only when the bucket
    // load failed or came back empty.
    const bucketRangeSettledEmpty =
      dayBucketRangeKey === dayBucketRangeRequestKey && !dayBucketRangeData.aggregateSummary;
    const bucketRangeFailed = dayBucketRangeFailedKey === dayBucketRangeRequestKey;
    if (canUseBucketRange && !rawRangeViewActive && !bucketRangeSettledEmpty && !bucketRangeFailed) {
      return;
    }
    // The tag index already holds every solve this range can show.
    if (hasActiveTagFilter && canUseIndexedTagScope) return;

    loadDateScopedSessionSolves();
  }, [
    canUseBucketRange,
    canUseIndexedTagScope,
    hasActiveTagFilter,
    dayBucketRangeData.aggregateSummary,
    dayBucketRangeFailedKey,
    dayBucketRangeKey,
    dayBucketRangeRequestKey,
    hasActiveDateFilter,
    isSolveLevelMode,
    loadDateScopedSessionSolves,
    rawRangeViewActive,
    statsViewMode,
  ]);

  useEffect(() => {
    if (!canUseBucketRange || !dayBucketRangeRequestKey) {
      setDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
      setDayBucketRangeKey("");
      setLoadingDayBuckets(false);
      return;
    }

    const isRefresh = dayBucketRangeKey === dayBucketRangeRequestKey;
    if (isRefresh && dayBucketLoadedNonceRef.current === aggregateRefreshNonce) return;

    let cancelled = false;
    // A refresh keeps showing the current buckets until the new ones land.
    if (!isRefresh) setLoadingDayBuckets(true);

    (async () => {
      try {
        const data = await getDayBuckets(user.UserID, {
          event: bucketScopeQuery.event,
          events: bucketScopeQuery.events,
          mainOnly: bucketScopeQuery.mainOnly,
          startDay: dateFilterStart,
          endDay: dateFilterEnd,
          timeZone: effectiveTimeZone,
        });
        if (cancelled) return;
        setDayBucketRangeData({
          items: Array.isArray(data?.items) ? data.items : [],
          eventItems: Array.isArray(data?.eventItems) ? data.eventItems : null,
          aggregateSummary: data?.aggregateSummary || null,
          scope: data?.scope || bucketScopeQuery.scopeLabel,
        });
        setDayBucketRangeKey(dayBucketRangeRequestKey);
        setDayBucketRangeFailedKey("");
        dayBucketLoadedNonceRef.current = aggregateRefreshNonce;
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load day buckets:", error);
        dayBucketLoadedNonceRef.current = aggregateRefreshNonce;
        if (isRefresh) return;
        setDayBucketRangeData({ items: [], aggregateSummary: null, scope: "" });
        setDayBucketRangeKey("");
        setDayBucketRangeFailedKey(dayBucketRangeRequestKey);
      } finally {
        if (!cancelled) setLoadingDayBuckets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bucketScopeQuery.events,
    aggregateRefreshNonce,
    bucketScopeEventsKey,
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

  // Number the raw range's solves globally: total solves in scope minus the
  // ones on or after the range start. Day buckets give that count from one
  // summary per day, never by touching solves.
  useEffect(() => {
    const total = Number(overallStatsForEvent?.SolveCountTotal);
    if (
      !rawRangeViewActive ||
      statsViewMode !== "standard" ||
      !canUseBucketRange ||
      !dateFilterStart ||
      !Number.isFinite(total)
    ) {
      setRawRangeIndexOffset(null);
      return;
    }

    let cancelled = false;
    setRawRangeIndexOffset(null);
    getDayBuckets(user.UserID, {
      event: bucketScopeQuery.event,
      events: bucketScopeQuery.events,
      mainOnly: bucketScopeQuery.mainOnly,
      startDay: dateFilterStart,
      endDay: getTodayLocalDayKey(),
      timeZone: effectiveTimeZone,
    })
      .then((data) => {
        if (cancelled) return;
        const onOrAfter = Number(data?.aggregateSummary?.SolveCountTotal);
        setRawRangeIndexOffset(Number.isFinite(onOrAfter) ? Math.max(0, total - onOrAfter) : null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to resolve solve index offset for date range:", error);
        setRawRangeIndexOffset(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    bucketScopeQuery.events,
    bucketScopeQuery.event,
    bucketScopeQuery.mainOnly,
    canUseBucketRange,
    dateFilterStart,
    effectiveTimeZone,
    overallStatsForEvent?.SolveCountTotal,
    rawRangeViewActive,
    statsViewMode,
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

  // All time needs no scan: each event's stored all-time stats fill the matrix.
  const wantsPeriodAwareEventMatrix =
    statsViewMode === "time" && isAllEventsMode && hasActiveDateFilter && !isAllTimeDateFilter && !compareEnabled;
  const wantsRawTimeScope =
    statsViewMode === "time" &&
    (rawRangeViewActive || hasActiveTagFilter || wantsPeriodAwareEventMatrix);

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
    if (!fitRawRangeToViewRef.current) return;
    if (!rawRangeViewActive) {
      fitRawRangeToViewRef.current = false;
      return;
    }
    if (!hasDateScopedSessionCache || loadingDateScopedSolves) return;
    fitRawRangeToViewRef.current = false;
    if (activeStandardSolves.length > solvesPerPage) setSolvesPerPage(activeStandardSolves.length);
    setCurrentPage(0);
  }, [
    activeStandardSolves.length,
    hasDateScopedSessionCache,
    loadingDateScopedSolves,
    rawRangeViewActive,
    solvesPerPage,
  ]);

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
      setCompareSessionCursor(null);

      try {
        let items = [];
        let nextCursor = null;

        if (canPageCompareTagScope) {
          const out = await getSolvesByTag(user.UserID, {
            ...compareIndexedTagScope,
            limit: DEFAULT_IN_VIEW,
            hydrate: true,
          });
          items = out?.items || [];
          nextCursor = out?.lastKey || null;
        } else if (canUseCompareIndexedTagScope) {
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
          nextCursor = out?.lastKey || null;
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
        setCompareSessionCursor(nextCursor);
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
    canPageCompareTagScope,
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
      if (scopeEventSet) {
        scoped = scoped.filter((solve) =>
          scopeEventSet.has(String(solve?.event || solve?.Event || "").toUpperCase())
        );
      }

      if (scopePairSet) {
        scoped = scoped.filter((solve) =>
          scopePairSet.has(
            `${String(solve?.event || solve?.Event || "").toUpperCase()}|${String(
              solve?.sessionID || solve?.SessionID || "main"
            )}`
          )
        );
      }
    }

    return filterSolvesByDateRange(scoped, dateFilterStart, dateFilterEnd);
  }, [
    allLoadedSolves,
    activeStandardSolves,
    dateFilterEnd,
    dateFilterStart,
    scopeEventSet,
    scopePairSet,
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
    if (hasMultiIndexSolves && !selectedTimeDay) return allLoadedFilteredRawSolves;

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
    hasMultiIndexSolves,
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

  const appendOlderSessionPages = useCallback(async ({ maxPages = null, minSolveCount = null } = {}) => {
    const nothingAdded = { addedCount: 0, lastKey: pageCursor, hasMore: hasMoreOlder };
    const userID = user?.UserID;
    if (!userID) return nothingAdded;
    if (!isSolveLevelMode) return nothingAdded;
    if (!hasMoreOlder || !pageCursor || loadingMore) return nothingAdded;

    setLoadingMore(true);
    const myToken = ++requestTokenRef.current;

    try {
      let cursor = pageCursor;
      let lastKey = pageCursor;
      let pagesLoaded = 0;
      const accumulated = [];
      const targetCount =
        minSolveCount == null ? null : Math.max(0, Number(minSolveCount) || 0);
      // A page can come back short (the API caps responses by size), so keep going
      // until the requested solve count is loaded rather than stopping after one page.
      const pageLimit = Math.max(1, Number(maxPages) || (targetCount != null ? 50 : 1));

      while (cursor && pagesLoaded < pageLimit) {
        const out = await getSolvesBySessionPage(
          userID,
          String(statsEvent || "").toUpperCase(),
          sessionId,
          DEFAULT_PAGE_FETCH,
          cursor
        );

        if (requestTokenRef.current !== myToken) return nothingAdded;

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

      if (requestTokenRef.current !== myToken) return nothingAdded;

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
      return nothingAdded;
    } finally {
      // Always clear: a stuck flag would disable zoom-out and older paging for good.
      setLoadingMore(false);
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

  const allEventsBreakdown = useMemo(() => {
    return getAllEventsBreakdownFromSessionsList(sessionsList);
  }, [sessionsList]);

  const allEventsOverall = useMemo(() => {
    return aggregateStatsList(allEventsBreakdown.map((row) => row.stats));
  }, [allEventsBreakdown]);
  const timeViewEventMatrixActiveItems = useMemo(() => {
    if ((hasActiveDateFilter && dateFilterStart !== ALL_TIME_START_DAY) || hasMultiIndexSolves) {
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
            scramble: getProfileEventScramble(user, event, ""),
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
      if (scopeEventSet && !scopeEventSet.has(event)) return false;
      if (scopePairSet) return scopePairSet.has(`${event}|${String(session?.SessionID || "main")}`);
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
        // The cache holds main-session or whole-event stats; custom session picks aggregate their own.
        const aggregate =
          scopeSessions.mode === "custom" ? fallbackAggregate : cachedEventMatrixStats[event] || fallbackAggregate;
        return {
          event,
          mainOnly: timeViewMainSessionsOnly,
          scramble: getProfileEventScramble(user, event, ""),
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
  }, [
    hasMultiIndexSolves,
    scopeEventSet,
    scopePairSet,
    scopeSessions.mode,
    allLoadedFilteredRawSolves,
    cachedEventMatrixStats,
    dateFilterStart,
    hasActiveDateFilter,
    sessionsList,
    timeViewMainSessionsOnly,
    user,
  ]);
  // The matrix shows only the events with solves in the current range.
  const timeViewEventMatrixItems = timeViewEventMatrixActiveItems;
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

    if (!hasActiveDateFilter && !hasMultiIndexSolves) {
      return (allEventsBreakdown || [])
        .filter((row) => !scopeEventSet || scopeEventSet.has(String(row?.event || "").toUpperCase()))
        .map((row) => ({
        label: String(row?.event || "Unknown"),
        value: Number(row?.stats?.SolveCountTotal || 0),
        solves: [],
      }));
    }

    // Event-subset buckets come merged per day; their per-event rows are in eventItems.
    const breakdownBucketItems = dayBucketRangeData.eventItems || activeBucketItems;
    if (activeBucketSummary && Array.isArray(breakdownBucketItems) && breakdownBucketItems.length > 0) {
      const grouped = new Map();
      for (const item of breakdownBucketItems) {
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
  }, [
    hasMultiIndexSolves,
    activeBucketItems,
    activeBucketSummary,
    allEventsBreakdown,
    dayBucketRangeData.eventItems,
    hasActiveDateFilter,
    isAllEventsMode,
    pieChartSolves,
    scopeEventSet,
  ]);
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
  const useBucketBackedRange = !!activeBucketSummary && !rawRangeViewActive;
  // Stat group B picks bucketed vs raw data on its own scope, independent of group A.
  const useCompareBucketBackedRange = !!activeCompareBucketSummary;
  const isCompareAllTimeBucketOverview =
    useCompareBucketBackedRange &&
    effectiveCompareDateFilterStart === ALL_TIME_START_DAY &&
    !!effectiveCompareDateFilterEnd;
  const tableUsesBucketRange =
    compareEnabled && tableCompareView === "compare" ? useCompareBucketBackedRange : useBucketBackedRange;
  const isAllTimeBucketOverview = useBucketBackedRange &&
    statsViewMode === "standard" &&
    dateFilterStart === ALL_TIME_START_DAY &&
    !!dateFilterEnd;
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
  // Real solve numbers for loaded solves; null hides ranges (see solveIndexOffset.js).
  const summarySolveIndexOffset = useMemo(
    () =>
      computeSolveIndexOffset({
        hasActiveTagFilter,
        statsViewMode,
        useBucketBackedRange,
        hasActiveDateFilter,
        rawRangeViewActive,
        rawRangeIndexOffset,
        overallStats: effectiveOverallStats,
        loadedCount: activeStandardSolves.length,
        isAllLoaded,
      }),
    [
      activeStandardSolves.length,
      effectiveOverallStats,
      hasActiveDateFilter,
      hasActiveTagFilter,
      isAllLoaded,
      rawRangeIndexOffset,
      rawRangeViewActive,
      statsViewMode,
      useBucketBackedRange,
    ]
  );

  // Real solve numbers for the time table. Only the primary standard view has
  // fullIndex values that line up with the cached total; everywhere else the
  // table keeps numbering the rows it was given.
  const tableSolveIndexOffset =
    statsViewMode === "standard" &&
    !useBucketBackedRange &&
    (!hasActiveDateFilter || (rawRangeViewActive && rawRangeIndexOffset != null))
      ? summarySolveIndexOffset
      : null;

  const lineChartTitleDate = useMemo(
    () => formatChartTitleDate(dateFilterStart, dateFilterEnd),
    [dateFilterEnd, dateFilterStart]
  );
  const lineChartSolveIndexOffset =
    !compareEnabled && !useBucketBackedRange && statsViewMode === "standard" && summarySolveIndexOffset > 0
      ? summarySolveIndexOffset
      : 0;
  const lineChartTitleIndexRange = useMemo(() => {
    if (compareEnabled || useBucketBackedRange || statsViewMode !== "standard") return "";
    if (summarySolveIndexOffset === null || !timeViewLineSolves.length) return "";
    const first = Number(timeViewLineSolves[0]?.fullIndex);
    const last = Number(timeViewLineSolves[timeViewLineSolves.length - 1]?.fullIndex);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return "";
    const offset = summarySolveIndexOffset > 0 ? summarySolveIndexOffset : 0;
    return `${(first + offset + 1).toLocaleString()}-${(last + offset + 1).toLocaleString()}`;
  }, [compareEnabled, statsViewMode, summarySolveIndexOffset, timeViewLineSolves, useBucketBackedRange]);
  // Plus2BestMs / FirstSolveAt / TopSingles10 used to be detected as "missing"
  // here and repaired with a full recompute, because the incremental stats
  // writer never maintained them. It maintains them now (and repairs a stale
  // row on its next write), so there is nothing left to detect: the recompute
  // in Settings is the only remaining entry point, and it is manual.

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
    return formatCompactDateRange(first, last);
  }, [visiblePageFilteredRawSolves]);
  const compareDateRangeText = useMemo(() => {
    if (!compareVisiblePageFilteredRawSolves || compareVisiblePageFilteredRawSolves.length === 0) return "";
    const first = compareVisiblePageFilteredRawSolves[0]?.datetime;
    const last = compareVisiblePageFilteredRawSolves[compareVisiblePageFilteredRawSolves.length - 1]?.datetime;
    if (!first || !last) return "";
    return formatCompactDateRange(first, last);
  }, [compareVisiblePageFilteredRawSolves]);

  const dateFilterLabel = useMemo(() => {
    const formatDay = (dayKey) => formatCompactDateRange(dayKey, dayKey) || dayKey;

    if (dateFilterStart === ALL_TIME_START_DAY && !!dateFilterEnd) return "All Time";
    if (!dateFilterStart && !dateFilterEnd) return dateRangeText || "All Dates";
    if (dateFilterStart && dateFilterEnd) {
      return formatCompactDateRange(dateFilterStart, dateFilterEnd) || `${dateFilterStart} – ${dateFilterEnd}`;
    }
    if (dateFilterStart) return `${formatDay(dateFilterStart)} onward`;
    return `Through ${formatDay(dateFilterEnd)}`;
  }, [dateFilterEnd, dateFilterStart, dateRangeText]);
  const compareDateFilterLabel = useMemo(() => {
    const formatDay = (dayKey) => formatCompactDateRange(dayKey, dayKey) || dayKey;

    if (effectiveCompareDateFilterStart === ALL_TIME_START_DAY && !!effectiveCompareDateFilterEnd) return "All Time";
    if (!effectiveCompareDateFilterStart && !effectiveCompareDateFilterEnd) {
      return linkStatsControls ? dateFilterLabel : compareDateRangeText || "All Dates";
    }
    if (effectiveCompareDateFilterStart && effectiveCompareDateFilterEnd) {
      return (
        formatCompactDateRange(effectiveCompareDateFilterStart, effectiveCompareDateFilterEnd) ||
        `${effectiveCompareDateFilterStart} – ${effectiveCompareDateFilterEnd}`
      );
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
      if (start === String(dateFilterStart || "") && end === String(dateFilterEnd || "")) {
        options?.onApply?.();
        return true;
      }
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
      const dayEstimate = formatBucketDayEstimate(start, end, canonicalOverallStats?.FirstSolveAt);
      // Only true big loads ask first. Day-bucket summaries are one small item
      // per day, and a raw window of a week or less is a few hundred solves.
      const span = getInclusiveDaySpan(start, end);
      const isSmallRawWindow = span > 0 && span <= MAX_RAW_INDEX_RANGE_DAYS;
      const isLightweightLoad = isSmallRawWindow || (bucketBackedDateRange && !requiresRawLoad);

      if (statsViewMode === "time" && requiresRawLoad && !isSmallRawWindow) {
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
      } else if (isSolveLevelMode && (start || end) && !isLightweightLoad) {
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

      // Runs in the same render batch as the range change below.
      options?.onApply?.();
      setDateFilterStart(start);
      setDateFilterEnd(end);
      // A day drill-down pins the raw solve view; any range that isn't a single
      // day has to release it or the charts stay on that day's raw solve page.
      if (!start || !end || start !== end) {
        setPreferRawDateRangeView(false);
      }
      return true;
    },
    [
      canonicalOverallStats?.FirstSolveAt,
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
  const [wcaCompetitions, setWcaCompetitions] = useState([]);
  useEffect(() => {
    const userID = String(user?.UserID || "").trim();
    setWcaCompetitions([]);
    if (!userID) return undefined;
    let cancelled = false;
    getWcaCompetitions(userID)
      .then((items) => {
        if (!cancelled) setWcaCompetitions(items);
      })
      .catch((err) => console.warn("Failed to load WCA competitions:", err));
    return () => {
      cancelled = true;
    };
  }, [user?.UserID]);

  const handleCompetitionOpen = useCallback(
    (competitionID) => {
      const userID = String(user?.UserID || "").trim();
      if (!competitionID || !userID) return;
      navigate(
        `/competition/${encodeURIComponent(competitionID)}?user=${encodeURIComponent(userID)}`
      );
    },
    [navigate, user?.UserID]
  );

  // Competitions held on the single day being viewed. The day can also hold
  // ordinary practice solves, so the banner says how many came from the comp.
  const viewedDayCompetitions = useMemo(() => {
    const day = dateFilterStart && dateFilterStart === dateFilterEnd ? dateFilterStart : "";
    if (!day || !wcaCompetitions.length) return [];
    return wcaCompetitions.filter((comp) => {
      const start = String(comp?.StartDay || "");
      const end = String(comp?.EndDay || start);
      return start && start <= day && day <= end;
    });
  }, [dateFilterEnd, dateFilterStart, wcaCompetitions]);

  const handleBucketDaySelect = useCallback(async (dayKey) => {
    const nextDay = String(dayKey || "").trim();
    if (!nextDay) return;

    setCurrentPage(0);

    if (dateFilterStart === nextDay && dateFilterEnd === nextDay) {
      fitRawRangeToViewRef.current = true;
      setPreferRawDateRangeView(true);
      return;
    }

    // Flip to raw only alongside the range change (onApply). Setting it before
    // the confirm dialog resolves would raw-load the *current* range — e.g.
    // every solve in All Time — while the dialog is still open.
    // eslint-disable-next-line no-use-before-define
    const applied = await applyPrimaryDateRange(nextDay, nextDay, {
      requiresRawLoad: true,
      onApply: () => {
        fitRawRangeToViewRef.current = true;
        setPreferRawDateRangeView(true);
      },
    });
    if (applied) setSelectedTimeDay(nextDay);
  }, [applyPrimaryDateRange, dateFilterEnd, dateFilterStart]);

  // ---- Date range <-> URL history ----
  // Range changes push a history entry so browser back returns to the
  // previous view (e.g. All Time after drilling into a day) instead of
  // leaving Stats. Nothing is kept in memory: popping an entry just re-applies
  // that range, which reloads from day buckets / the solve cache as usual.
  const urlScope = { events: scopeEvents, sessions: scopeSessions, defaultEvent: currentEvent || "333" };
  const statsRangeKey = buildStatsRangeParams(
    dateFilterStart,
    dateFilterEnd,
    rawRangeViewActive && statsViewMode === "standard",
    urlScope
  ).toString();
  // staleKey: the range state held when a URL restore was applied. Until state
  // moves off it, the writer below must not push that stale range back into
  // the URL, or the two effects ping-pong (page flicker, junk history).
  const urlRangeSyncRef = useRef({ initialized: false, staleKey: null, wrote: false });

  useEffect(() => {
    if (!isStatsRoute) return;
    const sync = urlRangeSyncRef.current;
    const parsed = parseStatsRangeSearch(location.search);
    const hasUrlRange = !!(parsed.start || parsed.end);
    const hasUrlScope = !!(parsed.events || parsed.sessions);
    if (!sync.initialized) {
      sync.initialized = true;
      if (!hasUrlRange && !hasUrlScope) return;
    }
    const parsedEvents = parsed.events || [String(currentEvent || "333").toUpperCase()];
    const parsedSessions = parsed.sessions || { mode: "main", keys: [] };
    const parsedMulti =
      parsedEvents === ALL_EVENTS ||
      parsedEvents.length > 1 ||
      parsedSessions.mode === "all" ||
      (parsedSessions.keys || []).length > 1;
    const parsedView = parsedMulti ? "time" : "standard";
    if (urlStatsRangeKey(location.search, currentEvent) === statsRangeKey) return;

    // Never let a URL silently start a raw scan of a wide range: only short
    // windows are restored unless the standard view is backed by day buckets.
    // (The all-events time view raw-loads any dated range, so it only gets
    // short windows.)
    const span = getInclusiveDaySpan(parsed.start, parsed.end);
    const isShortRange = span > 0 && span <= MAX_RAW_INDEX_RANGE_DAYS;
    const targetSession =
      parsedView === "time"
        ? ALL_SESSIONS
        : parsedSessions.mode === "custom"
          ? String(parsedSessions.keys[0] || "").split("|")[1] || "main"
          : "main";
    const bucketScopeOk =
      parsedView === "standard" &&
      canUseDayBucketScope({
        userID: user?.UserID,
        hasActiveTagFilter,
        statsViewMode: parsedView,
        hasActiveDateFilter: hasUrlRange,
        isAllEventsMode: false,
        isAllSessionsMode: targetSession === ALL_SESSIONS,
        sessionId: targetSession,
      });
    // The Overall view's own default window opens without a prompt in the app,
    // so a link (or back / reload) to it is restored too.
    const overallDefault = getDefaultOverallRange(sessionsList);
    const isOverallDefaultRange =
      parsedView === "time" && parsed.start === overallDefault.start && parsed.end === overallDefault.end;
    if (hasUrlRange && !bucketScopeOk && !isShortRange && !isOverallDefaultRange) {
      navigate(
        { search: withStatsRangeParams(location.search, new URLSearchParams(statsRangeKey)) },
        { replace: true }
      );
      return;
    }

    sync.staleKey = statsRangeKey;
    if (encodeScopeEvents(parsedEvents) !== encodeScopeEvents(scopeEvents)) {
      setScopeEvents(parsedEvents);
      setSessionMenuOpen(false);
    }
    if (encodeScopeSessions(parsedSessions) !== encodeScopeSessions(scopeSessions)) {
      setScopeSessions(parsedSessions);
    }
    if (parsed.raw) fitRawRangeToViewRef.current = true;
    setDateFilterStart(parsed.start);
    setDateFilterEnd(parsed.end);
    setPreferRawDateRangeView(parsed.raw);
    setCurrentPage(0);
    if (parsed.raw) setSelectedTimeDay(parsed.start);
    // Only a URL change (back / forward / link) should drive this; state
    // changes are written to the URL by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatsRoute, location.search]);

  useEffect(() => {
    const sync = urlRangeSyncRef.current;
    if (!isStatsRoute || !sync.initialized) return;
    if (timerScopeResetPending) return;
    if (sync.staleKey !== null) {
      if (statsRangeKey === sync.staleKey) return;
      sync.staleKey = null;
    }
    if (urlStatsRangeKey(location.search, currentEvent) === statsRangeKey) return;
    // The first write after opening just records the opening scope (e.g. the
    // default "last 7 days"), so it replaces rather than adds a history step.
    const isFirstWrite = !sync.wrote && !!initialDateFrame;
    sync.wrote = true;
    navigate(
      { search: withStatsRangeParams(location.search, new URLSearchParams(statsRangeKey)) },
      isFirstWrite ? { replace: true, state: location.state } : { state: { ptsStatsRange: true } }
    );
    // Written only when the range itself changes (or a pending timer-event
    // scope reset lands).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatsRoute, statsRangeKey, timerScopeResetPending]);

  const canStepBackInStatsHistory = location.state?.ptsStatsRange === true;
  const handleStatsRangeBack = useCallback(() => {
    if (canStepBackInStatsHistory) {
      navigate(-1);
      return;
    }
    void applyPrimaryDateRange(ALL_TIME_START_DAY, getTodayLocalDayKey(), {
      onApply: () => {
        setPreferRawDateRangeView(false);
        setCurrentPage(0);
      },
    });
  }, [applyPrimaryDateRange, canStepBackInStatsHistory, navigate]);

  // Single entry point for scope changes (event set and/or session set). Resets
  // paging and tags, and carries the date range across a switch between the
  // single-scope and multi-scope layouts the way the old view toggle did:
  // short ranges always survive, wider ones only when they stay bucket-backed.
  const applyScope = useCallback(
    // range: "solves" drops the date window (last N solves); { start, end }
    // opens that window; omitted carries the current range across as below.
    async ({ events = scopeEvents, sessions = scopeSessions, range = null } = {}) => {
      const nextList = events === ALL_EVENTS ? getEventsFromSessionsList(sessionsList) : events;
      if (!nextList.length && events !== ALL_EVENTS) return;
      const nextPairs = resolveScopePairs(nextList, sessions, sessionsList);
      const nextMulti = events === ALL_EVENTS || nextList.length > 1;
      const nextView = nextMulti || nextPairs.length > 1 ? "time" : "standard";

      if (nextView === "time" && wantsRawTimeScope) {
        const approved = await warnBeforeSolveScan({
          title: "Load new scope?",
          intro: "Changing the scope loads every solve in it so the charts can rebuild.",
          event: nextMulti ? ALL_EVENTS : nextList[0],
          sessionID: ALL_SESSIONS,
          extraLines:
            dateFilterStart || dateFilterEnd
              ? [`Date filter: ${formatShortDateRangeLabel(dateFilterStart, dateFilterEnd, dateFilterLabel)}.`]
              : [],
          confirmLabel: "Load Scope",
        });
        if (!approved) return;
      }

      setScopeEvents(events);
      setScopeSessions(sessions);
      setSessionMenuOpen(false);

      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);
      setPageCursor(null);
      setHasMoreOlder(false);
      setIsAllLoaded(false);
      setShowAllActive(false);
      setTagFilterSelection(makeEmptyTagSelection());

      if (range) {
        setPreferRawDateRangeView(false);
        setSelectedTimeDay("");
        setDateFilterStart(range === "solves" ? "" : range.start);
        setDateFilterEnd(range === "solves" ? "" : range.end);
        return;
      }
      if (nextView === statsViewMode) return;
      const span = getInclusiveDaySpan(dateFilterStart, dateFilterEnd);
      const isShortRange = span > 0 && span <= MAX_RAW_INDEX_RANGE_DAYS;
      if (nextView === "time") {
        setPreferRawDateRangeView(false);
        // Multi scopes open in the Overall view: keep a short range, otherwise
        // the default overall window (this month, or this year for small accounts).
        if (!isShortRange) {
          const overall = getDefaultOverallRange(sessionsList);
          setDateFilterStart(overall.start);
          setDateFilterEnd(overall.end);
          setSelectedTimeDay("");
        }
        return;
      }
      const keepRange = isShortRange || (hasActiveDateFilter && nextPairs[0]?.SessionID === "main");
      if (keepRange && isShortRange) {
        fitRawRangeToViewRef.current = true;
        setPreferRawDateRangeView(true);
      } else {
        setPreferRawDateRangeView(false);
      }
      if (!keepRange) {
        setDateFilterStart("");
        setDateFilterEnd("");
        setSelectedTimeDay("");
      }
    },
    [
      DEFAULT_IN_VIEW,
      dateFilterEnd,
      dateFilterLabel,
      dateFilterStart,
      hasActiveDateFilter,
      scopeEvents,
      scopeSessions,
      sessionsList,
      statsViewMode,
      wantsRawTimeScope,
      warnBeforeSolveScan,
    ]
  );

  // Picking one event from the selector (or a legacy <select> change event).
  const handleEventChange = useCallback(
    (eventOrValue) => {
      const next = typeof eventOrValue === "string" ? eventOrValue : eventOrValue?.target?.value;
      if (!next) return;
      if (next === ALL_EVENTS) return applyScope({ events: ALL_EVENTS });
      return applyScope({
        events: [String(next).toUpperCase()],
        sessions: scopeSessions.mode === "custom" ? { mode: "main", keys: [] } : scopeSessions,
      });
    },
    [applyScope, scopeSessions]
  );

  // Picking exactly one session of the single event in view.
  const handlePickSession = useCallback(
    (sid) => {
      const ev = scopeEventList[0];
      if (!ev) return;
      if (sid === ALL_SESSIONS) return applyScope({ sessions: { mode: "all", keys: [] } });
      return applyScope({
        sessions: sid === "main" ? { mode: "main", keys: [] } : { mode: "custom", keys: [`${ev}|${sid}`] },
      });
    },
    [applyScope, scopeEventList]
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

  const handlePromoteCompareRow = useCallback((options) => {
    if (!compareSelection) return;
    const dateRangeOverride = options?.dateRange || null;

    const promotedEvent = String(compareEvent || statsEvent || currentEvent || "333");
    const promotedSession = String(compareSessionId || "main");
    const promotedTags = sanitizeTagSelection(compareTagSelection);
    const promotedPaletteKey = compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE;
    const promotedDateStart = dateRangeOverride ? dateRangeOverride.start : effectiveCompareDateFilterStart;
    const promotedDateEnd = dateRangeOverride ? dateRangeOverride.end : effectiveCompareDateFilterEnd;
    // The compare row's loaded solves only carry over when its date range does.
    const keepsCompareDateScope =
      promotedDateStart === effectiveCompareDateFilterStart &&
      promotedDateEnd === effectiveCompareDateFilterEnd;
    const promotedSolvesPerPage = linkStatsControls ? solvesPerPage : compareSolvesPerPage;
    const promotedCurrentPage = dateRangeOverride ? 0 : linkStatsControls ? currentPage : compareCurrentPage;
    const promotedShowAllActive = dateRangeOverride
      ? false
      : linkStatsControls
        ? showAllActive
        : compareShowAllActive;

    setScopeEvents([String(promotedEvent).toUpperCase()]);
    setScopeSessions(makeInitialScopeSessions(promotedEvent, promotedSession));
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
    if (dateRangeOverride) setPreferRawDateRangeView(false);

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

    if (keepsCompareDateScope && (promotedDateStart || promotedDateEnd)) {
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

  // Switching between the event view and the all-events time view keeps the
  // date range when it is cheap to carry over: a day / short window (a few
  // hundred solves) either way, or a longer range going back to a Main
  // session, which day buckets cover. Anything else resets to the view's
  // default rather than raw-loading a wide range.


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

    // Load enough older solves for a full page at the current zoom before stepping back.
    const neededCount = solvesPerPage * (currentPage + 2);
    const loadedCount = activeStandardSolves.length;

    if (loadedCount < neededCount && hasMoreOlder && !loadingMore && !isAllLoaded) {
      const result = await appendOlderSessionPages({ minSolveCount: neededCount });
      const nextLoadedCount = loadedCount + Number(result?.addedCount || 0);
      if (nextLoadedCount > solvesPerPage * (currentPage + 1)) setCurrentPage(currentPage + 1);
      return;
    }

    if (currentPage < maxPage) setCurrentPage(currentPage + 1);
  }, [
    activeStandardSolves.length,
    appendOlderSessionPages,
    currentPage,
    maxPage,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    isSolveLevelMode,
    solvesPerPage,
  ]);

  const handleNextPage = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCurrentPage((p) => Math.max(0, p - 1));
  }, [isSolveLevelMode]);

  const handleZoomIn = useCallback(() => {
    if (!isSolveLevelMode) return;
    const target = getNextSmallerSolveWindow(solvesPerPage);
    setSolvesPerPage(target);
    setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, target));
  }, [currentPage, isSolveLevelMode, solvesPerPage]);

  const handleZoomOut = useCallback(async () => {
    if (!isSolveLevelMode) return;
    const target = getNextLargerSolveWindow(solvesPerPage);

    if (target <= activeStandardSolves.length) {
      setSolvesPerPage(target);
      setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, target));
      return;
    }

    let loadedCount = activeStandardSolves.length;
    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      const result = await appendOlderSessionPages({ minSolveCount: target });
      loadedCount += Number(result?.addedCount || 0);
    }
    // Nothing older to fetch: widen to everything loaded instead of stalling below the next preset.
    const loadedTarget = Math.min(target, loadedCount);
    if (loadedTarget <= solvesPerPage) return;
    setSolvesPerPage(loadedTarget);
    setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, loadedTarget));
  }, [
    currentPage,
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
    const target = Math.max(1, solvesPerPage - 1);
    setSolvesPerPage(target);
    setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, target));
  }, [currentPage, isSolveLevelMode, solvesPerPage]);

  const handleIncreaseSolveCount = useCallback(async () => {
    if (!isSolveLevelMode) return;
    const target = solvesPerPage + 1;

    if (target <= activeStandardSolves.length) {
      setSolvesPerPage(target);
      setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, target));
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      const result = await appendOlderSessionPages({ minSolveCount: target });
      const loadedCount = activeStandardSolves.length + Number(result?.addedCount || 0);
      const loadedTarget = Math.min(target, Math.max(activeStandardSolves.length, loadedCount));
      setSolvesPerPage(loadedTarget);
      setCurrentPage(getAnchoredSolvePage(solvesPerPage, currentPage, loadedTarget));
    }
  }, [
    currentPage,
    solvesPerPage,
    activeStandardSolves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    appendOlderSessionPages,
    isSolveLevelMode,
  ]);

  // Range modal "Last N" picks. A multi scope reloads its scoped solves; a
  // single scope resizes its page, loading older solves when it needs more.
  // Either way an active date range is cleared first.
  const pendingIndexTargetRef = useRef(null);
  const handleSetIndexFrame = useCallback(
    (n) => {
      const target = Math.max(1, Math.round(Number(n)) || DEFAULT_IN_VIEW);
      setSelectedTimeDay("");
      if (statsViewMode === "time") {
        setMultiIndexCount(target);
      } else {
        pendingIndexTargetRef.current = target;
      }
      if (hasActiveDateFilter) void applyPrimaryDateRange("", "");
      else if (statsViewMode !== "time") setCurrentPage(0);
    },
    [DEFAULT_IN_VIEW, applyPrimaryDateRange, hasActiveDateFilter, statsViewMode]
  );

  useEffect(() => {
    const target = pendingIndexTargetRef.current;
    if (!target || hasActiveDateFilter || !isSolveLevelMode || loadingInitial || loadingMore) return;
    if (target <= activeStandardSolves.length || !hasMoreOlder || isAllLoaded) {
      pendingIndexTargetRef.current = null;
      setSolvesPerPage(Math.max(1, Math.min(target, activeStandardSolves.length || target)));
      setCurrentPage(0);
      return;
    }
    void appendOlderSessionPages({ minSolveCount: target });
  }, [
    activeStandardSolves.length,
    appendOlderSessionPages,
    hasActiveDateFilter,
    hasMoreOlder,
    isAllLoaded,
    isSolveLevelMode,
    loadingInitial,
    loadingMore,
    solvesPerPage,
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

  // Opening an overview from two-group mode confirms the load first, then drops the
  // other group and applies the all-time range in one render.
  const handleOpenOverviewFromCompare = useCallback(
    async (scopeKey) => {
      if (!isSolveLevelMode) return;
      const allTimeEnd = getTodayLocalDayKey();

      if (scopeKey !== "compare") {
        await applyPrimaryDateRange(ALL_TIME_START_DAY, allTimeEnd, {
          onApply: () => {
            handleRemoveCompareRow();
            setPreferRawDateRangeView(false);
            setCurrentPage(0);
          },
        });
        return;
      }

      const alreadyAllTime =
        effectiveCompareDateFilterStart === ALL_TIME_START_DAY && !!effectiveCompareDateFilterEnd;
      if (!alreadyAllTime) {
        // Day-bucket summaries are cheap; only a raw all-time scan asks first.
        const bucketBackedDateRange = canUseDayBucketScope({
          userID: user?.UserID,
          hasActiveTagFilter: hasActiveTagSelection(compareTagSelection),
          statsViewMode,
          hasActiveDateFilter: true,
          isAllEventsMode: compareEvent === ALL_EVENTS,
          isAllSessionsMode: compareSessionId === ALL_SESSIONS,
          sessionId: compareSessionId,
        });
        const approved = bucketBackedDateRange || await warnBeforeSolveScan({
          title: "Load date-filtered solve scope?",
          intro: bucketBackedDateRange
            ? "Applying this date range loads aggregated day summaries for the selected scope so the stats can update."
            : "Applying this index date range loads every matching solve in the selected session so the charts and tables can update.",
          event: compareEvent,
          sessionID: compareSessionId,
          estimateLabel: bucketBackedDateRange
            ? "Estimated day summaries touched"
            : "Estimated solves touched",
          estimateValue: bucketBackedDateRange
            ? formatBucketDayEstimate(ALL_TIME_START_DAY, allTimeEnd)
            : undefined,
          extraLines: [`Date filter: ${formatShortDateRangeLabel(ALL_TIME_START_DAY, allTimeEnd, "")}.`],
          confirmLabel: "Load Date Range",
        });
        if (!approved) return;
      }

      handlePromoteCompareRow(
        alreadyAllTime ? undefined : { dateRange: { start: ALL_TIME_START_DAY, end: allTimeEnd } }
      );
    },
    [
      applyPrimaryDateRange,
      compareEvent,
      compareSessionId,
      compareTagSelection,
      effectiveCompareDateFilterEnd,
      effectiveCompareDateFilterStart,
      handlePromoteCompareRow,
      handleRemoveCompareRow,
      isSolveLevelMode,
      statsViewMode,
      user?.UserID,
      warnBeforeSolveScan,
    ]
  );

  const canUseDateWindowControls =
    statsViewMode === "standard" && isSolveLevelMode && hasActiveDateFilter;
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

  // Loads older compare solves; with minAdded it keeps paging (pages can come back
  // short) until at least that many solves were added or the scope runs out.
  const fetchCompareOlderPage = useCallback(async (minAdded = 1) => {
    const userID = user?.UserID;
    if (!userID || !compareSessionCursor || loadingCompareMore) return 0;

    setLoadingCompareMore(true);
    const requestId = compareRequestTokenRef.current;

    try {
      const older = [];
      let cursor = compareSessionCursor;
      let pagesLoaded = 0;
      while (cursor && pagesLoaded < 50) {
        const out = canPageCompareTagScope
          ? await getSolvesByTag(userID, {
              ...compareIndexedTagScope,
              limit: DEFAULT_PAGE_FETCH,
              hydrate: true,
              cursor,
            })
          : await getSolvesBySessionPage(userID, compareEvent, compareSessionId, DEFAULT_PAGE_FETCH, cursor);
        // The compare scope changed while this page was loading.
        if (compareRequestTokenRef.current !== requestId) return 0;
        older.push(...(out?.items || []).map(normalizeSolve).filter(Boolean));
        cursor = out?.lastKey || null;
        pagesLoaded += 1;
        if (older.length >= Math.max(1, Number(minAdded) || 1)) break;
      }

      const mergeOlder = (prev) =>
        [...older, ...(Array.isArray(prev) ? prev : [])].sort((a, b) => {
          const ta = new Date(a?.datetime || "").getTime();
          const tb = new Date(b?.datetime || "").getTime();
          return ta - tb;
        });
      setCompareSessionSolves(mergeOlder);
      if (canPageCompareTagScope) setCompareTagScopeSolves(mergeOlder);
      setCompareSessionCursor(cursor);
      return older.length;
    } catch (error) {
      console.error("Failed to fetch older compare solves page:", error);
      return 0;
    } finally {
      setLoadingCompareMore(false);
    }
  }, [
    DEFAULT_PAGE_FETCH,
    canPageCompareTagScope,
    compareEvent,
    compareIndexedTagScope,
    compareSessionCursor,
    compareSessionId,
    loadingCompareMore,
    normalizeSolve,
    user?.UserID,
  ]);

  const handleComparePreviousPage = useCallback(async () => {
    if (!isSolveLevelMode) return;

    // Load enough older solves for a full page at the current zoom before stepping back.
    const loadedCount = compareFilteredRawSolves.length;
    const neededCount = compareSolvesPerPage * (compareCurrentPage + 2);
    if (loadedCount < neededCount && compareSessionCursor && !loadingCompareMore) {
      const added = await fetchCompareOlderPage(neededCount - loadedCount);
      if (loadedCount + added > compareSolvesPerPage * (compareCurrentPage + 1)) {
        setCompareCurrentPage(compareCurrentPage + 1);
      }
      return;
    }

    if (compareCurrentPage < compareMaxPage) setCompareCurrentPage(compareCurrentPage + 1);
  }, [
    compareCurrentPage,
    compareFilteredRawSolves.length,
    compareMaxPage,
    compareSessionCursor,
    compareSolvesPerPage,
    fetchCompareOlderPage,
    isSolveLevelMode,
    loadingCompareMore,
  ]);

  // Grows the compare window, loading older solves first when it outgrows what is loaded.
  const resizeCompareWindowUp = useCallback(
    async (requested) => {
      if (!isSolveLevelMode) return;
      let available = compareFilteredRawSolves.length;
      if (requested > available && compareSessionCursor && !loadingCompareMore) {
        available += await fetchCompareOlderPage(requested - available);
      }
      const target = Math.max(1, Math.min(requested, available));
      setCompareSolvesPerPage(target);
      setCompareCurrentPage(getAnchoredSolvePage(compareSolvesPerPage, compareCurrentPage, target));
    },
    [
      compareCurrentPage,
      compareFilteredRawSolves.length,
      compareSessionCursor,
      compareSolvesPerPage,
      fetchCompareOlderPage,
      isSolveLevelMode,
      loadingCompareMore,
    ]
  );

  const handleCompareNextPage = useCallback(() => {
    if (!isSolveLevelMode) return;
    setCompareCurrentPage((page) => Math.max(0, page - 1));
  }, [isSolveLevelMode]);

  const handleCompareZoomIn = useCallback(() => {
    if (!isSolveLevelMode) return;
    const target = getNextSmallerSolveWindow(compareSolvesPerPage);
    setCompareSolvesPerPage(target);
    setCompareCurrentPage(getAnchoredSolvePage(compareSolvesPerPage, compareCurrentPage, target));
  }, [compareCurrentPage, compareSolvesPerPage, isSolveLevelMode]);

  const handleCompareZoomOut = useCallback(
    () => resizeCompareWindowUp(getNextLargerSolveWindow(compareSolvesPerPage)),
    [compareSolvesPerPage, resizeCompareWindowUp]
  );

  const handleCompareDecreaseSolveCount = useCallback(() => {
    if (!isSolveLevelMode) return;
    const target = Math.max(1, compareSolvesPerPage - 1);
    setCompareSolvesPerPage(target);
    setCompareCurrentPage(getAnchoredSolvePage(compareSolvesPerPage, compareCurrentPage, target));
  }, [compareCurrentPage, compareSolvesPerPage, isSolveLevelMode]);

  const handleCompareIncreaseSolveCount = useCallback(
    () => resizeCompareWindowUp(compareSolvesPerPage + 1),
    [compareSolvesPerPage, resizeCompareWindowUp]
  );

  const handleCompareShowAll = useCallback(() => {
    if (!isSolveLevelMode) return;
    const canBucketAllTime = canUseDayBucketScope({
      userID: user?.UserID,
      hasActiveTagFilter: hasActiveTagSelection(compareTagSelection),
      statsViewMode,
      hasActiveDateFilter: true,
      isAllEventsMode: compareEvent === ALL_EVENTS,
      isAllSessionsMode: compareSessionId === ALL_SESSIONS,
      sessionId: compareSessionId,
    });
    if (canBucketAllTime) {
      setCompareDateFilterStart(ALL_TIME_START_DAY);
      setCompareDateFilterEnd(getTodayLocalDayKey());
      setCompareCurrentPage(0);
      return;
    }
    setCompareShowAllActive(true);
    setCompareCurrentPage(0);
    setCompareSolvesPerPage(Math.max(DEFAULT_IN_VIEW, compareFilteredRawSolves.length));
  }, [
    DEFAULT_IN_VIEW,
    compareEvent,
    compareFilteredRawSolves.length,
    compareSessionId,
    compareTagSelection,
    isSolveLevelMode,
    statsViewMode,
    user?.UserID,
  ]);

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
    // "All" stays a date window (all time) so the scope keeps its Time view.
    if (preset === "all") {
      const applied = await applyPrimaryDateRange(ALL_TIME_START_DAY, getTodayLocalDayKey());
      if (applied) {
        setSelectedTimeDay("");
        setPreferRawDateRangeView(false);
        setCurrentPage(0);
      }
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

  // Chunk uploads are idempotent on the server, so a dropped request is safe to repeat.
  const sendImportChunk = useCallback(
    async (jobID, payload) => {
      const userID = user?.UserID;
      // A big import sends hundreds of chunks over the better part of an hour, so ride out a
      // dropped connection or a busy server for about two minutes. Chunks are safe to resend:
      // solves already written are skipped.
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await appendImportJobChunk(userID, jobID, payload);
        } catch (err) {
          const status = Number(err?.status);
          const retryable = err?.isNetworkError || !status || status >= 500 || status === 429;
          if (!retryable || attempt >= 6) throw err;
          await new Promise((resolve) => setTimeout(resolve, Math.min(30000, 2000 * 2 ** attempt)));
        }
      }
    },
    [user?.UserID]
  );

  const handleImportSolves = useCallback(
    async ({ parsedSolves, detectedFormat }) => {
      const userID = user?.UserID;
      if (!userID) return;
      if (isAllEventsMode) return;

      const fallbackSessionID = isAllSessionsMode ? "main" : String(sessionId || "main");

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

      // The modal tags each solve with _importSessionID (use that session, creating it when a
      // name comes with it) or just _importSessionName (reuse that event's session by name, or create it).
      const importGroups = new Map();
      for (const s of normalized) {
        const ev = s.event;
        const importSessionName = s._importSessionName ? String(s._importSessionName).trim() : "";
        const importSessionID = s._importSessionID
          ? String(s._importSessionID)
          : importSessionName
            ? ""
            : fallbackSessionID;
        const key = importSessionID
          ? `${ev}::id::${importSessionID}`
          : `${ev}::name::${importSessionName.toLowerCase()}`;
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
            destinationSessionID: fallbackSessionID,
            solves: normalized,
          });

          const preparedGroups = [];
          const overallTotal = normalized.length;
          let totalChunks = 0;

          for (const group of importGroups.values()) {
            const { ev, solves: solvesForEv, importSessionID, importSessionName, importSessionOpts } = group;
            let destSessionForThisEvent = fallbackSessionID;
            const sessionsForGroupEvent = (sessionsList || []).filter(
              (session) => String(session?.Event || "").toUpperCase() === ev
            );

            if (importSessionID) {
              const existingSession = sessionsForGroupEvent.find(
                (session) => String(session?.SessionID || "main") === importSessionID
              );

              if (!existingSession && importSessionName) {
                await runDb("Creating import session", () =>
                  createSession(userID, ev, importSessionID, importSessionName, importSessionOpts || {})
                );
              }

              destSessionForThisEvent = importSessionID;
            } else {
              const wantedName = importSessionName.toLowerCase();
              const namedSession = sessionsForGroupEvent.find(
                (session) =>
                  String(session?.SessionName || session?.Name || "").trim().toLowerCase() === wantedName
              );

              destSessionForThisEvent = namedSession
                ? String(namedSession.SessionID || "main")
                : await createImportSession(ev, importSessionName);
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

            const chunks = chunkImportSolves(cleanSolves);
            totalChunks += chunks.length;
            preparedGroups.push({
              ev,
              destSessionForThisEvent,
              chunks,
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
              sourceFormat: detectedFormat || "unknown",
              scope: isPtsExportImport ? "pts-export" : "single-target",
            },
          });

          const jobID = createRes?.job?.jobID;
          if (!jobID) throw new Error("Failed to create import job");

          let overallCompleted = 0;
          for (const group of preparedGroups) {
            for (const chunk of group.chunks) {
              try {
                await sendImportChunk(jobID, { sourceKey, solves: chunk });
              } catch (chunkError) {
                // Recompute stats for what did land, so the sessions aren't left stale.
                if (overallCompleted > 0) {
                  try {
                    await finalizeImportJob(userID, jobID);
                  } catch (_) {}
                }
                // Running it again can't get past the import allowance, so don't suggest it.
                throw new Error(
                  Number(chunkError?.status) === 403
                    ? `Import stopped after ${overallCompleted} of ${overallTotal} solves. ${
                        chunkError?.message || "Import limit reached."
                      } The solves before that point were kept.`
                    : `Import stopped after ${overallCompleted} of ${overallTotal} solves: ${
                        chunkError?.message || "upload failed"
                      }. Run the same import again to continue - solves already imported are skipped.`
                );
              }
              overallCompleted += chunk.length;
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

          // Finalizing runs on the server in the background; poll until it settles.
          const pollStartedAt = Date.now();
          let pollFailures = 0;
          let lastJobUpdate = "";
          let lastJobUpdateSeenAt = Date.now();
          while (true) {
            let statusRes = null;
            try {
              statusRes = await getImportJob(userID, jobID);
              pollFailures = 0;
            } catch (pollError) {
              pollFailures += 1;
              if (pollFailures >= 10) throw pollError;
              await new Promise((resolve) => setTimeout(resolve, 3000));
              continue;
            }
            const job = statusRes?.job || null;
            const status = String(job?.status || "").toUpperCase();

            // No progress for a while usually means the server restarted mid-finalize; ask again.
            if (String(job?.updatedAt || "") !== lastJobUpdate) {
              lastJobUpdate = String(job?.updatedAt || "");
              lastJobUpdateSeenAt = Date.now();
            } else if (status === "FINALIZING" && Date.now() - lastJobUpdateSeenAt > 5 * 60 * 1000) {
              lastJobUpdateSeenAt = Date.now();
              try {
                await finalizeImportJob(userID, jobID);
              } catch (_) {}
            }
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
      sendImportChunk,
      isAllEventsMode,
      isAllSessionsMode,
      loadInitialSolves,
      onSessionsListRefresh,
      sessionsList,
      runDb,
    ]
  );

  const downloadJsonFile = useCallback((filename, parts) => {
    const blob = new Blob(parts, {
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
        let lastProgressAt = 0;
        for (const session of chosenSessions) {
          const event = String(session?.Event || "").toUpperCase();
          const sessionID = String(session?.SessionID || "main");
          const reportProgress = () => {
            lastProgressAt = Date.now();
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
          };

          // Each page goes straight to a Blob so a huge session isn't held in the tab's heap.
          const solveParts = [];
          await forEachSolvesPage(userID, event, sessionID, (items) => {
            if (!items.length) return;
            solveParts.push(new Blob([serializeSolvesPage(items, stripDbKeys)]));
            solvesExported += items.length;
            if (Date.now() - lastProgressAt >= 1000) reportProgress();
          });
          sessionsCompleted += 1;
          reportProgress();

          sessionExports.push({ session: stripDbKeys(session), solveParts });
        }

        const solveCount = solvesExported;

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

        downloadJsonFile(filename, buildExportJsonParts(payload, sessionExports));
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
    (compareCurrentPage < compareMaxPage || (!!compareSessionCursor && !loadingCompareMore));
  const compareCanNewer =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareCurrentPage > 0;
  const compareCanZoomIn =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareSolvesPerPage > 5;
  const compareCanZoomOut =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveCompareDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    (compareSolvesPerPage < compareFilteredRawSolves.length || (!!compareSessionCursor && !loadingCompareMore));
  const compareCanDecreaseSolveCount =
    statsViewMode === "standard" && isSolveLevelMode && !hasActiveCompareDateFilter && compareSolvesPerPage > 1;
  const compareCanIncreaseSolveCount =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveCompareDateFilter &&
    compareFilteredRawSolves.length > 0 &&
    (compareSolvesPerPage < compareFilteredRawSolves.length || (!!compareSessionCursor && !loadingCompareMore));
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
  const tagBreakdownTagColors = useMemo(
    () => getTagColorMapForEvent(tagColorCatalog, statsEvent === ALL_EVENTS ? "" : statsEvent),
    [statsEvent, tagColorCatalog]
  );
  const handleStatsTagColorsChange = useMemo(
    () =>
      typeof onTagColorsChange === "function" && statsEvent && statsEvent !== ALL_EVENTS
        ? (next) => onTagColorsChange(String(statsEvent).toUpperCase(), next)
        : null,
    [onTagColorsChange, statsEvent]
  );
  // Tag pickers for the bulk tag editor in the solve tables.
  const bulkTagEditorProps = useMemo(
    () => ({
      tagConfig: safeTagConfig,
      cubeModelOptions,
      discoveredTagOptions: mergeTagOptionMaps(discoveredTagOptions, compareDiscoveredTagOptions),
      tagColors: tagBreakdownTagColors,
      onTagColorsChange: handleStatsTagColorsChange,
    }),
    [
      compareDiscoveredTagOptions,
      cubeModelOptions,
      discoveredTagOptions,
      handleStatsTagColorsChange,
      safeTagConfig,
      tagBreakdownTagColors,
    ]
  );
  // The all-time overview is bucket-backed and loads no raw solves, so the tag
  // breakdown is drawn from the per-tag stats records for the same scope.
  const tagBreakdownAggregateKey =
    isAllTimeBucketOverview && !isAllEventsMode && user?.UserID && statsEvent
      ? [
          user.UserID,
          String(statsEvent).toUpperCase(),
          isAllSessionsMode ? "" : sessionId,
          Number(activeBucketSummary?.SolveCountTotal || 0),
        ].join("|")
      : "";
  const [tagBreakdownAggregate, setTagBreakdownAggregate] = useState({ key: "", items: [] });
  useEffect(() => {
    if (!tagBreakdownAggregateKey) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const items = await getTagStatsList(user.UserID, {
          event: statsEvent,
          sessionID: isAllSessionsMode ? "" : sessionId,
        });
        if (!cancelled) setTagBreakdownAggregate({ key: tagBreakdownAggregateKey, items });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load tag stats list:", error);
        setTagBreakdownAggregate({ key: tagBreakdownAggregateKey, items: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagBreakdownAggregateKey, aggregateRefreshNonce]);
  // Any other bucket-backed range carries its own per-tag totals in the day buckets.
  const bucketTagSummaries =
    useBucketBackedRange && Array.isArray(activeBucketSummary?.TagSummaries)
      ? activeBucketSummary.TagSummaries
      : null;
  const tagBreakdownAggregateItems =
    tagBreakdownAggregateKey && tagBreakdownAggregate.key === tagBreakdownAggregateKey
      ? tagBreakdownAggregate.items
      : bucketTagSummaries;
  // The loaded raw page covers only part of a bucketed range, so the range-wide
  // tag totals win whenever they exist.
  const tagBreakdownSolves = useMemo(
    () => (useBucketBackedRange && tagBreakdownAggregateItems ? [] : visiblePageFilteredRawSolves),
    [tagBreakdownAggregateItems, useBucketBackedRange, visiblePageFilteredRawSolves]
  );
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

  // Summary value colors: a tag color (or each stat group's color) replaces the
  // default green/red, and in two-group mode each group is compared to the other.
  const primarySummaryRival = useMemo(
    () => ({
      solves: summaryCurrentSolves,
      solveIndexOffset: summarySolveIndexOffset,
      overallStats: canonicalOverallStats,
      overallSolves: stableOverallSolves,
      bucketSummary: useBucketBackedRange ? activeBucketSummary : null,
      bucketItems: useBucketBackedRange ? activeBucketItems : [],
      allowOverallDerived: allowOverallDerivedMetrics,
    }),
    [
      activeBucketItems,
      activeBucketSummary,
      allowOverallDerivedMetrics,
      canonicalOverallStats,
      stableOverallSolves,
      summaryCurrentSolves,
      summarySolveIndexOffset,
      useBucketBackedRange,
    ]
  );
  const compareSummaryRival = useMemo(
    () => ({
      solves: compareVisiblePageFilteredRawSolves,
      overallStats: useCompareBucketBackedRange ? activeCompareBucketSummary : null,
      overallSolves: compareFilteredRawSolves,
      bucketSummary: useCompareBucketBackedRange ? activeCompareBucketSummary : null,
      bucketItems: useCompareBucketBackedRange ? activeCompareBucketItems : [],
    }),
    [
      activeCompareBucketItems,
      activeCompareBucketSummary,
      compareFilteredRawSolves,
      compareVisiblePageFilteredRawSolves,
      useCompareBucketBackedRange,
    ]
  );
  const summaryRivalTonesActive = compareEnabled && statsViewMode === "standard" && !isAllEventsMode;
  const primarySummaryToneColor = summaryRivalTonesActive
    ? primaryAccentColor
    : statsViewMode === "standard"
      ? primaryTagAccentColor
      : "";

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

  // Solves | Time view: a date window means Time, otherwise Solves (last N).
  // Multi scopes in the Solves view use the single-scope cards over the combined
  // solves; in the Time view they get the time cards (event matrix, breakdown).
  const primaryScopeView = hasActiveDateFilter ? "time" : "solves";
  const layoutViewMode = statsViewMode === "time" && primaryScopeView === "solves" ? "standard" : statsViewMode;
  const layoutAllEvents = isAllEventsMode && layoutViewMode === "time";
  const showEventBreakdownCard = layoutViewMode === "time" && isAllEventsMode;
  const showAllEventsTimeMatrixCard = layoutViewMode === "time" && isAllEventsMode && !compareEnabled;
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
      solveIndexOffset: summarySolveIndexOffset,
      showCurrentMetrics: currentPage === 0,
      viewMode: statsViewMode,
      selectedDay: selectedTimeDay || "",
    };
    const compareSummaryRender = {
      solves: serializeSharedSolves(compareVisiblePageFilteredRawSolves, 500),
      overallSolves: serializeSharedSolves(compareFilteredRawSolves, 1000),
      overallStats: null,
      bucketSummary: useCompareBucketBackedRange ? activeCompareBucketSummary : null,
      bucketItems: useCompareBucketBackedRange ? activeCompareBucketItems : [],
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
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "line",
          title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
          subtitle: "Line Chart",
          profileConfig: {
            chart: "lineChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            subtitle: "Line Chart",
            seriesStyle: primaryCompareStyle,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "line",
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
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
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "percent",
          title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
          subtitle: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution",
          profileConfig: {
            chart: "percentBar",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            subtitle: showEventBreakdownCard ? "Event Breakdown" : "Solves Distribution",
            legendItems: compareLegendItems,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "percent",
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
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
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "bar",
          title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
          subtitle: "Bar Chart",
          profileConfig: {
            chart: "barChart",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            subtitle: "Bar Chart",
            seriesStyle: primaryCompareStyle,
            legendItems: compareLegendItems,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "bar",
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
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
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            viewMode: statsViewMode,
          }),
          key: "table",
          title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
          subtitle: "Time Table",
          profileConfig: {
            chart: "timeTable",
            event: statsEvent,
            session: sessionId,
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
            subtitle: "Time Table",
            seriesStyle: primaryCompareStyle,
            viewMode: statsViewMode,
          },
          statShare: {
            cardKey: "table",
            title: buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay),
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
    cardTitleEventLabel,
    cardTitleSessionLabel,
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
    summarySolveIndexOffset,
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
    useCompareBucketBackedRange,
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

  // Solve list for one tag-breakdown slice. Raw buckets carry their solves; a
  // bucket-backed (aggregate) slice is loaded from the tag index and clipped to
  // the visible date range. The list is a snapshot kept in step with bulk edits,
  // and solves retagged out of the slice drop off it.
  const [tagBucketList, setTagBucketList] = useState(null);
  const tagBucketRequestRef = useRef(0);

  const openTagBucketSolves = useCallback(
    async (bucket, fieldMeta) => {
      const field = String(fieldMeta?.field || "").trim();
      if (!bucket || !field) return;
      const base = {
        field,
        fieldLabel: fieldMeta?.label || field,
        key: bucket.key,
        label: bucket.label,
        expectedCount: bucket.value,
      };
      const requestId = ++tagBucketRequestRef.current;

      if (Array.isArray(bucket.solves) && bucket.solves.length) {
        setTagBucketList({ ...base, solves: bucket.solves, loading: false, error: "" });
        return;
      }
      if (!user?.UserID || bucket.key === "Unknown") return;

      setTagBucketList({ ...base, solves: [], loading: true, error: "" });
      try {
        const items = [];
        let cursor = null;
        do {
          const out = await getSolvesByTag(user.UserID, {
            tagKey: field,
            tagValue: bucket.key,
            event: isAllEventsMode ? "" : String(statsEvent || "").toUpperCase(),
            sessionID: isAllEventsMode || isAllSessionsMode ? "" : String(sessionId || "main"),
            limit: 500,
            hydrate: true,
            cursor,
            force: true,
          });
          if (Array.isArray(out?.items)) items.push(...out.items);
          cursor = out?.lastKey || null;
        } while (cursor);
        if (tagBucketRequestRef.current !== requestId) return;

        const normalized = filterSolvesByDateRange(
          items.map(normalizeSolve).filter(Boolean),
          dateFilterStart,
          dateFilterEnd
        )
          .filter((solve) => !hasActiveTagFilter || solveMatchesTagSelection(solve, tagFilterSelection))
          .sort((a, b) => new Date(a?.datetime || 0).getTime() - new Date(b?.datetime || 0).getTime());
        setTagBucketList((current) =>
          current ? { ...current, solves: normalized, loading: false } : current
        );
      } catch (error) {
        if (tagBucketRequestRef.current !== requestId) return;
        console.error("Failed to load tag bucket solves:", error);
        setTagBucketList((current) =>
          current ? { ...current, loading: false, error: "Couldn't load these solves." } : current
        );
      }
    },
    [
      dateFilterEnd,
      dateFilterStart,
      hasActiveTagFilter,
      isAllEventsMode,
      isAllSessionsMode,
      normalizeSolve,
      sessionId,
      statsEvent,
      tagFilterSelection,
      user?.UserID,
    ]
  );

  const closeTagBucketSolves = useCallback(() => {
    tagBucketRequestRef.current += 1;
    setTagBucketList(null);
  }, []);

  const tagBucketVisibleSolves = useMemo(() => {
    if (!tagBucketList) return [];
    return tagBucketList.solves.filter(
      (solve) => (getSolveTagValue(solve, tagBucketList.field) || "Unknown") === tagBucketList.key
    );
  }, [tagBucketList]);

  // Bulk actions update the app's sessions map; replay the same update on the
  // snapshot so edits, moves and deletes show up in the open list.
  const tagBucketSetSessions = useCallback(
    (update) => {
      statsSetSessions(update);
      setTagBucketList((current) =>
        current && typeof update === "function"
          ? { ...current, solves: replaySessionsUpdate(current.solves, update, statsEvent) }
          : current
      );
    },
    [statsSetSessions, statsEvent]
  );

  const tagBucketDeleteSolve = useCallback(
    async (solveRef) => {
      await handleDeleteSolve(solveRef);
      const ref = String(typeof solveRef === "string" ? solveRef : solveRef?.solveRef || "");
      setTagBucketList((current) =>
        current
          ? { ...current, solves: current.solves.filter((solve) => String(solve?.solveRef || "") !== ref) }
          : current
      );
    },
    [handleDeleteSolve]
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
        selection.variant !== "plus2-best" &&
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
        (!canUseCachedOverallRefs ||
          needsFullOverallScopeForCachedRefs ||
          (selection.variant === "plus2-best" && !hasFullLoadedOverallScope))
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
    if (!focusedCard?.profileConfig || !user?.UserID || typeof saveStatToProfile !== "function") return;

    setFocusActionBusy("profile");
    setFocusActionMessage("");

    try {
      const result = await saveStatToProfile(focusedCard.profileConfig);
      if (result?.status === "added") setFocusActionMessage("Saved to your profile.");
      else if (result?.status === "exists") setFocusActionMessage("Already saved there.");
    } catch (error) {
      console.error("Failed to add stat card to profile:", error);
      setFocusActionMessage("Failed to update your profile.");
    } finally {
      setFocusActionBusy("");
    }
  }, [focusedCard, saveStatToProfile, user?.UserID]);

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
            solveIndexOffset={summarySolveIndexOffset}
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
            solveIndexOffset={summarySolveIndexOffset}
            onStatSelect={handleSummaryStatSelect}
            profileColor={primaryAccentColor}
            loading={primaryOverallSummaryLoading}
            showWorstOverview={showAllActive || isAllTimeBucketOverview}
          />
        );
      }

      if (card.key === "summary-compare-secondary-current") {
        return (
                      <StatsSummaryCurrent
                        solves={compareVisiblePageFilteredRawSolves}
                        overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                        bucketSummary={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                        bucketItems={useCompareBucketBackedRange ? activeCompareBucketItems : []}
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
                        overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
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
                      solves: useCompareBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                      bucketItems: useCompareBucketBackedRange ? activeCompareBucketItems : [],
                      style: compareStyle,
                    },
                  ]
                : []
            }
            seriesStyle={primaryCompareStyle}
            legendItems={compareLegendItems}
            title={buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay)}
            titleDate={lineChartTitleDate}
            titleIndexRange={lineChartTitleIndexRange}
            solveIndexOffset={lineChartSolveIndexOffset}
            deleteTime={handleDeleteSolve}
            addPost={addPost}
            setSessions={statsSetSessions}
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
            {...bulkTagEditorProps}
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
                      solves: useCompareBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                      histogramCounts: useCompareBucketBackedRange
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
        if (tableUsesBucketRange) {
          return (
            <BucketTable
              profileColor={user?.Color || user?.color}
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
              competitions={wcaCompetitions}
              onCompetitionOpen={handleCompetitionOpen}
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
            setSessions={statsSetSessions}
            sessionsList={sessionsList}
            currentEvent={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
            currentSession={compareEnabled && tableCompareView === "compare" ? compareSessionId : sessionId}
            eventKey={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
            practiceMode={false}
            solveIndexOffset={compareEnabled && tableCompareView === "compare" ? null : tableSolveIndexOffset}
            {...bulkTagEditorProps}
          />
        );
      }

      return null;
    },
    [
      addPost,
      bulkTagEditorProps,
      wcaCompetitions,
      handleCompetitionOpen,
      activeBucketItems,
      activeBucketSummary,
      activeCompareBucketItems,
      activeCompareBucketSummary,
      allEventsBreakdown,
      allLoadedFilteredRawSolves,
      barChartSolves,
      tableSolveIndexOffset,
      lineChartSolveIndexOffset,
      lineChartTitleIndexRange,
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
      useCompareBucketBackedRange,
      tableUsesBucketRange,
      selectedSessionDisplay,
      selectedTagLabel,
      selectedTimeDay,
      sessionId,
      sessionsList,
      statsSetSessions,
      loadedSolveCountForSummary,
      summarySolveIndexOffset,
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

  // ---- Multi-select scope pickers (primary row) ----

  const setScopeEventList = (list) => {
    const unique = Array.from(new Set(list.map((ev) => String(ev).toUpperCase()))).filter(Boolean);
    if (!unique.length) return;
    const isEveryEvent = scopeAllEvents.length > 1 && unique.length === scopeAllEvents.length;
    const keepCustom = scopeSessions.mode === "custom" && unique.length === 1 && scopeEventList.length === 1 && unique[0] === scopeEventList[0];
    void applyScope({
      events: isEveryEvent ? ALL_EVENTS : unique,
      sessions: scopeSessions.mode === "custom" && !keepCustom ? { mode: "main", keys: [] } : scopeSessions,
    });
  };

  const scopeMultiEvent = {
    isMulti: isMultiEventScope,
    label: scopeEventsLabel,
    items: scopeAllEvents.map((ev) => ({
      key: ev,
      label: getEventDisplayMeta(ev).label,
      active: scopeEvents === ALL_EVENTS || scopeEventList.includes(ev),
    })),
    onToggle: (ev) => {
      const current = scopeEvents === ALL_EVENTS ? scopeAllEvents : scopeEventList;
      setScopeEventList(current.includes(ev) ? current.filter((e) => e !== ev) : [...current, ev]);
    },
    onOnly: (ev) => setScopeEventList([ev]),
    onAll: () => void applyScope({ events: ALL_EVENTS, sessions: scopeSessions.mode === "custom" ? { mode: "main", keys: [] } : scopeSessions }),
    onInvert: () => {
      if (scopeEvents === ALL_EVENTS) return;
      setScopeEventList(scopeAllEvents.filter((ev) => !scopeEventList.includes(ev)));
    },
  };

  const scopeSessionGroups = scopeEventList.map((ev) => ({
    event: ev,
    label: getEventDisplayMeta(ev).label,
    sessions: getSessionIdsForEvent(sessionsList, ev).map((sid) => {
      const found = (sessionsList || []).find(
        (s) => String(s?.Event || "").toUpperCase() === ev && String(s?.SessionID || "main") === sid
      );
      return {
        key: `${ev}|${sid}`,
        sid,
        label: normalizeSessionLabel(sid, found?.SessionName || found?.Name || sid),
      };
    }),
  }));
  const scopeActivePairKeys = new Set(scopePairs.map((p) => `${p.Event}|${p.SessionID}`));
  const setScopeSessionKeys = (keys) => {
    if (!keys.size) return;
    const allKeys = scopeSessionGroups.flatMap((g) => g.sessions.map((x) => x.key));
    const mainKeys = new Set(resolveScopePairs(scopeEventList, { mode: "main" }, sessionsList).map((p) => `${p.Event}|${p.SessionID}`));
    const sameAs = (set) => set.size === keys.size && [...keys].every((k) => set.has(k));
    const sessions = sameAs(mainKeys)
      ? { mode: "main", keys: [] }
      : allKeys.length > 1 && sameAs(new Set(allKeys))
        ? { mode: "all", keys: [] }
        : { mode: "custom", keys: [...keys] };
    void applyScope({ sessions });
  };
  const scopeMultiSession = {
    label: scopeSessionsLabel,
    mode: scopeSessions.mode,
    groups: scopeSessionGroups,
    isActive: (key) => scopeActivePairKeys.has(key),
    onMode: (mode) => void applyScope({ sessions: { mode, keys: [] } }),
    onToggle: (key) => {
      const next = new Set(scopeActivePairKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setScopeSessionKeys(next);
    },
    onOnly: (key) => setScopeSessionKeys(new Set([key])),
  };

  const renderScopeChip = ({ key, label, active, onToggle, onOnly, accentColor }) => (
    <span key={key} className={`statsScopeMultiChip ${active ? "active" : ""}`}>
      <button
        type="button"
        className={`statsScopeChip ${active ? "active" : ""}`}
        style={active ? { borderColor: accentColor, background: `${accentColor}22` } : undefined}
        aria-pressed={active}
        onClick={onToggle}
      >
        {label}
      </button>
      <button type="button" className="statsScopeOnlyBtn" onClick={onOnly} title={`Only ${label}`}>
        only
      </button>
    </span>
  );

  const renderMultiEventPicker = (picker, scopeKey, accentColor) => (
    <div className="statsScopeMultiPicker">
      <div className="statsScopeMultiActions">
        <button type="button" className="statsScopeMultiAction" onClick={picker.onAll}>All events</button>
        <button type="button" className="statsScopeMultiAction" onClick={picker.onInvert}>Invert</button>
      </div>
      <div className="statsScopeChipGrid">
        {picker.items.map((item) =>
          renderScopeChip({
            key: `${scopeKey}-event-${item.key}`,
            label: item.label,
            active: item.active,
            onToggle: () => picker.onToggle(item.key),
            onOnly: () => picker.onOnly(item.key),
            accentColor,
          })
        )}
      </div>
    </div>
  );

  const renderMultiSessionPicker = (picker, scopeKey, accentColor) => (
    <div className="statsScopeMultiPicker">
      <div className="statsScopeMultiActions">
        <button
          type="button"
          className={`statsScopeMultiAction ${picker.mode === "main" ? "active" : ""}`}
          onClick={() => picker.onMode("main")}
        >
          Main only
        </button>
        <button
          type="button"
          className={`statsScopeMultiAction ${picker.mode === "all" ? "active" : ""}`}
          onClick={() => picker.onMode("all")}
        >
          All sessions
        </button>
      </div>
      {picker.groups.map((group) => (
        <div key={`${scopeKey}-sessions-${group.event}`} className="statsScopeMultiGroup">
          {picker.groups.length > 1 ? <div className="statsScopeMultiGroupLabel">{group.label}</div> : null}
          <div className="statsScopeChipGrid">
            {group.sessions.map((session) =>
              renderScopeChip({
                key: `${scopeKey}-session-${session.key}`,
                label: session.label,
                active: picker.isActive(session.key),
                onToggle: () => picker.onToggle(session.key),
                onOnly: () => picker.onOnly(session.key),
                accentColor,
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const INDEX_FRAME_PRESETS = [50, 100, 500, 1000, 5000];
  const renderIndexFramePicker = (frame, scopeKey, accentColor) => (
    <div className="statsScopeMultiPicker statsScopeIndexFrame">
      <div className="statsScopeMultiGroupLabel">Last solves</div>
      <div className="statsScopeChipGrid">
        {INDEX_FRAME_PRESETS.map((n) => {
          const active = frame.active && frame.n === n;
          return (
            <button
              key={`${scopeKey}-index-${n}`}
              type="button"
              className={`statsScopeChip ${active ? "active" : ""}`}
              style={active ? { borderColor: accentColor, background: `${accentColor}22` } : undefined}
              onClick={() => frame.onPick(n)}
            >
              Last {n.toLocaleString()}
            </button>
          );
        })}
        <input
          type="number"
          min="1"
          max="5000"
          className="statsScopeIndexInput"
          placeholder="N"
          aria-label="Custom solve count"
          defaultValue={INDEX_FRAME_PRESETS.includes(frame.n) ? "" : frame.n}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const n = Math.round(Number(event.currentTarget.value));
            if (n > 0) frame.onPick(Math.min(5000, n));
          }}
        />
      </div>
      {frame.isMulti ? (
        <div className="statsScopeMultiActions">
          <button
            type="button"
            className={`statsScopeMultiAction ${frame.split === "combined" ? "active" : ""}`}
            onClick={() => frame.onSplit("combined")}
            title="Your last N solves across the chosen events"
          >
            Combined
          </button>
          <button
            type="button"
            className={`statsScopeMultiAction ${frame.split === "perEvent" ? "active" : ""}`}
            onClick={() => frame.onSplit("perEvent")}
            title="The last N solves of each chosen event"
          >
            Per event
          </button>
        </div>
      ) : null}
    </div>
  );

  // Date window for a Time-view preset (compare row; the primary row uses applyTimeRangePreset).
  const getTimePresetRange = (preset) => {
    const today = getTodayLocalDayKey();
    if (preset === "day") return { start: today, end: today };
    if (preset === "week") return getWeekRangeFromDayKey(today);
    if (preset === "month") return getMonthRangeFromDayKey(today);
    return { start: ALL_TIME_START_DAY, end: today };
  };

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
    // Primary row only: multi-select pickers (see buildScopeMultiPickers).
    multiEvent = null,
    multiSession = null,
    indexFrame = null,
    // Solves | Time view for this scope.
    view = "solves",
    onViewChange,
    isMultiScope = false,
    rangeLabel = "",
  }) => {
    if (!isOpen) return null;

    const tagsAvailable = !multiEvent || !multiEvent.isMulti;
    // Same order as the scope row: events, sessions, tags, then the view/range.
    const sectionButtons = [
      { key: "event", label: "Events" },
      { key: "session", label: "Sessions" },
      ...(tagsAvailable ? [{ key: "tags", label: "Tags" }] : []),
      { key: "date", label: isMultiScope ? "View" : "Range" },
      ...(typeof onPaletteChange === "function" ? [{ key: "color", label: "Color" }] : []),
    ];
    // Several events: the date-window view is the multi-event view.
    const timeViewName = isMultiScope ? "Overall" : "Time";
    const viewName = view === "time" ? timeViewName : "Solves";
    const viewOptions = [
      {
        value: "solves",
        label: "Solves",
        hint: "Count back by solves",
      },
      {
        value: "time",
        label: timeViewName,
        hint: isMultiScope ? "Each event side by side over a window of days" : "Pick a window of days",
      },
    ];
    const viewExplainer =
      view === "time"
        ? isMultiScope
          ? "Every solve in the days you pick, broken down by event."
          : "Every solve in the days you pick. Step through them with the arrows in the bar."
        : isMultiScope
        ? "Your most recent solves across the selected events, combined into one set of solve cards."
        : "Your most recent solves. Page older and newer with the arrows in the bar.";

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
            <p>
              {isMultiScope ? `${viewName} view${rangeLabel ? ` · ${rangeLabel}` : ""}` : rangeLabel}
            </p>
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
              <span>Events</span>
              <span>
                {multiEvent
                  ? multiEvent.label
                  : eventValue === ALL_EVENTS ? "All Events" : eventValue === "333" ? "3x3" : eventValue}
              </span>
            </button>

            {scopeModalSection === "event" && multiEvent && renderMultiEventPicker(multiEvent, scopeKey, accentColor)}
            {scopeModalSection === "event" && !multiEvent && (
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
              <span>Sessions</span>
              <span>
                {multiSession
                  ? multiSession.label
                  : sessionValue === ALL_SESSIONS
                  ? "All Sessions"
                  : normalizeSessionLabel(
                      sessionValue,
                      sessionItems.find((s) => s.SessionID === sessionValue)?.SessionName || sessionValue
                    )}
              </span>
            </button>

            {scopeModalSection === "session" && multiSession && renderMultiSessionPicker(multiSession, scopeKey, accentColor)}
            {scopeModalSection === "session" && !multiSession && (
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

          {tagsAvailable && (
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
          )}

          <div className="statsScopeModalSection">
            <button
              type="button"
              className={`statsScopeSectionHeader ${scopeModalSection === "date" ? "active" : ""}`}
              onClick={() => setScopeModalSection("date")}
            >
              <span>{isMultiScope ? "View" : "Range"}</span>
              <span>
                {isMultiScope ? viewName : rangeLabel}
                {isMultiScope && rangeLabel ? ` · ${rangeLabel}` : ""}
              </span>
            </button>

            {/* Single event: no view switch, just the solve count or a date range. */}
            {scopeModalSection === "date" && !isMultiScope && (
              <div className="statsScopeViewPanel">
                {indexFrame ? renderIndexFramePicker(indexFrame, scopeKey, accentColor) : null}
                <div className="statsScopeMultiGroupLabel statsScopeTimeCustomLabel">
                  {indexFrame ? "Or a date range" : "Date range"}
                </div>
                <StatsDateRangePicker
                  startDay={dateStartDay}
                  endDay={dateEndDay}
                  accentColor={accentColor}
                  onApply={onDateApply}
                />
              </div>
            )}

            {scopeModalSection === "date" && isMultiScope && (
              <div className="statsScopeViewPanel">
                <div className="statsScopeViewSwitch" role="radiogroup" aria-label="View by">
                  {viewOptions.map((option) => {
                    const active = view === option.value;
                    return (
                      <button
                        key={`${scopeKey}-view-${option.value}`}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`statsScopeViewOption ${active ? "active" : ""}`}
                        style={
                          active
                            ? { borderColor: accentColor, background: `${accentColor}22` }
                            : undefined
                        }
                        onClick={() => {
                          if (!active && typeof onViewChange === "function") onViewChange(option.value);
                        }}
                      >
                        <span className="statsScopeViewOptionLabel">{option.label}</span>
                        <span className="statsScopeViewOptionHint">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="statsScopeViewExplainer">{viewExplainer}</p>

                {view === "solves" ? (
                  indexFrame ? (
                    renderIndexFramePicker(indexFrame, scopeKey, accentColor)
                  ) : (
                    <div className="statsScopeModalMeta">
                      Use + and − in the bar to change how many solves are in view.
                    </div>
                  )
                ) : (
                  <>
                    <StatsDateRangePicker
                      startDay={dateStartDay}
                      endDay={dateEndDay}
                      accentColor={accentColor}
                      onApply={onDateApply}
                    />
                  </>
                )}
              </div>
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

    // Hovering/focusing a control previews its result in the range chip; clicking
    // drops the preview so the chip shows the range that was just applied.
    const previewProps = (action, run) => ({
      onClick: () => {
        setScopeControlHover(null);
        run();
      },
      onMouseEnter: () => setScopeControlHover({ scopeKey, action }),
      onMouseLeave: () => setScopeControlHover(null),
      onFocus: () => setScopeControlHover({ scopeKey, action }),
      onBlur: () => setScopeControlHover(null),
    });

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
      <div className="statsScopePair" role="group" aria-label="Page through solves">
        <button
          type="button"
          {...previewProps("older", controls.previous)}
          disabled={!controls.canOlder}
          title="Older solves"
          aria-label="Older solves"
        >
          {(useCompareControls ? loadingCompareMore : loadingMore) ? "…" : "▲"}
        </button>
        <button
          type="button"
          {...previewProps("newer", controls.next)}
          disabled={!controls.canNewer}
          title="Newer solves"
          aria-label="Newer solves"
        >
          ▼
        </button>
      </div>

      <div className="statsScopePair" role="group" aria-label="Zoom">
        <button
          type="button"
          {...previewProps("zoomIn", controls.zoomIn)}
          disabled={!controls.canZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          {...previewProps("zoomOut", controls.zoomOut)}
          disabled={!controls.canZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

      <div className="statsScopePair statsScopePair--step" role="group" aria-label="Solve count">
        <button
          type="button"
          {...previewProps("increase", controls.increase)}
          disabled={!controls.canIncreaseSolveCount}
          title="Show one more solve"
          aria-label="Show one more solve"
        >
          +1
        </button>
        <button
          type="button"
          {...previewProps("decrease", controls.decrease)}
          disabled={!controls.canDecreaseSolveCount}
          title="Show one fewer solve"
          aria-label="Show one fewer solve"
        >
          −1
        </button>
      </div>
        </>
      )}
      </div>
    );
  };

  // What the range chip of `rowKey` would read after clicking the hovered range control.
  const getScopeRangePreview = (rowKey) => {
    if (!scopeControlHover || statsViewMode !== "standard") return null;
    const { scopeKey: hoveredKey, action } = scopeControlHover;
    const controlsLinked = compareEnabled && linkStatsControls;
    if (!controlsLinked && hoveredKey !== rowKey) return null;
    const useCompareControls = hoveredKey === "compare" && compareEnabled && !linkStatsControls;

    if (!useCompareControls && canUseDateWindowControls) {
      if (!dateFilterStart || !dateFilterEnd) return null;
      if (action === "zoomIn" && isSingleDayDateFilter) {
        return { primary: dateFilterLabel, secondary: "Show individual solves" };
      }
      if (action === "zoomOut" && preferRawDateRangeView) {
        return { primary: dateFilterLabel, secondary: "Show day summaries" };
      }

      let range;
      if (action === "older" || action === "newer") {
        const offset = action === "older" ? -dateWindowDayCount : dateWindowDayCount;
        range = clampRangeEndToToday(
          shiftLocalDayKey(dateFilterStart, offset),
          shiftLocalDayKey(dateFilterEnd, offset)
        );
      } else {
        const nextDayCount =
          action === "zoomIn"
            ? Math.max(1, Math.ceil(dateWindowDayCount / 2))
            : action === "zoomOut"
            ? Math.max(2, dateWindowDayCount * 2)
            : action === "increase"
            ? dateWindowDayCount + 1
            : Math.max(1, dateWindowDayCount - 1);
        range = { start: shiftLocalDayKey(dateFilterEnd, -(nextDayCount - 1)), end: dateFilterEnd };
      }
      if (!range.start || !range.end) return null;
      const dayCount = getInclusiveDaySpan(range.start, range.end);
      return {
        primary: formatCompactDateRange(range.start, range.end) || `${range.start} – ${range.end}`,
        secondary: `${dayCount.toLocaleString()} ${dayCount === 1 ? "day" : "days"}`,
      };
    }

    const rowSolves = rowKey === "compare" ? compareFilteredRawSolves : activeStandardSolves;
    const total = rowSolves.length;
    let perPage = useCompareControls ? compareSolvesPerPage : solvesPerPage;
    let page = useCompareControls ? compareCurrentPage : currentPage;
    // Either scope fetches older solves when a control outgrows what is loaded.
    const canLoadMore = useCompareControls ? !!compareSessionCursor : hasMoreOlder && !isAllLoaded;

    if (action === "older") {
      if (perPage * (page + 1) >= total) {
        return canLoadMore
          ? { primary: "Older solves", secondary: "Loads more" }
          : null;
      }
      page += 1;
    } else if (action === "newer") {
      page = Math.max(0, page - 1);
    } else {
      let nextPerPage =
        action === "zoomIn"
          ? getNextSmallerSolveWindow(perPage)
          : action === "zoomOut"
          ? getNextLargerSolveWindow(perPage)
          : action === "increase"
          ? perPage + 1
          : Math.max(1, perPage - 1);
      if (!canLoadMore) nextPerPage = Math.min(nextPerPage, Math.max(1, total));
      page = getAnchoredSolvePage(perPage, page, nextPerPage);
      perPage = nextPerPage;
    }

    if (page === 0 && perPage > total && canLoadMore) {
      return { primary: `Last ${perPage.toLocaleString()}`, secondary: "Loads older solves" };
    }

    const sliced = rowSolves.slice(
      Math.max(0, total - perPage * (page + 1)),
      Math.max(0, Math.min(total, total - perPage * page))
    );
    const nextSolves = rowKey === "compare" ? sliced : filterRawSolveList(sliced);
    if (!nextSolves.length) return null;
    const countText = nextSolves.length.toLocaleString();
    return {
      primary: page === 0 ? `Last ${countText}` : `${countText} ${nextSolves.length === 1 ? "solve" : "solves"}`,
      secondary: formatCompactDateRange(nextSolves[0]?.datetime, nextSolves[nextSolves.length - 1]?.datetime),
    };
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
    // Primary row (no compare): multi-scope labels, the quick All-events hop,
    // and no tag button when several events are in scope.
    scopeLabels = null,
    // Session | Overall level switch (primary row).
    view = null,
    onViewChange = null,
    sessionViewLabel = "Session",
  }) => {
    const meta = getEventDisplayMeta(scopeLabels ? scopeLabels.iconEvent : eventValue);
    const eventLabel = scopeLabels ? scopeLabels.events : meta.label;
    const puzzleEvent = meta.puzzleEvent;
    const hasActiveTags = Object.values(sanitizeTagSelection(tagSelection)).some((value) =>
      String(value || "").trim()
    );
    const activeTone = hasActiveTags ? tagPills[0]?.color || rowAccentColor : rowAccentColor;
    const rangePreview = getScopeRangePreview(scopeModalKey);
    const rangeSummary = rangePreview || dateSummary;

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
          "--stats-scope-row-border": `${activeTone}4d`,
          "--stats-scope-row-border-hover": `${activeTone}a6`,
          background:
            loading || !hasActiveTags || settings?.statsTopBarBackground !== true
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
          {/* Leads the row: which level (Session | Overall) is in view. */}
          {view && typeof onViewChange === "function" ? (
            <div className="statsScopeLayoutToggle" role="group" aria-label="View by">
              {[
                {
                  value: "session",
                  label: sessionViewLabel,
                  title:
                    sessionViewLabel === "Session"
                      ? "Session view: one session, counted back by solves"
                      : "Sessions view: the selected events' latest solves together",
                },
                {
                  value: "overall",
                  label: "Overall",
                  title: "Overall view: every event side by side over a window of days",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`statsScopeLayoutBtn ${view === option.value ? "is-active" : ""}`}
                  aria-pressed={view === option.value}
                  title={option.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (view !== option.value) onViewChange(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
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
              <span
                className={`statsScopeEventIcon ${puzzleEvent === "333OH" ? "statsScopeEventIcon--oh" : ""}`}
                aria-hidden="true"
              >
                <PuzzleSVG
                  event={puzzleEvent}
                  scramble=""
                  isStatsHeaderIcon
                  colorStyle={settings?.statsSelectorPuzzleSvgStyle || "grayscale"}
                />
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
              {scopeLabels ? scopeLabels.sessions : sessionValue === ALL_SESSIONS ? "All Sessions" : sessionDisplay}
            </span>
          </button>

          {scopeLabels?.hideTags ? null : hasActiveTags ? (
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

        </div>

        {/* Range pill: the solve count or date range in view. */}
        <div className={`statsScopeRange ${rangePreview ? "is-preview" : ""}`}>
          <button
            type="button"
            className={`statsScopeSummaryChip statsScopeSummaryChip--date ${rangePreview ? "is-preview" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openScopeModal(scopeModalKey, "date");
            }}
          >
            <span className="statsScopeDatePrimary">{rangeSummary?.primary}</span>
            {rangeSummary?.secondary ? (
              <span className="statsScopeDateSecondary">{rangeSummary.secondary}</span>
            ) : null}
          </button>

        </div>

        <div className="statsScopeRowActions">
          {renderViewportControls(scopeModalKey)}
        </div>
      </div>
    );
  };

  // Date chip content: when paging by solve count the count leads ("Last 100") with the
  // dates underneath; when a date range is the scope, the range leads with its solve count.
  const buildDateSummary = ({ label, rangeText, count, hasDateFilter, page, showAll }) => {
    const countText = Number(count) > 0 ? Number(count).toLocaleString() : "";
    const solvesText = countText ? `${countText} ${Number(count) === 1 ? "solve" : "solves"}` : "";
    const countLeads = statsViewMode === "standard" && isSolveLevelMode && !hasDateFilter && !!countText;
    if (!countLeads) return { primary: label, secondary: solvesText };
    const primary = showAll ? `All ${countText}` : page === 0 ? `Last ${countText}` : solvesText;
    return { primary, secondary: rangeText };
  };
  // Multi-event / merged-session index frame: "Last 1,000" (or "Last 100 each")
  // over the loaded solves' count and day span.
  const multiIndexSummary = (() => {
    if (!multiIndexActive) return null;
    const nText = Number(multiIndexN).toLocaleString();
    const primary = multiIndexSplit === "perEvent" ? `Last ${nText} each` : `Last ${nText}`;
    if (loadingMultiIndex && !hasMultiIndexSolves) return { primary, secondary: "Loading…" };
    const solves = hasMultiIndexSolves ? multiIndexSolves : [];
    if (!solves.length) return { primary, secondary: multiIndexError ? "Couldn't load solves" : "No solves" };
    const firstDay = getLocalDayKey(getSolveDate(solves[0]));
    const lastDay = getLocalDayKey(getSolveDate(solves[solves.length - 1]));
    const count = solves.length.toLocaleString();
    return {
      primary,
      secondary: `${count} solves · ${formatShortDateRangeLabel(firstDay, lastDay, "")}`,
    };
  })();
  const primaryDateSummary =
    multiIndexSummary ||
    buildDateSummary({
      label: dateFilterLabel,
      rangeText: dateRangeText,
      count: showingCount,
      hasDateFilter: hasActiveDateFilter,
      page: currentPage,
      showAll: showAllActive,
    });
  const compareDateSummary = buildDateSummary({
    label: compareDateFilterLabel,
    rangeText: compareDateRangeText,
    count: compareVisiblePageFilteredRawSolves?.length || 0,
    hasDateFilter: hasActiveCompareDateFilter,
    page: linkStatsControls ? currentPage : compareCurrentPage,
    showAll: linkStatsControls ? showAllActive : compareShowAllActive,
  });

  // One-click hop between the timer's event and every event, keeping the range.
  const homeEvent = String(currentEvent || "333").toUpperCase();
  const homeEventLabel = getEventDisplayMeta(homeEvent).label;
  const primaryViewSwitchChip =
    scopeEvents === ALL_EVENTS
      ? {
          label: `← ${homeEventLabel}`,
          title: `Back to ${homeEventLabel} for this range`,
          onClick: () => void handleEventChange(homeEvent),
        }
      : {
          label: "All events →",
          title: "See every event for this range",
          onClick: () => void scopeMultiEvent.onAll(),
        };
  const primaryScopeLabels = {
    events: scopeEventsLabel,
    sessions: scopeSessionsLabel,
    // Several (but not all) events show the first one's puzzle; all events show none.
    iconEvent: scopeEvents === ALL_EVENTS ? ALL_EVENTS : scopeEventList[0] || homeEvent,
    hideTags: isMultiEventScope,
  };

  // Solves | Time: Solves drops the date window (back to the last N solves),
  // Time opens this week.
  const handlePrimaryViewChange = (next) => {
    if (next === primaryScopeView) return;
    if (next === "solves") {
      setSelectedTimeDay("");
      void applyPrimaryDateRange("", "", {
        onApply: () => {
          setPreferRawDateRangeView(false);
          setCurrentPage(0);
        },
      });
      return;
    }
    const overall = getDefaultOverallRange(sessionsList);
    setSelectedTimeDay("");
    void applyPrimaryDateRange(overall.start, overall.end, {
      onApply: () => {
        setPreferRawDateRangeView(false);
        setCurrentPage(0);
      },
    });
  };

  // Session | Overall: the two levels of the page. Session is one session (or
  // a picked group) counted back by solves; Overall is every event side by
  // side over a window of days. A picked group of events keeps both views.
  const primaryLevel = layoutViewMode === "time" ? "overall" : "session";
  const handlePrimaryLevelChange = (next) => {
    if (next === primaryLevel) return;
    if (next === "overall") {
      if (statsViewMode === "time") {
        handlePrimaryViewChange("time");
        return;
      }
      zoomOutScopeRef.current = { events: scopeEvents, sessions: scopeSessions };
      void applyScope({
        events: ALL_EVENTS,
        sessions: { mode: "main", keys: [] },
        range: getDefaultOverallRange(sessionsList),
      });
      return;
    }
    if (scopeEvents === ALL_EVENTS) {
      const previous = zoomOutScopeRef.current;
      zoomOutScopeRef.current = null;
      void applyScope({
        events: previous?.events || [homeEvent],
        sessions: previous?.sessions || makeInitialScopeSessions(currentEvent, currentSession),
        range: "solves",
      });
      return;
    }
    handlePrimaryViewChange("solves");
  };
  // Overall → one event: its main session, last N solves.
  const handleOverallEventSelect = (eventKey) => {
    const ev = String(eventKey || "").toUpperCase();
    if (!ev) return;
    void applyScope({ events: [ev], sessions: { mode: "main", keys: [] }, range: "solves" });
  };
  const compareScopeView =
    effectiveCompareDateFilterStart || effectiveCompareDateFilterEnd ? "time" : "solves";
  const applyCompareDateRange = (nextStart, nextEnd) => {
    if (linkStatsControls) {
      void applyPrimaryDateRange(nextStart, nextEnd);
      return;
    }
    setCompareDateFilterStart(nextStart);
    setCompareDateFilterEnd(nextEnd);
  };
  const handleCompareTimePreset = (preset) => {
    const range = getTimePresetRange(preset);
    applyCompareDateRange(range.start, range.end);
  };
  const handleCompareViewChange = (next) => {
    if (next === compareScopeView) return;
    if (linkStatsControls) {
      handlePrimaryViewChange(next);
      return;
    }
    if (next === "solves") applyCompareDateRange("", "");
    else handleCompareTimePreset("week");
  };

  const primaryBackChip =
    rawRangeViewActive && statsViewMode === "standard"
      ? {
          label: canStepBackInStatsHistory ? "Back" : "All time",
          title: canStepBackInStatsHistory ? "Back to the previous stats view" : "Show all-time day summaries",
          onClick: handleStatsRangeBack,
        }
      : null;
  // Small nav row above the selector (setting: statsNavButtonsEnabled).
  const statsNavChips = [
    primaryBackChip ? { ...primaryBackChip, key: "back", label: `← ${primaryBackChip.label}` } : null,
    compareEnabled || readOnly ? null : { ...primaryViewSwitchChip, key: "view" },
  ].filter(Boolean);
  const showStatsNavRow = settings?.statsNavButtonsEnabled === true && statsNavChips.length > 0;

  const useSharedCompareRail = compareEnabled && statsViewMode === "standard";
  // Clicking an overview card that is already on the all-time range drops back to recent solves.
  const isPrimaryAllTimeRange =
    statsViewMode === "standard" && dateFilterStart === ALL_TIME_START_DAY && !!dateFilterEnd;
  const isCompareAllTimeRange =
    compareDateFilterStart === ALL_TIME_START_DAY && !!compareDateFilterEnd;
  const handleExitPrimaryOverview = () => {
    void applyPrimaryDateRange("", "");
  };
  const showCompareOverviewMini = useSharedCompareRail && !isAllEventsMode;

  const statsContainerVars = getStatsContainerVars(settings, profileChartStyle?.primary || "#2EC4B6");
  // The top selector + overview cards have their own fill toggle.
  const statsTopBarFill = settings?.statsTopBarBackground === true;
  if (!statsTopBarFill) {
    statsContainerVars["--stats-overview-mini-bg"] = "transparent";
  }

  return (
    <div
      className={`Page statsPageRoot ${statsTopBarFill ? "statsPageRoot--topBarFill" : ""} ${
        settings?.statsHoverGrow === true ? "statsPageRoot--hoverGrow" : ""
      }`}
      style={{
        "--stats-profile-accent": profileChartStyle?.primary || "#2EC4B6",
        "--stats-profile-accent-soft": `${profileChartStyle?.primary || "#2EC4B6"}22`,
        "--stats-profile-accent-strong": `${profileChartStyle?.primary || "#2EC4B6"}7a`,
        ...statsContainerVars,
      }}
    >
      {showStatsNavRow ? (
        <div className="statsNavRow">
          {statsNavChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="statsNavChip"
              onClick={chip.onClick}
              title={chip.title}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={`statsTopBar ${statsViewMode === "standard" ? "statsTopBar--standard" : ""} ${
          canCompare && !compareEnabled ? "statsTopBar--addable" : ""
        }`}
      >
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
                dateSummary: primaryDateSummary,
                scopeModalKey: "primary",
                scopeLabels: compareEnabled ? null : primaryScopeLabels,
                view: compareEnabled && statsViewMode !== "time" ? null : primaryLevel,
                onViewChange: handlePrimaryLevelChange,
                // All events steps back into a single session; a picked group stays a group.
                sessionViewLabel:
                  statsViewMode === "time" && scopeEvents !== ALL_EVENTS ? "Sessions" : "Session",
              })}

              {compareEnabled &&
                renderScopeRow({
                  rowAccentColor: compareAccentColor,
                  eventValue: compareEvent,
                  sessionValue: compareSessionId,
                  sessionDisplay: compareSessionDisplay,
                  tagSelection: compareTagSelection,
                  tagPills: compareSelectedTagPills,
                  dateSummary: compareDateSummary,
                  loading: compareLoading,
                  scopeModalKey: "compare",
                })}
            </div>

            {useSharedCompareRail ? (
              <div className="statsCompareSharedRail" aria-label="Comparison controls">
                <button
                  type="button"
                  className="statsMiniBtn statsCompareRemoveBtn statsCompareRemoveBtn--outside"
                  onClick={() => handlePromoteCompareRow()}
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

        <div
          className={`statsTopIdentity statsTopIdentity--header ${
            showCompareOverviewMini ? "statsTopIdentity--dual" : ""
          }`}
        >
          <StatsSummaryOverviewMini
            overallSolves={stableOverallSolves}
            overallStats={canonicalOverallStats}
            allowOverallDerived={allowOverallDerivedMetrics}
            profileColor={primaryAccentColor}
            active={showAllActive || isAllTimeBucketOverview}
            disabled={!canShowAll && !isPrimaryAllTimeRange}
            loading={loadingAllSolves || primaryOverallSummaryLoading}
            onClick={
              showCompareOverviewMini
                ? () => handleOpenOverviewFromCompare("primary")
                : isPrimaryAllTimeRange
                  ? handleExitPrimaryOverview
                  : handleShowAll
            }
          />
          {showCompareOverviewMini ? (
            <StatsSummaryOverviewMini
              overallSolves={compareFilteredRawSolves}
              overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
              profileColor={compareStyle?.primary || "#7c8cff"}
              active={effectiveCompareShowAllActive || isCompareAllTimeBucketOverview}
              disabled={
                linkStatsControls
                  ? !canShowAll && !isPrimaryAllTimeRange
                  : !compareCanShowAll && !isCompareAllTimeRange
              }
              loading={compareLoading || compareSummaryLoading}
              onClick={() => handleOpenOverviewFromCompare("compare")}
            />
          ) : null}
        </div>

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
            </button>
          </div>
        )}
      </div>

            {renderTagScopeModal({
        isOpen: scopeModalState === "primary",
        title: compareEnabled ? "Scope A" : "Scope",
        subtitle: compareEnabled
          ? `${eventSelectLabel} · ${selectedSessionDisplay}`
          : `${scopeEventsLabel} · ${scopeSessionsLabel}`,
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
        // Compare rows are single-event, so the primary row only goes multi when alone.
        multiEvent: compareEnabled ? null : scopeMultiEvent,
        multiSession: compareEnabled ? null : scopeMultiSession,
        indexFrame: compareEnabled
          ? null
          : {
              active: !hasActiveDateFilter,
              n: statsViewMode === "time" ? multiIndexN : solvesPerPage,
              label: primaryDateSummary?.primary || "",
              isMulti: statsViewMode === "time",
              split: multiIndexSplit,
              onPick: handleSetIndexFrame,
              onSplit: (split) => {
                setMultiIndexSplit(split);
                if (hasActiveDateFilter) void applyPrimaryDateRange("", "");
              },
            },
        view: primaryScopeView,
        onViewChange: handlePrimaryViewChange,
        isMultiScope: statsViewMode === "time",
        rangeLabel: primaryDateSummary?.primary || "",
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
        view: compareScopeView,
        onViewChange: handleCompareViewChange,
        rangeLabel: compareDateSummary?.primary || "",
      })}

      <div className="stats-page">
        {viewedDayCompetitions.map((comp) => {
          const compSolveCount = chartVisibleSolves.filter(
            (solve) => (solve?.tags?.Competition || solve?.Tags?.Competition) === comp.CompetitionID
          ).length;
          const otherCount = chartVisibleSolves.length - compSolveCount;
          return (
            <button
              key={comp.CompetitionID}
              type="button"
              className="statsCompetitionBanner"
              onClick={() => handleCompetitionOpen(comp.CompetitionID)}
            >
              <span className="statsCompetitionBanner-badge">WCA</span>
              <span className="statsCompetitionBanner-text">
                <strong>{comp.Name || comp.CompetitionID}</strong>
                <span>
                  {[
                    comp.City,
                    compSolveCount
                      ? `${compSolveCount} competition solve${compSolveCount === 1 ? "" : "s"} here${
                          otherCount > 0 ? ` · ${otherCount} other` : ""
                        }`
                      : "Competition day",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="statsCompetitionBanner-cta">All competition results ›</span>
            </button>
          );
        })}
        <div
          className={`stats-grid stats-grid--figma ${layoutViewMode === "time" ? "stats-grid--time" : ""} ${
            showAllEventsTimeMatrixCard ? "" : "stats-grid--noEventMatrix"
          }`}
        >
          <div
            className={`stats-item stats-item--header stats-item--minh stats-item--headerSplit${
              layoutAllEvents || (!compareEnabled && layoutViewMode === "time") || (!compareEnabled && summaryLayout === "row")
                ? " stats-item--headerSplitSingle"
                : ""
            }${compareEnabled ? " stats-item--headerSplitSingle" : ""}`}
          >
            {!compareEnabled ? (
              layoutViewMode === "time" ? (
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
                    solveIndexOffset={summarySolveIndexOffset}
                    showCurrentMetrics={currentPage === 0}
                    viewMode={layoutViewMode}
                    summaryLayout={summaryLayout}
                    selectedDay={selectedTimeDay}
                    selectedTagPills={selectedTagPills}
                    summarySource="primary"
                    onStatSelect={handleSummaryStatSelect}
                    loading={primarySummaryLoading}
                  />
                </div>
              ) : layoutAllEvents ? (
                <div
                  className={`statsSummaryPanel statsCardShell ${primaryOverallSummaryLoading ? "is-loading" : ""}`}
                  aria-busy={primaryOverallSummaryLoading}
                  {...bindCardFocus(cardDefinitions[0]?.id)}
                >
                  <StatsSummary
                    hideOverall
                    solves={summaryCurrentSolves}
                    overallSolves={stableOverallSolves}
                    overallStats={canonicalOverallStats}
                    overviewOnly={isAllTimeBucketOverview}
                    bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                    bucketItems={useBucketBackedRange ? activeBucketItems : []}
                    allEventsBreakdown={layoutViewMode === "time" ? null : layoutAllEvents ? allEventsBreakdown : null}
                    eventBreakdownData={layoutViewMode === "time" ? timeViewEventBreakdownData : []}
                    allowOverallDerived={allowOverallDerivedMetrics}
                    mode={summaryMode}
                    selectedEvent={eventSelectLabel}
                    selectedSession={selectedSessionDisplay}
                    selectedTagLabel={selectedTagLabel}
                    selectedTagPills={selectedTagPills}
                    loadedSolveCount={loadedSolveCountForSummary}
                    solveIndexOffset={summarySolveIndexOffset}
                    showCurrentMetrics={currentPage === 0}
                    viewMode={layoutViewMode}
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
                      hideOverall
                      solves={summaryCurrentSolves}
                      overallSolves={stableOverallSolves}
                      overallStats={canonicalOverallStats}
                      overviewOnly={isAllTimeBucketOverview}
                      bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                      bucketItems={useBucketBackedRange ? activeBucketItems : []}
                      allEventsBreakdown={null}
                      eventBreakdownData={layoutViewMode === "time" ? timeViewEventBreakdownData : []}
                      allowOverallDerived={allowOverallDerivedMetrics}
                      mode={summaryMode}
                      selectedEvent={eventSelectLabel}
                      selectedSession={selectedSessionDisplay}
                      selectedTagLabel={selectedTagLabel}
                      selectedTagPills={selectedTagPills}
                      loadedSolveCount={loadedSolveCountForSummary}
                      solveIndexOffset={summarySolveIndexOffset}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={layoutViewMode}
                      summaryLayout={summaryLayout}
                      selectedDay={selectedTimeDay}
                      profileColor={primaryAccentColor}
                      summarySource="primary"
                      toneColor={primarySummaryToneColor}
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
                      eventBreakdownData={layoutViewMode === "time" ? timeViewEventBreakdownData : []}
                      mode={summaryMode}
            loadedSolveCount={loadedSolveCountForSummary}
            solveIndexOffset={summarySolveIndexOffset}
            showCurrentMetrics={currentPage === 0}
            viewMode={layoutViewMode}
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
            solveIndexOffset={summarySolveIndexOffset}
            onStatSelect={handleSummaryStatSelect}
            profileColor={primaryAccentColor}
                      loading={primaryOverallSummaryLoading}
            showWorstOverview={showAllActive || isAllTimeBucketOverview}
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
                        hideOverall
                        solves={summaryCurrentSolves}
                        overallSolves={stableOverallSolves}
                        overallStats={canonicalOverallStats}
                        overviewOnly={isAllTimeBucketOverview}
                        bucketSummary={useBucketBackedRange ? activeBucketSummary : null}
                        bucketItems={useBucketBackedRange ? activeBucketItems : []}
                        allEventsBreakdown={null}
                        eventBreakdownData={layoutViewMode === "time" ? timeViewEventBreakdownData : []}
                        allowOverallDerived={allowOverallDerivedMetrics}
                        mode={summaryMode}
                        selectedEvent={eventSelectLabel}
                        selectedSession={selectedSessionDisplay}
                        selectedTagLabel={selectedTagLabel}
                        selectedTagPills={selectedTagPills}
                        loadedSolveCount={loadedSolveCountForSummary}
                        solveIndexOffset={summarySolveIndexOffset}
                        showCurrentMetrics={currentPage === 0}
                        viewMode={layoutViewMode}
                        summaryLayout={summaryLayout}
                        selectedDay={selectedTimeDay}
                        summarySource="primary"
                        toneColor={primarySummaryToneColor}
                        rival={summaryRivalTonesActive ? compareSummaryRival : null}
                        onStatSelect={handleSummaryStatSelect}
                        profileColor={primaryAccentColor}
                        loading={primaryOverallSummaryLoading}
                        showWorstOverview={showAllActive || isAllTimeBucketOverview}
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
                        eventBreakdownData={layoutViewMode === "time" ? timeViewEventBreakdownData : []}
                        mode={summaryMode}
                      loadedSolveCount={loadedSolveCountForSummary}
                      solveIndexOffset={summarySolveIndexOffset}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={layoutViewMode}
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
                        solveIndexOffset={summarySolveIndexOffset}
                        onStatSelect={handleSummaryStatSelect}
                        profileColor={primaryAccentColor}
                        loading={primaryOverallSummaryLoading}
                        showWorstOverview={showAllActive || isAllTimeBucketOverview}
                      />
                    </div>
                      </>
                    )}
                  </div>
                </div>

                {!layoutAllEvents && (
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
                          hideOverall
                          solves={compareVisiblePageFilteredRawSolves}
                          overallSolves={compareFilteredRawSolves}
                          overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                          overviewOnly={isCompareAllTimeBucketOverview}
                          bucketSummary={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                          bucketItems={useCompareBucketBackedRange ? activeCompareBucketItems : []}
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
                          toneColor={compareAccentColor}
                          rival={primarySummaryRival}
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
                            overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                            bucketSummary={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
                            bucketItems={useCompareBucketBackedRange ? activeCompareBucketItems : []}
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
                            overallStats={useCompareBucketBackedRange ? activeCompareBucketSummary : null}
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

          {showAllEventsTimeMatrixCard && (
            <div className="stats-item stats-item--eventMatrix statsCardShell">
              <AllEventsTimeMatrix
                items={timeViewEventMatrixItems}
                loading={
                  hasActiveDateFilter && !isAllTimeDateFilter
                    ? loadingTimeScope
                    : loadingEventMatrixStats
                }
                mainOnly={timeViewMainSessionsOnly}
                onToggleMainOnly={(mainOnly) =>
                  void applyScope({ sessions: { mode: mainOnly ? "main" : "all", keys: [] } })
                }
                onStatSelect={handleEventMatrixStatSelect}
                onEventSelect={handleOverallEventSelect}
              />
            </div>
          )}

          {showSolveCharts && (
            <>
              <div
                className={`stats-item stats-item--line stats-item--minh statsCardShell ${layoutViewMode === "time" ? "stats-item--lineWide" : ""} ${chartCardsLoading ? "is-loading" : ""}`}
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
                            solves: useCompareBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                            bucketItems: useCompareBucketBackedRange ? activeCompareBucketItems : [],
                            style: compareStyle,
                          },
                        ]
                      : []
                  }
                  seriesStyle={primaryCompareStyle}
                  legendItems={compareLegendItems}
                  title={buildStatCardTitle(cardTitleEventLabel || eventSelectLabel, cardTitleSessionLabel || selectedSessionDisplay)}
                  titleDate={lineChartTitleDate}
                  titleIndexRange={lineChartTitleIndexRange}
                  solveIndexOffset={lineChartSolveIndexOffset}
                  deleteTime={handleDeleteSolve}
                  addPost={addPost}
                  setSessions={statsSetSessions}
                  sessionsList={sessionsList}
                  currentEvent={statsEvent}
                  currentSession={sessionId}
                  eventKey={statsEvent}
                  practiceMode={false}
                  viewMode={layoutViewMode}
                  selectedDay={selectedTimeDay}
                  onSelectedDayChange={setSelectedTimeDay}
                  onSolveOpen={openSolveDetail}
                  onBucketSelect={handleBucketDaySelect}
                  {...bulkTagEditorProps}
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

              {layoutViewMode !== "time" && (
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
                              solves: useCompareBucketBackedRange ? [] : compareVisiblePageFilteredRawSolves,
                              histogramCounts: useCompareBucketBackedRange
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

              {layoutViewMode !== "time" && (
                <div
                  className={`stats-item stats-item--tagBreakdown statsCardShell ${chartCardsLoading ? "is-loading" : ""}`}
                  aria-busy={chartCardsLoading}
                >
                  <TagBreakdownPie
                    solves={tagBreakdownSolves}
                    tagConfig={safeTagConfig}
                    eventKey={statsEvent}
                    onSolveOpen={openSolveDetail}
                    filteredFields={activeTagFilterFields}
                    tagColors={tagBreakdownTagColors}
                    aggregateItems={tagBreakdownAggregateItems}
                    aggregateSummary={tagBreakdownAggregateItems ? activeBucketSummary : null}
                    profileColor={user?.Color || user?.color || "#2EC4B6"}
                    onBucketSolvesOpen={openTagBucketSolves}
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
                {tableUsesBucketRange ? (
                  <BucketTable
                    profileColor={user?.Color || user?.color}
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
                    competitions={wcaCompetitions}
                    onCompetitionOpen={handleCompetitionOpen}
                  />
                ) : (
                  <TimeTable
                    user={user}
                    solves={
                      compareEnabled && tableCompareView === "compare"
                        ? compareVisiblePageFilteredRawSolves
                        : layoutViewMode === "time"
                          ? timeViewFocusedSolves
                          : chartVisibleSolves
                    }
                    seriesStyle={compareEnabled && tableCompareView === "compare" ? compareStyle : primaryCompareStyle}
                    deleteTime={handleDeleteSolve}
                    addPost={addPost}
                    setSessions={statsSetSessions}
                    sessionsList={sessionsList}
                    currentEvent={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
                    currentSession={compareEnabled && tableCompareView === "compare" ? compareSessionId : sessionId}
                    eventKey={compareEnabled && tableCompareView === "compare" ? compareEvent : statsEvent}
                    practiceMode={false}
                    solveIndexOffset={compareEnabled && tableCompareView === "compare" ? null : tableSolveIndexOffset}
                    {...bulkTagEditorProps}
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
            if (solveRef) (tagBucketList ? tagBucketDeleteSolve : handleDeleteSolve)(solveRef);
          }}
          addPost={addPost}
          saveToProfile={saveToProfile}
          setSessions={tagBucketList ? tagBucketSetSessions : statsSetSessions}
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
        userID={readOnly ? null : user?.UserID}
        setSessions={statsSetSessions}
        sessionsList={sessionsList}
        onClose={() => setSelectedAverageDetail(null)}
        onSolveOpen={openSolveDetail}
      />

      <StatFocusModal
        isOpen={!!tagBucketList}
        title={tagBucketList ? `${tagBucketList.fieldLabel}: ${tagBucketList.label}` : ""}
        subtitle={
          tagBucketList
            ? tagBucketList.loading
              ? `Loading ${tagBucketList.expectedCount} solves…`
              : `${tagBucketVisibleSolves.length} ${tagBucketVisibleSolves.length === 1 ? "solve" : "solves"}${
                  readOnly ? "" : " · select solves to retag, move or delete them"
                }`
            : ""
        }
        modalClassName="statFocusModal--tagBucket"
        bodyClassName="statFocusBody--tagBucket"
        onClose={closeTagBucketSolves}
      >
        {tagBucketList?.error ? (
          <div className="statsSummaryEmpty">{tagBucketList.error}</div>
        ) : tagBucketList?.loading ? (
          <div className="statsSummaryEmpty">Loading solves…</div>
        ) : tagBucketList && !tagBucketVisibleSolves.length ? (
          <div className="statsSummaryEmpty">No solves left in this slice.</div>
        ) : tagBucketList ? (
          <TimeTable
            user={user}
            solves={tagBucketVisibleSolves}
            seriesStyle={primaryCompareStyle}
            deleteTime={tagBucketDeleteSolve}
            addPost={addPost}
            setSessions={tagBucketSetSessions}
            sessionsList={sessionsList}
            currentEvent={statsEvent}
            currentSession={sessionId}
            eventKey={statsEvent}
            practiceMode={false}
            showBulkControls={!readOnly}
            onSolveOpen={openSolveDetail}
            {...bulkTagEditorProps}
          />
        ) : null}
      </StatFocusModal>

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
            label: focusActionBusy === "profile" ? "Saving..." : "Save to Profile",
            onClick: handleShareFocusedCardToProfile,
            disabled:
              readOnly ||
              !focusedCard?.profileConfig ||
              !user?.UserID ||
              focusActionBusy !== "" ||
              typeof saveStatToProfile !== "function",
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
          eventOptions={baseEventOptions}
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
