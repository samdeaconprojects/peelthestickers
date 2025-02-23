import React, { useState, useEffect } from 'react';

function BarChart({ solves }) {
  // Tooltip state
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, count: 0 });

  // Responsive chart dimensions
  const [chartWidth, setChartWidth] = useState(window.innerWidth * 0.5);
  const [chartHeight, setChartHeight] = useState(window.innerHeight * 0.5);
  const padding = 40;

  useEffect(() => {
    // Function to update chart size on window resize
    const handleResize = () => {
      setChartWidth(window.innerWidth * 0.5); // 80% of window width
      setChartHeight(window.innerHeight * 0.5); // 50% of window height
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!solves || solves.length === 0) {
    return <div>No data available for this chart.</div>;
  }

  // Extract the solve times
  const times = solves.map(solve => solve.time);

  // Find the min and max time values
  const minTime = Math.floor(Math.min(...times) / 1000);
  const maxTime = Math.ceil(Math.max(...times) / 1000);

  // Create an array to count solves in each second
  const counts = Array(maxTime - minTime + 1).fill(0);
  times.forEach(time => counts[Math.floor(time / 1000) - minTime]++);

  const barWidth = (chartWidth - 2 * padding) / counts.length;
  const maxCount = Math.max(...counts);

  // Function to determine the color of each bar
  const getColor = (index) => {
    const time = minTime + index;
    const normalizedValue = (time - minTime) / (maxTime - minTime);
    const r = Math.floor(255 * normalizedValue);
    const g = Math.floor(255 * (1 - normalizedValue));
    return `rgb(${r}, ${g}, 0)`;
  };

  return (
    <div style={{ position: 'relative', width: '100%', textAlign: 'center' }}>
      <svg width={chartWidth} height={chartHeight}>
        {/* X & Y Axis */}
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
              fill={getColor(index)}
              onMouseOver={(e) => setTooltip({ visible: true, x: e.clientX, y: e.clientY, count })}
              onMouseOut={() => setTooltip({ visible: false, x: 0, y: 0, count: 0 })}
            />
          );
        })}

        {/* X-axis labels */}
        {counts.map((_, index) => {
          const second = index + minTime;
          return (
            <text
              key={index}
              x={padding + index * barWidth + barWidth / 2}
              y={chartHeight - padding + 15}
              textAnchor="middle"
              fontSize="10px"
              fill="white"
            >
              {second}
            </text>
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
            position: 'absolute',
            left: tooltip.x - 50,
            top: tooltip.y - 40,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            padding: '5px',
            borderRadius: '5px',
            pointerEvents: 'none'
          }}
        >
          Count: {tooltip.count}
        </div>
      )}
    </div>
  );
}

export default BarChart;
