export const formatTime = (timeToDisplay) => {
    //const timeToDisplay = timerOn ? elapsedTime : lastTime;
    let totalSeconds = Math.floor(timeToDisplay / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let milliseconds = timeToDisplay % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = milliseconds.toString().padStart(3, '0').substring(0, 2);

    let formattedTime = minutes > 0
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}`
      : `${seconds}.${formattedMilliseconds}`;

    return formattedTime;
  };

  // TimeUtils.js
export const calculateAverageForGraph = (times) => {
  if (!times || times.length === 0) {
    return 0;
  }

  const sum = times.reduce((total, time) => total + time, 0);
  return sum / times.length;
};


export const calculateAverage = (timesArray, removeMinMax) => {
  //console.log("Original timesArray: " + timesArray);

  // Ensure all entries are numeric and map to an array of objects with value and original index
  const indexedArray = timesArray.map((time, index) => ({ value: parseFloat(time), index }))
                                 .filter(item => !isNaN(item.value));  // Filter out non-numeric entries

  if (indexedArray.length === 0) {
      return { average: null, minIndex: -1, maxIndex: -1 };
  }

  // Sort indexedArray based on the value in ascending order
  indexedArray.sort((a, b) => a.value - b.value);

  //console.log("Sorted indexedArray: ");
  //indexedArray.forEach(item => console.log(`Value: ${item.value}, Original Index: ${item.index}`));

  let sum = 0;  // Initialize sum
  let currAverage = 0;

  if (removeMinMax && indexedArray.length > 2) {
      // Remove the smallest and largest values if appropriate
      const filteredArray = indexedArray.slice(1, -1);
      sum = filteredArray.reduce((acc, curr) => acc + curr.value, 0);
      currAverage = sum / filteredArray.length;
  } else {
      // Calculate sum of all values
      sum = indexedArray.reduce((acc, curr) => acc + curr.value, 0);
      currAverage = sum / indexedArray.length;
  }

  const minIndex = indexedArray[0].index;
  const maxIndex = indexedArray[indexedArray.length - 1].index;

  //console.log("Average: " + currAverage);

  return {
      average: currAverage,
      minIndex: minIndex,
      maxIndex: maxIndex,
      sortedWithOriginalIndexes: indexedArray // This includes both sorted values and their original indexes
  };
};


export const getOveralls = (timesArray) => {

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

export const calculateAverageOfFive = (times) => {
    const lastFiveSolves = times.slice(-5);
    //console.log("calculate average of five, last five solves: " + lastFiveSolves);
    if (lastFiveSolves.length === 0) return 'N/A';
    return calculateAverage(lastFiveSolves, true).answer;
  };

export const calculateBestAverageOfFive = (times) => {
    let bestAvg = Infinity;
    for (let i = 0; i <= times.length - 5; i++) {
      const avg = calculateAverage(times.slice(i, i + 5), true).average;
      if (avg < bestAvg) {
        bestAvg = avg;
      }
    }
    return isFinite(bestAvg) ? bestAvg : 'N/A';
  };