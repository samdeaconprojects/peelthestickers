import React, { useEffect, useState } from 'react';
import { calculateAverageForGraph, calculateAverage, calculateBestAverageOfFive, formatTime } from '../TimeList/TimeUtils';

// Helper function to calculate the median
const calculateMedianTime = (times) => {
  const sortedTimes = times.slice().sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedTimes.length / 2);

  if (sortedTimes.length % 2 === 0) {
    return (sortedTimes[middleIndex - 1] + sortedTimes[middleIndex]) / 2;
  } else {
    return sortedTimes[middleIndex];
  }
};

// Helper function to calculate standard deviation
const calculateStandardDeviation = (times) => {
  const average = calculateAverageForGraph(times);
  const variance = times.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / times.length;
  return Math.sqrt(variance);
};

// Helper function to calculate the best average over a given number of solves
const calculateBestAverage = (times, n) => {
  let bestAvg = Infinity;
  for (let i = 0; i <= times.length - n; i++) {
    const avg = calculateAverage(times.slice(i, i + n), true).average;
    if (avg < bestAvg) {
      bestAvg = avg;
    }
  }
  return isFinite(bestAvg) ? bestAvg : 'N/A';
};

function StatsSummary({ solves }) {
  const [average, setAverage] = useState(null);
  const [median, setMedian] = useState(null);
  const [stdDev, setStdDev] = useState(null);
  const [bestAvg5, setBestAvg5] = useState(null);
  const [bestAvg12, setBestAvg12] = useState(null);
  const [bestAvg100, setBestAvg100] = useState(null);
  const [bestAvg1000, setBestAvg1000] = useState(null);

  useEffect(() => {
    if (solves && solves.length > 0) {
      const times = solves.map(solve => solve.time);

      // Calculate stats
      const avg = calculateAverageForGraph(times);
      const medianTime = calculateMedianTime(times);
      const standardDeviation = calculateStandardDeviation(times);
      const bestAvgOf5 = calculateBestAverageOfFive(times);
      const bestAvgOf12 = calculateBestAverage(times, 12);
      const bestAvgOf100 = calculateBestAverage(times, 100);
      const bestAvgOf1000 = calculateBestAverage(times, 1000);

      // Set stats to state
      setAverage(avg);
      setMedian(medianTime);
      setStdDev(standardDeviation);
      setBestAvg5(bestAvgOf5);
      setBestAvg12(bestAvgOf12);
      setBestAvg100(bestAvgOf100);
      setBestAvg1000(bestAvgOf1000);
    }
  }, [solves]);

  if (!solves || solves.length === 0) {
    return <div>No solves available</div>;
  }

  return (
    <div className="stats-summary">
      <div className="stat-item">
        <strong>Count:</strong> {(solves.length)}
      </div>
      <div className="stat-item">
        <strong>Average:</strong> {formatTime(average)}
      </div>
      <div className="stat-item">
        <strong>Median:</strong> {formatTime(median)}
      </div>
      <div className="stat-item">
        <strong>Standard Deviation:</strong> {formatTime(stdDev)}
      </div>
      <div className="stat-item">
        <strong>Best Average of 5:</strong> {formatTime(bestAvg5)}
      </div>
      <div className="stat-item">
        <strong>Best Average of 12:</strong> {formatTime(bestAvg12)}
      </div>
      <div className="stat-item">
        <strong>Best Average of 100:</strong> {formatTime(bestAvg100)}
      </div>
      <div className="stat-item">
        <strong>Best Average of 1000:</strong> {formatTime(bestAvg1000)}
      </div>
    </div>
  );
}

export default StatsSummary;
