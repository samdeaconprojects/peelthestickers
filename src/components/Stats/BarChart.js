import React, { useState, useEffect, useRef } from "react";

function BarChart({ solves }) {
  const containerRef = useRef(null);

  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, count: 0, label: "" });
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight] = useState(250);
  const margin = 0.05;
  const padding = chartWidth * margin;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth * 0.95);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  if (!solves || solves.length === 0 || chartWidth === 0) {
    return <div ref={containerRef}>No data available for this chart.</div>;
  }

  // Convert solve times
  const times = solves.map((solve) => {
    if (solve.penalty === "+2") return (solve.originalTime || solve.time) + 2000;
    if (solve.penalty === "DNF") return "DNF";
    return solve.time;
  });

  const numericTimes = times.filter((t) => typeof t === "number");
  const dnfCount = times.filter((t) => t === "DNF").length;

  const minTime = Math.floor(Math.min(...numericTimes) / 1000);
  const maxTime = Math.ceil(Math.max(...numericTimes) / 1000);

  const bucketCount = Math.max(1, maxTime - minTime + 1);
  const counts = Array(bucketCount + (dnfCount > 0 ? 1 : 0)).fill(0);

  numericTimes.forEach((time) => {
    const bucketIndex = Math.floor(time / 1000) - minTime;
    counts[bucketIndex]++;
  });

  if (dnfCount > 0) {
    counts[counts.length - 1] = dnfCount;
  }

  const barWidth = (chartWidth - 2 * padding) / counts.length;
  const maxCount = Math.max(...counts);

  const getColor = (index) => {
    if (dnfCount > 0 && index === counts.length - 1) return "crimson";
    const time = minTime + index;
    const normalized = (time - minTime) / (maxTime - minTime);
    const r = Math.floor(255 * normalized);
    const g = Math.floor(255 * (1 - normalized));
    return `rgb(${r}, ${g}, 100)`;
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "80%", textAlign: "center", padding: "5%" }}>
      <svg width={chartWidth} height={chartHeight}>
        {/* Axes */}
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#ccc" />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#ccc" />

        {/* Bars */}
        {counts.map((count, index) => {
          const barHeight = (count / maxCount) * (chartHeight - 2 * padding);
          const barX = padding + index * barWidth;
          const barY = chartHeight - padding - barHeight;
          const label = dnfCount > 0 && index === counts.length - 1 ? "DNF" : `${minTime + index}`;

          return (
            <g key={index}>
              <rect
                x={barX}
                y={barY}
                width={barWidth - 2}
                height={barHeight}
                rx={5}
                ry={5}
                fill={getColor(index)}
                style={{ transition: "all 0.2s ease-in-out", transformOrigin: "bottom" }}
                onMouseOver={() =>
                  setTooltip({ visible: true, x: barX + barWidth / 2, y: barY - 10, count, label })
                }
                onMouseOut={() => setTooltip({ visible: false, x: 0, y: 0, count: 0, label: "" })}
              />
              <text
                x={barX + barWidth / 2}
                y={chartHeight - padding + 15}
                textAnchor="middle"
                fontSize="10px"
                fill="white"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Y-axis labels */}
        {[0, maxCount].map((count, index) => (
          <text
            key={index}
            x={padding - 10}
            y={chartHeight - padding - (count / maxCount) * (chartHeight - 2 * padding)}
            textAnchor="end"
            fontSize="10px"
            fill="white"
          >
            {count}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "5px",
            borderRadius: "5px",
            fontSize: "12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {tooltip.label}: {tooltip.count}
        </div>
      )}
    </div>
  );
}

export default BarChart;
