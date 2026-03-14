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

import { getSolvesBySession, getSolvesBySessionPage } from "../../services/getSolvesBySession";
import { getSolvesByTag } from "../../services/getSolvesByTag";
import { getSessionStats } from "../../services/getSessionStats";
import { getTagStats } from "../../services/getTagStats";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";
import { updateUser } from "../../services/updateUser";
import { getSolveWindowFromStart } from "../../services/getSolveWindow";

import ImportSolvesModal from "./ImportSolvesModal";
import { importSolvesBatch } from "../../services/importSolvesBatch";
import { createSession } from "../../services/createSession";
import DbStatusIndicator from "../Navigation/DbStatusIndicator";

/* -------------------------------------------------------------------------- */
/*                              TAG/TIME HELPERS                              */
/* -------------------------------------------------------------------------- */

const TAG_NONE = "__none__";

const ALL_EVENTS = "__all_events__";
const ALL_SESSIONS = "__all_sessions__";
const DEFAULT_HEATMAP_PALETTE = "default";
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

function getPaletteOptions() {
  return [
    { value: DEFAULT_HEATMAP_PALETTE, label: "Default" },
    ...Object.entries(COMPARE_PALETTES).map(([value, meta]) => ({
      value,
      label: meta.label,
    })),
  ];
}

