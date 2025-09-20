import React from 'react';
import { formatTime, calculateAverage, calculateBestAverageOfFive } from '../TimeList/TimeUtils';
import './AveragesDisplay.css';

function safeAverage(solves, count) {
  if (solves.length < count) return "N/A";
  return calculateAverage(solves.slice(-count).map(s => s.time), true).average;
}

function AveragesDisplay({ currentSolves, setSelectedAverageSolves }) {
  const avgOfFive = safeAverage(currentSolves, 5);
  const avgOfTwelve = safeAverage(currentSolves, 12);

  const bestAvgOfFive = calculateBestAverageOfFive(currentSolves.map((s) => s.time));

  // Best AO12
  let bestAvgOfTwelve = "N/A";
  if (currentSolves.length >= 12) {
    let best = Infinity;
    for (let i = 0; i <= currentSolves.length - 12; i++) {
      const avgResult = calculateAverage(currentSolves.slice(i, i + 12).map(s => s.time), true).average;
      if (typeof avgResult === "number" && isFinite(avgResult) && avgResult < best) {
        best = avgResult;
      }
    }
    if (best !== Infinity) bestAvgOfTwelve = best;
  }

  // BPA/WPA
  const lastFour = currentSolves.slice(-4).map(s => s.time).filter(t => typeof t === "number");
  let bpa5 = "N/A", wpa5 = "N/A";
  let bpa12 = "N/A", wpa12 = "N/A";

  if (lastFour.length === 4) {
    // AO5 BPA/WPA
    const sorted = [...lastFour].sort((a, b) => a - b);
    const bestHypo = sorted[0];
    const worstHypo = sorted[3];

    const bestSet = [...lastFour, bestHypo];
    const worstSet = [...lastFour, worstHypo];

    const bpaAvg5 = calculateAverage(bestSet, true).average;
    const wpaAvg5 = calculateAverage(worstSet, true).average;

    bpa5 = bpaAvg5 === "DNF" ? "DNF" : formatTime(bpaAvg5);
    wpa5 = wpaAvg5 === "DNF" ? "DNF" : formatTime(wpaAvg5);
  }

  if (currentSolves.length >= 11) {
    // AO12 BPA/WPA
    const lastEleven = currentSolves.slice(-11).map(s => s.time).filter(t => typeof t === "number");
    if (lastEleven.length === 11) {
      const sorted12 = [...lastEleven].sort((a, b) => a - b);
      const bestHypo12 = sorted12[0];
      const worstHypo12 = sorted12[sorted12.length - 1];

      const bestSet12 = [...lastEleven, bestHypo12];
      const worstSet12 = [...lastEleven, worstHypo12];

      const bpaAvg12 = calculateAverage(bestSet12, true).average;
      const wpaAvg12 = calculateAverage(worstSet12, true).average;

      bpa12 = bpaAvg12 === "DNF" ? "DNF" : formatTime(bpaAvg12);
      wpa12 = wpaAvg12 === "DNF" ? "DNF" : formatTime(wpaAvg12);
    }
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
        {avgOfFive === "DNF" ? "DNF" : formatTime(avgOfFive)}
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
              if (typeof avg === "number" && avg < best) {
                best = avg;
                bestSlice = slice;
              }
            }
            if (bestSlice.length > 0) setSelectedAverageSolves(bestSlice);
          }
        }}
      >
        {bestAvgOfFive === "N/A" ? "N/A" : bestAvgOfFive === "DNF" ? "DNF" : formatTime(bestAvgOfFive)}
      </div>
      <div className="cell less-important">{bpa5}</div>
      <div className="cell less-important">{wpa5}</div>

      {/* AO12 row */}
      <div className="row-title ao12" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>
        AO12
      </div>
      <div className="cell current-col ao12" onClick={() => setSelectedAverageSolves(currentSolves.slice(-12))}>
        {avgOfTwelve === "DNF" ? "DNF" : formatTime(avgOfTwelve)}
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
              if (typeof avg === "number" && avg < best) {
                best = avg;
                bestSlice = slice;
              }
            }
            if (bestSlice.length > 0) setSelectedAverageSolves(bestSlice);
          }
        }}
      >
        {bestAvgOfTwelve === "N/A" ? "N/A" : bestAvgOfTwelve === "DNF" ? "DNF" : formatTime(bestAvgOfTwelve)}
      </div>
      <div className="cell less-important">{bpa12}</div>
      <div className="cell less-important">{wpa12}</div>
    </div>
  );
}

export default AveragesDisplay;
