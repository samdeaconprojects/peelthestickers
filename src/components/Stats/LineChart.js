import React, { useState } from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';
import { formatTime, calculateAverageForGraph } from '../TimeList/TimeUtils';

function LineChart({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);

  const times = solves.map(solve => solve.time);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const averageTime = calculateAverageForGraph(times);

  const getColor = (time) => {
    const ratio = (time - minTime) / (maxTime - minTime);
    if (time <= averageTime) {
      return `rgb(${255 * ratio}, 255, ${0})`; // Green to Yellow
    } else {
      return `rgb(255, ${255 * (1 - ratio)}, 0)`; // Yellow to Red
    }
  };

  const data = solves.map((solve, index) => ({
    label: `${index + 1}`, // Creating a label with the solve number
    x: index, // x-coordinate as the index
    y: parseFloat(formatTime(solve.time).replace(':', '.')), // Convert formatted time to a float for y-coordinate
    color: getColor(solve.time), // Assign a color based on the time
    time: formatTime(solve.time), // Include the formatted time for the tooltip
    solve: solve // Pass the entire solve object for the detail view
  }));

  const solveCountText = "Solve Count: " + times.length;

  const styles = {
    chartComponentsContainer: {
      display: 'grid', gridTemplateColumns: 'max-content 700px', alignItems: 'center'
    },
    chartWrapper: { maxWidth: 700, alignSelf: 'flex-start' }
  }

  return (
    <div className='lineChart'>
      <div style={styles.chartComponentsContainer} />
      <div className='chartTitle'>
        <ChartTitle text={title} />
      </div>
      <div style={styles.chartWrapper}>
        <LineChartBuilder
          width={500}
          height={300}
          data={data}
          horizontalGuides={5}
          precision={2}
          verticalGuides={7}
          onDotClick={(solve) => setSelectedSolve(solve)}
        />
      </div>
      <div />
      <Label text={solveCountText} />
      {selectedSolve && (
        <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />
      )}
    </div>
  );
}

export default LineChart;
