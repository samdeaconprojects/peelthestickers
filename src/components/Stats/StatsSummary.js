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

function StatsSummary({ solves, overallStats }) {  //  overallStats NEW
  const [average, setAverage] = useState(null);
  const [median, setMedian] = useState(null);
  const [stdDev, setStdDev] = useState(null);
  const [bestSingle, setBestSingle] = useState(null);
  const [currentAverages, setCurrentAverages] = useState({});
  const [bestAverages, setBestAverages] = useState({});

  useEffect(() => {
    if (solves && solves.length > 0) {
      // Times with DNFs included (DNF → "DNF")
      const times = solves.map(s => s.penalty === 'DNF' ? "DNF" : s.time);
      // Numeric-only times for stats + larger averages
      const numericTimes = solves.filter(s => s.penalty !== 'DNF').map(s => s.time);

      if (times.length === 0) {
        setAverage(null);
        setMedian(null);
        setStdDev(null);
        setBestSingle(null);
        setCurrentAverages({});
        setBestAverages({});
        return;
      }

      // Basic stats (ignore DNFs) for the *window* of solves
      setAverage(
        numericTimes.length > 0
          ? numericTimes.reduce((sum, t) => sum + t, 0) / numericTimes.length
          : "N/A"
      );
      setMedian(
        numericTimes.length > 0
          ? calculateMedianTime(numericTimes)
          : "N/A"
      );
      setStdDev(
        numericTimes.length > 1
          ? calculateStandardDeviation(numericTimes)
          : "N/A"
      );
      setBestSingle(
        numericTimes.length > 0
          ? Math.min(...numericTimes)
          : "N/A"
      );

      const aoValues = [5, 12, 50, 100, 1000, 10000, 100000, 1000000];
      let newCurrentAverages = {};
      let newBestAverages = {};

      aoValues.forEach(n => {
        if (times.length >= n) {
          if (n === 5 || n === 12) {
            // ✅ Current AO5 / AO12 respect DNFs for the visible window
            newCurrentAverages[n] = calculateAverage(times.slice(-n), true).average;
          } else {
            // ✅ Larger averages ignore DNFs on the window
            newCurrentAverages[n] =
              calculateAverage(numericTimes.slice(-n), true).average || "N/A";
          }
          newBestAverages[n] = calculateBestAverage(numericTimes, n) || "N/A";
        }
      });

      // 🔹 Override BEST Ao5/Ao12 with precomputed overall stats if available
      if (overallStats) {
        if (overallStats.bestAo5Ms != null) {
          newBestAverages[5] = overallStats.bestAo5Ms;
        }
        if (overallStats.bestAo12Ms != null) {
          newBestAverages[12] = overallStats.bestAo12Ms;
        }
      }

      setCurrentAverages(newCurrentAverages);
      setBestAverages(newBestAverages);
    } else {
      // No solves in the current window → just reset window-based stats
      setAverage(null);
      setMedian(null);
      setStdDev(null);
      setBestSingle(null);
      setCurrentAverages({});
      setBestAverages({});
    }
  }, [solves, overallStats]);  // depend on overallStats too

  if (!solves || solves.length === 0) {
    return <div>No solves available</div>;
  }

  const totalSolveCount =
    overallStats && overallStats.solveCount != null
      ? overallStats.solveCount
      : solves.length;

  const meanToDisplay =
    overallStats && overallStats.overallAvgMs != null
      ? overallStats.overallAvgMs
      : average;

  const bestSingleToDisplay =
    overallStats && overallStats.bestSingleMs != null
      ? overallStats.bestSingleMs
      : bestSingle;

  return (
    <div className="stats-summary">
      {/* Top Section */}
      <div className="stats-header">
        <div className="stat-count">
          <div className="count-value">{totalSolveCount}</div>
          <div className="count-title">solves</div>
        </div>

        <div className="summary-item">
          <div className="stat-title">MEAN</div>
          <div className="stat-value">{formatTime(meanToDisplay)}</div>
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
          <div className="single-time">{formatTime(bestSingleToDisplay)} </div>
          <div className='stat-title'>BEST SINGLE</div>
        </div>

        {/* Bottom Grid */}
        <div className="summary-grid">
          {/* Best Averages */}
          <div className="stats-best">
            <h4>BEST</h4>
            {Object.keys(bestAverages).map(n => (
              <div key={`best-ao${n}`} className="ao-item">
                <strong>{formatTime(bestAverages[n])}</strong> &nbsp;
                <div className='ao-title'>ao{n}</div>
              </div>
            ))}
          </div>

          {/* Current Averages */}
          <div className="stats-current">
            <h4>CURRENT</h4>
            {Object.keys(currentAverages).map(n => (
              <div key={`current-ao${n}`} className="ao-item">
                <strong>{formatTime(currentAverages[n])}</strong> &nbsp;
                <div className='ao-title'>ao{n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsSummary;
