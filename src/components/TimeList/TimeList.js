// src/components/TimeList/TimeList.js
import React, { useState, useEffect } from 'react';
import './TimeList.css';
import './TimeItem.css';
import Detail from '../Detail/Detail';
import { useSettings } from '../../contexts/SettingsContext';
import {
  formatTime,
  calculateAverage,
  getOveralls
} from './TimeUtils';

function TimeList({ user, applyPenalty, solves = [], deleteTime, rowsToShow = 3, inPlayerBar, addPost }) {
  const { settings } = useSettings();
  const isHorizontal = inPlayerBar ? false : settings.horizontalTimeList;

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);
  const [selectedSolveList, setSelectedSolveList] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    const colsPerRow = windowWidth > 1100 ? 12 : 5;
    const totalRows = Math.ceil(solves.length / colsPerRow);
    setCurrentPage(Math.max(0, totalRows - rowsToShow));

    return () => window.removeEventListener('resize', handleResize);
  }, [windowWidth, solves.length, rowsToShow]);

  if (solves.length === 0) {
    return (
      <div className="time-list-container">
        <p>No solves available</p>
      </div>
    );
  }
console.log("USER ID TIMELIST");
              console.log(user);

  const times = solves.map(solve => solve.time);
  const overallData = getOveralls(times);
  const overallMin = overallData.min;
  const overallMax = overallData.max;

  const colsPerRow = windowWidth > 1100 ? 12 : 5;
  const rowsToDisplay = inPlayerBar ? 1 : rowsToShow;
  const maxPage = Math.ceil(solves.length / (colsPerRow * rowsToDisplay)) - 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 0), maxPage);
  const startIndex = validCurrentPage * colsPerRow * rowsToDisplay;
  const visibleSolves = solves.slice(startIndex, startIndex + (colsPerRow * rowsToDisplay));
  const currentFiveIndices = times.length > 5 ? Array.from({ length: 5 }, (_, i) => times.length - 5 + i) : [];

  const rows = [];
  for (let i = 0; i < visibleSolves.length; i += colsPerRow) {
    const timesRow = visibleSolves.slice(i, i + colsPerRow);
    const averageData = calculateAverage(timesRow.map(solve => solve.time), true);

    rows.push(
      <tr key={i}>
        {timesRow.map((solve, index) => {
          const solveIndex = startIndex + i + index;
          const isBest = solveIndex === overallMin;
          const isWorst = solveIndex === overallMax;
          const isCurrentFive = currentFiveIndices.includes(solveIndex);

          return (
            <td
              className={`TimeItem ${isBest ? 'overall-border-min' : ''} ${isWorst ? 'overall-border-max' : ''} ${isCurrentFive ? 'current-five' : ''}`}
              key={index}
              onClick={() => {
                if (solve?.tags?.IsRelay && Array.isArray(solve.tags.RelayLegs)) {
                  const legs = solve.tags.RelayLegs || [];
                  const scrs = solve.tags.RelayScrambles || [];
                  const timesArr = solve.tags.RelayLegTimes || [];

                  const expanded = legs.map((ev, i) => ({
                    event: ev,
                    scramble: scrs[i] || "",
                    time: timesArr[i] ?? 0,
                    penalty: null,
                    note: "",
                    datetime: `${solve.datetime}#${i}`, // unique enough for UI
                    userID: user?.UserID,
                  }));

                  setSelectedSolveList(expanded);
                  setSelectedSolveIndex(solveIndex); // keep index so delete can delete the relay solve
                  return;
                }

                setSelectedSolve({ ...solve, userID: user?.UserID });
                setSelectedSolveIndex(solveIndex);
              }}
            >
              {formatTime(solve.time, false, solve.penalty)}
              <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(solveIndex); }}>x</span>
            </td>
          );
        })}
        {timesRow.length < colsPerRow && [...Array(colsPerRow - timesRow.length)].map((_, index) => (
          <td className="TimeItem" key={colsPerRow + index}>&nbsp;</td>
        ))}
        <td className="TimeItem current-five">{formatTime(averageData.average)}</td>
      </tr>
    );
  }

  const goToPreviousPage = () => {
    if (validCurrentPage > 0) setCurrentPage(validCurrentPage - 1);
  };

  const goToNextPage = () => {
    if ((validCurrentPage + 1) * rowsToDisplay * colsPerRow < solves.length) setCurrentPage(validCurrentPage + 1);
  };

  const horizontalCount = windowWidth > 1250 ? 12 : 5;
  const horizontalSolves = solves.slice(-horizontalCount);
  const horizontalTimes = horizontalSolves.map(s => s.time);
  const bestTime = Math.min(...horizontalTimes);
  const worstTime = Math.max(...horizontalTimes);

  const ao5s = horizontalSolves.map((_, index, arr) => {
    const actualIndex = solves.length - arr.length + index;
    const slice = solves.slice(actualIndex - 4, actualIndex + 1);
    return slice.length === 5 ? calculateAverage(slice.map(s => s.time), true).average : null;
  }).filter(a => a !== null);

  const ao12s = horizontalSolves.map((_, index, arr) => {
    const actualIndex = solves.length - arr.length + index;
    const slice = solves.slice(actualIndex - 11, actualIndex + 1);
    return slice.length === 12 ? calculateAverage(slice.map(s => s.time), true).average : null;
  }).filter(a => a !== null);

  const bestAo5 = Math.min(...ao5s);
  const worstAo5 = Math.max(...ao5s);
  const bestAo12 = Math.min(...ao12s);
  const worstAo12 = Math.max(...ao12s);

  return (
    <div className="time-list-container">
      {isHorizontal ? (
        <div className="horizontal-time-list">
          {/* AO12 */}
          <div className="horizontal-row ao12-row">
            {horizontalSolves.map((_, index, arr) => {
              
              const actualIndex = solves.length - arr.length + index;
              const slice = solves.slice(actualIndex - 11, actualIndex + 1);
              if (slice.length === 12) {
                const avg = calculateAverage(slice.map(s => s.time), true).average;
                const textClass = avg === bestAo12 ? 'best-time' : avg === worstAo12 ? 'worst-time' : '';
                return (
                  <div
                    key={index}
                    className={`ao12 TimeItem ${textClass}`}
                    onClick={() => setSelectedSolveList(slice.map(s => ({ ...s, userID: user?.UserID })))}
                  >
                    {formatTime(avg)}
                  </div>
                );
              }
              return <div key={index} className="ao12 empty TimeItem"></div>;
            })}
            <div className="TimeItem row-label">AO12</div>
          </div>

          {/* AO5 */}
          <div className="horizontal-row ao5-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solves.length - arr.length + index;
              const slice = solves.slice(actualIndex - 4, actualIndex + 1);
              if (slice.length === 5) {
                const avg = calculateAverage(slice.map(s => s.time), true).average;
                const textClass = avg === bestAo5 ? 'best-time' : avg === worstAo5 ? 'worst-time' : '';
                return (
                  <div
                    key={index}
                    className={`ao5 TimeItem ${textClass}`}
                    onClick={() => setSelectedSolveList(slice.map(s => ({ ...s, userID: user?.UserID })))}
                  >
                    {formatTime(avg)}
                  </div>
                );
              }
              return <div key={index} className="ao5 empty TimeItem"></div>;
            })}
            <div className="TimeItem row-label">AO5</div>
          </div>

          {/* Times */}
          <div className="horizontal-row times-row">
            {horizontalSolves.map((solve, index, arr) => {
              const actualIndex = solves.length - arr.length + index;
              const isBest = solve.time === bestTime;
              const isWorst = solve.time === worstTime;

              return (
                <div
                  key={index}
                  className={`TimeItem ${isBest ? 'dashed-border-min' : ''} ${isWorst ? 'dashed-border-max' : ''}`}
                  onClick={() => {
                    // If it's a relay solve, expand into per-leg solves for Detail
                    if (solve?.tags?.IsRelay && Array.isArray(solve.tags.RelayLegs)) {
                      const legs = solve.tags.RelayLegs || [];
                      const scrs = solve.tags.RelayScrambles || [];
                      const times = solve.tags.RelayLegTimes || [];

                      const expanded = legs.map((ev, i) => ({
                        event: ev,
                        scramble: scrs[i] || "",
                        time: times[i] ?? 0,
                        penalty: null,
                        note: "",
                        datetime: `${solve.datetime}#${i}`, // unique enough for UI
                        userID: user?.UserID,
                      }));

                      setSelectedSolveList(expanded);
                      setSelectedSolveIndex(actualIndex); // ✅ use actualIndex here
                      return;
                    }

                    // normal solve behavior
                    setSelectedSolve({ ...solve, userID: user?.UserID });
                    setSelectedSolveIndex(actualIndex); // ✅ use actualIndex here
                  }}

                >
                  {formatTime(solve.time, false, solve.penalty)}
                  <span className="delete-icon" onClick={(e) => { e.stopPropagation(); deleteTime(actualIndex); }}>x</span>
                </div>
              );
            })}
            <div className="TimeItem row-label time-label">TIME</div>
          </div>

          {/* Solve count */}
          <div className="horizontal-row count-row">
            {horizontalSolves.map((_, index, arr) => {
              const actualIndex = solves.length - arr.length + index + 1;
              return <div key={index} className="solve-count TimeItem">{actualIndex}</div>;
            })}
            <div className="TimeItem row-label">SOLVE #</div>
          </div>

          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              userID={user?.UserID}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
            />
          )}
          {selectedSolveList && (
            <Detail
              solve={selectedSolveList}
              userID={user?.UserID}
              onClose={() => setSelectedSolveList(null)}
              deleteTime={() => {}}
              applyPenalty={applyPenalty}
              addPost={() =>
                addPost({
                  note: 'Average solve group',
                  event: selectedSolveList[0]?.event,
                  solveList: selectedSolveList,
                  comments: [],
                })
              }
            />
          )}
        </div>
      ) : (
        <div className="time-list-content">
          <table className="TimeList">
            <tbody>{rows}</tbody>
          </table>
          {selectedSolve && (
            <Detail
              solve={selectedSolve}
              userID={user?.UserID}
              onClose={() => setSelectedSolve(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
            />
          )}
          {selectedSolveList && (
            <Detail
              solve={selectedSolveList}
              userID={user?.UserID}
              onClose={() => setSelectedSolveList(null)}
              deleteTime={() => deleteTime(selectedSolveIndex)}
              addPost={addPost}
              applyPenalty={applyPenalty}
            />
          )}
        </div>
      )}
      <div className="pagination-buttons">
        <button onClick={goToPreviousPage} disabled={validCurrentPage === 0}>▲</button>
        <button onClick={goToNextPage} disabled={(validCurrentPage + 1) * rowsToDisplay * colsPerRow >= solves.length}>▼</button>
      </div>
    </div>
  );
}

export default TimeList;
