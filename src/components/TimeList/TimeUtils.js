export const formatTime = (timeToDisplay, isAverage = false, penalty = null) => {
  if (timeToDisplay === "DNF" || timeToDisplay === Number.MAX_SAFE_INTEGER || penalty === 'DNF') {
    return 'DNF';
  }
  if (timeToDisplay === "N/A" || timeToDisplay === null || isNaN(timeToDisplay)) {
    return 'N/A';
  }

  let minutes = Math.floor(timeToDisplay / 60000);
  let seconds = Math.floor((timeToDisplay % 60000) / 1000);

  let milliseconds;
  if (isAverage) {
    milliseconds = ((timeToDisplay % 1000) / 1000).toFixed(2).slice(2);
  } else {
    milliseconds = Math.floor((timeToDisplay % 1000) / 10).toString().padStart(2, '0');
  }

  const formattedSeconds = seconds.toString().padStart(2, '0');

  let formattedTime = minutes > 0
    ? `${minutes}:${formattedSeconds}.${milliseconds}`
    : `${seconds}.${milliseconds}`;

  if (penalty === '+2') formattedTime += '+';

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
  // Count DNFs (stored as "DNF" or MAX_SAFE_INTEGER etc.)
  const dnfCount = timesArray.filter(
    t => t === "DNF" || t === null || t === undefined || t === Number.MAX_SAFE_INTEGER
  ).length;

  if (dnfCount >= 2) {
    return { average: "DNF", minIndex: -1, maxIndex: -1 };
  }

  // Convert numeric times
  const indexedArray = timesArray
    .map((time, index) => ({ value: parseFloat(time), index }))
    .filter(item => !isNaN(item.value));

  if (indexedArray.length === 0) {
    return { average: "N/A", minIndex: -1, maxIndex: -1 };
  }

  indexedArray.sort((a, b) => a.value - b.value);

  let currAverage;
  if (removeMinMax && indexedArray.length > 2) {
    const filteredArray = indexedArray.slice(1, -1);
    const sum = filteredArray.reduce((acc, curr) => acc + curr.value, 0);
    currAverage = sum / filteredArray.length;
  } else {
    const sum = indexedArray.reduce((acc, curr) => acc + curr.value, 0);
    currAverage = sum / indexedArray.length;
  }

  return {
    average: currAverage,
    minIndex: indexedArray[0].index,
    maxIndex: indexedArray[indexedArray.length - 1].index,
    sortedWithOriginalIndexes: indexedArray
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
  let found = false;

  for (let i = 0; i <= times.length - 5; i++) {
    const avgResult = calculateAverage(times.slice(i, i + 5), true).average;
    if (typeof avgResult === "number" && isFinite(avgResult)) {
      found = true;
      if (avgResult < bestAvg) {
        bestAvg = avgResult;
      }
    }
  }

  return found ? bestAvg : "N/A";
};

export const calculateBestAverageOfTwelve = (times) => {
  let bestAvg = Infinity;
  let found = false;

  for (let i = 0; i <= times.length - 12; i++) {
    const avgResult = calculateAverage(times.slice(i, i + 12), true).average;
    if (typeof avgResult === "number" && isFinite(avgResult)) {
      found = true;
      if (avgResult < bestAvg) {
        bestAvg = avgResult;
      }
    }
  }

  return found ? bestAvg : "N/A";
};
