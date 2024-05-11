import React from 'react';
import LineChart from "./LineChart";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";

const data = [
    { label: "S", x: 0, y: 0 },
    { label: "M", x: 1, y: 400 },
    { label: "T", x: 2, y: 300 },
    { label: "W", x: 3, y: 100 },
    { label: "TH", x: 4, y: 400 },
    { label: "F", x: 5, y: 500 },
    { label: "S", x: 6, y: 400 }
  ];
  
  const styles = {
    chartComponentsContainer: {
      display: 'grid', gridTemplateColumns: 'max-content 700px', alignItems: 'center'
    },
    chartWrapper: { maxWidth: 700, alignSelf: 'flex-start' }
  }

function Stats() {
  return (
    <div className='Page'>
    <div style={styles.chartComponentsContainer}>
      <div/>
      <ChartTitle text="Movements per Day of the Week"/>
      <Label text="Movements" rotate/>
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
      <Label text="Days of the Week"/>
    </div>
    </div>
  );
}

export default Stats;
