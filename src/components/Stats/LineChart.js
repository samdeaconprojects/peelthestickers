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

  // Only use originalTime for DNFs. Skip DNFs with no originalTime.
  const validSolves = solves.filter(solve => {
    if (solve.penalty === "DNF") {
      return typeof solve.originalTime === "number" && isFinite(solve.originalTime);
    }
    return typeof solve.time === "number" && isFinite(solve.time);
  });

  const times = validSolves.map(solve =>
    solve.penalty === "DNF" ? solve.originalTime : solve.time
  );

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

  const data = validSolves.map((solve, index) => {
    const baseTime = solve.penalty === "DNF" ? solve.originalTime : solve.time;

    return {
      label: `${index + 1}`,
      x: index,
      y: baseTime / 1000,
      color: getColor(baseTime),
      time: formatTime(baseTime),
      solve,
      solveIndex: index,
      fullIndex: solve.fullIndex,
      isDNF: solve.penalty === "DNF"
    };
  });

  const solveCountText = "Solve Count: " + data.length;

  const styles = {
    chartComponentsContainer: {
      display: 'grid',
      alignItems: 'center'
    },
    chartWrapper: {
      alignSelf: 'flex-start'
    }
  };

  return (
    <div className='lineChart'>
      <div style={styles.chartComponentsContainer} />
      <div className='chartTitle'>
        {/*<ChartTitle text={title} />*/}
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
            console.log("Actual Full Index:", solve.fullIndex);

            setSelectedSolve(solve);
            setSelectedSolveIndex(solve.fullIndex);
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
