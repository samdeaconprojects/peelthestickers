import React, { useState, useEffect, useRef } from "react";

function BarChart({ solves }) {
  const containerRef = useRef(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, count: 0 });

  // Chart size based on parent container
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(250);
  const margin = 0.05; // 5% margin
  const padding = chartWidth * margin; // Dynamic padding

  useEffect(() => {
    // Dynamically get container width
    const updateSize = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth * 0.95); // 95% of container width
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  if (!solves || solves.length === 0 || chartWidth === 0) {
    return <div ref={containerRef}>No data available for this chart.</div>;
  }

  // Extract solve times and normalize to seconds
  const times = solves.map((solve) => solve.time);
  const minTime = Math.floor(Math.min(...times) / 1000);
  const maxTime = Math.ceil(Math.max(...times) / 1000);

  // Count the number of solves per second range
  const counts = Array(maxTime - minTime + 1).fill(0);
  times.forEach((time) => counts[Math.floor(time / 1000) - minTime]++);

  const barWidth = (chartWidth - 2 * padding) / counts.length;
  const maxCount = Math.max(...counts);

  // Function to determine color gradient
  const getColor = (index) => {
    const time = minTime + index;
    const normalizedValue = (time - minTime) / (maxTime - minTime);
    const r = Math.floor(255 * normalizedValue);
    const g = Math.floor(255 * (1 - normalizedValue));
    return `rgb(${r}, ${g}, 100)`;
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "80%", textAlign: "center", padding: "5%" }}>
      <svg width={chartWidth} height={chartHeight}>
        {/* X & Y Axes */}
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#ccc" />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#ccc" />

        {/* Bars */}
        {counts.map((count, index) => {
          const barHeight = (count / maxCount) * (chartHeight - 2 * padding);
          const barX = padding + index * barWidth;
          const barY = chartHeight - padding - barHeight;

          return (
            <rect
              key={index}
              x={barX}
              y={barY}
              width={barWidth - 2}
              height={barHeight}
              rx={5} // Rounded corners
              ry={5}
              fill={getColor(index)}
              style={{
                transition: "all 0.2s ease-in-out",
                transformOrigin: "bottom",
              }}
              onMouseOver={(e) => {
                setTooltip({
                  visible: true,
                  x: barX + barWidth / 2,
                  y: barY - 10,
                  count,
                });
              }}
              onMouseOut={() => setTooltip({ visible: false, x: 0, y: 0, count: 0 })}
            />
          );
        })}

        {/* X-axis labels */}
        {counts.map((_, index) => (
          <text
            key={index}
            x={padding + index * barWidth + barWidth / 2}
            y={chartHeight - padding + 15}
            textAnchor="middle"
            fontSize="10px"
            fill="white"
          >
            {minTime + index}
          </text>
        ))}

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
          Count: {tooltip.count}
        </div>
      )}
    </div>
  );
}

export default BarChart;
