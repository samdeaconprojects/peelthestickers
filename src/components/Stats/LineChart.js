import React, { useMemo, useState } from "react";
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
  // key formats:
  // day:   YYYY-MM-DD
  // week:  YYYY-W##
  // month: YYYY-MM
  // year:  YYYY
  if (!key) return "";

  if (mode === "day") {
    // show MM/DD
    const [y, m, d] = key.split("-");
    return `${m}/${d}`;
  }
  if (mode === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y.slice(2)}`;
  }
  if (mode === "week") {
    // show W##
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

  // Keep chronological order (Map preserves insertion, but solves might not be sorted)
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return keys
    .map((key) => {
      const arr = map.get(key) || [];

      // Same rule as your new version:
      // - DNFs only count if originalTime is numeric
      // - otherwise time must be numeric
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

      // last solve in bucket for detail click
      const lastSolve = valid[valid.length - 1];

      return {
        isBucket: true,
        bucketKey: key,
        bucketLabel: formatBucketLabel(mode, key),
        time: avgMs, // store ms here, consistent with solve.time units
        solve: lastSolve,
        // keep fullIndex for delete/detail compatibility when possible
        fullIndex: lastSolve?.fullIndex,
      };
    })
    .filter(Boolean);
}

function LineChart({ solves, title, deleteTime, addPost }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);

  // ✅ bring back selector
  // last100, all, day, week, month, year
  const [viewMode, setViewMode] = useState("last100");

  const computed = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];

    // Base “valid solves” rule (same as your new version)
    const baseValid = input.filter((solve) => {
      if (solve.penalty === "DNF") {
        return typeof solve.originalTime === "number" && isFinite(solve.originalTime);
      }
      return typeof solve.time === "number" && isFinite(solve.time);
    });

    // Decide what we plot
    let processed = [];

    if (viewMode === "last100") {
      processed = baseValid.slice(-100);
    } else if (viewMode === "all") {
      if (baseValid.length > 5000) {
        // keep your warning behavior
        // eslint-disable-next-line no-alert
        alert("⚠ Rendering more than 5000 solves may be slow");
      }
      processed = baseValid;
    } else {
      // date-bucketed series (day/week/month/year)
      processed = groupByDate(baseValid, viewMode);
    }

    if (processed.length === 0) {
      return { data: [], solveCountText: "Solve Count: 0" };
    }

    // Convert to ms array for min/max/avg
    const timesMs = processed.map((item) => {
      // bucket item has item.time already in ms
      if (item.isBucket) return item.time;
      return item.penalty === "DNF" ? item.originalTime : item.time;
    });

    const minTime = Math.min(...timesMs);
    const maxTime = Math.max(...timesMs);
    const averageTime = calculateAverageForGraph(timesMs);
    const denom = maxTime - minTime || 1;

    const getColor = (timeMs) => {
      const ratio = (timeMs - minTime) / denom;
      if (timeMs <= averageTime) {
        return `rgb(${255 * ratio}, 255, 0)`; // Green -> Yellow
      } else {
        return `rgb(255, ${255 * (1 - ratio)}, 0)`; // Yellow -> Red
      }
    };

    const data = processed.map((item, index) => {
      const baseTimeMs = item.isBucket
        ? item.time
        : item.penalty === "DNF"
          ? item.originalTime
          : item.time;

      const label =
        item.isBucket
          ? item.bucketLabel
          : `${index + 1}`;

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

    return {
      data,
      solveCountText: `Solve Count: ${data.length}`,
    };
  }, [solves, viewMode]);

  return (
    <div className="lineChart">
      {/* ✅ selector (like the old version) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
          <option value="last100">Last 100</option>
          <option value="all">Show All</option>
          <option value="day">By Day</option>
          <option value="week">By Week</option>
          <option value="month">By Month</option>
          <option value="year">By Year</option>
        </select>
      </div>

      <div className="chartTitle">{/* {title} if you want */}</div>

      <LineChartBuilder
        width={500}
        height={300}
        data={computed.data}
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
