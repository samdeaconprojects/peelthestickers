import React, { useMemo } from 'react';
import { formatTime, calculateAverage } from '../TimeList/TimeUtils';
import { findBestStrictWindow } from '../../utils/strictAverageUtils';
import { useSettings } from '../../contexts/SettingsContext';
import './AveragesDisplay.css';

// Columns left to right. `wide` columns drop out on narrow screens.
const AVERAGE_COLUMNS = [
  { key: "single", label: "Single", count: 1, bestStat: "BestSingleMs", bestRef: "BestSingleSolveSK" },
  { key: "ao5", label: "AO5", count: 5, bestStat: "BestAo5Ms", bestRef: "BestAo5StartSolveSK" },
  { key: "ao12", label: "AO12", count: 12, bestStat: "BestAo12Ms", bestRef: "BestAo12StartSolveSK" },
  { key: "ao25", label: "AO25", count: 25, bestStat: "BestAo25Ms", bestRef: "BestAo25StartSolveSK" },
  { key: "ao50", label: "AO50", count: 50, bestStat: "BestAo50Ms", bestRef: "BestAo50StartSolveSK", wide: true },
  { key: "ao100", label: "AO100", count: 100, bestStat: "BestAo100Ms", bestRef: "BestAo100StartSolveSK", wide: true },
];

function getPenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").trim().toUpperCase();
}

function getComparableSolveTime(solve) {
  if (!solve) return null;

  const penalty = getPenalty(solve);
  if (penalty === "DNF") return Number.MAX_SAFE_INTEGER;

  const explicitFinal = Number(solve?.finalTimeMs ?? solve?.FinalTimeMs);
  if (Number.isFinite(explicitFinal) && explicitFinal >= 0) {
    return explicitFinal;
  }

  const base = Number(
    solve?.rawTimeMs ??
      solve?.RawTimeMs ??
      solve?.rawTime ??
      solve?.originalTime ??
      solve?.time
  );
  if (!Number.isFinite(base) || base < 0) return null;

  return penalty === "+2" ? base + 2000 : base;
}

function windowValue(times) {
  if (times.length === 1) {
    return times[0] === Number.MAX_SAFE_INTEGER ? "DNF" : times[0];
  }
  return calculateAverage(times, true).average;
}

// Singles truncate like the timer and time list; averages round.
function formatValue(value, isAverage = true) {
  if (value === "DNF") return "DNF";
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return formatTime(value, isAverage);
}

function isNumericValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function computeColumnStats(times, solves, column, overallSessionStats, showStrictAverages) {
  const { count } = column;
  const hasWindow = times.length >= count;

  const current = hasWindow ? windowValue(times.slice(-count)) : "N/A";

  // Best: prefer the whole-session stat, fall back to the solves loaded here.
  let best = "N/A";
  const overallBest = Number(overallSessionStats?.[column.bestStat]);
  if (Number.isFinite(overallBest)) {
    best = overallBest;
  } else if (hasWindow) {
    let bestNumeric = Infinity;
    let sawDnf = false;
    for (let i = 0; i <= times.length - count; i++) {
      const value = windowValue(times.slice(i, i + count));
      if (isNumericValue(value) && value < bestNumeric) bestNumeric = value;
      else if (value === "DNF") sawDnf = true;
    }
    if (bestNumeric !== Infinity) best = bestNumeric;
    else if (sawDnf) best = "DNF";
  }

  const strict =
    showStrictAverages && count >= 5 ? findBestStrictWindow(solves, count, "ao") : null;

  // BPA/WPA: best/worst possible result for the next solve.
  let bpa = null;
  let wpa = null;
  if (count >= 5 && times.length >= count - 1) {
    const pending = times.slice(-(count - 1));
    const sorted = [...pending].sort((a, b) => a - b);
    bpa = calculateAverage([...pending, sorted[0]], true).average;
    wpa = calculateAverage([...pending, sorted[sorted.length - 1]], true).average;
  }

  return { current, best, strict, bpa, wpa };
}

