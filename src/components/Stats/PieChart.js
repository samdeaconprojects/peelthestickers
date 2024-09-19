import React, { useState, useEffect } from 'react';
import PieChartBuilder from "./PieChartBuilder";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';

// Helper function to calculate median
const calculateMedianTime = (solves) => {
  const sortedTimes = solves.map(solve => solve.time).sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedTimes.length / 2);

  if (sortedTimes.length % 2 === 0) {
    return (sortedTimes[middleIndex - 1] + sortedTimes[middleIndex]) / 2;
  } else {
    return sortedTimes[middleIndex];
  }
};

function PieChart({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [threshold, setThreshold] = useState(10); // Default threshold

  useEffect(() => {
    if (solves.length > 0) {
      // Calculate and set the median time as the threshold
      const medianTime = calculateMedianTime(solves) / 1000; // Convert to seconds
      setThreshold(medianTime.toFixed(2)); // Set to 2 decimal places
    }
  }, [solves]);

  // Convert milliseconds to seconds for comparison
  const belowThreshold = solves.filter(solve => solve.time / 1000 < threshold);
  const aboveThreshold = solves.filter(solve => solve.time / 1000 >= threshold);

  const data = [
    { label: `Below ${threshold}s`, value: belowThreshold.length, solves: belowThreshold },
    { label: `Above ${threshold}s`, value: aboveThreshold.length, solves: aboveThreshold }
  ];

  // Calculate percentages
  const totalSolves = belowThreshold.length + aboveThreshold.length;
  const belowPercentage = ((belowThreshold.length / totalSolves) * 100).toFixed(2);
  const abovePercentage = ((aboveThreshold.length / totalSolves) * 100).toFixed(2);

  const handleThresholdChange = (event) => {
    setThreshold(event.target.value);
  };

  const styles = {
    chartComponentsContainer: {
      display: 'grid', gridTemplateColumns: 'max-content 700px', alignItems: 'center'
    },
    chartWrapper: { maxWidth: 500, alignSelf: 'flex-start' }
  };

  return (
    <div className='pieChart'>
      <div style={styles.chartComponentsContainer} />
      <div className='chartTitle'>
        <ChartTitle text={title} />
      </div>
      <div className='chartWrapper'>
        <label>
          Threshold (seconds): 
          <input 
            type="number" 
            value={threshold} 
            onChange={handleThresholdChange} 
            className="pie-chart-input" 
            style={{ marginLeft: '10px', padding: '5px', fontSize: '14px' }} 
          />
        </label>
        <PieChartBuilder
          width={400}
          height={400}
          data={data}
          onSliceClick={(solves) => setSelectedSolve(solves[0])} // Open detail of the first solve in the group
        />
      </div>
      <p>{`Below ${threshold}s: ${belowPercentage}%, Above ${threshold}s: ${abovePercentage}%`}</p>
      {selectedSolve && (
        <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />
      )}
    </div>
  );
}

export default PieChart;
