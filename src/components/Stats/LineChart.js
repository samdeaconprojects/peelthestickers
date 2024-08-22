import React from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import './Stats.css';
import { formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive, calculateAverageForGraph } from '../TimeList/TimeUtils';

function LineChart({ times, title }) {
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

  const data = times.map((time, index) => ({
    label: `${index + 1}`, // Creating a label with the solve number
    x: index, // x-coordinate as the index
    y: parseFloat(formatTime(time).replace(':', '.')), // Convert formatted time to a float for y-coordinate
    color: getColor(time), // Assign a color based on the time
    time: formatTime(time) // Include the formatted time for the tooltip
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
      {/*<Label text="Time" rotate />*/}
      <div style={styles.chartWrapper}>
        <LineChartBuilder
          width={500}
          height={300}
          data={data}
          horizontalGuides={5}
          precision={2}
          verticalGuides={7}
        />
      </div>
      <div />
      <Label text={solveCountText} />
    </div>
  );
}

export default LineChart;
