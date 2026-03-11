import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary from "./StatsSummary";
import BarChart from "./BarChart";

import { getSolvesBySession, getSolvesBySessionPage } from "../../services/getSolvesBySession";
import { getSessionStats } from "../../services/getSessionStats";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";

import ImportSolvesModal from "./ImportSolvesModal";
import { importSolvesBatch } from "../../services/importSolvesBatch";
import { createSession } from "../../services/createSession";

/* -------------------------------------------------------------------------- */
/*                              TAG/TIME HELPERS                              */
/* -------------------------------------------------------------------------- */

const TAG_NONE = "__none__";

const ALL_EVENTS = "__all_events__";
const ALL_SESSIONS = "__all_sessions__";

function isFiniteDate(d) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function minMaybe(a, b) {
  const aa = Number.isFinite(Number(a)) ? Number(a) : null;
  const bb = Number.isFinite(Number(b)) ? Number(b) : null;
  if (aa == null) return bb;
  if (bb == null) return aa;
  return Math.min(aa, bb);
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return String(a) > String(b) ? a : b;
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

  let bestSingleAt = null;
  let lastSolveAt = null;

  for (const s of items) {
    solveCountTotal += num(s.SolveCountTotal);
    solveCountIncluded += num(s.SolveCountIncluded);
    dnfCount += num(s.DNFCount);
    plus2Count += num(s.Plus2Count);
    sumFinalTimeMs += num(s.SumFinalTimeMs);

    bestSingleMs = minMaybe(bestSingleMs, s.BestSingleMs);
    bestMo3Ms = minMaybe(bestMo3Ms, s.BestMo3Ms);
    bestAo5Ms = minMaybe(bestAo5Ms, s.BestAo5Ms);
    bestAo12Ms = minMaybe(bestAo12Ms, s.BestAo12Ms);
    bestAo25Ms = minMaybe(bestAo25Ms, s.BestAo25Ms);
    bestAo50Ms = minMaybe(bestAo50Ms, s.BestAo50Ms);
    bestAo100Ms = minMaybe(bestAo100Ms, s.BestAo100Ms);
    bestAo1000Ms = minMaybe(bestAo1000Ms, s.BestAo1000Ms);

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
    BestMo3Ms: bestMo3Ms,
    BestAo5Ms: bestAo5Ms,
    BestAo12Ms: bestAo12Ms,
    BestAo25Ms: bestAo25Ms,
    BestAo50Ms: bestAo50Ms,
    BestAo100Ms: bestAo100Ms,
    BestAo1000Ms: bestAo1000Ms,
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

function Stats({
  sessions,
  sessionsList = [],
  sessionStats,
  statsMutationTick = 0,
  setSessions,
  currentEvent,
  currentSession,
  user,
  deleteTime,
  addPost,
}) {
  const DEFAULT_IN_VIEW = 500;
  const DEFAULT_PAGE_FETCH = 500;

  const [statsEvent, setStatsEvent] = useState(currentEvent || "333");
  const [statsSession, setStatsSession] = useState(currentSession || "main");

  const sessionId = useMemo(() => statsSession || "main", [statsSession]);

  const isAllEventsMode = statsEvent === ALL_EVENTS;
  const isAllSessionsMode = statsSession === ALL_SESSIONS;
  const isSolveLevelMode = !isAllEventsMode && !isAllSessionsMode;

  const [tagFilterKey, setTagFilterKey] = useState(TAG_NONE);
  const [tagFilterValue, setTagFilterValue] = useState("");

  const [solvesPerPage, setSolvesPerPage] = useState(DEFAULT_IN_VIEW);
  const [currentPage, setCurrentPage] = useState(0);

  const [overallStatsForEvent, setOverallStatsForEvent] = useState(null);
  const [loadingOverallStats, setLoadingOverallStats] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves, setLoadingAllSolves] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);

  const [pageCursor, setPageCursor] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isAllLoaded, setIsAllLoaded] = useState(false);

  const requestTokenRef = useRef(0);

  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const sessionMenuWrapRef = useRef(null);

  const [showImport, setShowImport] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [statsViewMode, setStatsViewMode] = useState("standard");
  const [selectedTimeDay, setSelectedTimeDay] = useState("");

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

  const eventOptions = useMemo(() => {
    const set = new Set();

    for (const k of Object.keys(sessions || {})) {
      if (k) set.add(String(k).toUpperCase());
    }

    for (const s of sessionsList || []) {
      if (s?.Event) set.add(String(s.Event).toUpperCase());
    }

    const values = Array.from(set).sort((a, b) => a.localeCompare(b));
    return [ALL_EVENTS, ...values];
  }, [sessions, sessionsList]);

  const solves = useMemo(() => {
    if (!isSolveLevelMode) return [];
    const ev = String(statsEvent || "").toUpperCase();
    const allForEvent = Array.isArray(sessions?.[ev]) ? sessions[ev] : [];

    return allForEvent.filter(
      (s) => String(s?.sessionID || s?.SessionID || "main") === String(sessionId || "main")
    );
  }, [sessions, statsEvent, sessionId, isSolveLevelMode]);

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

    return [
      {
        SessionID: ALL_SESSIONS,
        SessionName: "All Sessions",
        Stats: getEventAggregateFromSessionsList(sessionsList, ev),
      },
      ...deduped,
    ];
  }, [sessionsList, statsEvent, isAllEventsMode]);

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
    setStatsEvent(currentEvent || "333");
    setStatsSession(currentSession || "main");

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
  }, [user?.UserID, statsEvent, sessionId, sessionsList, isAllEventsMode, isAllSessionsMode]);

  const solveStatsRefreshKey = useMemo(() => {
    if (!isSolveLevelMode || !Array.isArray(solves) || solves.length === 0) return "";
    const first = solves[0];
    const latest = solves[solves.length - 1];
    const firstKey = String(first?.solveRef || first?.datetime || "");
    const lastKey = String(latest?.solveRef || latest?.datetime || "");
    return `${solves.length}|${firstKey}|${lastKey}`;
  }, [solves, isSolveLevelMode]);

  useEffect(() => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;

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
  }, [user?.UserID, statsEvent, sessionId, solveStatsRefreshKey, statsMutationTick, isSolveLevelMode]);

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

  const visiblePageRawSolves = useMemo(() => {
    return solves.slice(startIndex, endIndex).map((solve, i) => ({
      ...solve,
      fullIndex: startIndex + i,
    }));
  }, [solves, startIndex, endIndex]);

  const discoveredTagInfo = useMemo(() => {
    const info = {
      cubeModels: new Set(),
      crossColors: new Set(),
      timerInputs: new Set(),
    };

    for (const s of solves || []) {
      const tags = s?.tags || s?.Tags || {};
      if (!tags) continue;

      if (tags.CubeModel) info.cubeModels.add(String(tags.CubeModel));
      if (tags.CrossColor) info.crossColors.add(String(tags.CrossColor));
      if (tags.TimerInput || tags.InputType) {
        info.timerInputs.add(String(tags.TimerInput || tags.InputType));
      }
    }

    return info;
  }, [solves]);

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

  useEffect(() => {
    setTagFilterValue("");
  }, [tagFilterKey]);

  const filterRawSolveList = useCallback(
    (arr) => {
      const input = Array.isArray(arr) ? arr : [];
      if (!isSolveLevelMode) return input;
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
    [tagFilterKey, tagFilterValue, isSolveLevelMode]
  );

  const visiblePageFilteredRawSolves = useMemo(() => {
    return filterRawSolveList(visiblePageRawSolves);
  }, [visiblePageRawSolves, filterRawSolveList]);

  const allLoadedFilteredRawSolves = useMemo(() => {
    return filterRawSolveList(solves);
  }, [solves, filterRawSolveList]);

  const barChartSolves = useMemo(() => {
    return visiblePageFilteredRawSolves;
  }, [visiblePageFilteredRawSolves]);

  const pieChartSolves = useMemo(() => {
    return allLoadedFilteredRawSolves;
  }, [allLoadedFilteredRawSolves]);

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

  const allEventsBreakdown = useMemo(() => {
    return getAllEventsBreakdownFromSessionsList(sessionsList);
  }, [sessionsList]);

  const allEventsOverall = useMemo(() => {
    return aggregateStatsList(allEventsBreakdown.map((row) => row.stats));
  }, [allEventsBreakdown]);

  const overallCount = useMemo(() => {
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? null;
    return overallStatsForEvent?.SolveCountTotal ?? null;
  }, [isAllEventsMode, allEventsOverall, overallStatsForEvent]);

  const showingCount = useMemo(() => {
    if (isAllEventsMode) return allEventsOverall?.SolveCountTotal ?? 0;
    if (isAllSessionsMode) return overallStatsForEvent?.SolveCountTotal ?? 0;
    return visiblePageFilteredRawSolves?.length || 0;
  }, [isAllEventsMode, isAllSessionsMode, allEventsOverall, overallStatsForEvent, visiblePageFilteredRawSolves]);

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

      if (next === ALL_EVENTS) {
        setStatsSession(ALL_SESSIONS);
      } else {
        setStatsSession("main");
      }
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
      setShowAllActive(false);

      setTagFilterKey(TAG_NONE);
      setTagFilterValue("");
    },
    [DEFAULT_IN_VIEW]
  );

  const handleDeleteSolve = useCallback(
    async (solveRefOrIndex) => {
      if (!isSolveLevelMode) return;
      const solveRef =
        typeof solveRefOrIndex === "string"
          ? solveRefOrIndex
          : Number.isInteger(solveRefOrIndex)
          ? visiblePageFilteredRawSolves?.[solveRefOrIndex]?.solveRef ||
            solves?.[solveRefOrIndex]?.solveRef ||
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
        if (user?.UserID && !isAllEventsMode && !isAllSessionsMode) {
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
      solves,
      visiblePageFilteredRawSolves,
      isSolveLevelMode,
      user?.UserID,
      isAllEventsMode,
      isAllSessionsMode,
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

    if (solvesPerPage < solves.length) {
      setSolvesPerPage((prev) => Math.min(prev + 50, solves.length));
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
    solves.length,
    hasMoreOlder,
    loadingMore,
    isAllLoaded,
    fetchNextOlderPage,
    isSolveLevelMode,
  ]);

  const handleShowAll = useCallback(async () => {
    const userID = user?.UserID;
    if (!userID) return;
    if (!isSolveLevelMode) return;

    if (!hasMoreOlder) {
      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, solves.length));
      setCurrentPage(0);
      setShowAllActive(true);
      return;
    }

    setLoadingAllSolves(true);
    const myToken = ++requestTokenRef.current;

    try {
      const fullItems = await getSolvesBySession(
        userID,
        String(statsEvent || "").toUpperCase(),
        String(sessionId || "main")
      );
      if (requestTokenRef.current !== myToken) return;

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
    } catch (err) {
      console.error("Failed to load all solves for Stats:", err);
    } finally {
      if (requestTokenRef.current === myToken) setLoadingAllSolves(false);
    }
  }, [
    user?.UserID,
    statsEvent,
    sessionId,
    isSolveLevelMode,
    hasMoreOlder,
    solves.length,
    normalizeSolve,
    setSessions,
    DEFAULT_IN_VIEW,
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
    isSolveLevelMode &&
    (currentPage < maxPage || (hasMoreOlder && !loadingMore && !isAllLoaded));

  const canNewer = isSolveLevelMode && currentPage > 0;
  const canZoomIn = isSolveLevelMode && solvesPerPage > 50;
  const canZoomOut =
    isSolveLevelMode &&
    ((solves.length > 0 && solvesPerPage < solves.length) ||
      (hasMoreOlder && !loadingMore && !isAllLoaded));
  const canShowAll = isSolveLevelMode && !!user?.UserID && !loadingAllSolves && !showAllActive;

  const canRecomputeOverall =
    !!user?.UserID && !loadingOverallStats && !isAllEventsMode && !isAllSessionsMode;

  const headerStatusText = useMemo(() => {
    if (loadingInitial) return "Loading solves…";
    if (loadingAllSolves) return "Loading ALL solves…";
    if (loadingMore) return "Loading older solves…";
    if (isAllEventsMode) return "Cached overall stats for all events";
    if (isAllSessionsMode) return `Cached overall stats for ${statsEvent}`;
    if (showAllActive) return "All solves loaded";
    if (isAllLoaded) return "Loaded solves currently in memory for this session";
    if (hasMoreOlder) return "Showing recent solves (paged)";
    return "Showing recent solves";
  }, [loadingInitial, loadingAllSolves, loadingMore, isAllEventsMode, isAllSessionsMode, statsEvent, showAllActive, isAllLoaded, hasMoreOlder]);

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

  return (
    <div className="Page statsPageRoot">
      <div className="statsTopBar">
        <div className="statsTopLeft">
          <select className="statsSelect" onChange={handleEventChange} value={statsEvent}>
            {eventOptions.map((eventKey) => (
              <option key={eventKey} value={eventKey}>
                {eventKey === ALL_EVENTS ? "All Events" : eventKey === "333" ? "3x3" : eventKey}
              </option>
            ))}
          </select>

          {!isAllEventsMode && (
            <div className="statsSessionWrap" ref={sessionMenuWrapRef}>
              <button
                type="button"
                className="statsSessionBtn"
                onClick={() => setSessionMenuOpen((v) => !v)}
              >
                {selectedSessionDisplay} <span className="statsCaret">▼</span>
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
          )}

          {isSolveLevelMode && (
            <>
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

              <div className="statsViewToggle" role="group" aria-label="Stats view">
                <button
                  type="button"
                  className={`statsToggleBtn ${statsViewMode === "standard" ? "is-active" : ""}`}
                  onClick={() => setStatsViewMode("standard")}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className={`statsToggleBtn ${statsViewMode === "time" ? "is-active" : ""}`}
                  onClick={() => setStatsViewMode("time")}
                >
                  Time View
                </button>
              </div>
            </>
          )}
        </div>

        <div className="statsTopMiddle">
          <div className="statsTopMeta">
            <span className="statsTopCount">
              {showingCount}
              {overallCount != null && isSolveLevelMode ? `/${overallCount}` : ""}
            </span>
            <span className="statsTopCountLabel">
              {isAllEventsMode
                ? "cached solves"
                : isAllSessionsMode
                  ? "event total"
                  : "visible/raw"}
            </span>
          </div>

          {dateRangeText && isSolveLevelMode && <div className="statsTopRange">{dateRangeText}</div>}
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

          <button onClick={handleRecomputeOverall} disabled={!canRecomputeOverall}>
            {loadingOverallStats ? "Recomputing…" : "Recompute Overall"}
          </button>

          <button
            onClick={() => setShowImport(true)}
            disabled={!user?.UserID || importBusy || isAllEventsMode}
            title={
              !user?.UserID
                ? "Sign in to import"
                : isAllEventsMode
                  ? "Choose a specific event to import"
                  : "Import solves into this event"
            }
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
            <StatsSummary
              solves={visiblePageFilteredRawSolves}
              overallSolves={allLoadedFilteredRawSolves}
              overallStats={overallStatsForEvent}
              allEventsBreakdown={isAllEventsMode ? allEventsBreakdown : null}
              mode={isAllEventsMode ? "all-events" : isAllSessionsMode ? "event-overall" : "session"}
              selectedEvent={eventSelectLabel}
              selectedSession={selectedSessionDisplay}
              loadedSolveCount={solves?.length || 0}
              showCurrentMetrics={currentPage === 0}
              viewMode={statsViewMode}
              selectedDay={selectedTimeDay}
            />
          </div>

          {isSolveLevelMode && (
            <>
              <div className="stats-item stats-item--line stats-item--minh">
                <LineChart
                  user={user}
                  solves={visiblePageFilteredRawSolves}
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
                />
              </div>

              <div className="stats-item stats-item--percent stats-item--minh">
                <PercentBar solves={pieChartSolves} title="Solves Distribution by Time" />
              </div>

              <div className="stats-item stats-item--bar stats-item--minh">
                <BarChart solves={barChartSolves} />
              </div>

              <div className="stats-item stats-item--table">
                <TimeTable
                  user={user}
                  solves={allLoadedFilteredRawSolves}
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
            </>
          )}

          {!isSolveLevelMode && (
            <div className="stats-item stats-item--table">
              <div className="statsSummaryEmpty">
                Cached overall mode is active. Pick a single session to see solve-level charts.
              </div>
            </div>
          )}
        </div>
      </div>

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
