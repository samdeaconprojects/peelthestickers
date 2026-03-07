// src/components/Stats/Stats.js
import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary from "./StatsSummary";
import BarChart from "./BarChart";

import {
  getSolvesBySession,
  getSolvesBySessionPage,
} from "../../services/getSolvesBySession";
import { getSessionStats } from "../../services/getSessionStats";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";

// ✅ NEW: import modal + batch import service
import ImportSolvesModal from "./ImportSolvesModal";
import { importSolvesBatch } from "../../services/importSolvesBatch";

// ✅ NEW: allow creating destination sessions for imports
import { createSession } from "../../services/createSession";

/* -------------------------------------------------------------------------- */
/*                              TAG/TIME HELPERS                              */
/* -------------------------------------------------------------------------- */

const TAG_NONE = "__none__";
const TAG_SHARED = "__shared__";
const TAG_IMPORTS = "__imports__";
const TAG_CUSTOM_PREFIX = "custom:"; // custom:<key>

const GROUP_RAW = "__raw__";
const GROUP_DAY = "day";
const GROUP_WEEK = "week";
const GROUP_MONTH = "month";
const GROUP_YEAR = "year";

function isFiniteDate(d) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

// ISO week start (Monday)
function startOfISOWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISO(d) {
  try {
    return d.toISOString();
  } catch {
    return "";
  }
}

function safeUpper(s) {
  return String(s || "").toUpperCase();
}

function solveHasSharedTag(tags) {
  if (!tags) return false;
  return !!(
    tags.IsShared ||
    tags.isShared ||
    tags.SharedID ||
    tags.sharedID ||
    tags.SharedIndex != null ||
    tags.sharedIndex != null
  );
}

function solveHasImportTag(tags) {
  if (!tags) return false;
  const src = String(tags.Source || tags.source || "").toLowerCase();
  return !!(
    tags.Imports ||
    tags.imports ||
    tags.Imported ||
    tags.imported ||
    tags.IsImport ||
    tags.isImport ||
    tags.IsImported ||
    tags.isImported ||
    tags.Import === true ||
    tags.import === true ||
    src === "import"
  );
}

function getTagValueForKey(solve, tagKey) {
  const tags = solve?.tags || solve?.Tags || {};
  if (!tags) return "";

  if (tagKey === "CubeModel") return String(tags.CubeModel || "");
  if (tagKey === "CrossColor") return String(tags.CrossColor || "");

  if (tagKey.startsWith(TAG_CUSTOM_PREFIX)) {
    const k = tagKey.slice(TAG_CUSTOM_PREFIX.length);
    const c = tags.Custom || tags.custom || {};
    const v = c?.[k];
    if (v == null) return "";
    return String(v);
  }

  // fallback: direct tag field
  const v = tags?.[tagKey];
  if (v == null) return "";
  return String(v);
}

function groupSolvesByPeriod(solves, grouping) {
  if (!Array.isArray(solves) || solves.length === 0) return [];
  if (!grouping || grouping === GROUP_RAW) return solves;

  const bucketMap = new Map();

  for (const s of solves) {
    const iso = s?.datetime;
    const d = new Date(iso);
    if (!isFiniteDate(d)) continue;

    let start;
    if (grouping === GROUP_DAY) start = startOfDay(d);
    else if (grouping === GROUP_WEEK) start = startOfISOWeek(d);
    else if (grouping === GROUP_MONTH) start = startOfMonth(d);
    else if (grouping === GROUP_YEAR) start = startOfYear(d);
    else start = d;

    const key = toISO(start);
    if (!key) continue;

    const entry = bucketMap.get(key) || {
      key,
      datetime: key,
      count: 0,
      sum: 0,
      validCount: 0,
      // keep representative fields so downstream components don't explode
      event: s?.event,
      scramble: "",
      penalty: null,
      note: "",
      tags: { Bucket: grouping },
      // keep earliest original time for compatibility
      originalTime: undefined,
    };

    entry.count += 1;

    const t = Number(s?.time);
    const isDNF = String(s?.penalty || "").toUpperCase() === "DNF";
    if (Number.isFinite(t) && t >= 0 && !isDNF) {
      entry.sum += t;
      entry.validCount += 1;
    }

    bucketMap.set(key, entry);
  }

  const out = Array.from(bucketMap.values())
    .map((b) => {
      const avg = b.validCount > 0 ? b.sum / b.validCount : null;
      return {
        time: avg == null ? 0 : avg, // keep numeric for charts
        scramble: "",
        event: b.event,
        penalty: b.validCount > 0 ? null : "DNF", // if all were DNF/invalid, mark bucket DNF-ish
        note: `(${b.count} solves)`,
        datetime: b.datetime,
        tags: b.tags,
        originalTime: b.originalTime,
        __bucketCount: b.count,
        __bucketValid: b.validCount,
      };
    })
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  return out;
}

