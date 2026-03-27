import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import "./TimeList.css";
import "./TimeItem.css";
import Detail from "../Detail/Detail";
import { useSettings } from "../../contexts/SettingsContext";
import { formatTime, calculateAverage, getOveralls } from "./TimeUtils";

import useSolveSelection from "../../hooks/useSolveSelection";
import useBulkSolveActions from "../../hooks/useBulkSolveActions";
import BulkSolveControls from "../SolveBulk/BulkSolveControls";
import { normalizeEventCode } from "../SolveBulk/solveBulkUtils";
import ForwardSVG from "../../assets/ForwardSVG.svg";
import BackwardSVG from "../../assets/BackwardSVG.svg";

function normalizeNavigationArrowStyle(style) {
  return String(style || "").trim().toLowerCase() === "classic"
    ? "classic"
    : "scramble";
}

function NavigationArrow({ direction, style }) {
  const resolvedStyle = normalizeNavigationArrowStyle(style);
  const isClassic = resolvedStyle === "classic";

  if (isClassic) {
    const glyphMap = {
      left: "◀",
      right: "▶",
      up: "▲",
      down: "▼",
    };

    return (
      <span className="timelist-nav-glyph" aria-hidden="true">
        {glyphMap[direction] || "▶"}
      </span>
    );
  }

  const isBackward = direction === "left" || direction === "up";
  const rotateClass =
    direction === "up"
      ? "timelist-nav-icon--up"
      : direction === "down"
      ? "timelist-nav-icon--down"
      : direction === "left"
      ? "timelist-nav-icon--left"
      : "timelist-nav-icon--right";

  return (
    <img
      src={isBackward ? BackwardSVG : ForwardSVG}
      alt=""
      className={`timelist-nav-icon ${rotateClass}`}
    />
  );
}

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hslColor(h, s = 100, l = 50) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function hueGreenToRed(t01) {
  const t = clamp01(t01);
  return 120 * (1 - t);
}

