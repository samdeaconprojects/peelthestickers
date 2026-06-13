export const formatTime = (timeToDisplay, isAverage = false, penalty = null) => {
  if (timeToDisplay === "DNF" || timeToDisplay === Number.MAX_SAFE_INTEGER || penalty === 'DNF') {
    return 'DNF';
  }
  if (timeToDisplay === "N/A" || timeToDisplay === null || isNaN(timeToDisplay)) {
    return 'N/A';
  }

  const numericTime = Number(timeToDisplay);
  const displayTime = isAverage ? Math.round(numericTime / 10) * 10 : numericTime;

  let minutes = Math.floor(displayTime / 60000);
  let seconds = Math.floor((displayTime % 60000) / 1000);

  const milliseconds = Math.floor((displayTime % 1000) / 10).toString().padStart(2, '0');

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
  const entries = (Array.isArray(timesArray) ? timesArray : []).map((time, index) => {
    const isDnf =
      time === "DNF" ||
      time === null ||
      time === undefined ||
      time === Number.MAX_SAFE_INTEGER;
    const value = Number.parseFloat(time);

    return {
      index,
      isDnf,
      value: Number.isFinite(value) ? value : null,
    };
  });

  const dnfCount = entries.filter((entry) => entry.isDnf).length;

  if (dnfCount >= 2) {
    return { average: "DNF", minIndex: -1, maxIndex: -1 };
  }

  const numericEntries = entries.filter(
    (entry) => !entry.isDnf && Number.isFinite(entry.value)
  );

  if (numericEntries.length === 0) {
    return { average: "N/A", minIndex: -1, maxIndex: -1 };
  }

  const sortedNumericEntries = [...numericEntries].sort((a, b) => a.value - b.value);
  const bestIndex = sortedNumericEntries[0]?.index ?? -1;
  const worstIndex =
    dnfCount === 1
      ? entries.find((entry) => entry.isDnf)?.index ?? -1
      : sortedNumericEntries[sortedNumericEntries.length - 1]?.index ?? -1;

  let currAverage;
  if (removeMinMax && entries.length > 2) {
    let filteredArray;

    if (dnfCount === 1) {
      filteredArray = sortedNumericEntries.slice(1);
    } else {
      filteredArray = sortedNumericEntries.slice(1, -1);
    }

    if (!filteredArray.length) {
      return {
        average: "N/A",
        minIndex: bestIndex,
        maxIndex: worstIndex,
        sortedWithOriginalIndexes: sortedNumericEntries,
      };
    }

    const sum = filteredArray.reduce((acc, curr) => acc + curr.value, 0);
    currAverage = sum / filteredArray.length;
  } else {
    if (dnfCount > 0) {
      return {
        average: "DNF",
        minIndex: bestIndex,
        maxIndex: worstIndex,
        sortedWithOriginalIndexes: sortedNumericEntries,
      };
    }

    const sum = sortedNumericEntries.reduce((acc, curr) => acc + curr.value, 0);
    currAverage = sum / sortedNumericEntries.length;
  }

  return {
    average: currAverage,
    minIndex: bestIndex,
    maxIndex: worstIndex,
    sortedWithOriginalIndexes: sortedNumericEntries,
  };
};

export const getExtremeIndexes = (timesArray) => {
  const entries = (Array.isArray(timesArray) ? timesArray : []).map((time, index) => {
    const isDnf =
      time === "DNF" ||
      time === null ||
      time === undefined ||
      time === Number.MAX_SAFE_INTEGER;
    const value = Number.parseFloat(time);

    return {
      index,
      isDnf,
      value: Number.isFinite(value) ? value : null,
    };
  });

  const numericEntries = entries.filter(
    (entry) => !entry.isDnf && Number.isFinite(entry.value)
  );

  if (!numericEntries.length) {
    return { minIndex: -1, maxIndex: -1 };
  }

  const sortedNumericEntries = [...numericEntries].sort((a, b) => a.value - b.value);
  const minIndex = sortedNumericEntries[0]?.index ?? -1;
  const maxIndex = entries.some((entry) => entry.isDnf)
    ? entries.find((entry) => entry.isDnf)?.index ?? -1
    : sortedNumericEntries[sortedNumericEntries.length - 1]?.index ?? -1;

  return { minIndex, maxIndex };
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
  if (lastFiveSolves.length === 0) return "N/A";
  return calculateAverage(lastFiveSolves, true).average;
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
