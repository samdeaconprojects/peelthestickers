// src/components/TimeList/TimeList.js
import React, { useState, useEffect, useMemo, useRef } from "react";
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

  // ✅ new props from App.js
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode,
}) {
  const solvesSafe = Array.isArray(solves) ? solves : [];

  const { settings } = useSettings();
  const isHorizontal = inPlayerBar ? false : settings.horizontalTimeList;

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

  // -----------------------------
  // ✅ Multi-select state
  // -----------------------------
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState(null);

  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);

  // ✅ NEW: bulk share
  const [showBulkShare, setShowBulkShare] = useState(false);
  const [bulkShareNote, setBulkShareNote] = useState("");

  const [bulkTagMode, setBulkTagMode] = useState("merge"); // merge | replace
  const [bulkCubeModel, setBulkCubeModel] = useState("");
  const [bulkCrossColor, setBulkCrossColor] = useState("");
  const [bulkCustomLines, setBulkCustomLines] = useState("");

  const [bulkMoveEvent, setBulkMoveEvent] = useState(() =>
    normalizeEventCode(currentEvent)
  );
  const [bulkMoveSession, setBulkMoveSession] = useState(() =>
    String(currentSession || "main")
  );

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

  // ✅ NEW: click-outside selection clearing
  const containerRef = useRef(null);

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

    // keep legacy call (ignored), but don't let it brick the app
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

  // INDEX FIX:
  // In "index" mode, rank colors by TIME within the visible window (fast -> green, slow -> red),
  // not by position / and not by raw min/max.
  const visibleRank01ByGlobalIndex = useMemo(() => {
    const items = visibleSolves.map((s, localIdx) => ({
      key: startIndex + localIdx,
      time: s?.time,
    }));
    return buildRank01Map(items);
  }, [visibleSolves, startIndex]);

  // Horizontal slice
  const horizontalCount = windowWidth > 1250 ? 12 : 5;

  const horizontalSolves = useMemo(() => {
    return solvesSafe.slice(-horizontalCount);
  }, [solvesSafe, horizontalCount]);

  const horizontalRank01ByGlobalIndex = useMemo(() => {
    const base = solvesSafe.length - horizontalSolves.length;
    const items = horizontalSolves.map((s, i) => ({
      key: base + i,
      time: s?.time,
    }));
    return buildRank01Map(items);
  }, [horizontalSolves, solvesSafe.length]);

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

    // BUCKET MODE: your CSS classes
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
  // ✅ Selection interaction rules
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

    // If user is in selection flow OR using modifiers, don't open Detail
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

    // Normal click: open Detail
    handleSolvePrimaryAction(solve, solveIndex);
  };

  const isIndexSelected = (idx) => selectedIndices.has(idx);

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

  // ✅ Use the actual list key for the solves you're viewing
  const sourceListKey = normalizeEventCode(eventKey || currentEvent || solvesSafe[0]?.event || "");

  const applyBulkTags = async () => {
    const patch = {};
    if (String(bulkCubeModel || "").trim()) patch.CubeModel = String(bulkCubeModel).trim();
    if (String(bulkCrossColor || "").trim()) patch.CrossColor = String(bulkCrossColor).trim();

    const custom = parseCustomLines(bulkCustomLines);
    if (Object.keys(custom).length) patch.Custom = custom;

    // Practice mode: local-only edit
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

        // local update so UI matches immediately
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

    // practice mode = local-only move
    if (practiceMode) {
      const idxs = Array.from(selectedIndices).sort((a, b) => b - a);

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const sourceArr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        // remove from current view
        const moving = [];
        for (const idx of idxs) {
          if (sourceArr[idx]) moving.push(sourceArr[idx]);
          sourceArr.splice(idx, 1);
        }
        next[sourceListKey] = sourceArr;

        // optionally add to target event list in memory (only if it exists)
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
        // ✅ CRITICAL FIX:
        // Your session queries rely on GSI1PK = SESSION#user#event#session
        // If you move an item, you MUST update GSI1PK too or it won't "move".
        const nextGsi1pk = buildGsi1pk(user.UserID, targetEvent, targetSession);

        await updateSolve(user.UserID, s.datetime, {
          Event: targetEvent,
          SessionID: targetSession,
          GSI1PK: nextGsi1pk,
          // GSI1SK stays the timestamp (same datetime), so no need to set it
        });
      }

      // local UI: remove them from the current list immediately
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

    // Capture targets BEFORE any UI changes
    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    if (!targets.length) {
      clearSelection();
      return;
    }

    // ✅ Practice mode: local-only delete (single state update)
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

    // ✅ Signed-in mode:
    // Call deleteTime BY DATETIME so App.js can do stable deletes (no index drift).
    try {
      for (const s of targets) {
        await deleteTime(s?.datetime);
      }
    } catch (e) {
      console.error("Bulk delete failed:", e);
    }

    clearSelection();
  };

  //  NEW: bulk share
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

  // ✅ NEW: click outside cancels selection (but not when clicking solves/bulk UI/modals)
  const handleContainerMouseDown = (e) => {
    if (selectionCount === 0) return;

    const el = e.target;
    if (!el) return;

    // Don't clear when clicking solve tiles, bulk bar/buttons, or inside modals
    if (el.closest?.(".TimeItem")) return;
    if (el.closest?.("[data-bulk-ui]")) return;
    if (el.closest?.("[data-bulk-modal]")) return;

    clearSelection();
  };

  // Now it's safe to early-return (hooks are already done)
  if (solvesSafe.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }

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

  const horizontalTimes = horizontalSolves
    .map((s) => s?.time)
    .filter((v) => typeof v === "number" && isFinite(v));

  const bestTime = horizontalTimes.length ? Math.min(...horizontalTimes) : null;
  const worstTime = horizontalTimes.length ? Math.max(...horizontalTimes) : null;

  const ao5s = horizontalSolves
    .map((_, index, arr) => {
      const actualIndex = solvesSafe.length - arr.length + index;
      const slice = solvesSafe.slice(actualIndex - 4, actualIndex + 1);
      return slice.length === 5 ? calculateAverage(slice.map((s) => s.time), true).average : null;
    })
    .filter((a) => a !== null);

  const ao12s = horizontalSolves
    .map((_, index, arr) => {
      const actualIndex = solvesSafe.length - arr.length + index;
      const slice = solvesSafe.slice(actualIndex - 11, actualIndex + 1);
      return slice.length === 12 ? calculateAverage(slice.map((s) => s.time), true).average : null;
    })
    .filter((a) => a !== null);

  const bestAo5 = ao5s.length ? Math.min(...ao5s) : null;
  const worstAo5 = ao5s.length ? Math.max(...ao5s) : null;
  const bestAo12 = ao12s.length ? Math.min(...ao12s) : null;
  const worstAo12 = ao12s.length ? Math.max(...ao12s) : null;

  return (
    <div
      className="time-list-container"
      ref={containerRef}
      onMouseDown={handleContainerMouseDown}
    >
      {/* ✅ BULK ACTION BAR */}
      <div style={bulkBarStyle} data-bulk-ui onMouseDown={(e) => e.stopPropagation()}>
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

          {/* ✅ NEW: Share */}
          <button type="button" style={bulkBtnStyle} onClick={openBulkShare}>
            Share
          </button>

          {/* ✅ NEW: Delete */}
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

      {isHorizontal ? (
        <div className="horizontal-time-list">
          {/* AO12 */}
          <div className="horizontal-row ao12-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index;
              const slice = solvesSafe.slice(actualIndex - 11, actualIndex + 1);
              if (slice.length === 12) {
                const avg = calculateAverage(slice.map((s) => s.time), true).average;
                const textClass =
                  bestAo12 != null && avg === bestAo12
                    ? "best-time"
                    : worstAo12 != null && avg === worstAo12
                    ? "worst-time"
                    : "";
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
              }
              return <div key={index} className="ao12 empty TimeItem"></div>;
            })}
            <div className="TimeItem row-label">AO12</div>
          </div>

          {/* AO5 */}
          <div className="horizontal-row ao5-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index;
              const slice = solvesSafe.slice(actualIndex - 4, actualIndex + 1);
              if (slice.length === 5) {
                const avg = calculateAverage(slice.map((s) => s.time), true).average;
                const textClass =
                  bestAo5 != null && avg === bestAo5
                    ? "best-time"
                    : worstAo5 != null && avg === worstAo5
                    ? "worst-time"
                    : "";
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
              }
              return <div key={index} className="ao5 empty TimeItem"></div>;
            })}
            <div className="TimeItem row-label">AO5</div>
          </div>

          {/* Times */}
          <div className="horizontal-row times-row">
            {horizontalSolves.map((solve, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index;

              const tval = solve?.time;
              const isBest = bestTime != null && tval === bestTime;
              const isWorst = worstTime != null && tval === worstTime;

              const rank01 =
                timeColorMode === "index" ? horizontalRank01ByGlobalIndex[actualIndex] ?? 0 : 0;

              const { perfClass, perfStyle } =
                !isBest && !isWorst
                  ? getPerfClassAndStyle(tval, bestTime, worstTime, rank01)
                  : { perfClass: "", perfStyle: null };

              const selected = isIndexSelected(actualIndex);
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
                  onClick={(e) => onSolveClick(e, solve, actualIndex)}
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

          {/* Solve count */}
          <div className="horizontal-row count-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index + 1;
              return (
                <div key={index} className="solve-count TimeItem">
                  {actualIndex}
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

      {/* ✅ BULK TAG MODAL */}
      {showBulkTags && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkTags(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Edit Tags ({selectionCount})
            </div>
            <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "12px" }}>
              Applies to all selected solves. “Merge” adds/overwrites fields; “Replace” sets Tags
              exactly to what you define here.
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
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  CubeModel
                </div>
                <input
                  style={inputStyle}
                  value={bulkCubeModel}
                  onChange={(e) => setBulkCubeModel(e.target.value)}
                  placeholder="Gan 13"
                />
              </div>
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  CrossColor
                </div>
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

      {/* ✅ BULK MOVE MODAL */}
      {showBulkMove && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkMove(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Move Solves ({selectionCount})
            </div>
            <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "12px" }}>
              This updates the solves’ <b>Event</b> and/or <b>SessionID</b> <b>and</b> the session
              index key (<b>GSI1PK</b>). They’ll disappear from the current view immediately.
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

            <div style={{ marginTop: "10px", fontSize: "12px", opacity: 0.75 }}>
              Tip: You can keep selecting across pages — selection is global by index in the current
              loaded list.
            </div>
          </div>
        </div>
      )}

      {/* ✅ BULK SHARE MODAL */}
      {showBulkShare && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkShare(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Share Solves ({selectionCount})
            </div>

            <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "10px" }}>
              Creates a post containing the selected solves.
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