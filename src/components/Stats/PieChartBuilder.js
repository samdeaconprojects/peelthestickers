import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";

const VIEWBOX_SIZE = 220;
const CHART_RADIUS = 86;
const CHART_CENTER = VIEWBOX_SIZE / 2;

const PieChartBuilder = ({ data, width, height, onSliceClick, legendValueMode, interactive }) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const colorPalette = ["#2EC4B6", "#FFB044", "#50B6FF", "#FB596D", "#FFE863", "#FDFFFC"];

  const sortedData = useMemo(
    () => [...data].filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value),
    [data]
  );

  if (total === 0 || sortedData.length === 0) {
    return <p className="pieChartEmpty">No solves available</p>;
  }

  let cumulativeValue = 0;

  const slices = sortedData.map((entry, index) => {
    const startAngle = (cumulativeValue / total) * 2 * Math.PI - Math.PI / 2;
    cumulativeValue += entry.value;
    const endAngle = (cumulativeValue / total) * 2 * Math.PI - Math.PI / 2;

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    const startX = CHART_CENTER + CHART_RADIUS * Math.cos(startAngle);
    const startY = CHART_CENTER + CHART_RADIUS * Math.sin(startAngle);
    const endX = CHART_CENTER + CHART_RADIUS * Math.cos(endAngle);
    const endY = CHART_CENTER + CHART_RADIUS * Math.sin(endAngle);
    const fill = colorPalette[index % colorPalette.length];
    const isHovered = hoveredSlice === index;

    const pathData = [
      `M ${CHART_CENTER} ${CHART_CENTER}`,
      `L ${startX} ${startY}`,
      `A ${CHART_RADIUS} ${CHART_RADIUS} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      "Z",
    ].join(" ");

    const handleSelect = () => {
      if (!interactive || typeof onSliceClick !== "function") return;
      onSliceClick(entry.solves);
    };

    return (
      <path
        key={entry.label}
        d={pathData}
        fill={fill}
        onClick={handleSelect}
        onMouseEnter={() => setHoveredSlice(index)}
        onMouseLeave={() => setHoveredSlice(null)}
        style={{
          cursor: interactive ? "pointer" : "default",
          transform: isHovered ? "scale(1.04)" : "scale(1)",
          transformOrigin: `${CHART_CENTER}px ${CHART_CENTER}px`,
          transition: "transform 0.2s ease-in-out, stroke-width 0.2s ease-in-out",
          stroke: isHovered ? "rgba(255,255,255,0.9)" : "rgba(5,10,12,0.35)",
          strokeWidth: isHovered ? "3px" : "1.25px",
        }}
      />
    );
  });

  const activeSlice = hoveredSlice != null ? sortedData[hoveredSlice] : sortedData[0];
  const activePercent = Math.round((activeSlice.value / total) * 100);

  return (
    <div className="pieChartRoot" style={{ width, height }}>
      <div className="pieChartCanvas">
        <svg
          className="pieChartSvg"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {slices}
          <circle
            cx={CHART_CENTER}
            cy={CHART_CENTER}
            r="42"
            fill="rgba(7, 12, 15, 0.88)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1.5"
          />
          <text x={CHART_CENTER} y={CHART_CENTER - 6} textAnchor="middle" className="pieChartCenterValue">
            {activePercent}%
          </text>
          <text x={CHART_CENTER} y={CHART_CENTER + 16} textAnchor="middle" className="pieChartCenterLabel">
            {activeSlice.label}
          </text>
        </svg>
      </div>

      <div className="pieChartLegend">
        {sortedData.map((entry, index) => {
          const percent = Math.round((entry.value / total) * 100);
          const isActive = hoveredSlice === index;
          const legendMeta = legendValueMode === "count" ? `${entry.value}` : `${entry.value} · ${percent}%`;
          return (
            <button
              key={entry.label}
              type="button"
              className={`pieChartLegendItem ${isActive ? "is-active" : ""}`}
              onClick={() => {
                if (!interactive || typeof onSliceClick !== "function") return;
                onSliceClick(entry.solves);
              }}
              onMouseEnter={() => setHoveredSlice(index)}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              <span
                className="pieChartLegendSwatch"
                style={{ backgroundColor: colorPalette[index % colorPalette.length] }}
              />
              <span className="pieChartLegendText" title={entry.label}>
                {entry.label}
              </span>
              <span className="pieChartLegendMeta">
                {legendMeta}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

PieChartBuilder.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      solves: PropTypes.arrayOf(
        PropTypes.shape({
          time: PropTypes.number.isRequired,
          scramble: PropTypes.string.isRequired,
          event: PropTypes.string.isRequired
        })
      ).isRequired
    })
  ).isRequired,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onSliceClick: PropTypes.func,
  legendValueMode: PropTypes.oneOf(["count", "count-percent"]),
  interactive: PropTypes.bool,
};

PieChartBuilder.defaultProps = {
  width: "100%",
  height: "100%",
  onSliceClick: null,
  legendValueMode: "count-percent",
  interactive: true,
};

export default PieChartBuilder;
