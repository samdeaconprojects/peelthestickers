// TimeList.js
import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';
import {formatTime, calculateAverage, getOveralls, calculateAverageOfFive, calculateBestAverageOfFive} from './TimeUtils';


function TimeList({ times, deleteTime }) {
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

  

  const currentAvgOfFive = calculateAverageOfFive(times);
  const bestAvgOfFive = calculateBestAverageOfFive(times);

  // Determine the number of columns per row based on window width
  const colsPerRow = windowWidth > 1100 ? 12 : 5; 

  const rows = [];
    
  for (let i = 0; i < times.length; i += colsPerRow) {
    //overall
    const overallData = getOveralls(times);
    const overallMin = overallData.min;
    const overallMax = overallData.max;

    //curr avg 5
   
    const currentData = calculateAverageOfFive(times);
    //const currentArray = currentData.sortedWithOriginalIndexes;
    
    //row
    const timesRow = times.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow, true);
    const minIndex = averageData.minIndex;
    const maxIndex = averageData.maxIndex;

    rows.push(
      <tr key={i}>
        {timesRow.map((time, index) => (
          /* ${i + index === times.length - (5 - currentArray[0].index) ? 'fastest' : ''} ${i + index === times.length - (5 - currentArray[1].index) ? 'faster' : ''} ${i + index === times.length - (5 - currentArray[2].index) ? 'middle-fast' : ''} ${i + index === times.length - (5 - currentArray[3].index) ? 'slower' : ''} ${i + index === times.length - (5 - currentArray[4].index) ? 'slowest' : ''} */
          <td className={`TimeItem ${(i + index) === overallMin ? 'overall-border-min' : ''} ${(i + index) === overallMax ? 'overall-border-max' : ''} ${i + index > times.length - 6 && i + index < times.length ? 'current-five' : 'not-current-five'}  `}  key={index}>
            {formatTime(time)}
            <span className="delete-icon" onClick={() => deleteTime(i + index)}>x</span>
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
    </div>
  );
}

export default TimeList;

/*
      <div className="averages-display">
        Current Avg of 5: {formatTime(currentAvgOfFive)}
        <br />
        Best Avg of 5: {formatTime(bestAvgOfFive)}
      </div>
*/