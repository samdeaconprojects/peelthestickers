import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import "./TimeTable.css";
import { formatTime, calculateAverage } from "../TimeList/TimeUtils";
import TimeItem from "../TimeList/TimeItem";
import Detail from "../Detail/Detail";
import useSolveSelection from "../../hooks/useSolveSelection";
import useBulkSolveActions from "../../hooks/useBulkSolveActions";
import BulkSolveControls from "../SolveBulk/BulkSolveControls";
import { normalizeEventCode } from "../SolveBulk/solveBulkUtils";

const TABLE_LIMITS = ["100", "250", "500", "1000", "all"];

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

function getSolveMs(solve) {
  if (!solve) return null;
  if (String(solve?.penalty || "").toUpperCase() === "DNF") return null;

  const t = Number(solve?.time);
  if (!Number.isFinite(t) || t < 0) return null;
  return t;
}

function getComparableSolveTime(solve) {
  if (!solve) return Number.POSITIVE_INFINITY;
  if (String(solve?.penalty || "").toUpperCase() === "DNF") return Number.POSITIVE_INFINITY;

  const t = Number(solve?.time);
  if (!Number.isFinite(t) || t < 0) return Number.POSITIVE_INFINITY;
  return t;
}

function getComparableSolveDate(solve) {
  const ts = new Date(solve?.datetime || "").getTime();
  if (!Number.isFinite(ts)) return 0;
  return ts;
}

