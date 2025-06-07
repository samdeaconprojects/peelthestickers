import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';
import Detail from '../Detail/Detail';
import { useSettings } from '../../contexts/SettingsContext';
import {
  formatTime,
  calculateAverage,
  getOveralls,
  calculateAverageOfFive,
  calculateBestAverageOfFive
} from './TimeUtils';

function TimeList({ solves = [], deleteTime, rowsToShow = 3, inPlayerBar = false, addPost }) {
  const { settings } = useSettings();
  const isHorizontal = settings.horizontalTimeList;

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    const colsPerRow = windowWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solves.length / colsPerRow);
    setCurrentPage(Math.max(0, totalRows - rowsToShow));

    return () => window.removeEventListener('resize', handleResize);
  }, [windowWidth, solves.length, rowsToShow]);

  if (solves.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }

  const times = solves.map(solve => solve.time);
  const overallData = getOveralls(times);
  const overallMin = overallData.min;
  const overallMax = overallData.max;

  const colsPerRow = windowWidth > 1100 ? 12 : 5;
  const rowsToDisplay = inPlayerBar ? 1 : rowsToShow;
  const maxPage = Math.ceil(solves.length / (colsPerRow * rowsToDisplay)) - 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 0), maxPage);
  const startIndex = validCurrentPage * colsPerRow * rowsToDisplay;
  const visibleSolves = solves.slice(startIndex, startIndex + (colsPerRow * rowsToDisplay));
  const currentFiveIndices = times.length > 5 ? Array.from({ length: 5 }, (_, i) => times.length - 5 + i) : [];

  const rows = [];
  for (let i = 0; i < visibleSolves.length; i += colsPerRow) {
    const timesRow = visibleSolves.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow.map(solve => solve.time), true);

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
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((_, index) => (
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

  const horizontalCount = windowWidth > 1100 ? 12 : 5;
  const horizontalSolves = solves.slice(-horizontalCount);

  return (
    <div className="time-list-container">
      {isHorizontal ? (
        <div className="horizontal-time-list">
  <div className="horizontal-row ao12-row">
    {horizontalSolves.map((_, index, arr) => {
      const actualIndex = solves.length - arr.length + index;
      const ao12Slice = solves.slice(actualIndex - 11, actualIndex + 1);
      if (ao12Slice.length === 12) {
        const ao12 = calculateAverage(ao12Slice.map(s => s.time), true).average;
        return <div key={index} className="ao12 TimeItem">{formatTime(ao12)}</div>;
      }
      return <div key={index} className="ao12 empty TimeItem"></div>;
    })}
    <div className="TimeItem row-label">Ao12</div> {/* Label */}
  </div>

  <div className="horizontal-row ao5-row">
    {horizontalSolves.map((_, index, arr) => {
      const actualIndex = solves.length - arr.length + index;
      const ao5Slice = solves.slice(actualIndex - 4, actualIndex + 1);
      if (ao5Slice.length === 5) {
        const ao5 = calculateAverage(ao5Slice.map(s => s.time), true).average;
        return <div key={index} className="ao5 TimeItem">{formatTime(ao5)}</div>;
      }
      return <div key={index} className="ao5 empty TimeItem"></div>;
    })}
    <div className="TimeItem row-label">Ao5</div> {/* Label */}
  </div>

  <div className="horizontal-row times-row">
    {horizontalSolves.map((solve, index, arr) => {
      const actualIndex = solves.length - arr.length + index;
      return (
        <div
          key={index}
          className="TimeItem"
          onClick={() => {
            setSelectedSolve(solve);
            setSelectedSolveIndex(actualIndex);
          }}
        >
          {formatTime(solve.time)}
          <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(actualIndex); }}>x</span>
        </div>
      );
    })}
    <div className="TimeItem row-label time-label">Time</div> {/* Optional time row label */}
  </div>

  <div className="horizontal-row count-row">
    {horizontalSolves.map((_, index, arr) => {
      const actualIndex = solves.length - arr.length + index + 1;
      return <div key={index} className="solve-count TimeItem">{actualIndex}</div>;
    })}
    <div className="TimeItem row-label">Count</div> {/* Label */}
  </div>

  {selectedSolve && (
    <Detail
      solve={selectedSolve}
      onClose={() => setSelectedSolve(null)}
      deleteTime={() => deleteTime(selectedSolveIndex)}
      addPost={addPost}
    />
  )}
</div>

      ) : (
        <div className="time-list-content">
          <table className="TimeList">
            <tbody>
              {rows}
            </tbody>
          </table>
          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
            />
          )}
        </div>
      )}
      <div className="pagination-buttons">
        <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>▲</button>
        <button onClick={goToNextPage} disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solves.length}>▼</button>
      </div>
    </div>
  );
}

export default TimeList;