function AveragesDisplay({
  currentSolves,
  overallSessionStats = null,
  setSelectedAverageSolves,
  onRequestBestAverageWindow = null,
  vertical = false,
}) {
  const { settings } = useSettings();
  const showStrictAverages = settings?.showStrictAverages !== false;
  // "single-last" runs AO100 -> Single (left to right, or top to bottom when vertical).
  const singleFirst = settings?.homeAveragesOrder === "single-first";

  const columnStats = useMemo(() => {
    const solves = (currentSolves || []).filter(
      (solve) => typeof getComparableSolveTime(solve) === "number"
    );
    const times = solves.map(getComparableSolveTime);
    const columns = singleFirst ? AVERAGE_COLUMNS : [...AVERAGE_COLUMNS].reverse();
    return columns.map((column) => ({
      column,
      ...computeColumnStats(times, solves, column, overallSessionStats, showStrictAverages),
    }));
  }, [currentSolves, overallSessionStats, showStrictAverages, singleFirst]);

  const selectBestWindow = async (count, targetAvg, startSolveRef = null) => {
    if (typeof onRequestBestAverageWindow === "function") {
      const handled = await onRequestBestAverageWindow(count, startSolveRef, targetAvg);
      if (handled) return;
    }

    if (!Number.isFinite(Number(targetAvg))) return;
    for (let i = 0; i <= currentSolves.length - count; i++) {
      const slice = currentSolves.slice(i, i + count);
      const avg = windowValue(slice.map(getComparableSolveTime));
      if (typeof avg === "number" && Math.round(avg) === Math.round(Number(targetAvg))) {
        setSelectedAverageSolves(slice);
        return;
      }
    }
  };

  const selectCurrentWindow = (count) => {
    if (currentSolves.length < count) return;
    setSelectedAverageSolves(currentSolves.slice(-count));
  };

  const selectStrictWindow = (result) => {
    if (!result?.solves?.length) return;
    setSelectedAverageSolves(result.solves);
  };

  const colClass = (column) =>
    `avg-col avg-col--${column.key}${column.wide ? " avg-col--wide" : ""}`;

  // Vertical: one row per average, stats across. Used beside the timer.
  if (vertical) {
    return (
      <div
        className={`averages-table averages-table--vertical${
          showStrictAverages ? " averages-table--vertical-strict" : ""
        }`}
      >
        <div className="header corner"></div>
        <div className="header">Current</div>
        <div className="header">Best</div>
        {showStrictAverages ? <div className="header strict-header">Strict</div> : null}
        <div className="header bpa-wpa-header">
          <span className="bpa">BPA</span>
          <span className="wpa">WPA</span>
        </div>

        {columnStats.map(({ column, current, best, strict, bpa, wpa }) => (
          <React.Fragment key={column.key}>
            <div
              className={`row-title col-header avg-col avg-col--${column.key}`}
              onClick={() => selectCurrentWindow(column.count)}
            >
              {column.label}
            </div>
            <div
              className={`cell current avg-col avg-col--${column.key}`}
              onClick={() => selectCurrentWindow(column.count)}
            >
              {formatValue(current, column.count > 1)}
            </div>
            <div
              className={`cell best avg-col avg-col--${column.key}`}
              onClick={() =>
                selectBestWindow(column.count, best, overallSessionStats?.[column.bestRef] || null)
              }
            >
              {formatValue(best, column.count > 1)}
            </div>
            {showStrictAverages ? (
              <div
                className={`cell strict avg-col avg-col--${column.key}`}
                onClick={() => selectStrictWindow(strict)}
              >
                {column.count >= 5 ? formatValue(strict?.value) : ""}
              </div>
            ) : null}
            <div className={`cell bpa-wpa avg-col avg-col--${column.key}`}>
              {column.count >= 5 ? (
                <>
                  <span className="bpa">{formatValue(bpa)}</span>
                  <span className="wpa">{formatValue(wpa)}</span>
                </>
              ) : null}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  // With Single on the right the table reads right to left, so the row titles move to
  // the right edge, beside the columns closest to them.
  const labelsRight = !singleFirst;
  const renderRow = (key, title, cells) => (
    <React.Fragment key={key}>
      {labelsRight ? cells : title}
      {labelsRight ? title : cells}
    </React.Fragment>
  );

  return (
    <div
      className={`averages-table${labelsRight ? " averages-table--labels-right" : ""}`}
      style={{ "--avg-cols": AVERAGE_COLUMNS.length }}
    >
      {/* Column headers */}
      {renderRow(
        "headers",
        <div className="header corner"></div>,
        columnStats.map(({ column }) => (
          <div
            key={`header-${column.key}`}
            className={`header col-header ${colClass(column)}`}
            onClick={() => selectCurrentWindow(column.count)}
          >
            {column.label}
          </div>
        ))
      )}

      {/* Current row */}
      {renderRow(
        "current",
        <div className="row-title current-row">Current</div>,
        columnStats.map(({ column, current }) => (
          <div
            key={`current-${column.key}`}
            className={`cell current ${colClass(column)}`}
            onClick={() => selectCurrentWindow(column.count)}
          >
            {formatValue(current, column.count > 1)}
          </div>
        ))
      )}

      {/* Best row */}
      {renderRow(
        "best",
        <div className="row-title best-row">Best</div>,
        columnStats.map(({ column, best }) => (
          <div
            key={`best-${column.key}`}
            className={`cell best ${colClass(column)}`}
            onClick={() =>
              selectBestWindow(column.count, best, overallSessionStats?.[column.bestRef] || null)
            }
          >
            {formatValue(best, column.count > 1)}
          </div>
        ))
      )}

      {/* Strict row */}
      {showStrictAverages
        ? renderRow(
            "strict",
            <div className="row-title strict-row">Strict</div>,
            columnStats.map(({ column, strict }) => (
              <div
                key={`strict-${column.key}`}
                className={`cell strict ${colClass(column)}`}
                onClick={() => selectStrictWindow(strict)}
              >
                {column.count >= 5 ? formatValue(strict?.value) : ""}
              </div>
            ))
          )
        : null}

      {/* BPA / WPA row */}
      {renderRow(
        "bpa-wpa",
        <div className="row-title bpa-wpa-row">
          <span className="bpa">BPA</span>
          <span className="bpa-wpa-sep">/</span>
          <span className="wpa">WPA</span>
        </div>,
        columnStats.map(({ column, bpa, wpa }) => (
          <div key={`bpa-wpa-${column.key}`} className={`cell bpa-wpa ${colClass(column)}`}>
            {column.count >= 5 ? (
              <>
                <span className="bpa">{formatValue(bpa)}</span>
                <span className="wpa">{formatValue(wpa)}</span>
              </>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

export default AveragesDisplay;
