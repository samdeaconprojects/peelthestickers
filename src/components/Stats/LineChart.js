import React, { useState, useMemo } from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import Detail from '../Detail/Detail';
import './Stats.css';
import { formatTime, calculateAverageForGraph } from '../TimeList/TimeUtils';

// ---------- DATE GROUPING HELPERS ----------
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function groupByDate(solves, mode) {
  const map = new Map();

  for (const s of solves) {
    const d = new Date(s.datetime || s.DateTime);
    let key;

    switch (mode) {
      case "day":
        key = d.toISOString().split("T")[0];
        break;
      case "week":
        key = `${d.getFullYear()}-W${getWeekNumber(d)}`;
        break;
      case "month":
        key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        break;
      case "year":
        key = `${d.getFullYear()}`;
        break;
      default:
        key = d.toISOString();
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }

  return Array.from(map.entries()).map(([label, arr]) => {
    const valid = arr.filter(s =>
      s.penalty === "DNF"
        ? typeof s.originalTime === "number"
        : typeof s.time === "number"
    );

    if (valid.length === 0) return null;

    const avg =
      valid.reduce(
        (sum, s) =>
          sum + (s.penalty === "DNF" ? s.originalTime : s.time),
        0
      ) / valid.length;

    return {
      label,
      time: avg,
      solve: valid[valid.length - 1], // last solve in bucket
      isDNF: false
    };
  }).filter(Boolean);
}

function LineChart({ solves, title, deleteTime, addPost }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);

  const [viewMode, setViewMode] = useState("latest"); 
  // latest, all, day, week, month, year

  const processed = useMemo(() => {
    if (!solves || solves.length === 0) return [];

    if (viewMode === "latest") {
      return solves.slice(-100);
    }

    if (viewMode === "all") {
      if (solves.length > 5000) {
        alert("⚠ Rendering more than 5000 solves may be slow");
      }
      return solves;
    }

    // Date Views
    return groupByDate(solves, viewMode);

  }, [solves, viewMode]);

  // ---------- NORMALIZE ----------
  const validSolves = processed.filter(s => {
    if (!s) return false;
    if (s.isBucket) return true;

    if (s.penalty === "DNF") {
      return typeof s.originalTime === "number";
    }
    return typeof s.time === "number";
  });

  if (validSolves.length === 0) return <div>No data</div>;

  const times = validSolves.map(s =>
    s.penalty === "DNF" ? s.originalTime : s.time
  );

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const avg = calculateAverageForGraph(times);

  const getColor = (t) => {
    const ratio = (t - minTime) / (maxTime - minTime);
    return t <= avg
      ? `rgb(${255 * ratio}, 255, 0)`
      : `rgb(255, ${255 * (1 - ratio)}, 0)`;
  };

  const data = validSolves.map((solve, index) => {
    const base = solve.penalty === "DNF" ? solve.originalTime : solve.time;
    return {
      label: solve.label || `${index+1}`,
      x: index,
      y: base / 1000,
      color: getColor(base),
      time: formatTime(base),
      solve,
      fullIndex: solve.fullIndex,
      isDNF: solve.penalty === "DNF"
    };
  });

  return (
    <div className='lineChart'>
      {/* -------- VIEW MODE SWITCH -------- */}
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <select value={viewMode} onChange={e=>setViewMode(e.target.value)}>
          <option value="latest">Last 100</option>
          <option value="all">Show All</option>
          <option value="day">By Day</option>
          <option value="week">By Week</option>
          <option value="month">By Month</option>
          <option value="year">By Year</option>
        </select>
      </div>

      <LineChartBuilder
        width={500}
        height={300}
        data={data}
        horizontalGuides={5}
        precision={2}
        verticalGuides={7}
        onDotClick={(solve) => {
          setSelectedSolve(solve);
        }}
      />

      <Label text={`Showing ${validSolves.length} datapoints`} />

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => deleteTime(selectedSolveIndex)}
          addPost={addPost}
        />
      )}
    </div>
  );
}

export default LineChart;
