// src/components/TimeList/TimeList.js
import React, { useState, useEffect, useMemo } from 'react';
import './TimeList.css';
import './TimeItem.css';
import Detail from '../Detail/Detail';
import { useSettings } from '../../contexts/SettingsContext';
import {
  formatTime,
  calculateAverage,
  getOveralls // keep import so nothing else changes
} from './TimeUtils';

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
    .filter(it => typeof it.time === 'number' && isFinite(it.time))
    .map(it => ({ key: it.key, time: it.time }));

  const n = valid.length;
  const out = {};
  if (n <= 1) {
    valid.forEach(v => (out[v.key] = 0));
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

function TimeList({ user, applyPenalty, solves = [], deleteTime, rowsToShow = 3, inPlayerBar, addPost }) {
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

  // always run hooks; never early-return before them
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    const colsPerRow = windowWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solvesSafe.length / colsPerRow);
    setCurrentPage(Math.max(0, totalRows - rowsToShow));

    return () => window.removeEventListener('resize', handleResize);
  }, [windowWidth, solvesSafe.length, rowsToShow]);

  // -----------------------------
  // SAFE overall best/worst (prevents the getOveralls crash)
  // -----------------------------
  const times = useMemo(() => solvesSafe.map(s => s?.time), [solvesSafe]);

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
    try { getOveralls(times); } catch (e) { /* ignore */ }

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
    return times.length > 5
      ? Array.from({ length: 5 }, (_, i) => times.length - 5 + i)
      : [];
  }, [times.length]);

  // INDEX FIX:
  // In "index" mode, rank colors by TIME within the visible window (fast -> green, slow -> red),
  // not by position / and not by raw min/max.
  const visibleRank01ByGlobalIndex = useMemo(() => {
    const items = visibleSolves.map((s, localIdx) => ({
      key: startIndex + localIdx,
      time: s?.time
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
      time: s?.time
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
      if (t <= 0.20) return { perfClass: "overall-border-min", perfStyle: null };
      if (t <= 0.40) return { perfClass: "faster", perfStyle: null };
      if (t <= 0.60) return { perfClass: "middle-fast", perfStyle: null };
      if (t <= 0.80) return { perfClass: "slower", perfStyle: null };
      return { perfClass: "overall-border-max", perfStyle: null };
    }

    // CONTINUOUS MODE: true spectrum by time min/max
    const h = hueGreenToRed(t);
    const c = hslColor(h, 100, 55);
    return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
  };

  // Now it's safe to early-return (hooks are already done)
  if (solvesSafe.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }

  console.log("USER ID TIMELIST");
  console.log(user);

  const rows = [];
  for (let i = 0; i < visibleSolves.length; i += colsPerRow) {
    const timesRow = visibleSolves.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow.map(solve => solve.time), true);

    rows.push(
      <tr key={i}>
        {timesRow.map((solve, index) => {
          const solveIndex = startIndex + i + index;
          const isBest = solveIndex === overallMin;
          const isWorst = solveIndex === overallMax;
          const isCurrentFive = currentFiveIndices.includes(solveIndex);

          const rank01 = (timeColorMode === "index")
            ? (visibleRank01ByGlobalIndex[solveIndex] ?? 0)
            : 0;

          const { perfClass, perfStyle } = (!isBest && !isWorst)
            ? getPerfClassAndStyle(solve.time, overallMinValue, overallMaxValue, rank01)
            : { perfClass: "", perfStyle: null };

          return (
            <td
              className={`TimeItem ${perfClass} ${isBest ? 'overall-border-min' : ''} ${isWorst ? 'overall-border-max' : ''} ${isCurrentFive ? 'current-five' : ''}`}
              style={perfStyle || undefined}
              key={index}
              onClick={() => {
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
              }}
            >
              {formatTime(solve.time, false, solve.penalty)}
              <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(solveIndex); }}>x</span>
            </td>
          );
        })}
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((_, index) => (
          <td className="TimeItem" key={colsPerRow + index}>&nbsp;</td>
        ))}
        <td className="TimeItem current-five">{formatTime(averageData.average)}</td>
      </tr>
    );
  }

  const goToPreviousPage = () => {
    if (validCurrentPage > 0) setCurrentPage(validCurrentPage - 1);
  };

  const goToNextPage = () => {
    if ((validCurrentPage + 1) * rowsToDisplay * colsPerRow < solvesSafe.length) setCurrentPage(validCurrentPage + 1);
  };

  const horizontalTimes = horizontalSolves
    .map(s => s?.time)
    .filter(v => typeof v === "number" && isFinite(v));

  const bestTime = horizontalTimes.length ? Math.min(...horizontalTimes) : null;
  const worstTime = horizontalTimes.length ? Math.max(...horizontalTimes) : null;

  const ao5s = horizontalSolves.map((_, index, arr) => {
    const actualIndex = solvesSafe.length - arr.length + index;
    const slice = solvesSafe.slice(actualIndex - 4, actualIndex + 1);
    return slice.length === 5 ? calculateAverage(slice.map(s => s.time), true).average : null;
  }).filter(a => a !== null);

  const ao12s = horizontalSolves.map((_, index, arr) => {
    const actualIndex = solvesSafe.length - arr.length + index;
    const slice = solvesSafe.slice(actualIndex - 11, actualIndex + 1);
    return slice.length === 12 ? calculateAverage(slice.map(s => s.time), true).average : null;
  }).filter(a => a !== null);

  const bestAo5 = ao5s.length ? Math.min(...ao5s) : null;
  const worstAo5 = ao5s.length ? Math.max(...ao5s) : null;
  const bestAo12 = ao12s.length ? Math.min(...ao12s) : null;
  const worstAo12 = ao12s.length ? Math.max(...ao12s) : null;

  return (
    <div className="time-list-container">
      {isHorizontal ? (
        <div className="horizontal-time-list">
          {/* AO12 */}
          <div className="horizontal-row ao12-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index;
              const slice = solvesSafe.slice(actualIndex - 11, actualIndex + 1);
              if (slice.length === 12) {
                const avg = calculateAverage(slice.map(s => s.time), true).average;
                const textClass = (bestAo12 != null && avg === bestAo12) ? 'best-time' : (worstAo12 != null && avg === worstAo12) ? 'worst-time' : '';
                return (
                  <div
                    key={index}
                    className={`ao12 TimeItem ${textClass}`}
                    onClick={() => setSelectedSolveList(slice.map(s => ({ ...s, userID: user?.UserID })))}
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
                const avg = calculateAverage(slice.map(s => s.time), true).average;
                const textClass = (bestAo5 != null && avg === bestAo5) ? 'best-time' : (worstAo5 != null && avg === worstAo5) ? 'worst-time' : '';
                return (
                  <div
                    key={index}
                    className={`ao5 TimeItem ${textClass}`}
                    onClick={() => setSelectedSolveList(slice.map(s => ({ ...s, userID: user?.UserID })))}
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
              const isBest = (bestTime != null && tval === bestTime);
              const isWorst = (worstTime != null && tval === worstTime);

              const rank01 = (timeColorMode === "index")
                ? (horizontalRank01ByGlobalIndex[actualIndex] ?? 0)
                : 0;

              const { perfClass, perfStyle } = (!isBest && !isWorst)
                ? getPerfClassAndStyle(tval, bestTime, worstTime, rank01)
                : { perfClass: "", perfStyle: null };

              return (
                <div
                  key={index}
                  className={`TimeItem ${perfClass} ${isBest ? 'dashed-border-min' : ''} ${isWorst ? 'dashed-border-max' : ''}`}
                  style={perfStyle || undefined}
                  onClick={() => {
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
                      setSelectedSolveIndex(actualIndex);
                      return;
                    }

                    setSelectedSolve({ ...solve, userID: user?.UserID });
                    setSelectedSolveIndex(actualIndex);
                  }}
                >
                  {formatTime(tval, false, solve?.penalty)}
                  <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(actualIndex); }}>x</span>
                </div>
              );
            })}
            <div className="TimeItem row-label time-label">TIME</div>
          </div>

          {/* Solve count */}
          <div className="horizontal-row count-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solvesSafe.length - arr.length + index + 1;
              return <div key={index} className="solve-count TimeItem">{actualIndex}</div>;
            })}
            <div className="TimeItem row-label">SOLVE #</div>
          </div>

          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              userID={user?.UserID}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
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
                  note: 'Average solve group',
                  event: selectedSolveList[0]?.event,
                  solveList: selectedSolveList,
                  comments: [],
                })
              }
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
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
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
            />
          )}
        </div>
      )}
      <div className="pagination-buttons">
        <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>▲</button>
        <button onClick={goToNextPage} disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solvesSafe.length}>▼</button>
      </div>
    </div>
  );
}

export default TimeList;
