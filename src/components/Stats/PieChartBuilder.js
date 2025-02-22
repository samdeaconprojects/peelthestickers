import React, { useState } from 'react';
import PropTypes from 'prop-types';

const PieChartBuilder = ({ data, width, height, onSliceClick }) => {
  const radius = Math.min(width, height) / 2;
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const colorPalette = ["#2EC4B6", "#FFB044", "#50B6FF", "#FB596D", "#FFE863", "#FDFFFC"];

  if (total === 0) {
    return <p>No solves available</p>;
  }

  // Sort data from largest to smallest value
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  let cumulativeValue = 0;

  const slices = sortedData.map((entry, index) => {
    if (entry.value === 0) return null;

    const startAngle = (cumulativeValue / total) * 2 * Math.PI;
    cumulativeValue += entry.value;
    const endAngle = (cumulativeValue / total) * 2 * Math.PI;

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    const startX = radius * Math.cos(startAngle);
    const startY = radius * Math.sin(startAngle);
    const endX = radius * Math.cos(endAngle);
    const endY = radius * Math.sin(endAngle);

    const pathData = [
      `M 0 0`,
      `L ${startX} ${startY}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      'Z'
    ].join(' ');

    const fill = colorPalette[index % colorPalette.length];
    const isHovered = hoveredSlice === index;

    return (
      <path
        key={entry.label}
        d={pathData}
        fill={fill}
        onClick={() => onSliceClick(entry.solves)}
        onMouseEnter={() => setHoveredSlice(index)}
        onMouseLeave={() => setHoveredSlice(null)}
        style={{
          cursor: 'pointer',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform 0.2s ease-in-out, stroke-width 0.2s ease-in-out',
          stroke: isHovered ? 'black' : 'none', // Outline on hover
          strokeWidth: isHovered ? '3px' : '0px', // Slightly thick outline
        }}
      />
    );
  });

  return (
    <svg
      width={width}
      height={height}
      style={{ overflow: 'visible', marginLeft: '20%', marginTop: '5%'  }}
    >
      <g transform={`translate(${width / 2},${height / 2})`}>{slices}</g>

      {/* Show hovered label */}
      {hoveredSlice !== null && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="16"
          fontWeight="bold"
          fill="white"
          style={{
            transform: `translate(${width / 2}px, ${height / 2}px)`,
            transition: 'opacity 0.1s ease-in-out',
          }}
        >
          {sortedData[hoveredSlice]?.label}
        </text>
      )}
    </svg>
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
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onSliceClick: PropTypes.func.isRequired
};

export default PieChartBuilder;
