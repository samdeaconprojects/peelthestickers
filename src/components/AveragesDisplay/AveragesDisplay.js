import React from 'react';
import { formatTime, calculateAverage, calculateBestAverageOfFive } from '../TimeList/TimeUtils';
import './AveragesDisplay.css';

function safeAverage(solves, count) {
  if (solves.length < count) return 0;
  return calculateAverage(solves.slice(-count).map(s => s.time), true).average;
}

function AveragesDisplay({ currentSolves, setSelectedAverageSolves }) {
  const avgOfFive = safeAverage(currentSolves, 5);
  const avgOfTwelve = safeAverage(currentSolves, 12);

  const bestAvgOfFive = calculateBestAverageOfFive(currentSolves.map((s) => s.time));
  const bestAvgOfTwelve =
    currentSolves.length >= 12
      ? Math.min(
          ...currentSolves.map((_, i) =>
            i + 12 <= currentSolves.length
              ? calculateAverage(currentSolves.slice(i, i + 12).map((s) => s.time), true).average
              : Infinity
          )
        )
      : 0;

  const lastFour = currentSolves.slice(-4).map(s => s.time).filter(t => typeof t === "number");

  let bpa5 = "N/A", wpa5 = "N/A";
  let bpa12 = "N/A", wpa12 = "N/A";

  if (lastFour.length === 4) {
    const sorted = [...lastFour].sort((a, b) => a - b);
    const bestHypo = sorted[0];
    const worstHypo = sorted[3];

    const bestSet = [...lastFour, bestHypo];
    const worstSet = [...lastFour, worstHypo];

    bpa5 = formatTime(calculateAverage(bestSet, true).average);
    wpa5 = formatTime(calculateAverage(worstSet, true).average);
  }

  return (
    <div className="averages-table">
      <div className="header"></div>
      <div className="header current-col">Current</div>
      <div className="header">Best</div>
      <div className="header bpa-header">BPA</div>
      <div className="header wpa-header">WPA</div>

      {/* AO5 row */}
      <div className="row-title ao5" onClick={() => setSelectedAverageSolves(currentSolves.slice(-5))}>
        AO5
      </div>
      <div className="cell current-col ao5" onClick={() => setSelectedAverageSolves(currentSolves.slice(-5))}>
        {formatTime(avgOfFive)}
      </div>
      <div
        className="cell best ao5"
        onClick={() => {
          if (currentSolves.length >= 5) {
            let bestSlice = [];
            let best = Infinity;
            for (let i = 0; i <= currentSolves.length - 5; i++) {
              const slice = currentSolves.slice(i, i + 5);
              const avg = calculateAverage(slice.map(s => s.time), true).average;
              if (avg < best) {
                best = avg;
                bestSlice = slice;
              }
            }
            setSelectedAverageSolves(bestSlice);
          }
        }}
      >
        {formatTime(bestAvgOfFive)}
      </div>
      <div className="cell less-important">{bpa5}</div>
      <div className="cell less-important">{wpa5}</div>

      {/* AO12 row */}
      <div className="row-title ao12" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>
        AO12
      </div>
      <div className="cell current-col ao12" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>
        {formatTime(avgOfTwelve)}
      </div>
      <div
        className="cell best ao12"
        onClick={() => {
          if (currentSolves.length >= 12) {
            let bestSlice = [];
            let best = Infinity;
            for (let i = 0; i <= currentSolves.length - 12; i++) {
              const slice = currentSolves.slice(i, i + 12);
              const avg = calculateAverage(slice.map(s => s.time), true).average;
              if (avg < best) {
                best = avg;
                bestSlice = slice;
              }
            }
            setSelectedAverageSolves(bestSlice);
          }
        }}
      >
        {formatTime(bestAvgOfTwelve)}
      </div>
      <div className="cell less-important">{bpa12}</div>
      <div className="cell less-important">{wpa12}</div>
    </div>
  );
}

export default AveragesDisplay;