function getSeriesStyle(paletteKey, fallbackKey = DEFAULT_PRIMARY_PALETTE) {
  const resolvedKey = paletteKey || fallbackKey || DEFAULT_PRIMARY_PALETTE;
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

function getTagValueForKey(solve, tagKey) {
  const tags = solve?.tags || solve?.Tags || {};
  if (!tags) return "";

  if (tagKey === "CubeModel") return String(tags.CubeModel || "");
  if (tagKey === "CrossColor") return String(tags.CrossColor || "");
  if (tagKey === "TimerInput") return String(tags.TimerInput || tags.InputType || "");

  const v = tags?.[tagKey];
  if (v == null) return "";
  return String(v);
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
  sessionStats,
  statsMutationTick = 0,
  setSessions,
  setUser,
  currentEvent,
  currentSession,
  user,
  deleteTime,
  addPost,
  onSettingsContextChange,
  recomputeRequest = 0,
  importRequest = 0,
}) {
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
  const [compareLoading, setCompareLoading] = useState(false);
  const compareRequestTokenRef = useRef(0);
  const compareSessionMenuWrapRef = useRef(null);

  const sessionId = useMemo(() => statsSession || "main", [statsSession]);

  const isAllEventsMode = statsEvent === ALL_EVENTS;
  const isAllSessionsMode = statsSession === ALL_SESSIONS;
  const isSolveLevelMode = !isAllEventsMode && !isAllSessionsMode;

  const [tagFilterKey, setTagFilterKey] = useState(TAG_NONE);
  const [tagFilterValue, setTagFilterValue] = useState("");
  const hasActiveTagFilter = tagFilterKey !== TAG_NONE;
  const hasSpecificTagFilter = hasActiveTagFilter && !!String(tagFilterValue || "").trim();

  const [solvesPerPage, setSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [currentPage, setCurrentPage] = useState(0);

  const [overallStatsForEvent, setOverallStatsForEvent] = useState(null);
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves, setLoadingAllSolves] = useState(false);
  const [loadingTimeScope, setLoadingTimeScope] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const [timeScopeSolves, setTimeScopeSolves] = useState([]);
  const [tagScopedSolves, setTagScopedSolves] = useState([]);
  const [timeScopeCacheKey, setTimeScopeCacheKey] = useState("");

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
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState("");
  const [focusActionMessage, setFocusActionMessage] = useState("");
  const [focusActionBusy, setFocusActionBusy] = useState("");
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedAverageDetail, setSelectedAverageDetail] = useState(null);
  const [tableCompareView, setTableCompareView] = useState("primary");
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

  const timeScopeSessionKey = useMemo(() => {
    return (sessionsList || [])
      .map((s) => `${String(s?.Event || "").toUpperCase()}|${String(s?.SessionID || "main")}`)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
  }, [sessionsList]);

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

  const activeStandardSolves = useMemo(() => {
    return hasSpecificTagFilter ? tagScopedSolves : selectedSessionSolves;
  }, [hasSpecificTagFilter, tagScopedSolves, selectedSessionSolves]);

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
  const compareTagKey = compareSelection?.tagKey || TAG_NONE;
  const compareTagValue = compareSelection?.tagValue || "";
  const compareStyle = useMemo(
    () => getSeriesStyle(compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE, DEFAULT_COMPARE_PALETTE),
    [compareSelection?.paletteKey]
  );
  const primaryCompareStyle = useMemo(
    () => getSeriesStyle(compareSelection?.primaryPaletteKey ?? primaryPaletteKey, DEFAULT_PRIMARY_PALETTE),
    [compareSelection?.primaryPaletteKey, primaryPaletteKey]
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

    setTagFilterKey(TAG_NONE);
    setTagFilterValue("");
    setSelectedTimeDay("");
  }, [currentEvent, currentSession]);

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

    if (hasSpecificTagFilter) {
      let cancelled = false;

      (async () => {
        try {
          setLoadingOverallStats(true);
          const item = await getTagStats(userID, {
            event: statsEvent,
            sessionID: isAllSessionsMode ? "" : sessionId,
            tagKey: tagFilterKey,
            tagValue: tagFilterValue,
          });
          if (!cancelled) setOverallStatsForEvent(item || null);
        } catch (e) {
          console.error("Failed to load TAGSTATS:", e);
          if (!cancelled) setOverallStatsForEvent(null);
        } finally {
          if (!cancelled) setLoadingOverallStats(false);
        }
      })();

      return () => {
        cancelled = true;
      };
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
    hasSpecificTagFilter,
    tagFilterKey,
    tagFilterValue,
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
    if (hasSpecificTagFilter) return;

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
    hasSpecificTagFilter,
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
        setTagScopedSolves([]);
        setSolvesPerPage(DEFAULT_IN_VIEW);
        setCurrentPage(0);
        return;
      }

      if (hasSpecificTagFilter) {
        const { items, lastKey } = await getSolvesByTag(userID, {
          tagKey: tagFilterKey,
          tagValue: tagFilterValue,
          event: String(statsEvent || "").toUpperCase(),
          sessionID: String(sessionId || "main"),
          limit: DEFAULT_PAGE_FETCH,
          hydrate: true,
          cursor: null,
        });

        if (requestTokenRef.current !== myToken) return;

        const normalizedOldestToNewest = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .reverse();

        setTagScopedSolves(normalizedOldestToNewest);
        setPageCursor(lastKey || null);
        setHasMoreOlder(!!lastKey);
        setIsAllLoaded(!lastKey);
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
    tagFilterKey,
    tagFilterValue,
    hasSpecificTagFilter,
    DEFAULT_PAGE_FETCH,
    DEFAULT_IN_VIEW,
    normalizeSolve,
    setSessions,
    isSolveLevelMode,
  ]);

  useEffect(() => {
    if (!user?.UserID) return;
    loadInitialSolves();
  }, [user?.UserID, statsEvent, sessionId, tagFilterKey, tagFilterValue, loadInitialSolves]);

  const loadTimeScopeSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return false;
    if (!timeScopeSessionKey) {
      setTimeScopeSolves([]);
      setTimeScopeCacheKey("");
      return false;
    }

    const cacheKey = `${userID}::${timeScopeSessionKey}`;
    if (timeScopeCacheKey === cacheKey && timeScopeSolves.length > 0) return true;

    setLoadingTimeScope(true);

    try {
      const results = await Promise.all(
        (sessionsList || []).map(async (session) => {
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
    sessionsList,
    timeScopeCacheKey,
    timeScopeSessionKey,
    timeScopeSolves.length,
    user?.UserID,
  ]);

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

  const discoveredTagInfo = useMemo(() => {
    const info = {
      cubeModels: new Set(),
      crossColors: new Set(),
      timerInputs: new Set(),
    };

    for (const s of selectedSessionSolves || []) {
      const tags = s?.tags || s?.Tags || {};
      if (!tags) continue;

      if (tags.CubeModel) info.cubeModels.add(String(tags.CubeModel));
      if (tags.CrossColor) info.crossColors.add(String(tags.CrossColor));
      if (tags.TimerInput || tags.InputType) {
        info.timerInputs.add(String(tags.TimerInput || tags.InputType));
      }
    }

    return info;
  }, [selectedSessionSolves]);

  const compareDiscoveredTagInfo = useMemo(() => {
    const info = {
      cubeModels: new Set(),
      crossColors: new Set(),
      timerInputs: new Set(),
    };

    for (const s of compareSessionSolves || []) {
      const tags = s?.tags || s?.Tags || {};
      if (!tags) continue;

      if (tags.CubeModel) info.cubeModels.add(String(tags.CubeModel));
      if (tags.CrossColor) info.crossColors.add(String(tags.CrossColor));
      if (tags.TimerInput || tags.InputType) {
        info.timerInputs.add(String(tags.TimerInput || tags.InputType));
      }
    }

    return info;
  }, [compareSessionSolves]);

  const tagKeyOptions = useMemo(() => {
    return [
      { value: TAG_NONE, label: "All tags" },
      { value: "CubeModel", label: "Cube Model" },
      { value: "CrossColor", label: "Cross Color" },
      { value: "TimerInput", label: "Timer Input" },
    ];
  }, []);

  const tagValueOptions = useMemo(() => {
    if (tagFilterKey === TAG_NONE) return [];

    let values = [];
    if (tagFilterKey === "CubeModel") {
      values = Array.from(discoveredTagInfo.cubeModels || []);
    } else if (tagFilterKey === "CrossColor") {
      values = Array.from(discoveredTagInfo.crossColors || []);
    } else if (tagFilterKey === "TimerInput") {
      values = Array.from(discoveredTagInfo.timerInputs || []);
    }

    values.sort((a, b) => String(a).localeCompare(String(b)));

    return [{ value: "", label: "All" }, ...values.map((v) => ({ value: v, label: v }))];
  }, [tagFilterKey, discoveredTagInfo]);

  const compareTagValueOptions = useMemo(() => {
    if (compareTagKey === TAG_NONE) return [];

    let values = [];
    if (compareTagKey === "CubeModel") {
      values = Array.from(compareDiscoveredTagInfo.cubeModels || []);
    } else if (compareTagKey === "CrossColor") {
      values = Array.from(compareDiscoveredTagInfo.crossColors || []);
    } else if (compareTagKey === "TimerInput") {
      values = Array.from(compareDiscoveredTagInfo.timerInputs || []);
    }

    values.sort((a, b) => String(a).localeCompare(String(b)));

    return [{ value: "", label: "All" }, ...values.map((v) => ({ value: v, label: v }))];
  }, [compareDiscoveredTagInfo, compareTagKey]);

  useEffect(() => {
    setTagFilterValue("");
  }, [tagFilterKey]);

  useEffect(() => {
    if (!compareEnabled || statsViewMode !== "standard" || !showSolveCharts || !user?.UserID) {
      setCompareSessionSolves([]);
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
        const items = await getSolvesBySession(user.UserID, compareEvent, compareSessionId);
        if (!active || compareRequestTokenRef.current !== requestId) return;

        const normalized = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          });

        setCompareSessionSolves(normalized);
      } catch (error) {
        if (!active || compareRequestTokenRef.current !== requestId) return;
        console.error("Failed to load compare solves:", error);
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
    compareSessionId,
    normalizeSolve,
    showSolveCharts,
    statsViewMode,
    user?.UserID,
  ]);

  useEffect(() => {
    if (statsViewMode !== "time") return;
    setSolvesPerPage(DEFAULT_IN_VIEW);
    setShowAllActive(false);
  }, [DEFAULT_IN_VIEW, statsViewMode, dateFilterStart, dateFilterEnd, statsEvent, statsSession]);

  const filterRawSolveList = useCallback(
    (arr) => {
      const input = Array.isArray(arr) ? arr : [];
      if (statsViewMode !== "time" && !isSolveLevelMode) return input;
      if (tagFilterKey === TAG_NONE) return input;

      if (!tagFilterValue) {
        return input.filter((s) => {
          const v = getTagValueForKey(s, tagFilterKey);
          return !!String(v || "").trim();
        });
      }

      return input.filter((s) => {
        const v = getTagValueForKey(s, tagFilterKey);
        return String(v || "") === String(tagFilterValue);
      });
    },
    [tagFilterKey, tagFilterValue, isSolveLevelMode, statsViewMode]
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

    const dateScoped = filterSolvesByDateRange(compareSessionSolves, dateFilterStart, dateFilterEnd);

    if (compareTagKey === TAG_NONE) return dateScoped;

    if (!compareTagValue) {
      return dateScoped.filter((solve) => !!String(getTagValueForKey(solve, compareTagKey) || "").trim());
    }

    return dateScoped.filter(
      (solve) => String(getTagValueForKey(solve, compareTagKey) || "") === String(compareTagValue)
    );
  }, [
    compareEnabled,
    compareSessionSolves,
    compareTagKey,
    compareTagValue,
    dateFilterEnd,
    dateFilterStart,
  ]);

  const compareStartIndex = useMemo(() => {
    return Math.max(0, compareFilteredRawSolves.length - solvesPerPage * (currentPage + 1));
  }, [compareFilteredRawSolves.length, currentPage, solvesPerPage]);

  const compareEndIndex = useMemo(() => {
    return Math.max(
      0,
      Math.min(compareFilteredRawSolves.length, compareFilteredRawSolves.length - solvesPerPage * currentPage)
    );
  }, [compareFilteredRawSolves.length, currentPage, solvesPerPage]);

  const compareVisiblePageFilteredRawSolves = useMemo(() => {
    return compareFilteredRawSolves.slice(compareStartIndex, compareEndIndex);
  }, [compareEndIndex, compareFilteredRawSolves, compareStartIndex]);

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
    if (statsViewMode !== "time") return visiblePageFilteredRawSolves;
    if (showAllActive) return allLoadedFilteredRawSolves;
    const total = allLoadedFilteredRawSolves.length;
    const limit = Math.max(DEFAULT_IN_VIEW, solvesPerPage);
    return allLoadedFilteredRawSolves.slice(Math.max(0, total - limit));
  }, [
    DEFAULT_IN_VIEW,
    allLoadedFilteredRawSolves,
    showAllActive,
    solvesPerPage,
    statsViewMode,
    visiblePageFilteredRawSolves,
  ]);

  const timeViewLineSolves = useMemo(() => {
    return statsViewMode === "time" ? allLoadedFilteredRawSolves : chartVisibleSolves;
  }, [allLoadedFilteredRawSolves, chartVisibleSolves, statsViewMode]);

  const comparisonPrimarySolves = useMemo(() => {
    return compareEnabled ? visiblePageFilteredRawSolves : [];
  }, [compareEnabled, visiblePageFilteredRawSolves]);

  useEffect(() => {
    if (!compareEnabled && tableCompareView !== "primary") {
      setTableCompareView("primary");
    }
  }, [compareEnabled, tableCompareView]);

  const fetchNextOlderPage = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;
    if (!hasMoreOlder || !pageCursor || loadingMore) return;

    setLoadingMore(true);
    const myToken = ++requestTokenRef.current;

    try {
      if (hasSpecificTagFilter) {
        const { items, lastKey } = await getSolvesByTag(userID, {
          tagKey: tagFilterKey,
          tagValue: tagFilterValue,
          event: String(statsEvent || "").toUpperCase(),
          sessionID: String(sessionId || "main"),
          limit: DEFAULT_PAGE_FETCH,
          hydrate: true,
          cursor: pageCursor,
        });

        if (requestTokenRef.current !== myToken) return;

        const pageOldestToNewest = (items || [])
          .map(normalizeSolve)
          .filter(Boolean)
          .reverse();

        setTagScopedSolves((prev) =>
          [...pageOldestToNewest, ...(Array.isArray(prev) ? prev : [])].sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          })
        );

        setPageCursor(lastKey || null);
        setHasMoreOlder(!!lastKey);
        setIsAllLoaded(!lastKey);
        return;
      }

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
    hasSpecificTagFilter,
    tagFilterKey,
    tagFilterValue,
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

  const loadAllTagSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return false;
    if (!isSolveLevelMode || !hasSpecificTagFilter) return false;

    setLoadingAllSolves(true);
    const myToken = ++requestTokenRef.current;

    try {
      let cursor = null;
      const all = [];

      do {
        const out = await getSolvesByTag(userID, {
          tagKey: tagFilterKey,
          tagValue: tagFilterValue,
          event: String(statsEvent || "").toUpperCase(),
          sessionID: String(sessionId || "main"),
          limit: 1000,
          hydrate: true,
          cursor,
        });
        if (requestTokenRef.current !== myToken) return false;
        if (out?.items?.length) all.push(...out.items);
        cursor = out?.lastKey || null;
      } while (cursor);

      const normalized = all.map(normalizeSolve).filter(Boolean).reverse();
      setTagScopedSolves(normalized);
      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, normalized.length));
      setCurrentPage(0);
      setIsAllLoaded(true);
      setHasMoreOlder(false);
      setPageCursor(null);
      setShowAllActive(true);
      return true;
    } catch (err) {
      console.error("Failed to load all tagged solves for Stats:", err);
      return false;
    } finally {
      if (requestTokenRef.current === myToken) setLoadingAllSolves(false);
    }
  }, [
    DEFAULT_IN_VIEW,
    hasSpecificTagFilter,
    isSolveLevelMode,
    normalizeSolve,
    sessionId,
    statsEvent,
    tagFilterKey,
    tagFilterValue,
    user?.UserID,
  ]);

  const allEventsBreakdown = useMemo(() => {
    return getAllEventsBreakdownFromSessionsList(sessionsList);
  }, [sessionsList]);

  const allEventsOverall = useMemo(() => {
    return aggregateStatsList(allEventsBreakdown.map((row) => row.stats));
  }, [allEventsBreakdown]);
  const useCachedOverallStats =
    statsViewMode === "standard" && !hasActiveDateFilter && (!hasActiveTagFilter || hasSpecificTagFilter);
  const effectiveOverallStats = useCachedOverallStats ? overallStatsForEvent : null;
  const allowOverallDerivedMetrics =
    statsViewMode === "time" || !effectiveOverallStats || showAllActive || isAllLoaded;

  useEffect(() => {
    if (!hasActiveDateFilter) return;
    if (statsViewMode !== "standard") return;
    if (!isSolveLevelMode) return;
    if (isAllLoaded || loadingAllSolves) return;

    if (hasSpecificTagFilter) {
      loadAllTagSolves();
      return;
    }

    loadAllSessionSolves();
  }, [
    hasActiveDateFilter,
    hasSpecificTagFilter,
    isAllLoaded,
    isSolveLevelMode,
    loadAllTagSolves,
    loadAllSessionSolves,
    loadingAllSolves,
    statsViewMode,
  ]);

  const loadedSolveCountForSummary =
    statsViewMode === "time" ? allLoadedFilteredRawSolves.length : activeStandardSolves.length;

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

      setTagFilterKey(TAG_NONE);
      setTagFilterValue("");

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

      setTagFilterKey(TAG_NONE);
      setTagFilterValue("");

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
      tagKey: tagFilterKey !== TAG_NONE ? tagFilterKey : TAG_NONE,
      tagValue: tagFilterValue || "",
      paletteKey: DEFAULT_COMPARE_PALETTE,
      primaryPaletteKey,
    });
    setCompareSessionMenuOpen(false);
  }, [currentEvent, primaryPaletteKey, sessionId, statsEvent, tagFilterKey, tagFilterValue]);

  const handleRemoveCompareRow = useCallback(() => {
    setCompareSelection(null);
    setCompareSessionMenuOpen(false);
    setCompareSessionSolves([]);
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
      const today = getTodayLocalDayKey();
      setDateFilterStart((prev) => prev || today);
      setDateFilterEnd((prev) => prev || today);
      setTimeSelection((prev) => ({
        event: prev?.event && prev.event !== ALL_EVENTS ? prev.event : (standardSelection.event || currentEvent || "333"),
        session:
          prev?.session && prev.session !== ALL_SESSIONS
            ? prev.session
            : (standardSelection.session || currentSession || "main"),
      }));
      return;
    }

    setStandardSelection((prev) => ({
      event: prev?.event || currentEvent || "333",
      session: prev?.session || currentSession || "main",
    }));
  }, [currentEvent, currentSession, standardSelection.event, standardSelection.session]);

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
      setTagScopedSolves((prev) =>
        (Array.isArray(prev) ? prev : []).filter((s) => String(s?.solveRef || "") !== String(solveRef))
      );

      await deleteTime(statsEvent, solveRef);

      try {
        if (user?.UserID && !isAllEventsMode && !isAllSessionsMode) {
          setLoadingOverallStats(true);
          const item = hasSpecificTagFilter
            ? await getTagStats(user.UserID, {
                event: String(statsEvent || "").toUpperCase(),
                sessionID: String(sessionId || "main"),
                tagKey: tagFilterKey,
                tagValue: tagFilterValue,
              })
            : await getSessionStats(
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
      hasSpecificTagFilter,
      tagFilterKey,
      tagFilterValue,
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
    setSolvesPerPage((prev) => Math.max(50, prev - 50));
    setCurrentPage(0);
  }, [isSolveLevelMode]);

  const handleZoomOut = useCallback(async () => {
    if (!isSolveLevelMode) return;

    if (solvesPerPage < activeStandardSolves.length) {
      setSolvesPerPage((prev) => Math.min(prev + 50, activeStandardSolves.length));
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !isAllLoaded) {
      await fetchNextOlderPage();
      setSolvesPerPage((prev) => prev + 50);
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

    if (hasSpecificTagFilter) {
      await loadAllTagSolves();
      return;
    }

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
    hasSpecificTagFilter,
    isSolveLevelMode,
    loadTimeScopeSolves,
    loadAllTagSolves,
    loadAllSessionSolves,
    statsViewMode,
  ]);

  const handleRecomputeOverall = useCallback(async () => {
    if (!user?.UserID) return;
    if (isAllEventsMode || isAllSessionsMode) return;

    try {
      setLoadingOverallStats(true);
      const updated = await recomputeSessionStats(user.UserID, statsEvent, sessionId);

      if (updated) {
        setOverallStatsForEvent(updated);
      } else {
        const item = await getSessionStats(user.UserID, statsEvent, sessionId);
        setOverallStatsForEvent(item || null);
      }
    } catch (e) {
      console.error("Recompute overall stats failed:", e);
      try {
        const item = await getSessionStats(user.UserID, statsEvent, sessionId);
        setOverallStatsForEvent(item || null);
      } catch (e2) {
        console.error("Refetch after recompute failed:", e2);
      }
    } finally {
      setLoadingOverallStats(false);
    }
  }, [user?.UserID, statsEvent, sessionId, isAllEventsMode, isAllSessionsMode]);

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
        await createSession(userID, cleanEvent, sid, baseName);
      } catch (e) {
        try {
          await createSession(userID, cleanEvent, baseName);
        } catch (e2) {
          console.error("createImportSession failed:", e, e2);
          throw e2;
        }
      }

      return sid;
    },
    [user?.UserID]
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
            tags: s.tags || {},
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
            const item = await getSessionStats(userID, String(statsEvent || "").toUpperCase(), String(sessionId || "main"));
            setOverallStatsForEvent(item || null);
          } else {
            const aggregated = getEventAggregateFromSessionsList(sessionsList, statsEvent);
            setOverallStatsForEvent(aggregated || null);
          }
        } catch (_) {}

        setShowImport(false);
      } catch (e) {
        console.error("Import failed:", e);
        alert("Import failed. Check console for details.");
      } finally {
        setImportBusy(false);
        setImportProgress(null);
      }
    },
    [user?.UserID, statsEvent, sessionId, setSessions, createImportSession, isAllEventsMode, isAllSessionsMode, sessionsList]
  );

  const canOlder =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    (currentPage < maxPage || (hasMoreOlder && !loadingMore && !isAllLoaded));

  const canNewer = statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && currentPage > 0;
  const canZoomIn = statsViewMode === "standard" && isSolveLevelMode && !hasActiveDateFilter && solvesPerPage > 50;
  const canZoomOut =
    statsViewMode === "standard" &&
    isSolveLevelMode &&
    !hasActiveDateFilter &&
    ((activeStandardSolves.length > 0 && solvesPerPage < activeStandardSolves.length) ||
      (hasMoreOlder && !loadingMore && !isAllLoaded));
  const canShowAll =
    statsViewMode === "time"
      ? !!user?.UserID &&
        !loadingTimeScope &&
        !showAllActive &&
        (timeScopeSolves.length === 0 || chartVisibleSolves.length < allLoadedFilteredRawSolves.length)
      : isSolveLevelMode && !!user?.UserID && !loadingAllSolves && !showAllActive;

  const canRecomputeOverall =
    statsViewMode === "standard" &&
    !!user?.UserID &&
    !loadingOverallStats &&
    !isAllEventsMode &&
    !isAllSessionsMode &&
    !hasActiveDateFilter &&
    !hasActiveTagFilter;

  const headerStatusText = useMemo(() => {
    if (compareEnabled && statsViewMode === "standard") {
      if (compareLoading) return "Loading compare solves…";
      return "Comparing two filtered stat groups across the active date range";
    }
    if (statsViewMode === "time") {
      if (loadingTimeScope) return "Loading solves for time view…";
      if (chartVisibleSolves.length < allLoadedFilteredRawSolves.length) {
        return `Showing latest ${chartVisibleSolves.length} solves in the selected range`;
      }
      return hasActiveDateFilter
        ? "Time view across the selected date range"
        : "Time view across all loaded solves";
    }
    if (loadingInitial) return "Loading solves…";
    if (loadingAllSolves) return "Loading ALL solves…";
    if (hasSpecificTagFilter) return "Showing solves for the selected tag";
    if (hasActiveTagFilter) return "Showing loaded solves with the selected tag field";
    if (hasActiveDateFilter) return "Showing all solves in the selected date range";
    if (loadingMore) return "Loading older solves…";
    if (isAllEventsMode) return "Cached overall stats for all events";
    if (isAllSessionsMode) return `Cached overall stats for ${statsEvent}`;
    if (showAllActive) return "All solves loaded";
    if (isAllLoaded) return "Loaded solves currently in memory for this session";
    if (hasMoreOlder) return "";
    return "";
  }, [compareEnabled, compareLoading, statsViewMode, loadingTimeScope, chartVisibleSolves.length, allLoadedFilteredRawSolves.length, hasSpecificTagFilter, hasActiveTagFilter, hasActiveDateFilter, loadingInitial, loadingAllSolves, loadingMore, isAllEventsMode, isAllSessionsMode, statsEvent, showAllActive, isAllLoaded, hasMoreOlder]);

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
    if (!hasSpecificTagFilter) return "";
    const tagKeyLabel =
      tagKeyOptions.find((option) => option.value === tagFilterKey)?.label || tagFilterKey || "Tag";
    return `${tagKeyLabel}: ${tagFilterValue}`;
  }, [hasSpecificTagFilter, tagFilterKey, tagFilterValue, tagKeyOptions]);

  const compareSessionDisplay = useMemo(() => {
    const found = compareSessionsForEvent.find((s) => s.SessionID === compareSessionId);
    return found?.SessionName || compareSessionId || "main";
  }, [compareSessionId, compareSessionsForEvent]);

  const compareEventLabel = useMemo(() => {
    if (!compareEvent) return "";
    return compareEvent === "333" ? "3x3" : compareEvent;
  }, [compareEvent]);

  const compareTagLabel = useMemo(() => {
    if (!compareSelection || compareTagKey === TAG_NONE) return "All tags";
    const tagKeyLabel =
      tagKeyOptions.find((option) => option.value === compareTagKey)?.label || compareTagKey || "Tag";
    return compareTagValue ? `${tagKeyLabel}: ${compareTagValue}` : `${tagKeyLabel}: All`;
  }, [compareSelection, compareTagKey, compareTagValue, tagKeyOptions]);

  const compareLegendItems = useMemo(() => {
    if (!compareEnabled) return [];
    return [
      {
        id: "primary",
        label: `${eventSelectLabel} · ${selectedSessionDisplay}${selectedTagLabel ? ` · ${selectedTagLabel}` : ""}`,
        color: resolveSeriesColor(primaryCompareStyle, 0.5, "#2EC4B6"),
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
    primaryCompareStyle,
    selectedSessionDisplay,
    selectedTagLabel,
  ]);

  const primaryAccentColor = compareEnabled
    ? resolveSeriesColor(primaryCompareStyle, 0.5, "#2EC4B6")
    : "#2EC4B6";
  const compareAccentColor = resolveSeriesColor(compareStyle, 0.5, "#7c8cff");

  const compareSelectedTagSummaryLabel = useMemo(() => {
    if (!compareSelection || compareTagKey === TAG_NONE) return "";
    return compareTagLabel;
  }, [compareSelection, compareTagKey, compareTagLabel]);

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
          selection.scope === "overall" ? allLoadedFilteredRawSolves : visiblePageFilteredRawSolves;
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
        selection.scope === "overall" ? allLoadedFilteredRawSolves : visiblePageFilteredRawSolves;

      let solvesForWindow = null;
      const startSolveRef =
        selection.scope === "overall" && selection.variant === "best"
          ? overallStatsForEvent?.[spec.startField] ?? null
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
      visiblePageFilteredRawSolves,
    ]
  );

  const persistUserCollection = useCallback(
    async (field, nextValue) => {
      if (!user?.UserID) throw new Error("Missing user");
      await updateUser(user.UserID, { [field]: nextValue });
      setUser?.((prev) => ({ ...(prev || {}), [field]: nextValue }));
    },
    [setUser, user?.UserID]
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

  const renderScopeRow = ({
    rowLabel,
    rowAccentColor = "rgba(255,255,255,0.22)",
    eventValue,
    onEventChange,
    sessionValue,
    sessionDisplay,
    sessionItems,
    sessionMenuRef,
    sessionMenuOpenValue,
    onToggleSessionMenu,
    onPickSession,
    tagKeyValue,
    onTagKeyChange,
    tagValueValue,
    tagValueItems,
    onTagValueChange,
    showPalette = true,
    paletteValue,
    onPaletteChange,
    allowRemove = false,
    onRemove = null,
    loading = false,
  }) => (
    <div className={`statsScopeRow ${loading ? "is-loading" : ""}`}>
      <span
        className="statsScopeLabel"
        style={{
          borderColor: rowAccentColor,
          boxShadow: `inset 0 0 0 1px ${rowAccentColor}33`,
        }}
      >
        {rowLabel}
      </span>

      <select className="statsSelect" onChange={(e) => onEventChange(e.target.value)} value={eventValue}>
        {eventOptions.map((eventKey) => (
          <option key={`${rowLabel}-${eventKey}`} value={eventKey}>
            {eventKey === ALL_EVENTS ? "All Events" : eventKey === "333" ? "3x3" : eventKey}
          </option>
        ))}
      </select>

      {!isAllEventsMode && (
        <div className="statsSessionWrap" ref={sessionMenuRef}>
          <button type="button" className="statsSessionBtn" onClick={onToggleSessionMenu}>
            {sessionDisplay} <span className="statsCaret">▼</span>
          </button>

          {sessionMenuOpenValue && (
            <div className="statsSessionMenu">
              {sessionItems.length === 0 && <div className="statsSessionEmpty">No sessions</div>}

              {sessionItems.map((s) => {
                const sid = s.SessionID || "main";
                const name = s.SessionName || sid;
                const active = sid === sessionValue;

                return (
                  <button
                    key={`${rowLabel}-sess-${sid}`}
                    type="button"
                    className={`statsSessionItem ${active ? "active" : ""}`}
                    onClick={() => onPickSession(sid)}
                  >
                    <span className="check">{active ? "✓" : ""}</span>
                    <span className="label">{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <select
        className="statsSelect"
        value={tagKeyValue}
        onChange={(e) => onTagKeyChange(e.target.value)}
        title="Filter stats by tag"
      >
        {tagKeyOptions.map((o) => (
          <option key={`${rowLabel}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {tagValueItems.length > 0 && (
        <select
          className="statsSelect"
          value={tagValueValue}
          onChange={(e) => onTagValueChange(e.target.value)}
          title="Tag value"
        >
          {tagValueItems.map((o) => (
            <option key={`${rowLabel}-${o.value}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {showPalette && (
        <select
          className="statsSelect"
          value={paletteValue}
          onChange={(e) => onPaletteChange(e.target.value)}
          title="Series color style"
        >
          {paletteOptions.map((o) => (
            <option key={`${rowLabel}-palette-${o.value}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {allowRemove && (
        <button type="button" className="statsMiniBtn statsCompareRemoveBtn" onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div className="Page statsPageRoot">
      <div className="statsTopBar">
        <div className="statsTopLeft">
          <div className="statsViewToggle" role="group" aria-label="Stats view">
            <button
              type="button"
              className={`statsToggleBtn ${statsViewMode === "standard" ? "is-active" : ""}`}
              onClick={() => handleSetViewMode("standard")}
            >
              Standard
            </button>
            <button
              type="button"
              className={`statsToggleBtn ${statsViewMode === "time" ? "is-active" : ""}`}
              onClick={() => handleSetViewMode("time")}
            >
              Time View
            </button>
          </div>

          <div className="statsCompareControls" aria-label="Stats settings">
            {renderScopeRow({
              rowLabel: compareEnabled ? "A" : "Scope",
              rowAccentColor: primaryAccentColor,
              eventValue: statsEvent,
              onEventChange: (next) =>
                handleEventChange({
                  target: { value: next },
                }),
              sessionValue: statsSession,
              sessionDisplay: selectedSessionDisplay,
              sessionItems: sessionsForEvent,
              sessionMenuRef: sessionMenuWrapRef,
              sessionMenuOpenValue: sessionMenuOpen,
              onToggleSessionMenu: () => setSessionMenuOpen((v) => !v),
              onPickSession: handlePickSession,
              tagKeyValue: tagFilterKey,
              onTagKeyChange: setTagFilterKey,
              tagValueValue: tagFilterValue,
              tagValueItems: tagValueOptions,
              onTagValueChange: setTagFilterValue,
              showPalette: showSolveCharts,
              paletteValue: compareSelection?.primaryPaletteKey ?? primaryPaletteKey,
              onPaletteChange: (value) => {
                setPrimaryPaletteKey(value);
                setCompareSelection((prev) => (prev ? { ...prev, primaryPaletteKey: value } : prev));
              },
            })}

            {compareEnabled &&
              renderScopeRow({
                rowLabel: "B",
                rowAccentColor: compareAccentColor,
                eventValue: compareEvent,
                onEventChange: (next) => {
                  setCompareSessionMenuOpen(false);
                  updateCompareSelection({
                    event: next,
                    session: "main",
                    tagKey: TAG_NONE,
                    tagValue: "",
                  });
                },
                sessionValue: compareSessionId,
                sessionDisplay: compareSessionDisplay,
                sessionItems: compareSessionsForEvent,
                sessionMenuRef: compareSessionMenuWrapRef,
                sessionMenuOpenValue: compareSessionMenuOpen,
                onToggleSessionMenu: () => setCompareSessionMenuOpen((v) => !v),
                onPickSession: (sid) => {
                  setCompareSessionMenuOpen(false);
                  updateCompareSelection({ session: sid });
                },
                tagKeyValue: compareTagKey,
                onTagKeyChange: (value) => updateCompareSelection({ tagKey: value, tagValue: "" }),
                tagValueValue: compareTagValue,
                tagValueItems: compareTagValueOptions,
                onTagValueChange: (value) => updateCompareSelection({ tagValue: value }),
                paletteValue: compareSelection?.paletteKey || DEFAULT_COMPARE_PALETTE,
                onPaletteChange: (value) => updateCompareSelection({ paletteKey: value }),
                allowRemove: true,
                onRemove: handleRemoveCompareRow,
                loading: compareLoading,
              })}

            {canCompare && !compareEnabled && (
              <button type="button" className="statsAddCompareBtn" onClick={handleAddCompareRow}>
                + Compare another stat group
              </button>
            )}
          </div>
        </div>

        <div className="statsTopMiddle">
          <div className="statsTopMeta">
            <span className="statsTopCount">
              {showingCount}
              {overallCount != null && showSolveCharts ? `/${overallCount}` : ""}
            </span>
            <span className="statsTopCountLabel">
              {statsViewMode === "time"
                ? "in range"
                : isAllEventsMode
                  ? "cached solves"
                  : isAllSessionsMode
                    ? "event total"
                    : "visible/raw"}
            </span>
          </div>

          <div className={`statsDateControls ${dateEditorOpen ? "is-editing" : ""}`}>
            {!dateEditorOpen ? (
              <button
                type="button"
                className="statsDateDisplay"
                onClick={() => setDateEditorOpen(true)}
                title="Edit date range"
              >
                <span className="statsDateDisplayText">{dateFilterLabel}</span>
                <span className="statsDateDisplayHint">Edit</span>
              </button>
            ) : (
              <>
                <input
                  className="statsDateInput"
                  type="date"
                  value={dateFilterStart}
                  max={dateFilterEnd || undefined}
                  onChange={(e) => setDateFilterStart(e.target.value)}
                  aria-label="Start date"
                />
                <span className="statsDateDash">to</span>
                <input
                  className="statsDateInput"
                  type="date"
                  value={dateFilterEnd}
                  min={dateFilterStart || undefined}
                  onChange={(e) => setDateFilterEnd(e.target.value)}
                  aria-label="End date"
                />
                {(dateFilterStart || dateFilterEnd) && (
                  <button
                    type="button"
                    className="statsMiniBtn"
                    onClick={() => {
                      setDateFilterStart("");
                      setDateFilterEnd("");
                    }}
                  >
                    Clear
                  </button>
                )}
                <button type="button" className="statsMiniBtn" onClick={() => setDateEditorOpen(false)}>
                  Done
                </button>
              </>
            )}
          </div>

        </div>

        <div className="statsTopRight">
          <button onClick={handlePreviousPage} disabled={!canOlder}>
            {loadingMore ? "Loading…" : "Older ▲"}
          </button>

          <button onClick={handleNextPage} disabled={!canNewer}>
            Newer ▼
          </button>

          <button onClick={handleZoomIn} disabled={!canZoomIn}>
            Zoom +
          </button>

          <button onClick={handleZoomOut} disabled={!canZoomOut}>
            Zoom -
          </button>

          <button onClick={handleShowAll} disabled={!canShowAll}>
            {loadingAllSolves ? "Loading…" : showAllActive ? "All Loaded" : "Show All"}
          </button>
        </div>
      </div>

      {headerStatusText ? <div className="statsStatusLine">{headerStatusText}</div> : null}

      <div className="stats-page">
        <div className={`stats-grid stats-grid--figma ${(loadingInitial || loadingTimeScope) ? "stats-grid--loading" : ""}`}>
          {(loadingInitial || loadingTimeScope) && (
            <div className="statsLoadingOverlay" aria-label="Loading stats">
              <DbStatusIndicator status={{ phase: "loading", tick: Number(loadingInitial) + Number(loadingTimeScope) }} />
            </div>
          )}

          <div
            className={`stats-item stats-item--header stats-item--minh stats-item--headerSplit${
              isAllEventsMode ? " stats-item--headerSplitSingle" : ""
            }${compareEnabled ? " stats-item--headerSplitSingle" : ""}`}
          >
            {!compareEnabled ? (
              isAllEventsMode ? (
                <div className="statsSummaryPanel statsCardShell" {...bindCardFocus(cardDefinitions[0]?.id)}>
                  <StatsSummary
                    solves={visiblePageFilteredRawSolves}
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
                  />
                </div>
              ) : (
                <>
                  <div
                    className="statsSummaryPanel statsCardShell"
                    {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-current")?.id)}
                  >
                    <StatsSummaryCurrent
                      solves={visiblePageFilteredRawSolves}
                      overallStats={effectiveOverallStats}
                      allEventsBreakdown={null}
                      mode={summaryMode}
                      loadedSolveCount={loadedSolveCountForSummary}
                      showCurrentMetrics={currentPage === 0}
                      viewMode={statsViewMode}
                      selectedDay={selectedTimeDay}
                      onStatSelect={handleSummaryStatSelect}
                    />
                  </div>
                  <div
                    className="statsSummaryPanel statsCardShell"
                    {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-overall")?.id)}
                  >
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
                      className="statsSummaryPanel statsCardShell"
                      {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-current")?.id)}
                    >
                      <StatsSummaryCurrent
                        solves={visiblePageFilteredRawSolves}
                        overallStats={effectiveOverallStats}
                        allEventsBreakdown={null}
                        mode={summaryMode}
                        loadedSolveCount={loadedSolveCountForSummary}
                        showCurrentMetrics={currentPage === 0}
                        viewMode={statsViewMode}
                        selectedDay={selectedTimeDay}
                        onStatSelect={handleSummaryStatSelect}
                      />
                    </div>
                    <div
                      className="statsSummaryPanel statsCardShell"
                      {...bindCardFocus(cardDefinitions.find((item) => item.key === "summary-compare-primary-overall")?.id)}
                    >
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
                        className="statsSummaryPanel statsCardShell"
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
                        />
                      </div>
                      <div
                        className="statsSummaryPanel statsCardShell"
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
                className="stats-item stats-item--line stats-item--minh statsCardShell"
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
                className="stats-item stats-item--percent stats-item--minh statsCardShell"
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
                className="stats-item stats-item--bar stats-item--minh statsCardShell"
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
                className="stats-item stats-item--table statsCardShell"
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
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => {
            const solveRef = selectedSolve?.solveRef || null;
            if (solveRef) handleDeleteSolve(solveRef);
          }}
          addPost={addPost}
          setSessions={setSessions}
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
        <div className={`statFocusCanvas ${focusedCard?.key === "summary" ? "is-summary" : ""}`}>
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
