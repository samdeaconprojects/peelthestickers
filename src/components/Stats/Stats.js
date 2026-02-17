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

function Stats({
  sessions,
  sessionsList = [], // ✅ NEW: needed for session dropdown
  sessionStats, // optional (unused for now)
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
  // Incremental paging state (Older loads next page)
  // -----------------------------
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAllSolves, setLoadingAllSolves] = useState(false);

  const [pageCursor, setPageCursor] = useState(null); // LastEvaluatedKey
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isAllLoaded, setIsAllLoaded] = useState(false);

  // Prevent late async responses from overwriting newer state
  const requestTokenRef = useRef(0);

  // -----------------------------
  // Session dropdown UI (checkmark menu)
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
  // Normalize DynamoDB solve item into UI shape
  // -----------------------------
  const normalizeSolve = useCallback((item) => {
    // already normalized?
    if (item && item.datetime) return item;

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

  // Solves currently in app state for statsEvent
  const solves = sessions?.[statsEvent] || [];

  // -----------------------------
  // Build list of sessions available for this event (for the dropdown)
  // -----------------------------
  const sessionsForEvent = useMemo(() => {
    const ev = String(statsEvent || "").toUpperCase();

    const list = (sessionsList || [])
      .filter((s) => String(s.Event || "").toUpperCase() === ev)
      .map((s) => ({
        SessionID: s.SessionID || "main",
        SessionName: s.SessionName || s.Name || s.SessionID || "main",
      }));

    // Deduplicate by SessionID
    const seen = new Set();
    const deduped = [];
    for (const s of list) {
      if (seen.has(s.SessionID)) continue;
      seen.add(s.SessionID);
      deduped.push(s);
    }

    // Ensure main exists first if present
    deduped.sort((a, b) => {
      if (a.SessionID === "main") return -1;
      if (b.SessionID === "main") return 1;
      return String(a.SessionName).localeCompare(String(b.SessionName));
    });

    return deduped;
  }, [sessionsList, statsEvent]);

  // Ensure statsSession defaults to main when possible for the chosen event
  useEffect(() => {
    const ev = String(statsEvent || "").toUpperCase();
    const hasMain = sessionsForEvent.some((s) => s.SessionID === "main");

    // If current session isn't valid for this event, pick main or first available
    const valid = sessionsForEvent.some((s) => s.SessionID === statsSession);
    if (!valid) {
      setStatsSession(hasMain ? "main" : (sessionsForEvent[0]?.SessionID || "main"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsEvent, sessionsForEvent]);

  // If user navigates to /stats with currentEvent/currentSession changed externally, sync without wiping UI
  useEffect(() => {
    setStatsEvent(currentEvent);
    setStatsSession(currentSession || "main");

    // reset view + paging state (data will swap when new fetch returns)
    setSolvesPerPage(DEFAULT_IN_VIEW);
    setCurrentPage(0);
    setPageCursor(null);
    setHasMoreOlder(false);
    setIsAllLoaded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEvent, currentSession]);

  // -----------------------------
  // Load overall stats from SESSIONSTATS (never derived from solves)
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
  // - Needed because App.js only loads solves for currentEvent
  // - Uses paged fetch (last 200)
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
        .reverse(); // UI expects oldest -> newest

      // Swap solves for this event (don’t blank the UI first)
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

  // Trigger initial load when statsEvent/session changes
  useEffect(() => {
    if (!user?.UserID) return;
    loadInitialSolves();
  }, [user?.UserID, statsEvent, sessionId, loadInitialSolves]);

  // -----------------------------
  // Paging math (CEIL pages)
  // -----------------------------
  const totalPages = useMemo(() => {
    const per = Math.max(1, solvesPerPage);
    return Math.max(1, Math.ceil((solves.length || 0) / per));
  }, [solves.length, solvesPerPage]);

  const maxPage = totalPages - 1;

  useEffect(() => {
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, maxPage]);

  // Indices for paging from the end (newest)
  const startIndex = useMemo(() => {
    return Math.max(0, solves.length - solvesPerPage * (currentPage + 1));
  }, [solves.length, solvesPerPage, currentPage]);

  const endIndex = useMemo(() => {
    return Math.max(
      0,
      Math.min(solves.length, solves.length - solvesPerPage * currentPage)
    );
  }, [solves.length, solvesPerPage, currentPage]);

  const solvesToDisplay = useMemo(() => {
    const slice = solves.slice(startIndex, endIndex);
    return slice.map((solve, i) => ({
      ...solve,
      fullIndex: startIndex + i,
    }));
  }, [solves, startIndex, endIndex]);

  // -----------------------------
  // Incremental “Older” fetch (next 200 older)
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

      // Prepend older solves so indices stay consistent (oldest -> newest)
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
  // Top bar meta: showing / overall + date range
  // -----------------------------
  const overallCount = useMemo(() => {
    return (
      overallStatsForEvent?.SolveCount ??
      overallStatsForEvent?.Count ??
      overallStatsForEvent?.TotalSolves ??
      overallStatsForEvent?.Solves ??
      null
    );
  }, [overallStatsForEvent]);

  const showingCount = useMemo(() => {
    return Math.min(solvesPerPage, solves.length || 0);
  }, [solvesPerPage, solves.length]);

  const dateRangeText = useMemo(() => {
    if (!solvesToDisplay || solvesToDisplay.length === 0) return "";
    const first = solvesToDisplay[0]?.datetime;
    const last = solvesToDisplay[solvesToDisplay.length - 1]?.datetime;
    if (!first || !last) return "";

    const fmt = (iso) => {
      const d = new Date(iso);
      if (!isFinite(d)) return "";
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

      // Session will be validated by effect; reset view/paging now
      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);

      setPageCursor(null);
      setHasMoreOlder(false);
      setIsAllLoaded(false);
    },
    [DEFAULT_IN_VIEW]
  );

  const handlePickSession = useCallback(
    (sid) => {
      setStatsSession(sid);
      setSessionMenuOpen(false);

      // reset view/paging (data swaps when fetch returns)
      setSolvesPerPage(DEFAULT_IN_VIEW);
      setCurrentPage(0);

      setPageCursor(null);
      setHasMoreOlder(false);
      setIsAllLoaded(false);
    },
    [DEFAULT_IN_VIEW]
  );

  const handleDeleteSolve = useCallback(
    (fullIndex) => {
      setSessions((prev) => ({
        ...prev,
        [statsEvent]: (prev?.[statsEvent] || []).filter((_, i) => i !== fullIndex),
      }));
      deleteTime(statsEvent, fullIndex);
    },
    [setSessions, deleteTime, statsEvent]
  );

  // Older ▲ (go back in time)
  // If we’re at the oldest loaded page and there are older solves, fetch next page then advance
  const handlePreviousPage = useCallback(async () => {
    if (currentPage < maxPage) {
      setCurrentPage((p) => Math.min(maxPage, p + 1));
      return;
    }

    if (hasMoreOlder && !loadingMore && !loadingAllSolves && !isAllLoaded) {
      const beforeLen = solves.length;
      await fetchNextOlderPage();

      // Advance one page (new data increases maxPage)
      setCurrentPage((p) => p + 1);

      // If nothing actually arrived, revert
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

  // Newer ▼ (towards latest)
  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const handleZoomIn = useCallback(() => {
    setSolvesPerPage((prev) => Math.max(50, prev - 50));
    setCurrentPage(0);
  }, []);

  // Zoom out: if at cap of loaded solves and more exist, fetch next page then expand
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

  // Show All: load ALL solves (explicit)
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

      setSolvesPerPage(Math.max(DEFAULT_IN_VIEW, Math.min(normalized.length, normalized.length)));
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

  // Recompute overall stats (SESSIONSTATS)
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

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="Page statsPageRoot">
      {/* ✅ Figma-style top bar */}
      <div className="statsTopBar">
        {/* LEFT */}
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
        </div>

        {/* MIDDLE */}
        <div className="statsTopMiddle">
          <div className="statsTopMeta">
            <span className="statsTopCount">
              {showingCount}
              {overallCount != null ? `/${overallCount}` : ""}
            </span>
            <span className="statsTopCountLabel">solves</span>
          </div>

          {dateRangeText && <div className="statsTopRange">{dateRangeText}</div>}
        </div>

        {/* RIGHT */}
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
        </div>
      </div>

      {/* tiny status line (optional) */}
      <div className="statsStatusLine">{headerStatusText}</div>

      <div className="stats-page">
        <div className={`stats-grid stats-grid--figma ${loadingInitial ? "stats-grid--loading" : ""}`}>
          {loadingInitial && (
            <div className="statsLoadingOverlay">Loading…</div>
          )}

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
              solves={solvesToDisplay}
              deleteTime={handleDeleteSolve}
              addPost={addPost}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stats;
