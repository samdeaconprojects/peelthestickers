// TimeList.js
import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';
import { formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive } from './TimeUtils';

function TimeList({ solves, deleteTime }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const times = solves.map(solve => solve.time);

  const currentAvgOfFive = calculateAverageOfFive(times);
  const bestAvgOfFive = calculateBestAverageOfFive(times);

  const colsPerRow = windowWidth > 1100 ? 12 : 5;

  const rows = [];

  for (let i = 0; i < times.length; i += colsPerRow) {
    const overallData = getOveralls(times);
    const overallMin = overallData.min;
    const overallMax = overallData.max;

    const timesRow = times.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow, true);
    const minIndex = averageData.minIndex;
    const maxIndex = averageData.maxIndex;

    rows.push(
      <tr key={i}>
        {timesRow.map((time, index) => (
          <td
            className={`TimeItem ${(i + index) === overallMin ? 'overall-border-min' : ''} ${(i + index) === overallMax ? 'overall-border-max' : ''} ${i + index > times.length - 6 && i + index < times.length ? 'current-five' : 'not-current-five'} `}
            key={index}
            onClick={() => setSelectedSolve(solves[i + index])}
          >
            {formatTime(time)}
            <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(i + index); }}>x</span>
          </td>
        ))}
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((e, index) => (
          <td className="TimeItem" key={colsPerRow + index}>&nbsp;</td>
        ))}
        <td className="TimeItem current-five">{formatTime(averageData.average)}</td>
      </tr>
    );
  }

  return (
    <div className="time-list-container">
      <table className="TimeList">
        <tbody>
          {rows}
        </tbody>
      </table>
      {selectedSolve && (
        <div className="scramble-popup">
          <div className="scramble-popup-content">
            <span className="close-popup" onClick={() => setSelectedSolve(null)}>x</span>
            <p>{selectedSolve.scramble}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimeList;
