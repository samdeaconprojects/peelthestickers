import React, { useEffect, useState } from 'react';
import { calculateAverage, formatTime } from '../TimeList/TimeUtils';
import './StatsSummary.css';

// Helper function to calculate the median
const calculateMedianTime = (times) => {
  const sortedTimes = times.slice().sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedTimes.length / 2);
  return sortedTimes.length % 2 === 0
    ? (sortedTimes[middleIndex - 1] + sortedTimes[middleIndex]) / 2
    : sortedTimes[middleIndex];
};

// Helper function to calculate standard deviation
const calculateStandardDeviation = (times) => {
  if (times.length < 2) return 'N/A';
  const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
  const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
  return Math.sqrt(variance);
};

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
  const [bestSingle, setBestSingle] = useState(null); // New state for best single time
  const [currentAverages, setCurrentAverages] = useState({});
  const [bestAverages, setBestAverages] = useState({});

  useEffect(() => {
    if (solves && solves.length > 0) {
      const times = solves.map(solve => solve.time);

      // Calculate basic stats
      setAverage(times.reduce((sum, t) => sum + t, 0) / times.length);
      setMedian(calculateMedianTime(times));
      setStdDev(calculateStandardDeviation(times));
      setBestSingle(Math.min(...times)); // Find the fastest single solve

      // Define the different AoX values to track
      const aoValues = [5, 12, 50, 100, 1000, 10000, 100000, 1000000];

      // Compute current and best averages
      let newCurrentAverages = {};
      let newBestAverages = {};

      aoValues.forEach(n => {
        if (times.length >= n) {
          newCurrentAverages[n] = calculateAverage(times.slice(-n), true).average || "N/A";
          newBestAverages[n] = calculateBestAverage(times, n) || "N/A";
        }
      });

      setCurrentAverages(newCurrentAverages);
      setBestAverages(newBestAverages);
    }
  }, [solves]);

  if (!solves || solves.length === 0) {
    return <div>No solves available</div>;
  }

  return (
    <div className="stats-summary">
      {/* Top Section */}
      <div className="stats-header">
        <div className="stat-count">
          <div className="count-value">{solves.length}</div>
          <div className="count-title">solves</div>
        </div>

        <div className="summary-item">
          <div className="stat-title">MEAN</div>
          <div className="stat-value">{formatTime(average)}</div>
        </div>
        <div className="summary-item">
          <div className="stat-title">MEDIAN</div>
          <div className="stat-value">{formatTime(median)}</div>
        </div>
        <div className="summary-item">
          <div className="stat-title">ST. DEV</div>
          <div className="stat-value">{formatTime(stdDev)}</div>
        </div>
      </div>

      <div className="stats-body">

      <div className="best-single">
          <div className="single-time">{formatTime(bestSingle)} </div> <div className='stat-title'>BEST SINGLE</div>
        </div>

      {/* Bottom Grid */}
      <div className="summary-grid">
        {/* Best Averages */}
        <div className="stats-best">
          <h4>BEST</h4>
          {Object.keys(bestAverages).map(n => (
            <div key={`best-ao${n}`} className="ao-item">
              <strong>{formatTime(bestAverages[n])}</strong> &nbsp; <div className='ao-title'>ao{n}</div>
            </div>
          ))}
        </div>

        {/* Current Averages */}
        <div className="stats-current">
          <h4>CURRENT</h4>
          {Object.keys(currentAverages).map(n => (
            <div key={`current-ao${n}`} className="ao-item">
              <strong>{formatTime(currentAverages[n])}</strong>  &nbsp; <div className='ao-title'>ao{n}</div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

export default StatsSummary;
