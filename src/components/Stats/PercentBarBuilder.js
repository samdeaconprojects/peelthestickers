import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Helper function to calculate median
const calculateMedianTime = (solves) => {
  const sortedTimes = solves.map(solve => solve.time).sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedTimes.length / 2);
  return sortedTimes.length % 2 === 0
    ? (sortedTimes[middleIndex - 1] + sortedTimes[middleIndex]) / 2
    : sortedTimes[middleIndex];
};

const PercentBarBuilder = ({ solves, width, onSliceClick }) => {
  const [dynamicHeight, setDynamicHeight] = useState(Math.max(200, window.innerHeight * 0.4));
  const [dynamicWidth, setDynamicWidth] = useState(Math.max(200, window.innerWidth * 0.4));
  const [threshold, setThreshold] = useState(10);

  // Update threshold to median on mount
  useEffect(() => {
    if (solves.length > 0) {
      const medianTime = calculateMedianTime(solves) / 1000;
      setThreshold(medianTime.toFixed(2));
    }
  }, [solves]);

  // Adjust height on window resize
  useEffect(() => {
    const handleResize = () => {
      setDynamicHeight(Math.max(200, window.innerHeight * 0.4));
      setDynamicWidth(Math.max(200, window.innerWidth * 0.4));

    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter solves based on threshold
  const belowThreshold = solves.filter(solve => solve.time / 1000 < threshold);
  const totalSolves = solves.length;
  const belowThresholdPercentage = totalSolves > 0 ? (belowThreshold.length / totalSolves) * 100 : 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: `${dynamicWidth}px`,
      height: `${dynamicHeight}px`
    }}>
      

      {/* Bar Container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        //width: '50%',
        height: '100%'
      }}>
        <div style={{
          position: 'relative',
          width: '50px',
          height: '100%',
          borderRadius: '6px',
          border: '2px solid white',
          overflow: 'hidden',
          backgroundColor: 'transparent'
        }}>
          {/* Below Threshold Section (Filled) */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              width: '100%',
              height: `${belowThresholdPercentage}%`,
              backgroundColor: '#2EC4B6',
              transition: 'height 0.3s ease-in-out'
            }}
            onClick={() => onSliceClick(belowThreshold)}
          />
        </div>

        {/* Text */}
        <div style={{
          display: 'flex',
          flexDirection: 'column'
        }}>
        {/* Percentage Label */}
        <div style={{
          marginLeft: '10%',
          color: 'white',
          fontSize: '42px',
        }}>
          <strong>{belowThresholdPercentage.toFixed(1)}%</strong>
        </div>

        {/* Threshold Input */}
      <label style={{ color: 'white', width: '100%', marginBottom: '10px', marginLeft: '10%',}}>
        Sub
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="percent-bar-input"
          style={{
            marginLeft: '5px',
            padding: '5px',
            fontSize: '20px',
            background: 'transparent',
            color: 'white',
            border: 'none'
          }}
        />
      </label>
      </div>
      </div>
    </div>
  );
};

PercentBarBuilder.propTypes = {
  solves: PropTypes.arrayOf(
    PropTypes.shape({
      time: PropTypes.number.isRequired,
      scramble: PropTypes.string.isRequired,
      event: PropTypes.string.isRequired
    })
  ).isRequired,
  width: PropTypes.number.isRequired,
  onSliceClick: PropTypes.func.isRequired
};

export default PercentBarBuilder;
