import React from 'react';
import LineChart from "./LineChart";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import {formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive} from '../TimeList/TimeUtils';



function Stats({times}) {

  const data = times.map((time, index) => ({
    label: `Solve ${index + 1}`, // Creating a label with the solve number
    x: index, // x-coordinate as the index
    y: parseFloat(formatTime(time).replace(':', '.')) // Convert formatted time to a float for y-coordinate
  }));
  /*
  const data = [
    { label: "S", x: 0, y: 0 },
    { label: "M", x: 1, y: 400 },
    { label: "T", x: 2, y: 300 },
    { label: "W", x: 3, y: 100 },
    { label: "TH", x: 4, y: 400 },
    { label: "F", x: 5, y: 500 },
    { label: "S2", x: 6, y: 400 },
    { label: "S22", x: 7, y: 0 },
    { label: "M2", x: 8, y: 400 },
    { label: "T2", x: 9, y: 300 },
    { label: "W2", x: 10, y: 100 },
    { label: "TH2", x: 11, y: 400 },
    { label: "F2", x: 12, y: 500 },
    { label: "S2", x: 13, y: 4200 }
  ];
  */
  
  const styles = {
    chartComponentsContainer: {
      display: 'grid', gridTemplateColumns: 'max-content 700px', alignItems: 'center'
    },
    chartWrapper: { maxWidth: 700, alignSelf: 'flex-start' }
  }

  return (
    <div className='Page'>
    <div style={styles.chartComponentsContainer}>
      <div/>
      <ChartTitle text="Current Average: 3x3"/>
      <Label text="Time" rotate/>
      <div style={styles.chartWrapper}>
        <LineChart
        width={500 }
          height={300}
          data={data}
          horizontalGuides={5}
          precision={2}
          verticalGuides={7}
        />
      </div>
      <div/>
      <Label text="Solves"/>
    </div>
    </div>
  );
}

export default Stats;
