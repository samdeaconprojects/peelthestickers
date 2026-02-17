import React, { useMemo, useRef, useState, useEffect } from "react";
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import Detail from "../Detail/Detail";
import "./Stats.css";
import { formatTime, calculateAverageForGraph } from "../TimeList/TimeUtils";

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
    const [y, m, d] = key.split("-");
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
        if (solve.penalty === "DNF") {
          return typeof solve.originalTime === "number" && isFinite(solve.originalTime);
        }
        return typeof solve.time === "number" && isFinite(solve.time);
      });

      if (valid.length === 0) return null;

      const avgMs =
        valid.reduce((sum, solve) => {
          const base = solve.penalty === "DNF" ? solve.originalTime : solve.time;
          return sum + base;
        }, 0) / valid.length;

      const lastSolve = valid[valid.length - 1];

      return {
        isBucket: true,
        bucketKey: key,
        bucketLabel: formatBucketLabel(mode, key),
        time: avgMs, // ms
        solve: lastSolve,
        fullIndex: lastSolve?.fullIndex,
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

  for (let i = 0; i < data.length; i++) {
    const v = data[i]?.y;
    if (typeof v !== "number" || !isFinite(v)) {
      sum = 0;
      continue;
    }

    sum += v;
    if (i >= windowSize) sum -= data[i - windowSize]?.y;

    if (i >= windowSize - 1) out[i] = sum / windowSize;
  }
  return out;
}

function LineChart({ solves, title, deleteTime, addPost }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);

  const [showAo5, setShowAo5] = useState(false);
  const [showAo12, setShowAo12] = useState(false);

  // Track if user manually picked a view (so we don't override)
  const userPickedView = useRef(false);

  // ✅ baseValid == "current view" (what Stats passed in)
  const baseValid = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];
    return input.filter((solve) => {
      if (solve.penalty === "DNF") {
        return typeof solve.originalTime === "number" && isFinite(solve.originalTime);
      }
      return typeof solve.time === "number" && isFinite(solve.time);
    });
  }, [solves]);

  // ✅ DEFAULT: current view (unless 500+ => day buckets)
  const [viewMode, setViewMode] = useState(() => (baseValid.length >= 500 ? "day" : "current"));

  useEffect(() => {
    if (userPickedView.current) return;
    setViewMode(baseValid.length >= 500 ? "day" : "current");
  }, [baseValid.length]);

  const computed = useMemo(() => {
    let processed = [];

    if (viewMode === "current") {
      processed = baseValid; // ✅ no slicing; show exactly what's in Stats view
      if (processed.length > 5000) {
        // eslint-disable-next-line no-alert
        alert("⚠ Rendering more than 5000 solves may be slow");
      }
    } else if (viewMode === "last100") {
      processed = baseValid.slice(-100);
    } else {
      processed = groupByDate(baseValid, viewMode);
    }

    if (processed.length === 0) {
      return { data: [], solveCountText: "Solve Count: 0", extraSeries: [] };
    }

    const timesMs = processed.map((item) => {
      if (item.isBucket) return item.time;
      return item.penalty === "DNF" ? item.originalTime : item.time;
    });

    const minTime = Math.min(...timesMs);
    const maxTime = Math.max(...timesMs);
    const averageTime = calculateAverageForGraph(timesMs);
    const denom = maxTime - minTime || 1;

    const getColor = (timeMs) => {
      const ratio = (timeMs - minTime) / denom;
      if (timeMs <= averageTime) return `rgb(${255 * ratio}, 255, 0)`;
      return `rgb(255, ${255 * (1 - ratio)}, 0)`;
    };

    const data = processed.map((item, index) => {
      const baseTimeMs = item.isBucket
        ? item.time
        : item.penalty === "DNF"
          ? item.originalTime
          : item.time;

      const label = item.isBucket ? item.bucketLabel : `${index + 1}`;
      const solveForDetail = item.isBucket ? item.solve : item;

      return {
        label,
        x: index,
        y: baseTimeMs / 1000,
        color: getColor(baseTimeMs),
        time: formatTime(baseTimeMs),
        solve: solveForDetail,
        fullIndex: item.isBucket ? item.fullIndex : item.fullIndex,
        isDNF: item.isBucket ? false : item.penalty === "DNF",
      };
    });

    // ✅ Ao overlays only on solve-level views: current + last100
    const extraSeries = [];
    const solveLevel = viewMode === "current" || viewMode === "last100";

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
      solveCountText: `Solve Count: ${data.length}`,
      extraSeries,
    };
  }, [baseValid, viewMode, showAo5, showAo12]);

  const solveLevel = viewMode === "current" || viewMode === "last100";

  return (
    <div className="lineChart">
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={viewMode}
          onChange={(e) => {
            userPickedView.current = true;
            setViewMode(e.target.value);
          }}
        >
          <option value="current">Current View</option>
          <option value="last100">Last 100</option>
          <option value="day">By Day</option>
          <option value="week">By Week</option>
          <option value="month">By Month</option>
          <option value="year">By Year</option>
        </select>

        <label style={{ display: "flex", gap: 6, alignItems: "center", opacity: solveLevel ? 1 : 0.4 }}>
          <input
            type="checkbox"
            checked={showAo5}
            disabled={!solveLevel}
            onChange={(e) => setShowAo5(e.target.checked)}
          />
          Ao5 line
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center", opacity: solveLevel ? 1 : 0.4 }}>
          <input
            type="checkbox"
            checked={showAo12}
            disabled={!solveLevel}
            onChange={(e) => setShowAo12(e.target.checked)}
          />
          Ao12 line
        </label>
      </div>

      <div className="chartTitle">{/* {title} */}</div>

      <LineChartBuilder
        width={560}
        height={340}
        data={computed.data}
        extraSeries={computed.extraSeries}
        horizontalGuides={5}
        precision={2}
        verticalGuides={7}
        onDotClick={(solve, fullIndex) => {
          setSelectedSolve(solve);
          setSelectedSolveIndex(fullIndex ?? solve?.fullIndex ?? null);
        }}
      />

      <Label text={computed.solveCountText} />

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => {
            if (selectedSolveIndex != null) deleteTime(selectedSolveIndex);
          }}
          addPost={addPost}
        />
      )}
    </div>
  );
}

export default React.memo(LineChart);
