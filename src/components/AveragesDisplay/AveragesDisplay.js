import React from 'react';
import { formatTime, calculateAverage, calculateBestAverageOfFive } from '../TimeList/TimeUtils';
import './AveragesDisplay.css';

function AveragesDisplay({ currentSolves, setSelectedAverageSolves }) {
  const avgOfFive = calculateAverage(currentSolves.slice(-5).map((s) => s.time), true).average;
  const avgOfTwelve = calculateAverage(currentSolves.slice(-12).map((s) => s.time), true).average || "N/A";
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
      : "N/A";

    const lastFour = currentSolves.slice(-4).map(s => s.time).filter(t => typeof t === "number");

let bpa = "N/A";
let wpa = "N/A";

if (lastFour.length === 4) {
  const sorted = [...lastFour].sort((a, b) => a - b);
  const bestHypo = sorted[0];  // BPA adds another solve same as the best
  const worstHypo = sorted[3]; // WPA adds another solve same as the worst

  const bestSet = [...lastFour, bestHypo];
  const worstSet = [...lastFour, worstHypo];

  bpa = formatTime(calculateAverage(bestSet, true).average);
  wpa = formatTime(calculateAverage(worstSet, true).average);
}


  return (
    
    <div className="container">
    <div className="possible-averages">
  <span className="bpa">BPA  {bpa}</span>
  <span className="wpa">WPA  {wpa}</span>
</div>

    <div className="averages-display">


      <p></p>
      <p className="averagesTitle" onClick={() => setSelectedAverageSolves(currentSolves.slice(-5))}>AO5</p>
      <p className="averagesTitle" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>AO12</p>
      <p className="averagesTitle" style={{ opacity: 0.5 }}>CURRENT</p>

      <p className="averagesTime" onClick={() => setSelectedAverageSolves(currentSolves.slice(-5))}>
        {formatTime(avgOfFive)}
      </p>
      <p className="averagesTime" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>
        {formatTime(avgOfTwelve)}
      </p>

      <p className="averagesTitle best">BEST</p>
      <p className="averagesTime best" onClick={() => {
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
      }}>
        {formatTime(bestAvgOfFive)}
      </p>

      <p className="averagesTime best" onClick={() => {
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
      }}>
        {formatTime(bestAvgOfTwelve)}
      </p>
    </div>
    </div>
  );
}

export default AveragesDisplay;
