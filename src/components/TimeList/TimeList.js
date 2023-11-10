// TimeList.js
import React, { useState, useEffect } from 'react';
import './TimeList.css';

function TimeList({ times }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const formatTime = (milliseconds) => {
    let totalSeconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let millisecondsLeft = milliseconds % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = millisecondsLeft.toString().padStart(3, '0').substring(0, 2);

    return minutes > 0 
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}` 
      : `${formattedSeconds}.${formattedMilliseconds}`;
  };

  const calculateAverage = (timesArray) => {
    const sum = timesArray.reduce((a, b) => a + b, 0);
    return sum / timesArray.length;
  };

  const calculateAverageOfFive = (times) => {
    const lastFiveSolves = times.slice(-5);
    if (lastFiveSolves.length === 0) return 'N/A';
    return calculateAverage(lastFiveSolves);
  };

  const calculateBestAverageOfFive = (times) => {
    let bestAvg = Infinity;
    for (let i = 0; i <= times.length - 5; i++) {
      const avg = calculateAverage(times.slice(i, i + 5));
      if (avg < bestAvg) {
        bestAvg = avg;
      }
    }
    return isFinite(bestAvg) ? bestAvg : 'N/A';
  };

  const currentAvgOfFive = calculateAverageOfFive(times);
  const bestAvgOfFive = calculateBestAverageOfFive(times);

  // Determine the number of columns per row based on window width
  const colsPerRow = windowWidth > 1100 ? 12 : 5; 

  const rows = [];
  for (let i = 0; i < times.length; i += colsPerRow) {
    const timesRow = times.slice(i, i + colsPerRow);
    rows.push(
      <tr key={i}>
        {timesRow.map((time, index) => (
          <td className="TimeItem" key={index}>{formatTime(time)}</td>
        ))}
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((e, index) => (
          <td className="TimeItem" key={colsPerRow + index}>&nbsp;</td>
        ))}
        <td className="TimeItem">{formatTime(calculateAverage(timesRow))}</td>
      </tr>
    );
  }

  return (
    <div className="time-list-container">
      <div className="averages-display">
        Current Avg of 5: {formatTime(currentAvgOfFive)}
        <br />
        Best Avg of 5: {formatTime(bestAvgOfFive)}
      </div>
      <table className="TimeList">
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  );
}

export default TimeList;
