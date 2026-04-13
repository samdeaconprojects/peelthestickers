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
  orientation = "horizontal",
  showSessionToggle = true,
}) {
  const isVertical = orientation === "vertical";
  const gridStyle = isVertical
    ? {
        gridTemplateColumns: "minmax(82px, 0.95fr) repeat(3, minmax(0, 1fr))",
        gridTemplateRows: `auto repeat(${Math.max(1, items.length)}, 48px)`,
      }
    : {
        gridTemplateColumns: `56px repeat(${Math.max(1, items.length)}, minmax(88px, 1fr))`,
        gridTemplateRows: "auto repeat(3, 48px)",
      };

  return (
    <div
      className={`statsEventMatrix ${isVertical ? "statsEventMatrix--vertical" : ""} ${loading ? "is-loading" : ""}`}
      aria-busy={loading}
    >
      <div className="statsEventMatrixScroller">
        <div className="statsEventMatrixGrid" style={gridStyle}>
          {isVertical ? (
            <>
              <div className="statsEventMatrixMetricHead statsEventMatrixFirstCol">
                <span className="statsEventMatrixFirstColContent">
                  {showSessionToggle ? (mainOnly ? "Main Sessions" : "All Sessions") : "Event"}
                </span>
              </div>
              {["Single", "AO5", "AO12"].map((label) => (
                <div key={label} className="statsEventMatrixMetricHead statsEventMatrixMetricHead--centered">
                  <span>{label}</span>
                </div>
              ))}

              {items.map((item) => (
                <React.Fragment key={`row-${item.event}`}>
                  <div className="statsEventMatrixEventHead statsEventMatrixFirstCol statsEventMatrixEventHead--vertical">
                    <div className="statsEventMatrixEventTitle">
                      <span
                        className={`statsEventMatrixEventIcon ${
                          isNxNStyleEvent(item.event) ? "is-nxn" : "is-other"
                        }`}
                        aria-hidden="true"
                      >
                        <PuzzleSVG event={getPuzzleIconEvent(item.event)} scramble="" isStatsHeaderIcon />
                      </span>
                      <span className="statsEventMatrixEventLabel">{formatEventLabel(item.event)}</span>
                    </div>
                    <small>{Number(item.solveCount || 0).toLocaleString()}</small>
                  </div>
                  <MatrixCell
                    item={item}
                    metricKey="single"
                    best={item.singleBest}
                    worst={item.singleWorst}
                    average={false}
                    onStatSelect={onStatSelect}
                  />
                  <MatrixCell
                    item={item}
                    metricKey="ao5"
                    best={item.ao5Best}
                    worst={item.ao5Worst}
                    average
                    onStatSelect={onStatSelect}
                  />
                  <MatrixCell
                    item={item}
                    metricKey="ao12"
                    best={item.ao12Best}
                    worst={item.ao12Worst}
                    average
                    onStatSelect={onStatSelect}
                  />
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              {showSessionToggle ? (
                <label className={`statsEventMatrixToggle statsEventMatrixMetricHead statsEventMatrixFirstCol ${mainOnly ? "" : "is-active"}`}>
                  <input
                    type="checkbox"
                    checked={!mainOnly}
                    onChange={(event) => onToggleMainOnly?.(!event.target.checked)}
                  />
                  <span className="statsEventMatrixToggleLabel">
                    {mainOnly ? "Main Sessions" : "All Sessions"}
                  </span>
                </label>
              ) : (
                <div className="statsEventMatrixMetricHead statsEventMatrixFirstCol">
                  <span className="statsEventMatrixFirstColContent">Event</span>
                </div>
              )}
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

              <div className="statsEventMatrixMetricHead statsEventMatrixFirstCol">
                <span className="statsEventMatrixFirstColContent">Single</span>
              </div>
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

              <div className="statsEventMatrixMetricHead statsEventMatrixFirstCol">
                <span className="statsEventMatrixFirstColContent">AO5</span>
              </div>
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

              <div className="statsEventMatrixMetricHead statsEventMatrixFirstCol">
                <span className="statsEventMatrixFirstColContent">AO12</span>
              </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
