import React from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import './Stats.css';
import {formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive} from '../TimeList/TimeUtils';
import LineChart from './LineChart';
import TimeTable from './TimeTable';



function Stats({solves}) {

  const times = solves.map(solve => solve.time);

  
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
  
 

  return (
    <div className='Page'>
      

      <div className='stats-page'>
      <div className='stats-grid'>
        <div className='stats-item'>
          <LineChart times={times} title={"Current Avg: 3x3"}/>
        </div>
        <div className='stats-item'>
          <TimeTable solves={solves}/>
        </div>
        <div className='stats-item'>
          <LineChart times={times} title={"Current Avg: 3x3"}/>
        </div>
        <div className='stats-item'>
          <TimeTable solves={solves}/>
        </div>
        <div className='stats-item'>
          <LineChart times={times} title={"Current Avg: 3x3"}/>
        </div>
        <div className='stats-item'>
          <TimeTable solves={solves}/>
        </div>
        {/* Add more LineChart components as needed */}
      </div>
    </div>
      
    </div>
  );
}

export default Stats;