function formatDateTime(datetime) {
  if (!datetime) return "—";
  const d = new Date(datetime);
  if (!Number.isFinite(d.getTime())) return "—";

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function solveToAverageValue(solve) {
  const penalty = String(solve?.penalty || "").toUpperCase();
  if (penalty === "DNF") return "DNF";

  const t = Number(solve?.time);
  if (!Number.isFinite(t) || t < 0) return "DNF";

  return t;
}

function getSolveKey(solve, fallbackIndex) {
  if (solve?.fullIndex != null) return `fi:${solve.fullIndex}`;
  if (solve?.datetime) return `dt:${solve.datetime}`;
  return `idx:${fallbackIndex}`;
}

function getPerfClassByRank01(rank01) {
  if (!isFinite(rank01)) return "";
  if (rank01 <= 0.2) return "fastest";
  if (rank01 <= 0.4) return "faster";
  if (rank01 <= 0.6) return "middle-fast";
  if (rank01 <= 0.8) return "slower";
  return "slowest";
}

const TimeTable = ({
  user,
  solves,
  deleteTime,
  addPost,
  applyPenalty,
  setSessions,
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode = false,
}) => {
  const [selectedSolve, setSelectedSolve] = useState(null);

  const [displayMode, setDisplayMode] = useState("items");
  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [itemRowSize, setItemRowSize] = useState(12);
  const [tableLimit, setTableLimit] = useState("1000");

  const selection = useSolveSelection();

  const limitedSolves = useMemo(() => {
    const arr = Array.isArray(solves) ? solves : [];
    if (tableLimit === "all") return arr;
    const n = Math.max(1, Number(tableLimit || 0));
    return arr.slice(-n);
  }, [solves, tableLimit]);

  const showAverages = sortBy !== "time";
  const totalDisplayed = Array.isArray(limitedSolves) ? limitedSolves.length : 0;

  const timeRange = useMemo(() => {
    const numeric = (limitedSolves || []).map(getSolveMs).filter((v) => Number.isFinite(v));
    if (numeric.length === 0) return { min: null, max: null };

    return {
      min: Math.min(...numeric),
      max: Math.max(...numeric),
    };
  }, [limitedSolves]);

  const averagesByKey = useMemo(() => {
    const ao5 = new Map();
    const ao12 = new Map();

    const chronological = Array.isArray(limitedSolves) ? limitedSolves : [];

    for (let i = 0; i < chronological.length; i++) {
      const solve = chronological[i];
      const key = getSolveKey(solve, i);

      if (i >= 4) {
        const slice = chronological.slice(i - 4, i + 1);
        try {
          const result = calculateAverage(slice.map(solveToAverageValue), true);
          ao5.set(key, result?.average ?? null);
        } catch {
          ao5.set(key, null);
        }
      } else {
        ao5.set(key, null);
      }

      if (i >= 11) {
        const slice = chronological.slice(i - 11, i + 1);
        try {
          const result = calculateAverage(slice.map(solveToAverageValue), true);
          ao12.set(key, result?.average ?? null);
        } catch {
          ao12.set(key, null);
        }
      } else {
        ao12.set(key, null);
      }
    }

    return { ao5, ao12 };
  }, [limitedSolves]);

  const sortedSolves = useMemo(() => {
    const arr = Array.isArray(limitedSolves) ? [...limitedSolves] : [];
    const dir = sortDirection === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      if (sortBy === "time") {
        const at = getComparableSolveTime(a);
        const bt = getComparableSolveTime(b);

        if (at !== bt) return (at - bt) * dir;

        const ad = getComparableSolveDate(a);
        const bd = getComparableSolveDate(b);
        return (ad - bd) * -1;
      }

      const ad = getComparableSolveDate(a);
      const bd = getComparableSolveDate(b);

      if (ad !== bd) return (ad - bd) * dir;

      const at = getComparableSolveTime(a);
      const bt = getComparableSolveTime(b);
      return at - bt;
    });

    return arr;
  }, [limitedSolves, sortBy, sortDirection]);

  const bulkActions = useBulkSolveActions({
    user,
    solves: sortedSolves,
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

  const overallVisibleRankMap = useMemo(() => {
    return buildRank01Map(
      sortedSolves.map((solve, idx) => ({
        key: idx,
        time: getSolveMs(solve),
      }))
    );
  }, [sortedSolves]);

  const tableRows = useMemo(() => {
    return sortedSolves.map((solve, index) => {
      const key = getSolveKey(solve, index);
      return {
        ...solve,
        __ao5: showAverages ? averagesByKey.ao5.get(key) ?? null : null,
        __ao12: showAverages ? averagesByKey.ao12.get(key) ?? null : null,
        __displayNumber:
          sortBy === "date" && sortDirection === "desc"
            ? totalDisplayed - index
            : index + 1,
        __sortedIndex: index,
      };
    });
  }, [sortedSolves, showAverages, averagesByKey, sortBy, sortDirection, totalDisplayed]);

  const itemRows = useMemo(() => {
    const chunks = chunkArray(sortedSolves, itemRowSize);

    return chunks.map((chunk, rowIndex) => {
      let average = null;

      if (showAverages) {
        try {
          const result = calculateAverage(chunk.map(solveToAverageValue), true);
          average = result?.average ?? null;
        } catch {
          average = null;
        }
      }

      const solvesWithDisplay = chunk.map((solve, solveIndex) => {
        const flatIndex = rowIndex * itemRowSize + solveIndex;
        const displayNumber =
          sortBy === "date" && sortDirection === "desc"
            ? totalDisplayed - flatIndex
            : flatIndex + 1;

        return {
          ...solve,
          __displayNumber: displayNumber,
          __flatIndex: flatIndex,
        };
      });

      const rowRankMap =
        sortBy === "time"
          ? overallVisibleRankMap
          : buildRank01Map(
              solvesWithDisplay.map((solve, idx) => ({
                key: idx,
                time: getSolveMs(solve),
              }))
            );

      const numeric = solvesWithDisplay
        .map((s, idx) => ({ idx, time: getSolveMs(s) }))
        .filter((x) => Number.isFinite(x.time));

      const bestIdxSet = new Set();
      const worstIdxSet = new Set();

      if (numeric.length > 0) {
        const minTime = Math.min(...numeric.map((x) => x.time));
        const maxTime = Math.max(...numeric.map((x) => x.time));

        numeric.forEach((item) => {
          if (item.time === minTime) bestIdxSet.add(item.idx);
          if (item.time === maxTime) worstIdxSet.add(item.idx);
        });
      }

      return {
        rowIndex,
        average,
        rankMap: rowRankMap,
        bestIdxSet,
        worstIdxSet,
        solves: solvesWithDisplay,
      };
    });
  }, [
    sortedSolves,
    itemRowSize,
    showAverages,
    sortBy,
    sortDirection,
    totalDisplayed,
    overallVisibleRankMap,
  ]);

  const handleSolvePrimaryAction = (solve) => {
    setSelectedSolve({ ...solve, userID: user?.UserID });
  };

  const onSolveClick = (e, solve, solveIndex) => {
    const handledAsSelection = selection.handleSelectionClick(e, solveIndex);
    if (handledAsSelection) return;
    handleSolvePrimaryAction(solve);
  };

  const closeDetail = () => {
    setSelectedSolve(null);
  };

  return (
    <div className="time-table-container">
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

      <div className="time-table-toolbar">
        <div className="time-table-toolbar-group">
          <button
            type="button"
            className={`time-table-toggle ${displayMode === "items" ? "active" : ""}`}
            onClick={() => setDisplayMode("items")}
          >
            Time Items
          </button>

          <button
            type="button"
            className={`time-table-toggle ${displayMode === "table" ? "active" : ""}`}
            onClick={() => setDisplayMode("table")}
          >
            Table
          </button>
        </div>

        <div className="time-table-toolbar-group">
          <button
            type="button"
            className={`time-table-toggle ${sortBy === "date" ? "active" : ""}`}
            onClick={() => setSortBy("date")}
          >
            Date
          </button>

          <button
            type="button"
            className={`time-table-toggle ${sortBy === "time" ? "active" : ""}`}
            onClick={() => setSortBy("time")}
          >
            Best Time
          </button>
        </div>

        <div className="time-table-toolbar-group">
          <button
            type="button"
            className={`time-table-toggle ${sortDirection === "asc" ? "active" : ""}`}
            onClick={() => setSortDirection("asc")}
          >
            ↑
          </button>

          <button
            type="button"
            className={`time-table-toggle ${sortDirection === "desc" ? "active" : ""}`}
            onClick={() => setSortDirection("desc")}
          >
            ↓
          </button>
        </div>

        <div className="time-table-toolbar-group">
          <select
            className="time-table-select"
            value={tableLimit}
            onChange={(e) => setTableLimit(e.target.value)}
          >
            {TABLE_LIMITS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All loaded" : `Last ${v}`}
              </option>
            ))}
          </select>
        </div>

        {displayMode === "items" && (
          <div className="time-table-toolbar-group">
            <button
              type="button"
              className={`time-table-toggle ${itemRowSize === 5 ? "active" : ""}`}
              onClick={() => setItemRowSize(5)}
            >
              Rows of 5
            </button>

            <button
              type="button"
              className={`time-table-toggle ${itemRowSize === 12 ? "active" : ""}`}
              onClick={() => setItemRowSize(12)}
            >
              Rows of 12
            </button>
          </div>
        )}
      </div>

      {displayMode === "table" ? (
        <div className="time-items-view">
          {tableRows.map((solve, index) => {
            const ms = getSolveMs(solve);
            const tablePerfClass = getPerfClassByRank01(overallVisibleRankMap[index]);

            const selected = selection.isIndexSelected(index);
            const selectStyleInline = selected
              ? {
                  outline: "2px solid rgba(46,196,182,0.95)",
                  outlineOffset: "-2px",
                  boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
                }
              : null;

            return (
              <button
                type="button"
                key={`${solve?.datetime || "no-date"}-${solve?.fullIndex ?? index}-${index}`}
                className="time-items-row"
                style={selectStyleInline || undefined}
                onClick={(e) => onSolveClick(e, solve, index)}
                onMouseDown={(e) => {
                  if (e.shiftKey || e.ctrlKey || e.metaKey || selection.selectionCount > 0) {
                    e.preventDefault();
                  }
                }}
              >
                <div className="time-items-rank">{solve.__displayNumber}</div>

                <div className="time-items-main">
                  <div className="time-items-time-wrap">
                    <TimeItem
                      ms={ms}
                      time={ms == null ? formatTime(solve?.time, false, solve?.penalty) : undefined}
                      penalty={solve?.penalty}
                      rangeMin={timeRange.min}
                      rangeMax={timeRange.max}
                      className={`time-items-time ${tablePerfClass}`}
                    />
                  </div>

                  <div className="time-items-meta">
                    <span className="time-items-date">
                      {formatDateTime(solve?.datetime)}
                    </span>
                    <span className="time-items-scramble">
                      {solve?.scramble || "—"}
                    </span>
                  </div>

                  {showAverages && (
                    <div className="time-items-averages">
                      <div className="time-items-average-box">
                        <span className="time-items-average-label">Ao5</span>
                        <span className="time-items-average-value">
                          {solve.__ao5 != null ? formatTime(solve.__ao5) : "—"}
                        </span>
                      </div>

                      <div className="time-items-average-box">
                        <span className="time-items-average-label">Ao12</span>
                        <span className="time-items-average-value">
                          {solve.__ao12 != null ? formatTime(solve.__ao12) : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={`timelist-rows-view timelist-rows-view--${itemRowSize}`}>
          {itemRows.map((row) => (
            <div className="timelist-row-wrap" key={`row-${row.rowIndex}`}>
              <div className="timelist-row">
                {row.solves.map((solve, solveIndex) => {
                  const perfKey = sortBy === "time" ? solve.__flatIndex : solveIndex;
                  const perfClass = getPerfClassByRank01(row.rankMap[perfKey]);
                  const isBest = sortBy !== "time" && row.bestIdxSet.has(solveIndex);
                  const isWorst = sortBy !== "time" && row.worstIdxSet.has(solveIndex);

                  const selected = selection.isIndexSelected(solve.__flatIndex);
                  const selectStyleInline = selected
                    ? {
                        outline: "2px solid rgba(46,196,182,0.95)",
                        outlineOffset: "-2px",
                        boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
                      }
                    : null;

                  return (
                    <div
                      key={`${solve?.datetime || "no-date"}-${solve?.fullIndex ?? solveIndex}-${solveIndex}`}
                      className="timelist-row-cell-wrap"
                    >
                      <button
                        type="button"
                        className={`timelist-row-cell TimeItem ${perfClass} ${
                          isBest ? "dashed-border-min" : ""
                        } ${isWorst ? "dashed-border-max" : ""}`}
                        style={selectStyleInline || undefined}
                        onClick={(e) => onSolveClick(e, solve, solve.__flatIndex)}
                        onMouseDown={(e) => {
                          if (e.shiftKey || e.ctrlKey || e.metaKey || selection.selectionCount > 0) {
                            e.preventDefault();
                          }
                        }}
                        title={formatDateTime(solve?.datetime)}
                      >
                        {formatTime(solve?.time, false, solve?.penalty)}
                      </button>

                      <div className="timelist-row-cell-index">
                        {solve.__displayNumber}
                      </div>
                    </div>
                  );
                })}

                {showAverages && (
                  <div className="timelist-row-average">
                    <span className="timelist-row-average-label">AVG</span>
                    <span className="timelist-row-average-value">
                      {row.average != null ? formatTime(row.average) : "DNF"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          userID={user?.UserID}
          onClose={closeDetail}
          deleteTime={() => {
            const solveRef = selectedSolve?.solveRef || null;
            if (solveRef) deleteTime(solveRef);
          }}
          addPost={addPost}
          applyPenalty={applyPenalty}
          setSessions={setSessions}
        />
      )}
    </div>
  );
};

TimeTable.propTypes = {
  user: PropTypes.shape({
    UserID: PropTypes.string,
  }),
  solves: PropTypes.arrayOf(
    PropTypes.shape({
      time: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      scramble: PropTypes.string,
      datetime: PropTypes.string,
      penalty: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
      fullIndex: PropTypes.number,
      tags: PropTypes.object,
      event: PropTypes.string,
      sessionID: PropTypes.string,
    })
  ).isRequired,
  deleteTime: PropTypes.func.isRequired,
  addPost: PropTypes.func,
  applyPenalty: PropTypes.func,
  setSessions: PropTypes.func,
  sessionsList: PropTypes.array,
  currentEvent: PropTypes.string,
  currentSession: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  eventKey: PropTypes.string,
  practiceMode: PropTypes.bool,
};

export default TimeTable;
