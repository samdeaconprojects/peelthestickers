import React from 'react';
import PropTypes from 'prop-types';

const PercentBarBuilder = ({ data, width, height, onSliceClick }) => {
  const radius = Math.min(width, height) / 2;
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  // Avoid drawing if the total is 0 (no data)
  if (total === 0) {
    return <p>No solves available for the current threshold</p>;
  }

  let cumulativeValue = 0;

  const slices = data.map((entry, index) => {
    if (entry.value === 0) return null; // Skip if the slice is zero

    const startAngle = (cumulativeValue / total) * 2 * Math.PI;
    cumulativeValue += entry.value;
    const endAngle = (cumulativeValue / total) * 2 * Math.PI;
    
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    const startX = radius * Math.cos(startAngle);
    const startY = radius * Math.sin(startAngle);
    const endX = radius * Math.cos(endAngle);
    const endY = radius * Math.sin(endAngle);

    const pathData = [
      `M 0 0`, // Move to center
      `L ${startX} ${startY}`, // Draw line to start of arc
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`, // Draw arc
      'Z' // Close the path back to the center
    ].join(' ');

    const fill = `hsl(${(index / data.length) * 360}, 70%, 50%)`;

    return (
      <path
        key={entry.label}
        d={pathData}
        fill={fill}
        onClick={() => onSliceClick(entry.solves)}
        style={{ cursor: 'pointer' }}
      />
    );
  });

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${width / 2},${height / 2})`}>{slices}</g>
    </svg>
  );
};

PercentBarBuilder.propTypes = {
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

export default PercentBarBuilder;