function buildRank01Map(items) {
  const valid = items
    .filter((it) => typeof it.time === "number" && isFinite(it.time))
    .map((it) => ({ key: it.key, time: it.time }));

  const n = valid.length;
  const out = {};
  if (n <= 1) {
    valid.forEach((v) => {
      out[v.key] = 0;
    });
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

function hasRealSolveRef(solve) {
  const ref = solve?.solveRef;
  return typeof ref === "string" && ref.startsWith("SOLVE#");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSharedRowStatus(row = {}, currentIndex) {
  const idx = Number(row?.index);
  if (!Number.isFinite(idx)) return "pending";
  if (idx < currentIndex) return "done";
  if (idx === currentIndex) return "current";
  return "upcoming";
}

function findSharedCurrentIndex(rows = []) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    if (!row.complete) return i;
  }
  return rows.length ? -1 : 0;
}

function buildSharedMirrorRows(rows = [], colsPerRow = 12) {
  const out = [];
  for (let i = 0; i < rows.length; i += colsPerRow) {
    out.push(rows.slice(i, i + colsPerRow));
  }
  return out;
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
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode,
  tagConfig,
  cubeModelOptions = [],
  discoveredTagOptions = {},
  onAverageClick,
  onLoadMore,
  canLoadMore = true,
  isLoadingMore = false,
  totalSolveCount,

  sharedAverageMeta = null,
  onRefreshSharedAverage,
  onLeaveSharedSession,
  sharedAverageRefreshMs = 10000,
}) {
  const { settings } = useSettings();

  const solvesSafe = useMemo(() => {
    return Array.isArray(solves) ? solves : [];
  }, [solves]);

  const isHorizontal = inPlayerBar ? false : settings.horizontalTimeList;
  const horizontalScrollEnabled = !!settings.horizontalTimeListScroll;
  const navigationArrowStyle = normalizeNavigationArrowStyle(
    settings?.navigationArrowStyle
  );

  const timeColorModeRaw = settings?.timeColorMode || "binary";
  const timeColorMode = timeColorModeRaw === "spectrum" ? "bucket" : timeColorModeRaw;

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);
  const [selectedSolveList, setSelectedSolveList] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [horizontalPage, setHorizontalPage] = useState(0);

  const selection = useSolveSelection();

  const bulkActions = useBulkSolveActions({
    user,
    solves: solvesSafe,
    selectedIndices: selection.selectedIndices,
    clearSelection: selection.clearSelection,
    deleteTime,
    addPost,
    setSessions,
    sessionsList,
    currentEvent,
    currentSession,
    eventKey,
    practiceMode,
  });

  const horizontalScrollRef = useRef(null);
  const pendingPrependRef = useRef(false);
  const prevLenRef = useRef(solvesSafe.length);
  const prevScrollLeftRef = useRef(0);
  const isNearRightRef = useRef(true);

  const COL_W = 70;
  const COL_GAP = 4;
  const COL_STEP = COL_W + COL_GAP;

  const horizontalColsSetting = String(settings?.horizontalTimeListCols || "auto").toLowerCase();
  const horizontalCount =
    horizontalColsSetting === "12"
      ? 12
      : horizontalColsSetting === "5"
      ? 5
      : windowWidth > 1250
      ? 12
      : 5;

  const horizontalMaxWidthPx = useMemo(() => {
    const cols = horizontalCount + 1;
    return cols * COL_STEP + 10;
  }, [horizontalCount]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);

    const colsPerRow = window.innerWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solvesSafe.length / colsPerRow);
    setCurrentPage(Math.max(0, totalRows - rowsToShow));

    return () => window.removeEventListener("resize", handleResize);
  }, [solvesSafe.length, rowsToShow]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selection.selectionCount > 0) {
          e.preventDefault();
          selection.clearSelection();
        }
        if (bulkActions.showBulkTags) bulkActions.setShowBulkTags(false);
        if (bulkActions.showBulkMove) bulkActions.setShowBulkMove(false);
        if (bulkActions.showBulkShare) bulkActions.setShowBulkShare(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, bulkActions]);

  useEffect(() => {
    bulkActions.setBulkMoveEvent(normalizeEventCode(currentEvent));
  }, [currentEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bulkActions.setBulkMoveSession(String(currentSession || "main"));
  }, [currentSession]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHorizontalPage(0);
  }, [eventKey, currentSession, horizontalCount, horizontalScrollEnabled]);

  useEffect(() => {
    if (!sharedAverageMeta?.active) return undefined;
    if (typeof onRefreshSharedAverage !== "function") return undefined;

    const id = window.setInterval(() => {
      onRefreshSharedAverage();
    }, Math.max(3000, Number(sharedAverageRefreshMs) || 10000));

    return () => window.clearInterval(id);
  }, [sharedAverageMeta?.active, onRefreshSharedAverage, sharedAverageRefreshMs]);

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
      // ignore
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

  const visibleRank01ByGlobalIndex = useMemo(() => {
    const items = visibleSolves.map((s, localIdx) => ({
      key: startIndex + localIdx,
      time: s?.time,
    }));
    return buildRank01Map(items);
  }, [visibleSolves, startIndex]);

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
      stats?.SolveCountTotal ??
      stats?.solveCountTotal ??
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
    if (horizontalScrollEnabled) return solvesSafe;
    return solvesSafe.slice(pagedWindow.start, pagedWindow.end);
  }, [isHorizontal, horizontalScrollEnabled, solvesSafe, pagedWindow.start, pagedWindow.end]);

  const horizontalRank01ByKey = useMemo(() => {
    if (!isHorizontal) return {};
    if (horizontalScrollEnabled) {
      const items = horizontalSolves.map((s, i) => ({ key: i, time: s?.time }));
      return buildRank01Map(items);
    }

    const items = horizontalSolves.map((s, i) => ({
      key: pagedWindow.start + i,
      time: s?.time,
    }));
    return buildRank01Map(items);
  }, [isHorizontal, horizontalScrollEnabled, horizontalSolves, pagedWindow.start]);

  const sharedRows = useMemo(() => {
    return safeArray(sharedAverageMeta?.rows).map((row, idx) => ({
      index: Number.isFinite(Number(row?.index)) ? Number(row.index) : idx,
      scramble: row?.scramble || "",
      event: row?.event || "",
      yourTime: row?.yourTime ?? null,
      theirTime: row?.theirTime ?? null,
      peers: safeArray(row?.peers),
      complete: !!row?.complete,
    }));
  }, [sharedAverageMeta]);

  const derivedSharedCurrentIndex = useMemo(() => {
    if (Number.isFinite(Number(sharedAverageMeta?.currentIndex))) {
      return Number(sharedAverageMeta.currentIndex);
    }
    return findSharedCurrentIndex(sharedRows);
  }, [sharedAverageMeta, sharedRows]);

  const sharedMirrorRows = useMemo(
    () => buildSharedMirrorRows(sharedRows, colsPerRow),
    [sharedRows, colsPerRow]
  );

  const getPerfClassAndStyle = (value, min, max, rank01) => {
    if (timeColorMode === "binary") return { perfClass: "", perfStyle: null };

    if (timeColorMode === "index") {
      const h = hueGreenToRed(rank01);
      const c = hslColor(h, 100, 55);
      return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
    }

    if (typeof value !== "number" || !isFinite(value)) return { perfClass: "", perfStyle: null };
    if (typeof min !== "number" || !isFinite(min)) return { perfClass: "", perfStyle: null };
    if (typeof max !== "number" || !isFinite(max)) return { perfClass: "", perfStyle: null };
    if (max <= min) return { perfClass: "", perfStyle: null };

    const t = clamp01((value - min) / (max - min));

    if (timeColorMode === "bucket") {
      if (t <= 0.2) return { perfClass: "overall-border-min", perfStyle: null };
      if (t <= 0.4) return { perfClass: "faster", perfStyle: null };
      if (t <= 0.6) return { perfClass: "middle-fast", perfStyle: null };
      if (t <= 0.8) return { perfClass: "slower", perfStyle: null };
      return { perfClass: "overall-border-max", perfStyle: null };
    }

    const h = hueGreenToRed(t);
    const c = hslColor(h, 100, 55);
    return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
  };

  const handleSolvePrimaryAction = (solve, solveIndex) => {
    if (solve?.tags?.IsRelay && Array.isArray(solve.tags.RelayLegs)) {
      const legs = solve.tags.RelayLegs || [];
      const scrs = solve.tags.RelayScrambles || [];
      const timesArr = solve.tags.RelayLegTimes || [];

      const expanded = legs.map((ev, i) => ({
        solveRef: `RELAYLEG#${solve.solveRef || "local"}#${i}`,
        createdAt: solve.createdAt,
        event: ev,
        scramble: scrs[i] || "",
        time: timesArr[i] ?? 0,
        rawTimeMs: timesArr[i] ?? 0,
        finalTimeMs: timesArr[i] ?? 0,
        penalty: null,
        note: "",
        userID: user?.UserID,
        __readOnly: true,
      }));

      setSelectedSolveList(expanded);
      setSelectedSolveIndex(solveIndex);
      return;
    }

    setSelectedSolve({ ...solve, userID: user?.UserID });
    setSelectedSolveIndex(solveIndex);
  };

  const onSolveClick = (e, solve, solveIndex) => {
    const handledAsSelection = selection.handleSelectionClick(e, solveIndex);
    if (handledAsSelection) return;
    handleSolvePrimaryAction(solve, solveIndex);
  };

  const openAverageWindow = (slice) => {
    const solvesForAverage = Array.isArray(slice) ? slice.filter(Boolean) : [];
    if (!solvesForAverage.length) return;

    if (typeof onAverageClick === "function") {
      onAverageClick(solvesForAverage);
      return;
    }

    setSelectedSolveList(
      solvesForAverage.map((s) => ({
        ...s,
        userID: user?.UserID,
      }))
    );
  };

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
  }, [horizontalScrollEnabled, solvesSafe.length]);

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

    const start = pagedWindow.start;
    const end = pagedWindow.end;

    for (let gi = start; gi < end; gi++) {
      if (gi >= 4) {
        const slice = solvesSafe.slice(gi - 4, gi + 1);
        if (slice.length === 5) ao5[gi] = calculateAverage(slice.map((s) => s?.time), true).average;
      }
      if (gi >= 11) {
        const slice = solvesSafe.slice(gi - 11, gi + 1);
        if (slice.length === 12) {
          ao12[gi] = calculateAverage(slice.map((s) => s?.time), true).average;
        }
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
    if (!isHorizontal) {
      return {
        bestTime: null,
        worstTime: null,
        bestAo5: null,
        worstAo5: null,
        bestAo12: null,
        worstAo12: null,
      };
    }

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

  if (solvesSafe.length === 0 && !sharedAverageMeta?.active) {
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

          const selected = selection.isIndexSelected(solveIndex);

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
                if (e.shiftKey || e.ctrlKey || e.metaKey || selection.selectionCount > 0) {
                  e.preventDefault();
                }
              }}
            >
              {formatTime(solve.time, false, solve.penalty)}
              <span
                className="delete-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasRealSolveRef(solve)) {
                    deleteTime(solve.solveRef);
                  }
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
        <td className="TimeItem current-five" onClick={() => openAverageWindow(timesRow)}>
          {formatTime(averageData.average)}
        </td>
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

  const { bestTime, worstTime, bestAo5, worstAo5, bestAo12, worstAo12 } = horizontalBestWorst;

  const getKeyForIndex = (localIndex) => {
    if (horizontalScrollEnabled) return localIndex;
    return pagedWindow.start + localIndex;
  };

  const getSolveNumberForIndex = (localIndex) => {
    const globalIdx = horizontalScrollEnabled ? localIndex : pagedWindow.start + localIndex;
    return globalBaseIndex + globalIdx + 1;
  };

  const selectedSolveListIsMutable =
    Array.isArray(selectedSolveList) && selectedSolveList.every((s) => hasRealSolveRef(s));

  return (
    <div className="time-list-container">
      <BulkSolveControls
        selectionCount={selection.selectionCount}
        clearSelection={selection.clearSelection}
        showBulkTags={bulkActions.showBulkTags}
        setShowBulkTags={bulkActions.setShowBulkTags}
        showBulkMove={bulkActions.showBulkMove}
        setShowBulkMove={bulkActions.setShowBulkMove}
        showBulkShare={bulkActions.showBulkShare}
        setShowBulkShare={bulkActions.setShowBulkShare}
        openBulkTags={bulkActions.openBulkTags}
        openBulkMove={bulkActions.openBulkMove}
        openBulkShare={bulkActions.openBulkShare}
        bulkTagMode={bulkActions.bulkTagMode}
        setBulkTagMode={bulkActions.setBulkTagMode}
        bulkCubeModel={bulkActions.bulkCubeModel}
        setBulkCubeModel={bulkActions.setBulkCubeModel}
        bulkCrossColor={bulkActions.bulkCrossColor}
        setBulkCrossColor={bulkActions.setBulkCrossColor}
        bulkCustomLines={bulkActions.bulkCustomLines}
        setBulkCustomLines={bulkActions.setBulkCustomLines}
        bulkMoveEvent={bulkActions.bulkMoveEvent}
        setBulkMoveEvent={bulkActions.setBulkMoveEvent}
        bulkMoveSession={bulkActions.bulkMoveSession}
        setBulkMoveSession={bulkActions.setBulkMoveSession}
        bulkShareNote={bulkActions.bulkShareNote}
        setBulkShareNote={bulkActions.setBulkShareNote}
        getSessionsForEvent={bulkActions.getSessionsForEvent}
        applyBulkTags={bulkActions.applyBulkTags}
        applyBulkMove={bulkActions.applyBulkMove}
        applyBulkDelete={bulkActions.applyBulkDelete}
        applyBulkShare={bulkActions.applyBulkShare}
        enableShare={true}
      />

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

      {solvesSafe.length > 0 && (isHorizontal ? (
        <div className="horizontal-shell">
          {!horizontalScrollEnabled && (
            <button
              type="button"
              className="horizontal-nav-btn"
              onClick={pageOlder}
              disabled={!canPageOlder}
              title={`Older (${horizontalCount})`}
            >
              <NavigationArrow direction="left" style={navigationArrowStyle} />
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
                    onClick={() => openAverageWindow(slice)}
                  >
                    {formatTime(avg)}
                  </div>
                );
              })}
              <div className="TimeItem row-label">AO12</div>
            </div>

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
                    onClick={() => openAverageWindow(slice)}
                  >
                    {formatTime(avg)}
                  </div>
                );
              })}
              <div className="TimeItem row-label">AO5</div>
            </div>

            <div className="horizontal-row times-row" style={{ "--cols": horizontalSolves.length }}>
              {horizontalSolves.map((solve, index) => {
                const key = getKeyForIndex(index);
                const globalIdx = key;

                const tval = solve?.time;
                const isBest = bestTime != null && tval === bestTime;
                const isWorst = worstTime != null && tval === worstTime;

                const rank01 = timeColorMode === "index" ? horizontalRank01ByKey[key] ?? 0 : 0;

                const { perfClass, perfStyle } =
                  !isBest && !isWorst
                    ? getPerfClassAndStyle(tval, bestTime, worstTime, rank01)
                    : { perfClass: "", perfStyle: null };

                const selected = selection.isIndexSelected(globalIdx);
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
                      if (e.shiftKey || e.ctrlKey || e.metaKey || selection.selectionCount > 0) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {formatTime(tval, false, solve?.penalty)}
                    <span
                      className="delete-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasRealSolveRef(solve)) {
                          deleteTime(solve.solveRef);
                        }
                      }}
                    >
                      x
                    </span>
                  </div>
                );
              })}
              <div className="TimeItem row-label time-label">TIME</div>
            </div>

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
                profileColor={user?.Color || user?.color || "#2EC4B6"}
                onClose={() => setSelectedSolve(null)}
                deleteTime={() => {
                  if (hasRealSolveRef(selectedSolve)) deleteTime(selectedSolve.solveRef);
                }}
                addPost={addPost}
                applyPenalty={hasRealSolveRef(selectedSolve) ? applyPenalty : null}
                setSessions={setSessions}
                sessionsList={sessionsList}
                tagConfig={tagConfig}
                cubeModelOptions={cubeModelOptions}
                discoveredTagOptions={discoveredTagOptions}
              />
            )}

            {selectedSolveList && (
              <Detail
                solve={selectedSolveList}
                userID={user?.UserID}
                profileColor={user?.Color || user?.color || "#2EC4B6"}
                onClose={() => setSelectedSolveList(null)}
                deleteTime={() => {}}
                applyPenalty={selectedSolveListIsMutable ? applyPenalty : null}
                addPost={() =>
                  addPost({
                    note: "Average solve group",
                    event: selectedSolveList[0]?.event,
                    solveList: selectedSolveList,
                    comments: [],
                  })
                }
                setSessions={setSessions}
                sessionsList={sessionsList}
                tagConfig={tagConfig}
                cubeModelOptions={cubeModelOptions}
                discoveredTagOptions={discoveredTagOptions}
              />
            )}
          </div>

          {!horizontalScrollEnabled && (
            <button
              type="button"
              className="horizontal-nav-btn"
              onClick={pageNewer}
              disabled={!canPageNewer}
              title={`Newer (${horizontalCount})`}
            >
              <NavigationArrow direction="right" style={navigationArrowStyle} />
            </button>
          )}
        </div>
      ) : (
        <div className="time-list-content">
          {sharedAverageMeta?.active && sharedMirrorRows.length > 0 && (
            <div className="timeListSharedMirror">
              <div className="timeListSharedMirrorHeader">
                <span className="timeListSharedMirrorName">
                  {sharedAverageMeta?.theirLabel || "Them"}
                </span>
                <span className="timeListSharedMirrorMeta">
                  {derivedSharedCurrentIndex === -1
                    ? "Complete"
                    : `Round ${derivedSharedCurrentIndex + 1} / ${safeArray(sharedRows).length || sharedAverageMeta?.count || 0}`}
                </span>
                {((typeof onRefreshSharedAverage === "function") ||
                  (sharedAverageMeta?.active && typeof onLeaveSharedSession === "function")) && (
                  <div className="timeListSharedMirrorActions">
                    {typeof onRefreshSharedAverage === "function" && (
                      <button
                        type="button"
                        className="timeListSharedMirrorRefresh"
                        onClick={() => onRefreshSharedAverage()}
                      >
                        Refresh
                      </button>
                    )}
                    {sharedAverageMeta?.active && typeof onLeaveSharedSession === "function" && (
                      <button
                        type="button"
                        className="timeListSharedMirrorRefresh"
                        onClick={() => onLeaveSharedSession()}
                      >
                        Exit
                      </button>
                    )}
                  </div>
                )}
              </div>

              <table className="TimeList TimeList--sharedMirror">
                <tbody>
                  {sharedMirrorRows.map((rowGroup, rowIdx) => (
                    <tr key={`shared-${rowIdx}`}>
                      {rowGroup.map((row, index) => {
                        const primaryPeer = safeArray(row?.peers)[0];
                        const value = Number.isFinite(Number(row?.theirTime))
                          ? Number(row.theirTime)
                          : Number.isFinite(Number(primaryPeer?.time))
                          ? Number(primaryPeer.time)
                          : null;

                        return (
                          <td
                            key={`shared-${row.index}-${index}`}
                            className={`TimeItem ${
                              row.index === derivedSharedCurrentIndex ? "current-five" : ""
                            }`}
                            title={`Round ${row.index + 1}${row?.scramble ? `: ${row.scramble}` : ""}`}
                          >
                            {value != null ? formatTime(value) : "—"}
                          </td>
                        );
                      })}
                      {rowGroup.length < colsPerRow &&
                        [...Array(colsPerRow - rowGroup.length)].map((_, index) => (
                          <td className="TimeItem" key={`shared-pad-${rowIdx}-${index}`}>
                            &nbsp;
                          </td>
                        ))}
                      <td className="TimeItem current-five">
                        {sharedAverageMeta?.theirLabel || "Them"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <table className="TimeList">
            <tbody>{rows}</tbody>
          </table>

          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              userID={user?.UserID}
              profileColor={user?.Color || user?.color || "#2EC4B6"}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => {
                if (hasRealSolveRef(selectedSolve)) deleteTime(selectedSolve.solveRef);
              }}
              addPost={addPost}
              applyPenalty={hasRealSolveRef(selectedSolve) ? applyPenalty : null}
              setSessions={setSessions}
              sessionsList={sessionsList}
              tagConfig={tagConfig}
              cubeModelOptions={cubeModelOptions}
              discoveredTagOptions={discoveredTagOptions}
            />
          )}

          {selectedSolveList && (
            <Detail
              solve={selectedSolveList}
              userID={user?.UserID}
              profileColor={user?.Color || user?.color || "#2EC4B6"}
              onClose={() => setSelectedSolveList(null)}
              deleteTime={() => {}}
              addPost={() =>
                addPost({
                  note: "Average solve group",
                  event: selectedSolveList[0]?.event,
                  solveList: selectedSolveList,
                  comments: [],
                })
              }
              applyPenalty={selectedSolveListIsMutable ? applyPenalty : null}
              setSessions={setSessions}
              sessionsList={sessionsList}
              tagConfig={tagConfig}
              cubeModelOptions={cubeModelOptions}
              discoveredTagOptions={discoveredTagOptions}
            />
          )}
        </div>
      ))}

      {!isHorizontal && solvesSafe.length > 0 && (
        <div className="pagination-buttons">
          <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>
            <NavigationArrow direction={inPlayerBar ? "left" : "up"} style={navigationArrowStyle} />
          </button>
          <button
            onClick={goToNextPage}
            disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solvesSafe.length}
          >
            <NavigationArrow direction={inPlayerBar ? "right" : "down"} style={navigationArrowStyle} />
          </button>
        </div>
      )}
    </div>
  );
}

export default TimeList;
