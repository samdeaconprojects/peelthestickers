import React from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import './Stats.css';
import {formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive} from '../TimeList/TimeUtils';
import LineChart from './LineChart';
import TimeTable from './TimeTable';
import PieChart from './PieChart';
import StatsSummary from './StatsSummary';



function Stats({ sessions, currentEvent, deleteTime, addPost }) {
  const solves = sessions[currentEvent];

  return (
    <div className="Page">
      <div className="stats-page">
        <div className="stats-grid">
          <div className="stats-item">
            <LineChart solves={solves} title={"Current Avg: 3x3"} deleteTime={deleteTime} addPost={addPost} />
          </div>
          <div className="stats-item">
            <StatsSummary solves={solves} />
          </div>
          <div className="stats-item">
            <PieChart solves={solves} title="Solves Distribution by Time" />
          </div>
          <div className="stats-item">
            <TimeTable solves={solves} deleteTime={deleteTime} addPost={addPost} />
          </div>
          <div className="stats-item">
            <LineChart solves={solves} title={"Current Avg: 3x3"} deleteTime={deleteTime} addPost={addPost} />
          </div>
          <div className="stats-item">
            <TimeTable solves={solves} deleteTime={deleteTime} addPost={addPost} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stats;
