import React from "react";
import { formatTime } from "../TimeList/TimeUtils";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";

function formatMetric(value, average = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return formatTime(numeric, average);
}

function formatEventLabel(event) {
  const ev = String(event || "").trim().toUpperCase();
  const labelMap = {
    "222": "2x2",
    "333": "3x3",
    "444": "4x4",
    "555": "5x5",
    "666": "6x6",
    "777": "7x7",
    "333OH": "OH",
    "333FEW": "FMC",
    "333BLD": "3BLD",
    "444BLD": "4BLD",
    "555BLD": "5BLD",
    "333MULTIBLD": "MBLD",
    "PYRAMINX": "Pyra",
    "CLOCK": "Clock",
    "SKEWB": "Skewb",
    "SQ1": "Sq-1",
    "MEGAMINX": "Mega",
  };
  return labelMap[ev] || ev || "Event";
}

function getPuzzleIconEvent(event) {
  const ev = String(event || "").trim().toUpperCase();
  if (["333OH", "333BLD", "333MULTIBLD", "333FEW"].includes(ev)) return "333";
  if (ev === "444BLD") return "444";
  if (ev === "555BLD") return "555";
  return ev;
}

function isNxNStyleEvent(event) {
  return ["222", "333", "444", "555", "666", "777", "333OH", "333FEW", "333BLD", "444BLD", "555BLD", "333MULTIBLD"]
    .includes(String(event || "").trim().toUpperCase());
}

function MatrixValueButton({ value = null, average = false, className = "", onClick = null }) {
  const disabled = value == null || typeof onClick !== "function";

  return (
    <button
      type="button"
      className={`statsEventMatrixValueBtn ${disabled ? "is-disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className={className}>{formatMetric(value, average)}</div>
    </button>
  );
}

function MatrixCell({ item, metricKey, best = null, worst = null, average = false, onStatSelect = null }) {
  return (
    <div className="statsEventMatrixCell">
      <MatrixValueButton
        value={best}
        average={average}
        className="statsEventMatrixValue statsEventMatrixValue--best"
        onClick={() =>
          onStatSelect?.({
            event: item?.event,
            metricKey,
            variant: "best",
            value: best,
            mainOnly: item?.mainOnly !== false,
          })
        }
      />
      <MatrixValueButton
        value={worst}
        average={average}
        className="statsEventMatrixValue statsEventMatrixValue--worst"
        onClick={() =>
          onStatSelect?.({
            event: item?.event,
            metricKey,
            variant: "worst",
            value: worst,
            mainOnly: item?.mainOnly !== false,
          })
        }
      />
    </div>
  );
}

export default function AllEventsTimeMatrix({
  items = [],
  loading = false,
  mainOnly = false,
  onToggleMainOnly = null,
  onStatSelect = null,
}) {
  const gridStyle = {
    gridTemplateColumns: `56px repeat(${Math.max(1, items.length)}, minmax(88px, 1fr))`,
  };

  return (
    <div className={`statsEventMatrix ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <div className="statsEventMatrixScroller">
        <div className="statsEventMatrixGrid" style={gridStyle}>
          <label className={`statsEventMatrixToggle statsEventMatrixMetricHead ${mainOnly ? "" : "is-active"}`}>
            <input
              type="checkbox"
              checked={!mainOnly}
              onChange={(event) => onToggleMainOnly?.(!event.target.checked)}
            />
            <span className="statsEventMatrixToggleLabel">
              {mainOnly ? "Main Sessions" : "All Sessions"}
            </span>
          </label>
          {items.map((item) => (
            <div key={`head-${item.event}`} className="statsEventMatrixEventHead">
              <div className="statsEventMatrixEventTitle">
                <span
                  className={`statsEventMatrixEventIcon ${
                    isNxNStyleEvent(item.event) ? "is-nxn" : "is-other"
                  }`}
                  aria-hidden="true"
                >
                  <PuzzleSVG event={getPuzzleIconEvent(item.event)} scramble="" isStatsHeaderIcon />
                </span>
                <span>{formatEventLabel(item.event)}</span>
              </div>
              <small>{Number(item.solveCount || 0).toLocaleString()}</small>
            </div>
          ))}

          <div className="statsEventMatrixMetricHead">Single</div>
          {items.map((item) => (
            <MatrixCell
              key={`single-${item.event}`}
              item={item}
              metricKey="single"
              best={item.singleBest}
              worst={item.singleWorst}
              average={false}
              onStatSelect={onStatSelect}
            />
          ))}

          <div className="statsEventMatrixMetricHead">AO5</div>
          {items.map((item) => (
            <MatrixCell
              key={`ao5-${item.event}`}
              item={item}
              metricKey="ao5"
              best={item.ao5Best}
              worst={item.ao5Worst}
              average
              onStatSelect={onStatSelect}
            />
          ))}

          <div className="statsEventMatrixMetricHead">AO12</div>
          {items.map((item) => (
            <MatrixCell
              key={`ao12-${item.event}`}
              item={item}
              metricKey="ao12"
              best={item.ao12Best}
              worst={item.ao12Worst}
              average
              onStatSelect={onStatSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
