import React, { useMemo, useState, useEffect } from "react";
import LineChartBuilder from "./LineChartBuilder";
import TimePeriodChart from "./TimePeriodChart";
import Label from "./AxisLabel";
import Detail from "../Detail/Detail";
import "./Stats.css";
import { formatTime } from "../TimeList/TimeUtils";

import useSolveSelection from "../../hooks/useSolveSelection";
import useBulkSolveActions from "../../hooks/useBulkSolveActions";
import BulkSolveControls from "../SolveBulk/BulkSolveControls";

/* -----------------------------
   DATE GROUPING HELPERS
----------------------------- */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function safeDateFromSolve(s) {
  const raw = s?.datetime ?? s?.DateTime ?? s?.dateTime;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatBucketLabel(mode, key) {
  if (!key) return "";
  if (mode === "day") {
    const [, m, d] = key.split("-");
    return `${m}/${d}`;
  }
  if (mode === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y.slice(2)}`;
  }
  if (mode === "week") {
    const parts = key.split("-W");
    return parts.length === 2 ? `W${parts[1]}` : key;
  }
  if (mode === "year") return key;
  return key;
}

function getSolveBaseMs(solve) {
  if (!solve) return null;

  if (solve.penalty === "DNF") {
    if (typeof solve.originalTime === "number" && isFinite(solve.originalTime)) {
      return solve.originalTime;
    }
    if (typeof solve.rawTime === "number" && isFinite(solve.rawTime)) {
      return solve.rawTime;
    }
    return null;
  }

  if (typeof solve.time === "number" && isFinite(solve.time)) {
    return solve.time;
  }

  if (typeof solve.rawTime === "number" && isFinite(solve.rawTime)) {
    return solve.rawTime;
  }

  return null;
}

function groupByDate(solves, mode) {
  const map = new Map();

  for (const s of solves) {
    const d = safeDateFromSolve(s);
    if (!d) continue;

    let key;
    switch (mode) {
      case "day":
        key = d.toISOString().split("T")[0];
        break;
      case "week":
        key = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
        break;
      case "month":
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "year":
        key = `${d.getFullYear()}`;
        break;
      default:
        key = d.toISOString();
        break;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }

  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return keys
    .map((key) => {
      const arr = map.get(key) || [];

      const valid = arr.filter((solve) => {
        const ms = getSolveBaseMs(solve);
        return typeof ms === "number" && isFinite(ms);
      });

      if (valid.length === 0) return null;

      const avgMs =
        valid.reduce((sum, solve) => {
          const base = getSolveBaseMs(solve);
          return sum + base;
        }, 0) / valid.length;

      const lastSolve = valid[valid.length - 1];

      return {
        isBucket: true,
        bucketKey: key,
        bucketLabel: formatBucketLabel(mode, key),
        time: avgMs,
        solve: lastSolve,
        fullIndex: lastSolve?.fullIndex ?? null,
      };
    })
    .filter(Boolean);
}

/* -----------------------------
   ROLLING AVERAGES (AoN)
----------------------------- */
function rollingAverageSeconds(data, windowSize) {
  const out = new Array(data.length).fill(null);
  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < data.length; i++) {
    const v = data[i]?.y;
    if (typeof v === "number" && isFinite(v)) {
      sum += v;
      validCount += 1;
    }

    if (i >= windowSize) {
      const prev = data[i - windowSize]?.y;
      if (typeof prev === "number" && isFinite(prev)) {
        sum -= prev;
        validCount -= 1;
      }
    }

    if (i >= windowSize - 1 && validCount === windowSize) {
      out[i] = sum / windowSize;
    }
  }

  return out;
}

function LineChart({
  user,
  solves,
  title,
  deleteTime,
  addPost,
  applyPenalty,
  setSessions,
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode = false,
  allowViewPicker = true,
  viewMode = "standard",
  selectedDay = "",
  onSelectedDayChange = null,
}) {
  const DEFAULT_DOT_SIZE = 5;
  const MIN_DOT_SIZE = 2;
  const MAX_DOT_SIZE = 10;

  const [selectedSolve, setSelectedSolve] = useState(null);

  const [showAo5, setShowAo5] = useState(false);
  const [showAo12, setShowAo12] = useState(false);
  const [groupMode, setGroupMode] = useState("solve");
  const [dotSize, setDotSize] = useState(DEFAULT_DOT_SIZE);
  const [yMinInput, setYMinInput] = useState("");
  const [yMaxInput, setYMaxInput] = useState("");

  const selection = useSolveSelection();

  const baseValid = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];
    return input.filter((solve) => {
      const ms = getSolveBaseMs(solve);
      return typeof ms === "number" && isFinite(ms);
    });
  }, [solves]);

  const bulkSelectableSolves = useMemo(() => {
    return groupMode === "solve" ? baseValid : [];
  }, [groupMode, baseValid]);

  const bulkActions = useBulkSolveActions({
    user,
    solves: bulkSelectableSolves,
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

  const computed = useMemo(() => {
    let processed = [];

    if (groupMode === "solve") {
      processed = baseValid;
    } else {
      processed = groupByDate(baseValid, groupMode);
    }

    if (processed.length === 0) {
      return { data: [], solveCountText: "Solve Count: 0", extraSeries: [] };
    }

    const timesMs = processed
      .map((item) => (item.isBucket ? item.time : getSolveBaseMs(item)))
      .filter((v) => typeof v === "number" && isFinite(v));

    const minTime = Math.min(...timesMs);
    const maxTime = Math.max(...timesMs);
    const averageTime =
      timesMs.reduce((sum, v) => sum + v, 0) / Math.max(1, timesMs.length);
    const denom = maxTime - minTime || 1;

    const getColor = (timeMs) => {
      const ratio = (timeMs - minTime) / denom;
      if (timeMs <= averageTime) return `rgb(${255 * ratio}, 255, 0)`;
      return `rgb(255, ${255 * (1 - ratio)}, 0)`;
    };

    const data = processed.map((item, index) => {
      const baseTimeMs = item.isBucket ? item.time : getSolveBaseMs(item);
      const label = item.isBucket ? item.bucketLabel : `${index + 1}`;
      const solveForDetail = item.isBucket ? item.solve : item;

      let selectionIndex = null;
      if (!item.isBucket) {
        selectionIndex = index;
      }

      return {
        label,
        x: index,
        y: baseTimeMs / 1000,
        color: getColor(baseTimeMs),
        time: formatTime(baseTimeMs),
        solve: solveForDetail,
        fullIndex: item.isBucket ? item.fullIndex : item.fullIndex,
        isDNF: item.isBucket ? false : item.penalty === "DNF",
        isBucket: !!item.isBucket,
        selectionIndex,
      };
    });

    const extraSeries = [];
    const solveLevel = groupMode === "solve";

    if (solveLevel && showAo5) {
      const ao5 = rollingAverageSeconds(data, 5);
      extraSeries.push({
        id: "ao5",
        label: "Ao5",
        stroke: "#3B82F6",
        points: data.map((d, i) => ({ x: d.x, y: ao5[i] })),
      });
    }

    if (solveLevel && showAo12) {
      const ao12 = rollingAverageSeconds(data, 12);
      extraSeries.push({
        id: "ao12",
        label: "Ao12",
        stroke: "#A855F7",
        points: data.map((d, i) => ({ x: d.x, y: ao12[i] })),
      });
    }

    return {
      data,
      solveCountText: `${solveLevel ? "Solve" : "Bucket"} Count: ${data.length}`,
      extraSeries,
    };
  }, [baseValid, groupMode, showAo5, showAo12]);

  const solveLevel = groupMode === "solve";
  const bulkEnabled = solveLevel;
  const isTimeView = viewMode === "time";

  const autoScale = useMemo(() => {
    const values = computed.data
      .map((point) => point?.y)
      .filter((value) => typeof value === "number" && isFinite(value));

    if (values.length === 0) {
      return { min: 0, max: 1 };
    }

    const maxValue = Math.max(...values);
    return {
      min: 0,
      max: Math.max(1, Math.ceil(maxValue)),
    };
  }, [computed.data]);

  const parsedYMin = Number(yMinInput);
  const parsedYMax = Number(yMaxInput);
  const resolvedYMin =
    yMinInput !== "" && Number.isFinite(parsedYMin) ? parsedYMin : autoScale.min;
  const resolvedYMax =
    yMaxInput !== "" && Number.isFinite(parsedYMax) ? parsedYMax : autoScale.max;
  const hasCustomYRange = resolvedYMax > resolvedYMin;

  const handleDotClick = (solve, fullIndex, point) => {
    if (!point || point.isBucket || point.selectionIndex == null || !bulkEnabled) {
      setSelectedSolve(solve);
      return;
    }

    const syntheticEvent = {
      shiftKey: window.__ptsShiftDown === true,
      ctrlKey: window.__ptsCtrlDown === true,
      metaKey: window.__ptsMetaDown === true,
      preventDefault: () => {},
    };

    const handledAsSelection = selection.handleSelectionClick(syntheticEvent, point.selectionIndex);
    if (handledAsSelection) return;

    setSelectedSolve(solve);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Shift") window.__ptsShiftDown = true;
      if (e.key === "Control") window.__ptsCtrlDown = true;
      if (e.key === "Meta") window.__ptsMetaDown = true;
    };

    const onKeyUp = (e) => {
      if (e.key === "Shift") window.__ptsShiftDown = false;
      if (e.key === "Control") window.__ptsCtrlDown = false;
      if (e.key === "Meta") window.__ptsMetaDown = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.__ptsShiftDown = false;
      window.__ptsCtrlDown = false;
      window.__ptsMetaDown = false;
    };
  }, []);

  return (
    <div className="lineChart">
      {isTimeView ? (
        <TimePeriodChart
          user={user}
          solves={solves}
          deleteTime={deleteTime}
          addPost={addPost}
          applyPenalty={applyPenalty}
          setSessions={setSessions}
          selectedDay={selectedDay}
          onSelectedDayChange={onSelectedDayChange}
        />
      ) : (
        <>
      {bulkEnabled && (
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
      )}

      {allowViewPicker && (
        <div className="lineChartControls">
          <select
            className="statsSelect statsSelect--chart"
            value={groupMode}
            onChange={(e) => {
              selection.clearSelection();
              setGroupMode(e.target.value);
            }}
          >
            <option value="solve">By Solve</option>
            <option value="day">By Day</option>
            <option value="week">By Week</option>
            <option value="month">By Month</option>
            <option value="year">By Year</option>
          </select>

          <button
            type="button"
            className={`statsToggleBtn ${showAo5 ? "is-active" : ""}`}
            disabled={!solveLevel}
            onClick={() => setShowAo5((value) => !value)}
          >
            Ao5
          </button>

          <button
            type="button"
            className={`statsToggleBtn ${showAo12 ? "is-active" : ""}`}
            disabled={!solveLevel}
            onClick={() => setShowAo12((value) => !value)}
          >
            Ao12
          </button>

          <div className="chartControlGroup">
            <span className="chartControlLabel">Dots</span>
            <button
              type="button"
              className="statsMiniBtn"
              onClick={() => setDotSize((value) => Math.max(MIN_DOT_SIZE, value - 1))}
            >
              -
            </button>
            <span className="chartControlValue">{dotSize}</span>
            <button
              type="button"
              className="statsMiniBtn"
              onClick={() => setDotSize((value) => Math.min(MAX_DOT_SIZE, value + 1))}
            >
              +
            </button>
          </div>

          <div className="chartControlGroup">
            <span className="chartControlLabel">Scale</span>
            <input
              className="chartScaleInput"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder={String(autoScale.min)}
              value={yMinInput}
              onChange={(e) => setYMinInput(e.target.value)}
              aria-label="Minimum seconds"
            />
            <span className="chartControlDivider">to</span>
            <input
              className="chartScaleInput"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder={String(autoScale.max)}
              value={yMaxInput}
              onChange={(e) => setYMaxInput(e.target.value)}
              aria-label="Maximum seconds"
            />
            <button
              type="button"
              className="statsMiniBtn"
              onClick={() => {
                setYMinInput("");
                setYMaxInput("");
              }}
            >
              Auto
            </button>
          </div>
        </div>
      )}

      <div className="chartTitle">{/* {title} */}</div>

      <div className="lineChartCanvas">
        <LineChartBuilder
          width={560}
          height={320}
          data={computed.data}
          extraSeries={computed.extraSeries}
          horizontalGuides={5}
          precision={2}
          verticalGuides={7}
          selectedIndices={selection.selectedIndices}
          dotRadius={dotSize}
          selectedDotRadius={dotSize + 3}
          yMin={hasCustomYRange ? resolvedYMin : null}
          yMax={hasCustomYRange ? resolvedYMax : null}
          onDotClick={(solve, fullIndex, point) => {
            handleDotClick(solve, fullIndex, point);
          }}
        />
      </div>

      <Label text={computed.solveCountText} />

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          userID={user?.UserID}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => {
            const solveRef = selectedSolve?.solveRef || null;
            if (solveRef && deleteTime) deleteTime(solveRef);
          }}
          addPost={addPost}
          applyPenalty={applyPenalty}
          setSessions={setSessions}
        />
      )}
        </>
      )}
    </div>
  );
}

export default React.memo(LineChart);
