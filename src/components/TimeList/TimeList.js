// src/components/TimeList/TimeList.js
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import "./TimeList.css";
import "./TimeItem.css";
import Detail from "../Detail/Detail";
import { useSettings } from "../../contexts/SettingsContext";
import { formatTime, calculateAverage, getOveralls } from "./TimeUtils";

import { updateSolve } from "../../services/updateSolve";

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hslColor(h, s = 100, l = 50) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Green (fast) -> Red (slow)
function hueGreenToRed(t01) {
  const t = clamp01(t01);
  return 120 * (1 - t);
}

// Build a rank-based 0..1 mapping by time (fastest -> 0, slowest -> 1)
// Ties get the average rank of their tie group.
function buildRank01Map(items) {
  const valid = items
    .filter((it) => typeof it.time === "number" && isFinite(it.time))
    .map((it) => ({ key: it.key, time: it.time }));

  const n = valid.length;
  const out = {};
  if (n <= 1) {
    valid.forEach((v) => (out[v.key] = 0));
    return out;
  }

  valid.sort((a, b) => a.time - b.time);

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && valid[j + 1].time === valid[i].time) j++;

    const avgRank = (i + j) / 2;
    const rank01 = avgRank / (n - 1);

    for (let k = i; k <= j; k++) out[valid[k].key] = rank01;
    i = j + 1;
  }

  return out;
}

function normalizeEventCode(ev) {
  return String(ev || "").trim().toUpperCase();
}

function safeMergeTags(existing, patch, mode = "merge") {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const p = patch && typeof patch === "object" ? patch : {};

  if (mode === "replace") {
    return { ...p };
  }

  // merge
  const next = { ...base };

  // special-case Custom merge if present
  if (p.Custom && typeof p.Custom === "object" && !Array.isArray(p.Custom)) {
    const baseCustom =
      base.Custom && typeof base.Custom === "object" && !Array.isArray(base.Custom)
        ? { ...base.Custom }
        : {};
    next.Custom = { ...baseCustom, ...p.Custom };
    const { Custom, ...rest } = p;
    Object.assign(next, rest);
    return next;
  }

  Object.assign(next, p);
  return next;
}

function parseCustomLines(linesText) {
  // format:
  // key=value
  // key2=true
  // "key with spaces"=value
  const out = {};
  const raw = String(linesText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of raw) {
    const idx = line.indexOf("=");
    if (idx === -1) {
      // "key" implies true
      out[line] = "true";
      continue;
    }
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v || "true";
  }
  return out;
}

function buildGsi1pk(userID, ev, sessionID) {
  const E = normalizeEventCode(ev);
  const S = String(sessionID || "main").trim() || "main";
  return `SESSION#${userID}#${E}#${S}`;
}

