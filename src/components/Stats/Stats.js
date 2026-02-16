// src/components/Stats/Stats.js
import React, { useMemo, useCallback, useState } from "react";
import "./Stats.css";

import LineChart from "./LineChart";
import TimeTable from "./TimeTable";
import PercentBar from "./PercentBar";
import StatsSummary from "./StatsSummary";
import BarChart from "./BarChart";

import { getSolvesBySession } from "../../services/getSolvesBySession";

function Stats({
  sessions,
  sessionStats, // optional
  setSessions,
  currentEvent,
  currentSession,
  user,
  deleteTime,
  addPost,
}) {
  const [solvesPerPage, setSolvesPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [statsEvent, setStatsEvent] = useState(currentEvent);

  // Normalize DynamoDB solve item into UI shape (same as in App.js)
  const normalizeSolve = useCallback((item) => {
    return {
      time: item.Time,
      scramble: item.Scramble,
      event: item.Event,
      penalty: item.Penalty,
      note: item.Note || "",
      datetime: item.DateTime,
      tags: item.Tags || {},
      // Keep originalTime if your DB/service returns it for +2/DNF scenarios
      originalTime: item.OriginalTime ?? item.originalTime,
    };
  }, []);

  // Solves for selected stats event
  const solves = sessions?.[statsEvent] || [];

  // Compute indices (cheap, but memo keeps referential stability & clarity)
  const startIndex = useMemo(() => {
    return Math.max(0, solves.length - solvesPerPage * (currentPage + 1));
  }, [solves.length, solvesPerPage, currentPage]);

  const endIndex = useMemo(() => {
    return solves.length - solvesPerPage * currentPage;
  }, [solves.length, solvesPerPage, currentPage]);

  // Slice + add fullIndex once per relevant change
  const solvesToDisplay = useMemo(() => {
    const slice = solves.slice(startIndex, endIndex);
    return slice.map((solve, i) => ({
      ...solve,
      fullIndex: startIndex + i,
    }));
  }, [solves, startIndex, endIndex]);

  const handleEventChange = useCallback((event) => {
    setStatsEvent(event.target.value);
    setCurrentPage(0);
  }, []);

  const handleDeleteSolve = useCallback(
    (fullIndex) => {
      // Update sessions state immutably
      setSessions((prev) => ({
        ...prev,
        [statsEvent]: (prev?.[statsEvent] || []).filter((_, i) => i !== fullIndex),
      }));

      // Backend call with correct fullIndex
      deleteTime(statsEvent, fullIndex);
    },
    [setSessions, deleteTime, statsEvent]
  );

  const handlePreviousPage = useCallback(() => {
    if (currentPage < Math.floor(solves.length / solvesPerPage) - 1) {
      setCurrentPage((p) => p + 1);
    }
  }, [currentPage, solves.length, solvesPerPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1);
  }, [currentPage]);

  const handleZoomIn = useCallback(() => {
    setSolvesPerPage((prev) => (prev > 50 ? prev - 50 : prev));
    setCurrentPage(0);
  }, []);

  const handleZoomOut = useCallback(() => {
    setSolvesPerPage((prev) => {
      const next = prev + 50;
      return Math.min(next, solves.length || next);
    });
    setCurrentPage(0);
  }, [solves.length]);

  // Load *all* solves from DynamoDB for this event/session
  const handleShowAll = useCallback(async () => {
    if (!user?.UserID) {
      setSolvesPerPage(solves.length);
      setCurrentPage(0);
      return;
    }

    try {
      const sessionId = currentSession || "main";
      const fullItems = await getSolvesBySession(
        user.UserID,
        statsEvent.toUpperCase(),
        sessionId
      );

      const normalized = fullItems.map(normalizeSolve);

      setSessions((prev) => ({
        ...prev,
        [statsEvent]: normalized,
      }));

      setSolvesPerPage(normalized.length);
      setCurrentPage(0);
    } catch (err) {
      console.error("Failed to load all solves for Stats:", err);
      setSolvesPerPage(solves.length);
      setCurrentPage(0);
    }
  }, [user?.UserID, solves.length, currentSession, statsEvent, normalizeSolve, setSessions]);

  // Optional: plug in your precomputed sessionStats here if you want
  const overallStatsForEvent = useMemo(() => {
    // Example later:
    // return sessionStats?.[statsEvent]?.[currentSession || "main"] ?? null;
    return null;
  }, [sessionStats, statsEvent, currentSession]);

  return (
    <div className="Page statsPageRoot">
      <div className="stats-options">
        <select onChange={handleEventChange} value={statsEvent}>
          {Object.keys(sessions || {}).map((eventKey) => (
            <option key={eventKey} value={eventKey}>
              {eventKey}
            </option>
          ))}
        </select>

        <button
          onClick={handlePreviousPage}
          disabled={currentPage >= Math.floor(solves.length / solvesPerPage) - 1}
        >
          Older ▲
        </button>

        <button onClick={handleNextPage} disabled={currentPage === 0}>
          Newer ▼
        </button>

        <button onClick={handleZoomIn} disabled={solvesPerPage <= 50}>
          Zoom +
        </button>

        <button
          onClick={handleZoomOut}
          disabled={solves.length > 0 && solvesPerPage >= solves.length}
        >
          Zoom -
        </button>

        <button
          onClick={handleShowAll}
          disabled={solves.length > 0 && solvesPerPage === solves.length}
        >
          Show All
        </button>
      </div>

      {/* Scroll container */}
      <div className="stats-page">
        <div className="stats-grid stats-grid--figma">
          {/* Header */}
          <div className="stats-item stats-item--header">
            <StatsSummary solves={solvesToDisplay} overallStats={overallStatsForEvent} />
          </div>

          {/* Charts */}
          <div className="stats-item stats-item--line">
            <LineChart
              solves={solvesToDisplay}
              title={`Current Avg: ${statsEvent}`}
              deleteTime={handleDeleteSolve}
              addPost={addPost}
            />
          </div>

          <div className="stats-item stats-item--percent">
            <PercentBar solves={solvesToDisplay} title="Solves Distribution by Time" />
          </div>

          <div className="stats-item stats-item--bar">
            <BarChart solves={solvesToDisplay} />
          </div>

          {/* Table (just another stats item at the bottom) */}
          <div className="stats-item stats-item--table">
            <TimeTable
              solves={solvesToDisplay}
              deleteTime={handleDeleteSolve}
              addPost={addPost}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stats;
