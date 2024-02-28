// TimeList.js
import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';


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

  const formatTime = (timeToDisplay) => {
    //const timeToDisplay = timerOn ? elapsedTime : lastTime;
    let totalSeconds = Math.floor(timeToDisplay / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let milliseconds = timeToDisplay % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = milliseconds.toString().padStart(3, '0').substring(0, 2);

    let formattedTime = minutes > 0
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}`
      : `${formattedSeconds}.${formattedMilliseconds}`;

    return formattedTime;
  };

  const calculateAverage = (timesArray, removeMinMax) => {
    console.log("Original timesArray: " + timesArray);

    // Create an array of objects with value and original index
    const indexedArray = timesArray.map((value, index) => ({ value, index }));

    // Sort indexedArray based on the value in ascending order
    indexedArray.sort((a, b) => a.value - b.value);

    console.log("Sorted indexedArray: ");
    indexedArray.forEach(item => console.log(`Value: ${item.value}, Original Index: ${item.index}`));

    // Calculate the sum of sorted values
    let sum;
    let average;
    if (removeMinMax) {
      const filteredArray = indexedArray.length > 2 ? indexedArray.slice(1, -1) : indexedArray;
      let sum = filteredArray.reduce((acc, curr) => acc + curr.value, 0);

      average = sum / filteredArray.length;

    } else {

      let sum = indexedArray.reduce((acc, curr) => acc + curr.value, 0);

      // Calculate the average
      average = sum / indexedArray.length;

    }


    const minIndex = indexedArray[0].index;
    const maxIndex = indexedArray[indexedArray.length - 1].index;

    console.log("Average: " + average);

    return {
        average: average,
        minIndex: minIndex,
        maxIndex: maxIndex,
        sortedWithOriginalIndexes: indexedArray // This includes both sorted values and their original indexes
    };
};


const getOveralls = (timesArray) => {

  // Create an array of objects with value and original index
  const indexedArray = timesArray.map((value, index) => ({ value, index }));

  indexedArray.sort((a, b) => a.value - b.value);

  const min = indexedArray[0].index;
  const max = indexedArray[timesArray.length - 1].index;

  return {
      min: min,
      max: max,
  };
};

  const calculateAverageOfFive = (times) => {
    const lastFiveSolves = times.slice(-5);
    console.log("calculate average of five, last five solves: " + lastFiveSolves);
    if (lastFiveSolves.length === 0) return 'N/A';
    return calculateAverage(lastFiveSolves, true).answer;
  };

  const calculateBestAverageOfFive = (times) => {
    let bestAvg = Infinity;
    for (let i = 0; i <= times.length - 5; i++) {
      const avg = calculateAverage(times.slice(i, i + 5), true).average;
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
          <td className={`TimeItem ${(i + index) === overallMin ? 'overall-border-min' : ''} ${(i + index) === overallMax ? 'overall-border-max' : ''} ${i + index > times.length - 6 && i + index < times.length ? 'current-five' : 'not-current-five'}  `}  key={index}>{formatTime(time)}</td>
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