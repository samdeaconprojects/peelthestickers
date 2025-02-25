import React, { useState } from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';
import { formatTime, calculateAverageForGraph } from '../TimeList/TimeUtils';

function LineChart({ solves, title, deleteTime, addPost }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);

  const times = solves.map(solve => solve.time);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const averageTime = calculateAverageForGraph(times);

  const getColor = (time) => {
    const ratio = (time - minTime) / (maxTime - minTime);
    if (time <= averageTime) {
      return `rgb(${255 * ratio}, 255, 0)`; // Green to Yellow
    } else {
      return `rgb(255, ${255 * (1 - ratio)}, 0)`; // Yellow to Red
    }
  };

  // Pass both the solve object and its index for easy reference

  const data = solves.map((solve, index) => ({
    label: `${index + 1}`,
    x: index,
    y: parseFloat(formatTime(solve.time).replace(':', '.')),
    color: getColor(solve.time),
    time: formatTime(solve.time),
    solve: solve,
    solveIndex: index,   // This is the displayed index
    fullIndex: solve.fullIndex, // The correct index in sessions[statsEvent]
  }));
  

  const solveCountText = "Solve Count: " + times.length;

  const styles = {
    chartComponentsContainer: {
      display: 'grid',  alignItems: 'center'
    },
    chartWrapper: {  alignSelf: 'flex-start' }
  };

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
          onDotClick={(solve, solveIndex) => {
            console.log("Clicked Solve:", solve);
            console.log("Displayed Index:", solveIndex);
            console.log("Actual Full Index:", solve.fullIndex); // Debugging log
          
            setSelectedSolve(solve);
            setSelectedSolveIndex(solve.fullIndex); // Set the true index
          }}
          
        />
      </div>
      <div />
      <Label text={solveCountText} />
      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => deleteTime(selectedSolveIndex)}
          addPost={addPost}
        />
      )}
    </div>
  );
}

export default LineChart;
