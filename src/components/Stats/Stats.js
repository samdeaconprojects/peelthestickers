import React, { useState } from 'react';
import LineChartBuilder from "./LineChartBuilder";
import Label from "./AxisLabel";
import ChartTitle from "./ChartTitle";
import './Stats.css';
import { formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive } from '../TimeList/TimeUtils';
import LineChart from './LineChart';
import TimeTable from './TimeTable';
import PieChart from './PieChart';
import StatsSummary from './StatsSummary';
import BarChart from './BarChart';

function Stats({ sessions, deleteTime, addPost }) {
  const [solvesPerPage, setSolvesPerPage] = useState(300); // Default to showing 300 solves
  const [currentPage, setCurrentPage] = useState(0); // Start on the first page
  const [statsEvent, setStatsEvent] = useState("333"); // Local state for the stats page event

  // Get the solves for the selected stats event
  const solves = sessions[statsEvent] || [];

  // Calculate the range of solves to display based on the current page and solvesPerPage
  const startIndex = Math.max(0, solves.length - solvesPerPage * (currentPage + 1));
  const endIndex = solves.length - solvesPerPage * currentPage;

  // Slice the array to get the subset of solves to display
  const solvesToDisplay = solves.slice(startIndex, endIndex);

  const handleEventChange = (event) => {
    setStatsEvent(event.target.value);
    setCurrentPage(0); // Reset to the first page when switching events
  };

  const handlePreviousPage = () => {
    if (currentPage < Math.floor(solves.length / solvesPerPage) - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleZoomIn = () => {
    if (solvesPerPage > 50) { // Ensure there's a lower limit
      setSolvesPerPage(solvesPerPage - 50);
      setCurrentPage(0);
    }
  };

  const handleZoomOut = () => {
    if (solvesPerPage < solves.length) { // Ensure it doesn't exceed the total solves
      setSolvesPerPage(solvesPerPage + 50);
      setCurrentPage(0);
    }
  };

  return (
    <div className="Page">
      <div className="stats-options">
        <label>Event: </label>
        <select onChange={handleEventChange} value={statsEvent}>
          {Object.keys(sessions).map(eventKey => (
            <option key={eventKey} value={eventKey}>
              {eventKey}
            </option>
          ))}
        </select>
        <button onClick={handlePreviousPage} disabled={currentPage >= Math.floor(solves.length / solvesPerPage) - 1}>
          Older Solves ▲
        </button>
        <button onClick={handleNextPage} disabled={currentPage === 0}>
          Newer Solves ▼
        </button>
        <button onClick={handleZoomIn} disabled={solvesPerPage <= 50}>
          Zoom In
        </button>
        <button onClick={handleZoomOut} disabled={solvesPerPage >= solves.length}>
          Zoom Out
        </button>
      </div>

      <div className="stats-page">
        <div className="stats-grid">
          <div className="stats-item">
            <LineChart solves={solvesToDisplay} title={`Current Avg: ${statsEvent}`} deleteTime={deleteTime} addPost={addPost} />
          </div>
          <div className="stats-item">
            <StatsSummary solves={solvesToDisplay} />
          </div>
          <div className="stats-item">
            <PieChart solves={solvesToDisplay} title="Solves Distribution by Time" />
          </div>
          <div className="stats-item">
            <BarChart solves={solvesToDisplay} />
          </div>
          <div className="stats-item">
            <TimeTable solves={solvesToDisplay} deleteTime={deleteTime} addPost={addPost} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stats;
