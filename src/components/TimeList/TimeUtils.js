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


export const AVERAGE_TRIM_PERCENT = 0.05;

// Community standard (csTimer and the timers that followed it): trim ceil(5%) of
// the window from each end, never fewer than one. The 5% rule reproduces the WCA
// definitions on its own -- Ao5 and Ao12 both land on one trimmed solve per side --
// so Mo3/Ao5/Ao12 stay WCA-legal without being special-cased here.
export const getTrimCountForWindow = (windowSize) => {
  const n = Number(windowSize);
  if (!Number.isFinite(n) || n < 3) return 0;
  return Math.max(1, Math.ceil(n * AVERAGE_TRIM_PERCENT));
};

export const MEAN_DNF_TOLERANCE_PERCENT = 0.05;

// A mean trims nothing, so a DNF has no slot to fall into the way it does in a
// trimmed average: tolerating one means a "mean of 100" is really a mean of 95.
// Mo3 is WCA-defined and stays strict at zero tolerance.
// Must stay in sync with getMeanDnfToleranceForWindow in server/lib/ptsCore.js.
export const getMeanDnfToleranceForWindow = (windowSize) => {
  const n = Number(windowSize);
  if (!Number.isFinite(n) || n < 5) return 0;
  return Math.max(1, Math.ceil(n * MEAN_DNF_TOLERANCE_PERCENT));
};

// Mean of a window, DNFs tolerated up to `dnfTolerance` and excluded from the mean.
// Defaults to the strict WCA rule.
export const calculateMean = (timesArray, { dnfTolerance = 0 } = {}) => {
  const input = Array.isArray(timesArray) ? timesArray : [];
  if (!input.length) return { mean: "N/A", dnfCount: 0 };

  const values = input.map((time) => {
    const isDnf =
      time === "DNF" || time == null || time === Number.MAX_SAFE_INTEGER;
    const value = Number.parseFloat(time);
    return isDnf || !Number.isFinite(value) ? null : value;
  });

  const valid = values.filter((v) => v != null);
  const dnfCount = values.length - valid.length;

  if (dnfCount > Math.max(0, Number(dnfTolerance) || 0)) return { mean: "DNF", dnfCount };
  if (!valid.length) return { mean: "N/A", dnfCount };

  return { mean: valid.reduce((acc, v) => acc + v, 0) / valid.length, dnfCount };
};

// Both variants of every best mean are stored, so switching the setting is a field
// swap rather than a recompute. Returns the field names to read for a given window.
export const getBestMeanFieldNames = (windowSize, tolerateDnf = true) => {
  const n = Number(windowSize);
  if (!Number.isFinite(n)) return null;
  if (n === 3) {
    // Mo3 has no tolerant variant -- it is WCA-strict by definition.
    return { valueField: "BestMo3Ms", startField: "BestMo3StartSolveSK" };
  }
  return tolerateDnf === false
    ? { valueField: `BestMo${n}NoDnfMs`, startField: `BestMo${n}NoDnfStartSolveSK` }
    : { valueField: `BestMo${n}Ms`, startField: `BestMo${n}StartSolveSK` };
};

// Reads the best mean for `windowSize` out of a stored stats item, honouring the
// user's DNF-tolerance setting.
export const resolveBestMeanMs = (stats, windowSize, settings) => {
  const fields = getBestMeanFieldNames(windowSize, settings?.tolerateDnfInMeans !== false);
  if (!fields || !stats) return null;
  const value = Number(stats[fields.valueField]);
  return Number.isFinite(value) ? value : null;
};

const EMPTY_TRIM = Object.freeze({ low: [], high: [] });

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
  const trimCount =
    removeMinMax && entries.length > 2 ? getTrimCountForWindow(entries.length) : 0;

  // DNFs sort as the slowest solves, so the trim absorbs them. Only once there are
  // more DNFs than trimmed slots does the average itself become a DNF.
  if (trimCount > 0 && dnfCount > trimCount) {
    return { average: "DNF", minIndex: -1, maxIndex: -1, trimCount, trimmedIndexes: EMPTY_TRIM };
  }

  const numericEntries = entries.filter(
    (entry) => !entry.isDnf && Number.isFinite(entry.value)
  );

  if (numericEntries.length === 0) {
    return { average: "N/A", minIndex: -1, maxIndex: -1, trimCount, trimmedIndexes: EMPTY_TRIM };
  }

  const sortedNumericEntries = [...numericEntries].sort((a, b) => a.value - b.value);
  const bestIndex = sortedNumericEntries[0]?.index ?? -1;
  const worstIndex =
    dnfCount > 0
      ? entries.find((entry) => entry.isDnf)?.index ?? -1
      : sortedNumericEntries[sortedNumericEntries.length - 1]?.index ?? -1;

  let currAverage;
  let trimmedIndexes = EMPTY_TRIM;

  if (trimCount > 0) {
    // DNFs already occupy the slowest trim slots, so only the remainder comes off the top.
    const highTrim = Math.max(0, trimCount - dnfCount);
    const filteredArray = sortedNumericEntries.slice(
      trimCount,
      sortedNumericEntries.length - highTrim
    );

    // Which original positions were discarded, so callers can mark them in the UI.
    trimmedIndexes = {
      low: sortedNumericEntries.slice(0, trimCount).map((entry) => entry.index),
      high: [
        ...entries.filter((entry) => entry.isDnf).map((entry) => entry.index),
        ...(highTrim > 0
          ? sortedNumericEntries.slice(sortedNumericEntries.length - highTrim).map((e) => e.index)
          : []),
      ],
    };

    if (!filteredArray.length) {
      return {
        average: "N/A",
        minIndex: bestIndex,
        maxIndex: worstIndex,
        trimCount,
        trimmedIndexes,
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
        trimCount,
        trimmedIndexes,
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
    trimCount,
    trimmedIndexes,
    sortedWithOriginalIndexes: sortedNumericEntries,
  };
};

// Maps each trimmed original index to the end it came off, for callers that want to
// style the discarded solves. Returns an empty Map for untrimmed metrics like Mo3.
export const getTrimmedSideByIndex = (result) => {
  const sides = new Map();
  for (const index of result?.trimmedIndexes?.low || []) sides.set(index, "low");
  for (const index of result?.trimmedIndexes?.high || []) sides.set(index, "high");
  return sides;
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
