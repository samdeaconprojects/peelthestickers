import React, { useMemo, useState } from "react";
import Detail from "../Detail/Detail";
import PieChartBuilder from "./PieChartBuilder";
import "./Stats.css";

const BREAKDOWN_OPTIONS = [
  { value: "CubeModel", label: "Cube Model" },
  { value: "CrossColor", label: "Cross Color" },
  { value: "TimerInput", label: "Timer Input" },
  { value: "SolveSource", label: "Solve Source" },
  { value: "Shared", label: "Shared" },
  { value: "Imports", label: "Imports" },
];

function hasSharedTag(tags) {
  if (!tags) return false;
  return !!(
    tags.IsShared ||
    tags.isShared ||
    tags.SharedID ||
    tags.sharedID ||
    tags.SharedIndex != null ||
    tags.sharedIndex != null
  );
}

function hasImportTag(tags) {
  if (!tags) return false;
  const src = String(tags.Source || tags.source || "").toLowerCase();
  return !!(
    tags.Imports ||
    tags.imports ||
    tags.Imported ||
    tags.imported ||
    tags.IsImport ||
    tags.isImport ||
    tags.IsImported ||
    tags.isImported ||
    tags.Import === true ||
    tags.import === true ||
    src === "import"
  );
}

function getBucketValue(solve, mode) {
  const tags = solve?.tags || solve?.Tags || {};

  if (mode === "CubeModel") {
    return String(tags?.CubeModel || "").trim() || "Unknown";
  }

  if (mode === "CrossColor") {
    return String(tags?.CrossColor || "").trim() || "Unknown";
  }

  if (mode === "TimerInput") {
    return String(tags?.TimerInput || tags?.InputType || "").trim() || "Unknown";
  }

  if (mode === "SolveSource") {
    return String(tags?.SolveSource || "").trim() || "Unknown";
  }

  if (mode === "Shared") {
    return hasSharedTag(tags) ? "Shared" : "Not Shared";
  }

  if (mode === "Imports") {
    return hasImportTag(tags) ? "Imported" : "Not Imported";
  }

  return "Unknown";
}

function TagBreakdownPie({ solves, title = "Tag Breakdown" }) {
  const [mode, setMode] = useState("CubeModel");
  const [selectedSolve, setSelectedSolve] = useState(null);

  const data = useMemo(() => {
    const arr = Array.isArray(solves) ? solves : [];
    if (!arr.length) return [];

    const map = new Map();

    for (const solve of arr) {
      const key = getBucketValue(solve, mode);
      const existing = map.get(key) || { label: key, value: 0, solves: [] };
      existing.value += 1;
      existing.solves.push(solve);
      map.set(key, existing);
    }

    return Array.from(map.values())
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [solves, mode]);

  return (
    <div className="pieChartPanel pieChartPanel--withControl">
      <div className="pieChartPanelHeader">
        <select
          className="statsSelect"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          title="Pie chart breakdown"
        >
          {BREAKDOWN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {title}: {opt.label}
            </option>
          ))}
        </select>
      </div>

      <PieChartBuilder
        width="100%"
        height="100%"
        data={data}
        onSliceClick={(solvesInSlice) => setSelectedSolve(solvesInSlice?.[0] || null)}
      />

      {selectedSolve && (
        <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />
      )}
    </div>
  );
}

export default React.memo(TagBreakdownPie);
