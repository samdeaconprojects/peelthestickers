import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';
import Detail from '../Detail/Detail'; 
import { formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive } from './TimeUtils';

function TimeList({ solves = [], deleteTime, rowsToShow = 3, inPlayerBar = false, addPost }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null); // Store the selected solve's index

  const [currentPage, setCurrentPage] = useState(0); // Tracks the current row of solves being shown

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);

    // Set the current page to show the most recent solves
    const colsPerRow = windowWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solves.length / colsPerRow);

    // Ensure the current page shows the last set of solves or the first page
    setCurrentPage(Math.max(0, totalRows - rowsToShow)); 

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [windowWidth, solves.length, rowsToShow]);

  if (solves.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }

  const times = solves.map(solve => solve.time);

  const currentAvgOfFive = calculateAverageOfFive(times);
  const bestAvgOfFive = calculateBestAverageOfFive(times);

  const colsPerRow = windowWidth > 1100 ? 12 : 5;
  const totalRows = Math.ceil(times.length / colsPerRow);
  const rowsToDisplay = inPlayerBar ? 1 : rowsToShow;
  const maxPage = Math.ceil(solves.length / (colsPerRow * rowsToDisplay)) - 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 0), maxPage);
  const startIndex = validCurrentPage * colsPerRow * rowsToDisplay;
  const visibleSolves = solves.slice(startIndex, startIndex + (colsPerRow * rowsToDisplay));
  const overallData = getOveralls(times);
  const overallMin = overallData.min;
  const overallMax = overallData.max;
  const currentFiveIndices = times.length > 5 ? Array.from({ length: 5 }, (_, i) => times.length - 5 + i) : [];

  const rows = [];
  for (let i = 0; i < visibleSolves.length; i += colsPerRow) {
    const timesRow = visibleSolves.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow.map(solve => solve.time), true);
    console.log("AVERAGE DATA");

    console.log(averageData);

    rows.push(
      <tr key={i}>
        {timesRow.map((solve, index) => {
          const solveIndex = startIndex + i + index;
          const isBest = solveIndex === overallMin;
          const isWorst = solveIndex === overallMax;
          const isCurrentFive = currentFiveIndices.includes(solveIndex);

          return (
            <td
              className={`TimeItem ${isBest ? 'overall-border-min' : ''} ${isWorst ? 'overall-border-max' : ''} ${isCurrentFive ? 'current-five' : ''}`}
              key={index}
              onClick={() => {
                setSelectedSolve(solve);
                setSelectedSolveIndex(solveIndex);
              }}
            >
              {formatTime(solve.time)}
              <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(solveIndex); }}>x</span>
            </td>
          );
        })}
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((e, index) => (
          <td className="TimeItem" key={colsPerRow + index}>&nbsp;</td>
        ))}
        <td className="TimeItem current-five">{formatTime(averageData.average)}</td>
      </tr>
    );
  }

  const goToPreviousPage = () => {
    if (validCurrentPage > 0) setCurrentPage(validCurrentPage - 1);
  };

  const goToNextPage = () => {
    if ((validCurrentPage + 1) * rowsToDisplay * colsPerRow < solves.length) setCurrentPage(validCurrentPage + 1);
  };

  return (
    <div className="time-list-container">
      <div className="time-list-content">
        <table className="TimeList">
          <tbody>
            {rows}
          </tbody>
        </table>
        {selectedSolve && (
          <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} deleteTime={() => deleteTime(selectedSolveIndex)} addPost={addPost}/>
        )}
      </div>
      <div className="pagination-buttons">
        <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>
          ▲
        </button>
        <button onClick={goToNextPage} disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solves.length}>
          ▼
        </button>
      </div>
    </div>
  );
}

export default TimeList;