function TimeList({
  user,
  applyPenalty,
  solves = [],
  deleteTime,
  rowsToShow = 3,
  inPlayerBar,
  addPost,
  setSessions,

  // props from App.js
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode,

  // OPTIONAL load-more support (for scroll mode only, if wired)
  onLoadMore,
  canLoadMore = true,
  isLoadingMore = false,
  totalSolveCount,
}) {
  const { settings } = useSettings();

  // ✅ Memoize solvesSafe to keep deps sane
  const solvesSafe = useMemo(() => {
    return Array.isArray(solves) ? solves : [];
  }, [solves]);

  const isHorizontal = inPlayerBar ? false : settings.horizontalTimeList;

  // ✅ NEW: scroll toggle for horizontal list
  const horizontalScrollEnabled = !!settings.horizontalTimeListScroll;

  // Modes:
  // "binary" | "continuous" | "bucket" | "index"
  // also accept old "spectrum" as "bucket"
  const timeColorModeRaw = settings?.timeColorMode || "binary";
  const timeColorMode = timeColorModeRaw === "spectrum" ? "bucket" : timeColorModeRaw;

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);
  const [selectedSolveList, setSelectedSolveList] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  // ✅ NEW: horizontal paging (used when scroll disabled)
  const [horizontalPage, setHorizontalPage] = useState(0);

  // -----------------------------
  // Multi-select state
  // -----------------------------
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState(null);

  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);

  // bulk share
  const [showBulkShare, setShowBulkShare] = useState(false);
  const [bulkShareNote, setBulkShareNote] = useState("");

  const [bulkTagMode, setBulkTagMode] = useState("merge"); // merge | replace
  const [bulkCubeModel, setBulkCubeModel] = useState("");
  const [bulkCrossColor, setBulkCrossColor] = useState("");
  const [bulkCustomLines, setBulkCustomLines] = useState("");

  const [bulkMoveEvent, setBulkMoveEvent] = useState(() => normalizeEventCode(currentEvent));
  const [bulkMoveSession, setBulkMoveSession] = useState(() => String(currentSession || "main"));

  const selectionCount = selectedIndices.size;

  const clearSelection = () => {
    setSelectedIndices(new Set());
    setAnchorIndex(null);
  };

  const selectedSolvesByIndex = useMemo(() => {
    if (!selectionCount) return [];
    const out = [];
    selectedIndices.forEach((idx) => {
      if (idx >= 0 && idx < solvesSafe.length) out.push({ idx, solve: solvesSafe[idx] });
    });
    out.sort((a, b) => a.idx - b.idx);
    return out;
  }, [selectionCount, selectedIndices, solvesSafe]);

  // Horizontal scroll container ref (scroll mode only)
  const horizontalScrollRef = useRef(null);

  // Preserve scroll when older solves are prepended (scroll mode only)
  const pendingPrependRef = useRef(false);
  const prevLenRef = useRef(solvesSafe.length);
  const prevScrollLeftRef = useRef(0);

  // Track "am I pinned to the right?" (scroll mode only)
  const isNearRightRef = useRef(true);

  // Column sizing (must match TimeList.css)
  const COL_W = 70;
  const COL_GAP = 4;
  const COL_STEP = COL_W + COL_GAP;

  // ✅ NEW: Horizontal visible count can be forced by setting:
  // settings.horizontalTimeListCols = "auto" | "12" | "5"
  // Default ("auto") preserves your current behavior: 12 desktop, 5 small.
  const horizontalColsSetting = String(settings?.horizontalTimeListCols || "auto").toLowerCase();
  const horizontalCount =
    horizontalColsSetting === "12"
      ? 12
      : horizontalColsSetting === "5"
      ? 5
      : windowWidth > 1250
      ? 12
      : 5;

  // constrain viewport width when scroll is enabled (so it feels like “12 wide”)
  const horizontalMaxWidthPx = useMemo(() => {
    const cols = horizontalCount + 1; // plus label column
    return cols * COL_STEP + 10;
  }, [horizontalCount, COL_STEP]);

  // always run hooks; never early-return before them
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);

    const colsPerRow = windowWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solvesSafe.length / colsPerRow);
    setCurrentPage(Math.max(0, totalRows - rowsToShow));

    return () => window.removeEventListener("resize", handleResize);
  }, [windowWidth, solvesSafe.length, rowsToShow]);

  // Escape clears selection
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selectionCount > 0) {
          e.preventDefault();
          clearSelection();
        }
        if (showBulkTags) setShowBulkTags(false);
        if (showBulkMove) setShowBulkMove(false);
        if (showBulkShare) setShowBulkShare(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionCount, showBulkTags, showBulkMove, showBulkShare]);

  // keep move defaults in sync when event/session changes
  useEffect(() => {
    setBulkMoveEvent(normalizeEventCode(currentEvent));
  }, [currentEvent]);

  useEffect(() => {
    setBulkMoveSession(String(currentSession || "main"));
  }, [currentSession]);

  // ✅ reset horizontal paging when session/event changes OR when count changes
  useEffect(() => {
    setHorizontalPage(0);
  }, [eventKey, currentSession, horizontalCount, horizontalScrollEnabled]);

  // -----------------------------
  // SAFE overall best/worst (prevents the getOveralls crash)
  // -----------------------------
  const times = useMemo(() => solvesSafe.map((s) => s?.time), [solvesSafe]);

  const overallCalc = useMemo(() => {
    let minIdx = -1;
    let maxIdx = -1;
    let minVal = null;
    let maxVal = null;

    for (let i = 0; i < times.length; i++) {
      const v = times[i];
      if (typeof v !== "number" || !isFinite(v)) continue;

      if (minVal === null || v < minVal) {
        minVal = v;
        minIdx = i;
      }
      if (maxVal === null || v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }

    try {
      getOveralls(times);
    } catch (e) {
      /* ignore */
    }

    return { minIdx, maxIdx, minVal, maxVal };
  }, [times]);

  const overallMin = overallCalc.minIdx;
  const overallMax = overallCalc.maxIdx;
  const overallMinValue = overallCalc.minVal;
  const overallMaxValue = overallCalc.maxVal;

  const colsPerRow = windowWidth > 1100 ? 12 : 5;
  const rowsToDisplay = inPlayerBar ? 1 : rowsToShow;

  const maxPage = useMemo(() => {
    const denom = colsPerRow * rowsToDisplay;
    if (!denom) return 0;
    return Math.ceil(solvesSafe.length / denom) - 1;
  }, [solvesSafe.length, colsPerRow, rowsToDisplay]);

  const validCurrentPage = Math.min(Math.max(currentPage, 0), Math.max(0, maxPage));
  const startIndex = validCurrentPage * colsPerRow * rowsToDisplay;

  const visibleSolves = useMemo(() => {
    const take = colsPerRow * rowsToDisplay;
    return solvesSafe.slice(startIndex, startIndex + take);
  }, [solvesSafe, startIndex, colsPerRow, rowsToDisplay]);

  const currentFiveIndices = useMemo(() => {
    return times.length > 5 ? Array.from({ length: 5 }, (_, i) => times.length - 5 + i) : [];
  }, [times.length]);

  // INDEX MODE: rank colors by TIME within the visible window
  const visibleRank01ByGlobalIndex = useMemo(() => {
    const items = visibleSolves.map((s, localIdx) => ({
      key: startIndex + localIdx,
      time: s?.time,
    }));
    return buildRank01Map(items);
  }, [visibleSolves, startIndex]);

  // -----------------------------
  // Solve count base (global indexing)
  // -----------------------------
  const derivedTotalSolveCount = useMemo(() => {
    const n0 = Number(totalSolveCount);
    if (Number.isFinite(n0) && n0 >= 0) return n0;

    const E = normalizeEventCode(eventKey || currentEvent);
    const S = String(currentSession || "main");

    const match = (sessionsList || []).find(
      (sess) => normalizeEventCode(sess?.Event) === E && String(sess?.SessionID || "main") === S
    );

    const stats = match?.Stats || match?.stats || null;
    const c =
      stats?.SolveCount ??
      stats?.solveCount ??
      stats?.Count ??
      stats?.count ??
      match?.SolveCount ??
      match?.Count ??
      null;

    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;

    return null;
  }, [totalSolveCount, sessionsList, eventKey, currentEvent, currentSession]);

  const globalBaseIndex = useMemo(() => {
    if (!Number.isFinite(derivedTotalSolveCount)) return 0;
    const base = derivedTotalSolveCount - solvesSafe.length;
    return base > 0 ? base : 0;
  }, [derivedTotalSolveCount, solvesSafe.length]);

  // -----------------------------
  // Horizontal solves: two modes
  // - scroll enabled: render all loaded solves
  // - scroll disabled: render a single window of horizontalCount and page by arrows
  // -----------------------------
  const pagedWindow = useMemo(() => {
    const total = solvesSafe.length;
    const pageSize = horizontalCount;
    const maxP = Math.max(0, Math.ceil(total / pageSize) - 1);
    const p = Math.min(Math.max(horizontalPage, 0), maxP);

    const end = total - p * pageSize;
    const start = Math.max(0, end - pageSize);
    return { start, end, page: p, maxPage: maxP };
  }, [solvesSafe.length, horizontalCount, horizontalPage]);

  const horizontalSolves = useMemo(() => {
    if (!isHorizontal) return [];
    if (horizontalScrollEnabled) return solvesSafe; // ALL loaded
    return solvesSafe.slice(pagedWindow.start, pagedWindow.end); // windowed
  }, [isHorizontal, horizontalScrollEnabled, solvesSafe, pagedWindow.start, pagedWindow.end]);

  // Rank map for horizontal display:
  // - scroll enabled: key = index in array (0..n-1)
  // - scroll disabled: key = global index in solvesSafe
  const horizontalRank01ByKey = useMemo(() => {
    if (!isHorizontal) return {};
    if (horizontalScrollEnabled) {
      const items = horizontalSolves.map((s, i) => ({ key: i, time: s?.time }));
      return buildRank01Map(items);
    } else {
      const items = horizontalSolves.map((s, i) => ({
        key: pagedWindow.start + i, // global index
        time: s?.time,
      }));
      return buildRank01Map(items);
    }
  }, [isHorizontal, horizontalScrollEnabled, horizontalSolves, pagedWindow.start]);

  const getPerfClassAndStyle = (value, min, max, rank01) => {
    if (timeColorMode === "binary") return { perfClass: "", perfStyle: null };

    // INDEX MODE: rank-based hue
    if (timeColorMode === "index") {
      const h = hueGreenToRed(rank01);
      const c = hslColor(h, 100, 55);
      return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
    }

    // Need valid numeric range for by-time modes
    if (typeof value !== "number" || !isFinite(value)) return { perfClass: "", perfStyle: null };
    if (typeof min !== "number" || !isFinite(min)) return { perfClass: "", perfStyle: null };
    if (typeof max !== "number" || !isFinite(max)) return { perfClass: "", perfStyle: null };
    if (max <= min) return { perfClass: "", perfStyle: null };

    const t = clamp01((value - min) / (max - min)); // 0 fast -> 1 slow

    // BUCKET MODE: CSS classes
    if (timeColorMode === "bucket") {
      if (t <= 0.2) return { perfClass: "overall-border-min", perfStyle: null };
      if (t <= 0.4) return { perfClass: "faster", perfStyle: null };
      if (t <= 0.6) return { perfClass: "middle-fast", perfStyle: null };
      if (t <= 0.8) return { perfClass: "slower", perfStyle: null };
      return { perfClass: "overall-border-max", perfStyle: null };
    }

    // CONTINUOUS MODE: true spectrum by time min/max
    const h = hueGreenToRed(t);
    const c = hslColor(h, 100, 55);
    return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
  };

  // -----------------------------
  // Selection interaction rules
  // -----------------------------
  const toggleIndex = (idx) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setAnchorIndex(idx);
  };

  const rangeSelect = (idx) => {
    const a = anchorIndex == null ? idx : anchorIndex;
    const lo = Math.min(a, idx);
    const hi = Math.max(a, idx);

    setSelectedIndices((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) next.add(i);
      return next;
    });
  };

  const handleSolvePrimaryAction = (solve, solveIndex) => {
    if (solve?.tags?.IsRelay && Array.isArray(solve.tags.RelayLegs)) {
      const legs = solve.tags.RelayLegs || [];
      const scrs = solve.tags.RelayScrambles || [];
      const timesArr = solve.tags.RelayLegTimes || [];

      const expanded = legs.map((ev, i) => ({
        event: ev,
        scramble: scrs[i] || "",
        time: timesArr[i] ?? 0,
        penalty: null,
        note: "",
        datetime: `${solve.datetime}#${i}`,
        userID: user?.UserID,
      }));

      setSelectedSolveList(expanded);
      setSelectedSolveIndex(solveIndex);
      return;
    }

    setSelectedSolve({ ...solve, userID: user?.UserID });
    setSelectedSolveIndex(solveIndex);
  };

  const onSolveClick = (e, solve, solveIndex) => {
    const isShift = !!e.shiftKey;
    const isToggle = !!(e.ctrlKey || e.metaKey);
    const hasSelection = selectionCount > 0;

    if (isShift) {
      e.preventDefault();
      if (anchorIndex == null) setAnchorIndex(solveIndex);
      rangeSelect(solveIndex);
      return;
    }

    if (isToggle) {
      e.preventDefault();
      toggleIndex(solveIndex);
      return;
    }

    if (hasSelection) {
      e.preventDefault();
      toggleIndex(solveIndex);
      return;
    }

    handleSolvePrimaryAction(solve, solveIndex);
  };

  const isIndexSelected = (idx) => selectedIndices.has(idx);

  // -----------------------------
  // Scroll-mode load-more + scroll preservation
  // -----------------------------
  const requestLoadMore = () => {
    if (!onLoadMore) return;
    if (!canLoadMore) return;
    if (isLoadingMore) return;

    const el = horizontalScrollRef.current;
    if (!el) return;

    pendingPrependRef.current = true;
    prevLenRef.current = solvesSafe.length;
    prevScrollLeftRef.current = el.scrollLeft;

    onLoadMore();
  };

  const onHorizontalScroll = () => {
    const el = horizontalScrollRef.current;
    if (!el) return;

    const nearRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    isNearRightRef.current = nearRight;

    if (el.scrollLeft <= 2) {
      requestLoadMore();
    }
  };

  useLayoutEffect(() => {
    if (!horizontalScrollEnabled) return;
    const el = horizontalScrollRef.current;
    if (!el) return;

    const newLen = solvesSafe.length;
    const prevLen = prevLenRef.current;

    if (pendingPrependRef.current && newLen > prevLen) {
      const added = newLen - prevLen;
      const deltaPx = added * COL_STEP;

      const prevLeft = prevScrollLeftRef.current || 0;
      el.scrollLeft = prevLeft + deltaPx;

      pendingPrependRef.current = false;
      prevLenRef.current = newLen;
      return;
    }

    prevLenRef.current = newLen;
  }, [horizontalScrollEnabled, solvesSafe.length, COL_STEP]);

  useEffect(() => {
    if (!isHorizontal) return;
    if (!horizontalScrollEnabled) return;

    const el = horizontalScrollRef.current;
    if (!el) return;

    isNearRightRef.current = true;

    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [isHorizontal, horizontalScrollEnabled, eventKey, currentSession]);

  useEffect(() => {
    if (!isHorizontal) return;
    if (!horizontalScrollEnabled) return;

    const el = horizontalScrollRef.current;
    if (!el) return;
    if (pendingPrependRef.current) return;

    if (isNearRightRef.current) {
      requestAnimationFrame(() => {
        el.scrollLeft = el.scrollWidth;
      });
    }
  }, [isHorizontal, horizontalScrollEnabled, solvesSafe.length]);

  // -----------------------------
  // AO5/AO12 for horizontal display
  // - scroll enabled: computed across horizontalSolves indices
  // - scroll disabled: computed for the global indices shown in the window
  // -----------------------------
  const { ao5ByKey, ao12ByKey } = useMemo(() => {
    const ao5 = {};
    const ao12 = {};

    if (!isHorizontal) return { ao5ByKey: ao5, ao12ByKey: ao12 };

    if (horizontalScrollEnabled) {
      for (let i = 0; i < horizontalSolves.length; i++) {
        if (i >= 4) {
          const slice = horizontalSolves.slice(i - 4, i + 1);
          ao5[i] = calculateAverage(slice.map((s) => s?.time), true).average;
        }
        if (i >= 11) {
          const slice = horizontalSolves.slice(i - 11, i + 1);
          ao12[i] = calculateAverage(slice.map((s) => s?.time), true).average;
        }
      }
      return { ao5ByKey: ao5, ao12ByKey: ao12 };
    }

    // paged (no scroll): key is global index
    const start = pagedWindow.start;
    const end = pagedWindow.end;

    for (let gi = start; gi < end; gi++) {
      if (gi >= 4) {
        const slice = solvesSafe.slice(gi - 4, gi + 1);
        if (slice.length === 5) ao5[gi] = calculateAverage(slice.map((s) => s?.time), true).average;
      }
      if (gi >= 11) {
        const slice = solvesSafe.slice(gi - 11, gi + 1);
        if (slice.length === 12)
          ao12[gi] = calculateAverage(slice.map((s) => s?.time), true).average;
      }
    }

    return { ao5ByKey: ao5, ao12ByKey: ao12 };
  }, [
    isHorizontal,
    horizontalScrollEnabled,
    horizontalSolves,
    solvesSafe,
    pagedWindow.start,
    pagedWindow.end,
  ]);

  const horizontalBestWorst = useMemo(() => {
    if (!isHorizontal)
      return {
        bestTime: null,
        worstTime: null,
        bestAo5: null,
        worstAo5: null,
        bestAo12: null,
        worstAo12: null,
      };

    const timeVals = horizontalSolves
      .map((s) => s?.time)
      .filter((v) => typeof v === "number" && isFinite(v));

    const bestTime = timeVals.length ? Math.min(...timeVals) : null;
    const worstTime = timeVals.length ? Math.max(...timeVals) : null;

    const ao5Vals = Object.values(ao5ByKey).filter((v) => typeof v === "number" && isFinite(v));
    const ao12Vals = Object.values(ao12ByKey).filter((v) => typeof v === "number" && isFinite(v));

    const bestAo5 = ao5Vals.length ? Math.min(...ao5Vals) : null;
    const worstAo5 = ao5Vals.length ? Math.max(...ao5Vals) : null;

    const bestAo12 = ao12Vals.length ? Math.min(...ao12Vals) : null;
    const worstAo12 = ao12Vals.length ? Math.max(...ao12Vals) : null;

    return { bestTime, worstTime, bestAo5, worstAo5, bestAo12, worstAo12 };
  }, [isHorizontal, horizontalSolves, ao5ByKey, ao12ByKey]);

  // -----------------------------
  // Early return now safe
  // -----------------------------
  if (solvesSafe.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }

  // -----------------------------
  // Bulk UI styles
  // -----------------------------
  const bulkBarStyle = {
    position: "fixed",
    top: "10px",
    zIndex: 20,
    display: selectionCount ? "flex" : "none",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "10px 10px",
    background: "rgba(110, 115, 115, 0.75)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "12px",
    boxSizing: "border-box",
    marginBottom: "10px",
    backdropFilter: "blur(6px)",
  };

  const bulkBtnStyle = {
    height: "34px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    opacity: 0.95,
    fontWeight: 700,
    userSelect: "none",
  };

  const bulkPrimaryBtnStyle = {
    ...bulkBtnStyle,
    border: "none",
    background: "#2EC4B6",
    color: "#0E171D",
    fontWeight: 900,
  };

  const modalBackdrop = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  };

  const modalCard = {
    width: "520px",
    maxWidth: "94vw",
    background: "#181F23",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "16px",
    boxSizing: "border-box",
  };

  const inputStyle = {
    width: "100%",
    height: "34px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.20)",
    color: "white",
    padding: "0 10px",
    outline: "none",
    boxSizing: "border-box",
  };

  const textareaStyle = {
    width: "100%",
    minHeight: "130px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.20)",
    color: "white",
    padding: "10px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontSize: "13px",
    lineHeight: 1.35,
    resize: "vertical",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  const getSessionsForEvent = (ev) => {
    const E = normalizeEventCode(ev);
    return (sessionsList || []).filter((s) => normalizeEventCode(s.Event) === E);
  };

  const sourceListKey = normalizeEventCode(eventKey || currentEvent || solvesSafe[0]?.event || "");

  const applyBulkTags = async () => {
    const patch = {};
    if (String(bulkCubeModel || "").trim()) patch.CubeModel = String(bulkCubeModel).trim();
    if (String(bulkCrossColor || "").trim()) patch.CrossColor = String(bulkCrossColor).trim();

    const custom = parseCustomLines(bulkCustomLines);
    if (Object.keys(custom).length) patch.Custom = custom;

    if (practiceMode) {
      const idxs = Array.from(selectedIndices);

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        for (const idx of idxs) {
          if (!arr[idx]) continue;
          arr[idx] = {
            ...arr[idx],
            tags: safeMergeTags(arr[idx].tags, patch, bulkTagMode),
          };
        }
        next[sourceListKey] = arr;
        return next;
      });

      setShowBulkTags(false);
      clearSelection();
      return;
    }

    if (!user?.UserID) return;

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    try {
      for (const s of targets) {
        const nextTags = safeMergeTags(s.tags, patch, bulkTagMode);

        await updateSolve(user.UserID, s.datetime, { Tags: nextTags });

        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
          const idx = arr.findIndex((x) => x?.datetime === s.datetime);
          if (idx >= 0) arr[idx] = { ...arr[idx], tags: nextTags };
          next[sourceListKey] = arr;
          return next;
        });
      }
    } catch (err) {
      console.error("Bulk tag update failed:", err);
    }

    setShowBulkTags(false);
    clearSelection();
  };

  const applyBulkMove = async () => {
    const targetEvent = normalizeEventCode(bulkMoveEvent);
    const targetSession = String(bulkMoveSession || "main").trim() || "main";

    if (practiceMode) {
      const idxs = Array.from(selectedIndices).sort((a, b) => b - a);

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const sourceArr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        const moving = [];
        for (const idx of idxs) {
          if (sourceArr[idx]) moving.push(sourceArr[idx]);
          sourceArr.splice(idx, 1);
        }
        next[sourceListKey] = sourceArr;

        if (!next[targetEvent]) next[targetEvent] = [];
        if (Array.isArray(next[targetEvent])) {
          next[targetEvent] = [
            ...(next[targetEvent] || []),
            ...moving.map((s) => ({ ...s, event: targetEvent, sessionID: targetSession })),
          ];
        }

        return next;
      });

      setShowBulkMove(false);
      clearSelection();
      return;
    }

    if (!user?.UserID) return;

    const movingSolves = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    if (movingSolves.length === 0) {
      setShowBulkMove(false);
      clearSelection();
      return;
    }

    try {
      for (const s of movingSolves) {
        const nextGsi1pk = buildGsi1pk(user.UserID, targetEvent, targetSession);

        await updateSolve(user.UserID, s.datetime, {
          Event: targetEvent,
          SessionID: targetSession,
          GSI1PK: nextGsi1pk,
        });
      }

      const datetimeSet = new Set(movingSolves.map((s) => s.datetime));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        next[sourceListKey] = arr.filter((s) => !datetimeSet.has(s?.datetime));
        return next;
      });
    } catch (err) {
      console.error("Bulk move failed:", err);
    }

    setShowBulkMove(false);
    clearSelection();
  };

  const applyBulkDelete = async () => {
    if (!selectionCount) return;

    const ok = window.confirm(`Delete ${selectionCount} selected solve(s)?`);
    if (!ok) return;

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    if (!targets.length) {
      clearSelection();
      return;
    }

    if (practiceMode) {
      const datetimeSet = new Set(targets.map((s) => s.datetime));
      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        next[sourceListKey] = arr.filter((s) => !datetimeSet.has(s?.datetime));
        return next;
      });

      clearSelection();
      return;
    }

    try {
      for (const s of targets) {
        await deleteTime(s?.datetime);
      }
    } catch (e) {
      console.error("Bulk delete failed:", e);
    }

    clearSelection();
  };

  const openBulkShare = () => {
    if (!selectionCount) return;
    setBulkShareNote("");
    setShowBulkShare(true);
    setShowBulkTags(false);
    setShowBulkMove(false);
  };

  const applyBulkShare = async () => {
    const selectedSolves = selectedSolvesByIndex.map(({ solve }) => solve).filter(Boolean);

    if (!selectedSolves.length) {
      setShowBulkShare(false);
      clearSelection();
      return;
    }

    const ev = normalizeEventCode(currentEvent || eventKey || selectedSolves[0]?.event);

    try {
      await addPost?.({
        note: bulkShareNote?.trim() || `Shared ${selectedSolves.length} solves`,
        event: ev,
        solveList: selectedSolves,
        comments: [],
      });
    } catch (e) {
      console.error("Bulk share failed:", e);
    }

    setShowBulkShare(false);
    clearSelection();
  };

  // -----------------------------
  // Table mode rows
  // -----------------------------
  const rows = [];
  for (let i = 0; i < visibleSolves.length; i += colsPerRow) {
    const timesRow = visibleSolves.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow.map((solve) => solve.time), true);

    rows.push(
      <tr key={i}>
        {timesRow.map((solve, index) => {
          const solveIndex = startIndex + i + index;
          const isBest = solveIndex === overallMin;
          const isWorst = solveIndex === overallMax;
          const isCurrentFive = currentFiveIndices.includes(solveIndex);

          const rank01 =
            timeColorMode === "index" ? visibleRank01ByGlobalIndex[solveIndex] ?? 0 : 0;

          const { perfClass, perfStyle } =
            !isBest && !isWorst
              ? getPerfClassAndStyle(solve.time, overallMinValue, overallMaxValue, rank01)
              : { perfClass: "", perfStyle: null };

          const selected = isIndexSelected(solveIndex);

          const selectStyleInline = selected
            ? {
                outline: "2px solid rgba(46,196,182,0.95)",
                outlineOffset: "-2px",
                boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
              }
            : null;

          return (
            <td
              className={`TimeItem ${perfClass} ${isBest ? "overall-border-min" : ""} ${
                isWorst ? "overall-border-max" : ""
              } ${isCurrentFive ? "current-five" : ""}`}
              style={{ ...(perfStyle || {}), ...(selectStyleInline || {}) }}
              key={index}
              onClick={(e) => onSolveClick(e, solve, solveIndex)}
              onMouseDown={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey || selectionCount > 0) {
                  e.preventDefault();
                }
              }}
            >
              {formatTime(solve.time, false, solve.penalty)}
              <span
                className="delete-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTime(solve?.datetime);
                }}
              >
                x
              </span>
            </td>
          );
        })}
        {timesRow.length < colsPerRow &&
          [...Array(colsPerRow - timesRow.length)].map((_, index) => (
            <td className="TimeItem" key={colsPerRow + index}>
              &nbsp;
            </td>
          ))}
        <td className="TimeItem current-five">{formatTime(averageData.average)}</td>
      </tr>
    );
  }

  const goToPreviousPage = () => {
    if (validCurrentPage > 0) setCurrentPage(validCurrentPage - 1);
  };

  const goToNextPage = () => {
    if ((validCurrentPage + 1) * rowsToDisplay * colsPerRow < solvesSafe.length) {
      setCurrentPage(validCurrentPage + 1);
    }
  };

  // -----------------------------
  // Horizontal paging arrows (no-scroll mode)
  // -----------------------------
  const canPageOlder = !horizontalScrollEnabled && pagedWindow.page < pagedWindow.maxPage;
  const canPageNewer = !horizontalScrollEnabled && pagedWindow.page > 0;

  const pageOlder = () => {
    if (!canPageOlder) return;
    setHorizontalPage((p) => p + 1);
  };

  const pageNewer = () => {
    if (!canPageNewer) return;
    setHorizontalPage((p) => Math.max(0, p - 1));
  };

  // -----------------------------
  // Horizontal render helpers
  // -----------------------------
  const { bestTime, worstTime, bestAo5, worstAo5, bestAo12, worstAo12 } = horizontalBestWorst;

  const getKeyForIndex = (localIndex) => {
    if (horizontalScrollEnabled) return localIndex; // 0..n-1
    return pagedWindow.start + localIndex; // global index
  };

  const getSolveNumberForIndex = (localIndex) => {
    const globalIdx = horizontalScrollEnabled ? localIndex : pagedWindow.start + localIndex;
    return globalBaseIndex + globalIdx + 1;
  };

  return (
    <div className="time-list-container">
      {/* ✅ BULK ACTION BAR */}
      <div style={bulkBarStyle} data-bulk-ui>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontWeight: 900, color: "white" }}>{selectionCount} selected</div>
          <div style={{ fontSize: "12px", opacity: 0.85 }}>
            Shift+click = range, Ctrl/Cmd+click = toggle, Esc = clear
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            style={bulkBtnStyle}
            onClick={() => {
              setShowBulkTags(true);
              setShowBulkMove(false);
              setShowBulkShare(false);
            }}
          >
            Tags
          </button>

          <button
            type="button"
            style={bulkBtnStyle}
            onClick={() => {
              setShowBulkMove(true);
              setShowBulkTags(false);
              setShowBulkShare(false);
            }}
          >
            Move
          </button>

          <button type="button" style={bulkBtnStyle} onClick={openBulkShare}>
            Share
          </button>

          <button
            type="button"
            style={{ ...bulkBtnStyle, border: "1px solid rgba(255,80,80,0.45)" }}
            onClick={applyBulkDelete}
          >
            Delete
          </button>

          <button type="button" style={bulkBtnStyle} onClick={clearSelection}>
            Clear
          </button>
        </div>
      </div>

      {/* OPTIONAL Load More UI (scroll mode only) */}
      {!!onLoadMore && horizontalScrollEnabled && (
        <div className="timelist-loadmore">
          <button
            type="button"
            onClick={() => requestLoadMore()}
            disabled={!canLoadMore || isLoadingMore}
            className="timelist-loadmore-btn"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {isHorizontal ? (
        <div className="horizontal-shell">
          {/* ◀ older */}
          {!horizontalScrollEnabled && (
            <button
              type="button"
              className="horizontal-nav-btn"
              onClick={pageOlder}
              disabled={!canPageOlder}
              title={`Older (${horizontalCount})`}
            >
              ◀
            </button>
          )}

          <div
            className={`horizontal-time-list ${horizontalScrollEnabled ? "" : "no-scroll"}`}
            ref={horizontalScrollEnabled ? horizontalScrollRef : null}
            onScroll={horizontalScrollEnabled ? onHorizontalScroll : undefined}
            title={
              horizontalScrollEnabled
                ? "Scroll left for older solves. Scroll all the way left to auto-load more (if enabled)."
                : `Use arrows to jump by ${horizontalCount} solves`
            }
            style={{
              "--cols": horizontalSolves.length,
              maxWidth: horizontalScrollEnabled ? `${horizontalMaxWidthPx}px` : "unset",
              margin: "0 auto",
            }}
          >
            {/* AO12 */}
            <div className="horizontal-row ao12-row" style={{ "--cols": horizontalSolves.length }}>
              {horizontalSolves.map((_, index) => {
                const key = getKeyForIndex(index);
                const avg = ao12ByKey[key];
                if (avg == null) return <div key={index} className="ao12 empty TimeItem"></div>;

                const textClass =
                  bestAo12 != null && avg === bestAo12
                    ? "best-time"
                    : worstAo12 != null && avg === worstAo12
                    ? "worst-time"
                    : "";

                const globalIdx = key;
                const slice = solvesSafe.slice(globalIdx - 11, globalIdx + 1);

                return (
                  <div
                    key={index}
                    className={`ao12 TimeItem ${textClass}`}
                    onClick={() =>
                      setSelectedSolveList(slice.map((s) => ({ ...s, userID: user?.UserID })))
                    }
                  >
                    {formatTime(avg)}
                  </div>
                );
              })}
              <div className="TimeItem row-label">AO12</div>
            </div>

            {/* AO5 */}
            <div className="horizontal-row ao5-row" style={{ "--cols": horizontalSolves.length }}>
              {horizontalSolves.map((_, index) => {
                const key = getKeyForIndex(index);
                const avg = ao5ByKey[key];
                if (avg == null) return <div key={index} className="ao5 empty TimeItem"></div>;

                const textClass =
                  bestAo5 != null && avg === bestAo5
                    ? "best-time"
                    : worstAo5 != null && avg === worstAo5
                    ? "worst-time"
                    : "";

                const globalIdx = key;
                const slice = solvesSafe.slice(globalIdx - 4, globalIdx + 1);

                return (
                  <div
                    key={index}
                    className={`ao5 TimeItem ${textClass}`}
                    onClick={() =>
                      setSelectedSolveList(slice.map((s) => ({ ...s, userID: user?.UserID })))
                    }
                  >
                    {formatTime(avg)}
                  </div>
                );
              })}
              <div className="TimeItem row-label">AO5</div>
            </div>

            {/* Times */}
            <div className="horizontal-row times-row" style={{ "--cols": horizontalSolves.length }}>
              {horizontalSolves.map((solve, index) => {
                const key = getKeyForIndex(index); // index or global index
                const globalIdx = key;

                const tval = solve?.time;
                const isBest = bestTime != null && tval === bestTime;
                const isWorst = worstTime != null && tval === worstTime;

                const rank01 = timeColorMode === "index" ? horizontalRank01ByKey[key] ?? 0 : 0;

                const { perfClass, perfStyle } =
                  !isBest && !isWorst
                    ? getPerfClassAndStyle(tval, bestTime, worstTime, rank01)
                    : { perfClass: "", perfStyle: null };

                const selected = isIndexSelected(globalIdx);
                const selectStyleInline = selected
                  ? {
                      outline: "2px solid rgba(46,196,182,0.95)",
                      outlineOffset: "-2px",
                      boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
                    }
                  : null;

                return (
                  <div
                    key={index}
                    className={`TimeItem ${perfClass} ${isBest ? "dashed-border-min" : ""} ${
                      isWorst ? "dashed-border-max" : ""
                    }`}
                    style={{ ...(perfStyle || {}), ...(selectStyleInline || {}) }}
                    onClick={(e) => onSolveClick(e, solve, globalIdx)}
                    onMouseDown={(e) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey || selectionCount > 0) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {formatTime(tval, false, solve?.penalty)}
                    <span
                      className="delete-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTime(solve?.datetime);
                      }}
                    >
                      x
                    </span>
                  </div>
                );
              })}
              <div className="TimeItem row-label time-label">TIME</div>
            </div>

            {/* Solve # */}
            <div className="horizontal-row count-row" style={{ "--cols": horizontalSolves.length }}>
              {horizontalSolves.map((_, index) => {
                const realSolveNumber = getSolveNumberForIndex(index);
                return (
                  <div key={index} className="solve-count TimeItem">
                    {realSolveNumber}
                  </div>
                );
              })}
              <div className="TimeItem row-label">SOLVE #</div>
            </div>

            {selectedSolve && (
              <Detail
                solve={selectedSolve}
                userID={user?.UserID}
                onClose={() => setSelectedSolve(null)}
                deleteTime={() => deleteTime(selectedSolve?.datetime)}
                addPost={addPost}
                applyPenalty={applyPenalty}
                setSessions={setSessions}
              />
            )}

            {selectedSolveList && (
              <Detail
                solve={selectedSolveList}
                userID={user?.UserID}
                onClose={() => setSelectedSolveList(null)}
                deleteTime={() => {}}
                applyPenalty={applyPenalty}
                addPost={() =>
                  addPost({
                    note: "Average solve group",
                    event: selectedSolveList[0]?.event,
                    solveList: selectedSolveList,
                    comments: [],
                  })
                }
                setSessions={setSessions}
              />
            )}
          </div>

          {/* ▶ newer */}
          {!horizontalScrollEnabled && (
            <button
              type="button"
              className="horizontal-nav-btn"
              onClick={pageNewer}
              disabled={!canPageNewer}
              title={`Newer (${horizontalCount})`}
            >
              ▶
            </button>
          )}
        </div>
      ) : (
        <div className="time-list-content">
          <table className="TimeList">
            <tbody>{rows}</tbody>
          </table>

          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              userID={user?.UserID}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => deleteTime(selectedSolve?.datetime)}
              addPost={addPost}
              applyPenalty={applyPenalty}
              setSessions={setSessions}
            />
          )}

          {selectedSolveList && (
            <Detail
              solve={selectedSolveList}
              userID={user?.UserID}
              onClose={() => setSelectedSolveList(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
              setSessions={setSessions}
            />
          )}
        </div>
      )}

      {!isHorizontal && (
        <div className="pagination-buttons">
          <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>
            ▲
          </button>
          <button
            onClick={goToNextPage}
            disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solvesSafe.length}
          >
            ▼
          </button>
        </div>
      )}

      {/* BULK TAG MODAL */}
      {showBulkTags && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkTags(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Edit Tags ({selectionCount})
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <button
                type="button"
                style={bulkTagMode === "merge" ? bulkPrimaryBtnStyle : bulkBtnStyle}
                onClick={() => setBulkTagMode("merge")}
              >
                Merge
              </button>
              <button
                type="button"
                style={bulkTagMode === "replace" ? bulkPrimaryBtnStyle : bulkBtnStyle}
                onClick={() => setBulkTagMode("replace")}
              >
                Replace
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>CubeModel</div>
                <input
                  style={inputStyle}
                  value={bulkCubeModel}
                  onChange={(e) => setBulkCubeModel(e.target.value)}
                  placeholder="Gan 13"
                />
              </div>
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>CrossColor</div>
                <input
                  style={inputStyle}
                  value={bulkCrossColor}
                  onChange={(e) => setBulkCrossColor(e.target.value)}
                  placeholder="White"
                />
              </div>
            </div>

            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                Custom (one per line: <span style={{ fontFamily: "monospace" }}>key=value</span>)
              </div>
              <textarea
                style={textareaStyle}
                value={bulkCustomLines}
                onChange={(e) => setBulkCustomLines(e.target.value)}
                placeholder={`cube=RS3M\nlube=cosmic\nmy tag with spaces=true`}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkTags(false)}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkTags}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK MOVE MODAL */}
      {showBulkMove && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkMove(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Move Solves ({selectionCount})
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>Event</div>
                <input
                  style={inputStyle}
                  value={bulkMoveEvent}
                  onChange={(e) => setBulkMoveEvent(e.target.value)}
                  placeholder="333"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>Session</div>
                {getSessionsForEvent(bulkMoveEvent).length > 0 ? (
                  <select
                    style={selectStyle}
                    value={bulkMoveSession}
                    onChange={(e) => setBulkMoveSession(e.target.value)}
                  >
                    {getSessionsForEvent(bulkMoveEvent).map((s) => (
                      <option key={`${s.SessionID}-${s.SessionName || ""}`} value={s.SessionID}>
                        {s.SessionName || s.SessionID}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    value={bulkMoveSession}
                    onChange={(e) => setBulkMoveSession(e.target.value)}
                    placeholder="main"
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkMove(false)}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkMove}>
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK SHARE MODAL */}
      {showBulkShare && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkShare(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Share Solves ({selectionCount})
            </div>

            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>Post note</div>
              <textarea
                style={textareaStyle}
                value={bulkShareNote}
                onChange={(e) => setBulkShareNote(e.target.value)}
                placeholder="Optional note..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkShare(false)}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkShare}>
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimeList;