import React, { useState, useEffect } from "react";
import "./TimeList.css";
import "./TimeItem.css";
import { formatTime, calculateAverageOfFive, calculateAverage } from "./TimeUtils";

function getPenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").trim().toUpperCase();
}

function getComparableSolveTime(solve) {
  if (!solve) return null;

  const penalty = getPenalty(solve);
  if (penalty === "DNF") return Number.MAX_SAFE_INTEGER;

  const explicitFinal = Number(solve?.finalTimeMs ?? solve?.FinalTimeMs);
  if (Number.isFinite(explicitFinal) && explicitFinal >= 0) {
    return explicitFinal;
  }

  const base = Number(
    solve?.rawTimeMs ??
      solve?.RawTimeMs ??
      solve?.rawTime ??
      solve?.originalTime ??
      solve?.time
  );
  if (!Number.isFinite(base) || base < 0) return null;

  return penalty === "+2" ? base + 2000 : base;
}

function TimeListRolling({ solves = [], deleteTime }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [solvesPerRow, setSolvesPerRow] = useState(window.innerWidth > 1100 ? 12 : 5);

  useEffect(() => {
    const handleResize = () => {
      setSolvesPerRow(window.innerWidth > 1100 ? 12 : 5);
    };
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const latestSolves = solves.slice(-solvesPerRow);

  // Correctly generate Ao5 and Ao12 for each column
  const ao5Results = latestSolves.map((_, i) => 
    i >= 4
      ? formatTime(
          calculateAverageOfFive(
            latestSolves.slice(i - 4, i + 1).map(getComparableSolveTime)
          )
        )
      : ""
  );

  const ao12Results = latestSolves.map((_, i) =>
    i >= 11
      ? formatTime(
          calculateAverage(
            latestSolves.slice(i - 11, i + 1).map(getComparableSolveTime),
            true
          ).average
        )
      : ""
  );

  return (
    <div className="rolling-container">
      <div className="rolling-table-wrapper">
        <table className="TimeList">
          <tbody>
            {/* Ao5 Row */}
            <tr>
              {latestSolves.map((_, index) => (
                <td key={`ao5-${index}`} className="TimeItem ao5">
                  {ao5Results[index]}
                </td>
              ))}
            </tr>

            {/* Ao12 Row (Only appears after 12th solve) */}
            {solvesPerRow === 12 && (
              <tr>
                {latestSolves.map((_, index) => (
                  <td key={`ao12-${index}`} className="TimeItem ao12">
                    {ao12Results[index]}
                  </td>
                ))}
              </tr>
            )}

            {/* Solves Row */}
            <tr>
              {latestSolves.map((solve, index) => (
                <td key={`solve-${index}`} className="TimeItem">
                  {formatTime(getComparableSolveTime(solve), false, solve?.penalty)}
                  <span className="delete-icon" onClick={() => deleteTime(index)}>x</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TimeListRolling;