function Stats({
  sessions,
  sessionsList = [],
  sessionStats,
  setSessions,
  currentEvent,
  currentSession,
  user,
  deleteTime,
  addPost,
}) {
  const DEFAULT_IN_VIEW = 100;
  const DEFAULT_PAGE_FETCH = 200;

  // -----------------------------
  // Local (Stats-only) event + session
  // -----------------------------
  const [statsEvent, setStatsEvent] = useState(currentEvent);
  const [statsSession, setStatsSession] = useState(currentSession || "main");

  const sessionId = useMemo(() => statsSession || "main", [statsSession]);

  // -----------------------------
  // ✅ NEW: Tag filter + time grouping
  // -----------------------------
  const [tagFilterKey, setTagFilterKey] = useState(TAG_NONE);
  const [tagFilterValue, setTagFilterValue] = useState("");
  const [timeGrouping, setTimeGrouping] = useState(GROUP_RAW);

  // -----------------------------
  // View controls
  // -----------------------------
  const [solvesPerPage, setSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [currentPage, setCurrentPage] = useState(0);

  // -----------------------------
  // Overall stats (SESSIONSTATS)
  // -----------------------------
  const [overallStatsForEvent, setOverallStatsForEvent] = useState(null);
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);

  // -----------------------------
  // Incremental paging state
  // -----------------------------
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves, setLoadingAllSolves] = useState(false);

  const [pageCursor, setPageCursor] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isAllLoaded, setIsAllLoaded] = useState(false);

  // Prevent late async responses from overwriting newer state
  const requestTokenRef = useRef(0);

  // -----------------------------
  // Session dropdown UI
  // -----------------------------
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const sessionMenuWrapRef = useRef(null);

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

  // -----------------------------
  // ✅ NEW: Import modal state
  // -----------------------------
  const [showImport, setShowImport] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  // -----------------------------
  // Normalize DynamoDB solve item into UI shape
  // -----------------------------
  const normalizeSolve = useCallback((item) => {
    if (item && item.datetime) return item; // already normalized

    return {
      time: item.Time,
      scramble: item.Scramble,
      event: item.Event,
      penalty: item.Penalty,
      note: item.Note || "",
      datetime: item.DateTime,
      tags: item.Tags || {},
      originalTime: item.OriginalTime ?? item.originalTime,
    };
  }, []);

  // ✅ FIX: memoize solves so hooks deps don't thrash
  const solves = useMemo(() => {
    return sessions?.[statsEvent] || [];
  }, [sessions, statsEvent]);

  // -----------------------------
  // Sessions available for dropdown (for this event)
  // -----------------------------
  const sessionsForEvent = useMemo(() => {
    const ev = String(statsEvent || "").toUpperCase();

    const list = (sessionsList || [])
      .filter((s) => String(s.Event || "").toUpperCase() === ev)
      .map((s) => ({
        SessionID: s.SessionID || "main",
        SessionName: s.SessionName || s.Name || s.SessionID || "main",
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
  }, [sessionsList, statsEvent]);

  // Ensure statsSession valid for this event
  useEffect(() => {
    const hasMain = sessionsForEvent.some((s) => s.SessionID === "main");
    const valid = sessionsForEvent.some((s) => s.SessionID === statsSession);
    if (!valid) {
      setStatsSession(hasMain ? "main" : (sessionsForEvent[0]?.SessionID || "main"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsEvent, sessionsForEvent]);

  // Sync when navigating with external event/session
  useEffect(() => {
    setStatsEvent(currentEvent);
    setStatsSession(currentSession || "main");

    setSolvesPerPage(DEFAULT_IN_VIEW);
    setCurrentPage(0);
    setPageCursor(null);
    setHasMoreOlder(false);
    setIsAllLoaded(false);

    // ✅ reset tag/time filters when external navigation happens
    setTagFilterKey(TAG_NONE);
    setTagFilterValue("");
    setTimeGrouping(GROUP_RAW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEvent, currentSession]);

  // -----------------------------
  // Load overall stats (SESSIONSTATS)
  // -----------------------------
  useEffect(() => {
    const userID = user?.UserID;
    if (!userID) {
      setOverallStatsForEvent(null);
      return;
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
  }, [user?.UserID, statsEvent, sessionId]);

  // -----------------------------
  // Initial solves load for statsEvent/sessionId
  // -----------------------------
  const loadInitialSolves = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;

    const myToken = ++requestTokenRef.current;
    setLoadingInitial(true);

    try {
      const { items, lastKey } = await getSolvesBySessionPage(
        userID,
        statsEvent,
        sessionId,
        DEFAULT_PAGE_FETCH,
        null
      );

      if (requestTokenRef.current !== myToken) return;

      const normalizedOldestToNewest = (items || [])
        .map(normalizeSolve)
        .reverse();

      setSessions((prev) => ({
        ...prev,
        [statsEvent]: normalizedOldestToNewest,
      }));

      setPageCursor(lastKey || null);
      setHasMoreOlder(!!lastKey);
      setIsAllLoaded(false);

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
  ]);

  useEffect(() => {
    if (!user?.UserID) return;
    loadInitialSolves();
  }, [user?.UserID, statsEvent, sessionId, loadInitialSolves]);

  // -----------------------------
  // Paging math (RAW solves paging stays the same)
  // -----------------------------
  const totalPages = useMemo(() => {
    const per = Math.max(1, solvesPerPage);
    return Math.max(1, Math.ceil((solves.length || 0) / per));
  }, [solves.length, solvesPerPage]);

  const maxPage = totalPages - 1;

  useEffect(() => {
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, maxPage]);

  const startIndex = useMemo(() => {
    return Math.max(0, solves.length - solvesPerPage * (currentPage + 1));
  }, [solves.length, solvesPerPage, currentPage]);

  const endIndex = useMemo(() => {
    return Math.max(
      0,
      Math.min(solves.length, solves.length - solvesPerPage * currentPage)
    );
  }, [solves.length, solvesPerPage, currentPage]);

  const solvesToDisplayRaw = useMemo(() => {
    const slice = solves.slice(startIndex, endIndex);
    return slice.map((solve, i) => ({
      ...solve,
      fullIndex: startIndex + i,
    }));
  }, [solves, startIndex, endIndex]);

  /* -------------------------------------------------------------------------- */
  /*                         ✅ NEW: TAG OPTIONS + FILTERING                    */
  /* -------------------------------------------------------------------------- */

  // Discover tag keys/values from ALL loaded solves for this event/session view.
  // (So the dropdowns are stable even when paging)
  const discoveredTagInfo = useMemo(() => {
    const info = {
      cubeModels: new Set(),
      crossColors: new Set(),
      customKeys: new Set(),
      customValuesByKey: new Map(), // key -> Set(values)
      hasAnyShared: false,
      hasAnyImports: false,
    };

    for (const s of solves || []) {
      const tags = s?.tags || s?.Tags || {};
      if (!tags) continue;

      const cm = tags.CubeModel;
      if (cm) info.cubeModels.add(String(cm));

      const cc = tags.CrossColor;
      if (cc) info.crossColors.add(String(cc));

      if (solveHasSharedTag(tags)) info.hasAnyShared = true;
      if (solveHasImportTag(tags)) info.hasAnyImports = true;

      const custom = tags.Custom || tags.custom || null;
      if (custom && typeof custom === "object") {
        for (const k of Object.keys(custom)) {
          info.customKeys.add(String(k));
          const v = custom[k];
          if (!info.customValuesByKey.has(k)) info.customValuesByKey.set(k, new Set());
          if (v != null) info.customValuesByKey.get(k).add(String(v));
        }
      }
    }

    return info;
  }, [solves]);

  const tagKeyOptions = useMemo(() => {
    const opts = [{ value: TAG_NONE, label: "All tags" }];

    // core tags
    opts.push({ value: "CubeModel", label: "Cube Model" });
    opts.push({ value: "CrossColor", label: "Cross Color" });

    // boolean tags (only show if we’ve seen them, but keep safe if not)
    opts.push({ value: TAG_SHARED, label: "Shared" });
    opts.push({ value: TAG_IMPORTS, label: "Imports" });

    // custom keys
    const custom = Array.from(discoveredTagInfo.customKeys || []).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    for (const k of custom) {
      opts.push({ value: `${TAG_CUSTOM_PREFIX}${k}`, label: `Tag: ${k}` });
    }

    return opts;
  }, [discoveredTagInfo.customKeys]);

  const tagValueOptions = useMemo(() => {
    // For Shared/Imports we don’t need a value dropdown
    if (tagFilterKey === TAG_NONE || tagFilterKey === TAG_SHARED || tagFilterKey === TAG_IMPORTS)
      return [];

    let values = [];
    if (tagFilterKey === "CubeModel") {
      values = Array.from(discoveredTagInfo.cubeModels || []);
    } else if (tagFilterKey === "CrossColor") {
      values = Array.from(discoveredTagInfo.crossColors || []);
    } else if (tagFilterKey.startsWith(TAG_CUSTOM_PREFIX)) {
      const k = tagFilterKey.slice(TAG_CUSTOM_PREFIX.length);
      const set = discoveredTagInfo.customValuesByKey.get(k);
      values = set ? Array.from(set) : [];
    }

    values.sort((a, b) => String(a).localeCompare(String(b)));

    return [{ value: "", label: "All" }, ...values.map((v) => ({ value: v, label: v }))];
  }, [
    tagFilterKey,
    discoveredTagInfo.cubeModels,
    discoveredTagInfo.crossColors,
    discoveredTagInfo.customValuesByKey,
  ]);

  // If the tagKey changes, reset value (so you don’t get stuck on a stale value)
  useEffect(() => {
    setTagFilterValue("");
  }, [tagFilterKey]);

  const filteredSolvesRaw = useMemo(() => {
    const arr = solvesToDisplayRaw || [];
    if (tagFilterKey === TAG_NONE) return arr;

    if (tagFilterKey === TAG_SHARED) {
      return arr.filter((s) => solveHasSharedTag(s?.tags || s?.Tags || {}));
    }

    if (tagFilterKey === TAG_IMPORTS) {
      return arr.filter((s) => solveHasImportTag(s?.tags || s?.Tags || {}));
    }

    // value-based tags
    const desired = String(tagFilterValue || "").trim();
    if (!desired) {
      // "All" values, but still require the tag to exist (so it actually filters)
      return arr.filter((s) => {
        const v = getTagValueForKey(s, tagFilterKey);
        return !!String(v || "").trim();
      });
    }

    return arr.filter((s) => {
      const v = getTagValueForKey(s, tagFilterKey);
      return String(v || "") === desired;
    });
  }, [solvesToDisplayRaw, tagFilterKey, tagFilterValue]);

  /* -------------------------------------------------------------------------- */
  /*                       ✅ NEW: TIME GROUPING (BUCKETS)                      */
  /* -------------------------------------------------------------------------- */

  const solvesToDisplay = useMemo(() => {
    // Apply tag filter first, then bucket/group
    const filtered = filteredSolvesRaw || [];
    return groupSolvesByPeriod(filtered, timeGrouping);
  }, [filteredSolvesRaw, timeGrouping]);

  // -----------------------------
  // Incremental “Older” fetch
  // -----------------------------
  const fetchNextOlderPage = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!hasMoreOlder || !pageCursor || loadingMore || loadingAllSolves) return;

    setLoadingMore(true);
    const myToken = ++requestTokenRef.current;

    try {
      const { items, lastKey } = await getSolvesBySessionPage(
        userID,
        statsEvent,
        sessionId,
        DEFAULT_PAGE_FETCH,
        pageCursor
      );

      if (requestTokenRef.current !== myToken) return;

      const pageOldestToNewest = (items || []).map(normalizeSolve).reverse();

      setSessions((prev) => {
        const existing = prev?.[statsEvent] || [];
        return {
          ...prev,
          [statsEvent]: [...pageOldestToNewest, ...existing],
        };
      });

      setPageCursor(lastKey || null);
      setHasMoreOlder(!!lastKey);
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
    loadingAllSolves,
    normalizeSolve,
    setSessions,
  ]);

  // -----------------------------
  // Top bar meta
  // -----------------------------
  const overallCount = useMemo(() => {
    return (
      overallStatsForEvent?.SolveCount ??
      overallStatsForEvent?.Count ??
      overallStatsForEvent?.TotalSolves ??
      overallStatsForEvent?.Solves ??
      overallStatsForEvent?.solveCount ??
      null
    );
  }, [overallStatsForEvent]);

  const showingCount = useMemo(() => {
    // after filtering/grouping, this is the displayed list count
    return solvesToDisplay?.length || 0;
  }, [solvesToDisplay]);

  const dateRangeText = useMemo(() => {
    if (!solvesToDisplay || solvesToDisplay.length === 0) return "";
    const first = solvesToDisplay[0]?.datetime;
    const last = solvesToDisplay[solvesToDisplay.length - 1]?.datetime;
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
  }, [solvesToDisplay]);

  // -----------------------------
  // Controls
  // -----------------------------
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

      // ✅ reset tag/time when switching event
      setTagFilterKey(TAG_NONE);
      setTagFilterValue("");
      setTimeGrouping(GROUP_RAW);
    },
    [DEFAULT_IN_VIEW]
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

      // ✅ reset tag/time when switching session
      setTagFilterKey(TAG_NONE);
      setTagFilterValue("");
      setTimeGrouping(GROUP_RAW);
    },
    [DEFAULT_IN_VIEW]
  );

  const handleDeleteSolve = useCallback(
    (fullIndex) => {
      // If you’re viewing grouped buckets, deleting doesn’t make sense.
      // We’ll only allow delete when RAW grouping is active.
      if (timeGrouping !== GROUP_RAW) return;

      setSessions((prev) => ({
        ...prev,
        [statsEvent]: (prev?.[statsEvent] || []).filter((_, i) => i !== fullIndex),
      }));
      deleteTime(statsEvent, fullIndex);
    },
    [setSessions, deleteTime, statsEvent, timeGrouping]
  );

  const handlePreviousPage = useCallback(async () => {
    if (currentPage < maxPage) {
      setCurrentPage((p) => Math.min(maxPage, p + 1));
      return;
    }

    if (hasMoreOlder && !loadingMore && !loadingAllSolves && !isAllLoaded) {
      const beforeLen = solves.length;
      await fetchNextOlderPage();

      setCurrentPage((p) => p + 1);

      setTimeout(() => {
        const afterLen = (sessions?.[statsEvent] || []).length;
        if (afterLen === beforeLen) {
          setCurrentPage((p) => Math.max(0, p - 1));
        }
      }, 0);
    }
  }, [
    currentPage,
    maxPage,
    hasMoreOlder,
    loadingMore,
    loadingAllSolves,
    isAllLoaded,
    fetchNextOlderPage,
    solves.length,
    sessions,
    statsEvent,
  ]);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const handleZoomIn = useCallback(() => {
    setSolvesPerPage((prev) => Math.max(50, prev - 50));
    setCurrentPage(0);
  }, []);

  const handleZoomOut = useCallback(async () => {
    if (solvesPerPage < solves.length) {
      setSolvesPerPage((prev) => Math.min(prev + 50, solves.length));
      setCurrentPage(0);
      return;
    }

    if (hasMoreOlder && !loadingMore && !loadingAllSolves && !isAllLoaded) {
      const beforeLen = solves.length;
      await fetchNextOlderPage();

      setTimeout(() => {
        const afterLen = (sessions?.[statsEvent] || []).length;
        if (afterLen > beforeLen) {
          setSolvesPerPage((prev) => Math.min(prev + 50, afterLen));
          setCurrentPage(0);
        }
      }, 0);
    }
  }, [
    solvesPerPage,
    solves.length,
    hasMoreOlder,
    loadingMore,
    loadingAllSolves,
    isAllLoaded,
    fetchNextOlderPage,
    sessions,
    statsEvent,
  ]);

  const handleShowAll = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;

    setLoadingAllSolves(true);
    const myToken = ++requestTokenRef.current;

    try {
      const fullItems = await getSolvesBySession(
        userID,
        statsEvent.toUpperCase(),
        sessionId
      );
      if (requestTokenRef.current !== myToken) return;

      const normalized = (fullItems || []).map(normalizeSolve);

      setSessions((prev) => ({
        ...prev,
        [statsEvent]: normalized,
      }));

      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, normalized.length));
      setCurrentPage(0);

      setIsAllLoaded(true);
      setHasMoreOlder(false);
      setPageCursor(null);
    } catch (err) {
      console.error("Failed to load all solves for Stats:", err);
    } finally {
      if (requestTokenRef.current === myToken) setLoadingAllSolves(false);
    }
  }, [user?.UserID, statsEvent, sessionId, normalizeSolve, setSessions, DEFAULT_IN_VIEW]);

  const handleRecomputeOverall = useCallback(async () => {
    if (!user?.UserID) return;

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
  }, [user?.UserID, statsEvent, sessionId]);

  /* -----------------------------
     ✅ NEW: helpers for import destinations
  ----------------------------- */

  const slugify = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");

  // creates a session for a given event, returns the sessionID
  const createImportSession = useCallback(
    async (evUpper, desiredName) => {
      const userID = user?.UserID;
      if (!userID) throw new Error("No user");

      const cleanEvent = String(evUpper || "").toUpperCase();
      const baseName = String(desiredName || "").trim() || `Import ${new Date().toLocaleString()}`;
      const sid = `import_${slugify(baseName)}_${Date.now()}`;

      // createSession has multiple signatures across your app; try the richer one first, then fall back
      try {
        await createSession(userID, cleanEvent, sid, baseName);
      } catch (e) {
        // fallback: old signature (userID, event, name)
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

  // -----------------------------
  // ✅ NEW: Import handler (writes to DB + updates local sessions)
  // -----------------------------
  const handleImportSolves = useCallback(
    async ({ parsedSolves, destination }) => {
      const userID = user?.UserID;
      if (!userID) return;

      // destination can be:
      //  - { kind: "existing", sessionID }
      //  - { kind: "new", sessionName }
      const destKind = destination?.kind || "existing";
      const destExistingID = destination?.sessionID ? String(destination.sessionID) : null;
      const destNewName = destination?.sessionName ? String(destination.sessionName) : "";

      // normalize input (keep per-solve event if present; csTimer can include it)
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

      // group by event (because Dynamo writes are event partitioned in your schema)
      const byEvent = new Map();
      for (const s of normalized) {
        const ev = s.event;
        if (!byEvent.has(ev)) byEvent.set(ev, []);
        byEvent.get(ev).push(s);
      }

      setImportBusy(true);
      try {
        const results = [];

        // If creating a NEW import session, you must create it per-event
        // because sessions are scoped to an event.
        for (const [ev, solvesForEv] of byEvent.entries()) {
          let destSessionForThisEvent = String(sessionId || "main");

          if (destKind === "existing") {
            destSessionForThisEvent = destExistingID || String(sessionId || "main");
          } else {
            // destKind === "new"
            destSessionForThisEvent = await createImportSession(ev, destNewName || `Import ${ev}`);
          }

          const res = await importSolvesBatch(userID, ev, destSessionForThisEvent, solvesForEv);
          results.push({ ev, destSessionForThisEvent, res });
        }

        // Update local UI sessions state for each event that got imported
        setSessions((prev) => {
          const next = { ...(prev || {}) };

          for (const { ev, res } of results) {
            const added = res?.addedSolves || [];

            const existing = next[ev] || [];
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

        // Refresh overall stats for CURRENT view only (statsEvent + chosen dest if existing, else keep current)
        try {
          const overallEv = String(statsEvent || "").toUpperCase();
          const overallSid =
            destKind === "existing"
              ? (destExistingID || String(sessionId || "main"))
              : String(sessionId || "main");

          const item = await getSessionStats(userID, overallEv, overallSid);
          setOverallStatsForEvent(item || null);
        } catch (_) {}

        setShowImport(false);
      } catch (e) {
        console.error("Import failed:", e);
        alert("Import failed. Check console for details.");
      } finally {
        setImportBusy(false);
      }
    },
    [user?.UserID, statsEvent, sessionId, setSessions, createImportSession]
  );

  // Button states
  const canOlder =
    currentPage < maxPage ||
    (hasMoreOlder && !loadingMore && !loadingAllSolves && !isAllLoaded);

  const canNewer = currentPage > 0;

  const canZoomIn = solvesPerPage > 50;
  const canZoomOut =
    (solves.length > 0 && solvesPerPage < solves.length) ||
    (hasMoreOlder && !loadingMore && !loadingAllSolves && !isAllLoaded);

  const canShowAll = !!user?.UserID && !loadingAllSolves && !isAllLoaded;

  const headerStatusText = useMemo(() => {
    if (loadingInitial) return "Loading solves…";
    if (loadingAllSolves) return "Loading ALL solves…";
    if (loadingMore) return "Loading older solves…";
    if (isAllLoaded) return "All solves loaded";
    if (hasMoreOlder) return "Showing recent solves (paged)";
    return "Showing recent solves";
  }, [loadingInitial, loadingAllSolves, loadingMore, isAllLoaded, hasMoreOlder]);

  return (
    <div className="Page statsPageRoot">
      <div className="statsTopBar">
        <div className="statsTopLeft">
          <select className="statsSelect" onChange={handleEventChange} value={statsEvent}>
            {Object.keys(sessions || {}).map((eventKey) => (
              <option key={eventKey} value={eventKey}>
                {eventKey === "333" ? "3x3" : eventKey}
              </option>
            ))}
          </select>

          <div className="statsSessionWrap" ref={sessionMenuWrapRef}>
            <button
              type="button"
              className="statsSessionBtn"
              onClick={() => setSessionMenuOpen((v) => !v)}
            >
              {statsSession || "main"} <span className="statsCaret">▼</span>
            </button>

            {sessionMenuOpen && (
              <div className="statsSessionMenu">
                {sessionsForEvent.length === 0 && (
                  <div className="statsSessionEmpty">No sessions</div>
                )}

                {sessionsForEvent.map((s) => {
                  const sid = s.SessionID || "main";
                  const name = s.SessionName || sid;
                  const active = sid === statsSession;

                  return (
                    <button
                      key={`sess-${sid}`}
                      type="button"
                      className={`statsSessionItem ${active ? "active" : ""}`}
                      onClick={() => handlePickSession(sid)}
                    >
                      <span className="check">{active ? "✓" : ""}</span>
                      <span className="label">{name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ✅ NEW: Tag filter */}
          <select
            className="statsSelect"
            value={tagFilterKey}
            onChange={(e) => setTagFilterKey(e.target.value)}
            title="Filter stats by tag"
          >
            {tagKeyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* ✅ NEW: Tag value (only when needed) */}
          {tagValueOptions.length > 0 && (
            <select
              className="statsSelect"
              value={tagFilterValue}
              onChange={(e) => setTagFilterValue(e.target.value)}
              title="Tag value"
            >
              {tagValueOptions.map((o) => (
                <option key={`${o.value}`} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {/* ✅ NEW: Time grouping */}
          <select
            className="statsSelect"
            value={timeGrouping}
            onChange={(e) => setTimeGrouping(e.target.value)}
            title="Group stats by time"
          >
            <option value={GROUP_RAW}>Raw</option>
            <option value={GROUP_DAY}>Day</option>
            <option value={GROUP_WEEK}>Week</option>
            <option value={GROUP_MONTH}>Month</option>
            <option value={GROUP_YEAR}>Year</option>
          </select>
        </div>

        <div className="statsTopMiddle">
          <div className="statsTopMeta">
            <span className="statsTopCount">
              {showingCount}
              {overallCount != null ? `/${overallCount}` : ""}
            </span>
            <span className="statsTopCountLabel">
              {timeGrouping === GROUP_RAW ? "solves" : "buckets"}
            </span>
          </div>

          {dateRangeText && <div className="statsTopRange">{dateRangeText}</div>}
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
            {loadingAllSolves ? "Loading…" : isAllLoaded ? "All Loaded" : "Show All"}
          </button>

          <button onClick={handleRecomputeOverall} disabled={loadingOverallStats}>
            {loadingOverallStats ? "Recomputing…" : "Recompute Overall"}
          </button>

          {/* ✅ NEW: Import button */}
          <button
            onClick={() => setShowImport(true)}
            disabled={!user?.UserID || importBusy}
            title={!user?.UserID ? "Sign in to import" : "Import solves into this session"}
          >
            {importBusy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      <div className="statsStatusLine">{headerStatusText}</div>

      <div className="stats-page">
        <div className={`stats-grid stats-grid--figma ${loadingInitial ? "stats-grid--loading" : ""}`}>
          {loadingInitial && <div className="statsLoadingOverlay">Loading…</div>}

          <div className="stats-item stats-item--header stats-item--minh">
            <StatsSummary solves={solvesToDisplay} overallStats={overallStatsForEvent} />
          </div>

          <div className="stats-item stats-item--line stats-item--minh">
            <LineChart
              solves={solvesToDisplay}
              title={`Current Avg: ${statsEvent}`}
              deleteTime={handleDeleteSolve}
              addPost={addPost}
            />
          </div>

          <div className="stats-item stats-item--percent stats-item--minh">
            <PercentBar solves={solvesToDisplay} title="Solves Distribution by Time" />
          </div>

          <div className="stats-item stats-item--bar stats-item--minh">
            <BarChart solves={solvesToDisplay} />
          </div>

          <div className="stats-item stats-item--table">
            <TimeTable
  user={user}
  solves={solvesToDisplay}
  deleteTime={handleDeleteSolve}
  addPost={addPost}
  setSessions={setSessions}
  sessionsList={sessionsList}
  currentEvent={statsEvent}
  currentSession={sessionId}
  eventKey={statsEvent}
  practiceMode={false}
/>
          </div>
        </div>
      </div>

      {/* ✅ NEW: Import modal */}
      {showImport && (
        <ImportSolvesModal
          event={String(statsEvent || "").toUpperCase()}
          sessionID={String(sessionId || "main")}
          onClose={() => setShowImport(false)}
          onImport={handleImportSolves}
          busy={importBusy}
          sessionsForEvent={sessionsForEvent}
          defaultDestination={{ kind: "new", sessionName: "" }}
        />
      )}
    </div>
  );
}

export default Stats;
