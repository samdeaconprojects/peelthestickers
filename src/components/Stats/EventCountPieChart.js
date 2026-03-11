import React from "react";
import PieChart from "./PieChart";

function EventCountPieChart({ sessions, sessionStats }) {
  const hasSessions = sessions && typeof sessions === "object";
  const hasStats = sessionStats && typeof sessionStats === "object";

  if (!hasSessions && !hasStats) {
    return <PieChart solves={[]} title="Event Breakdown" />;
  }

  let pseudoSolves = [];

  if (hasStats) {
    const eventCounts = {};

    Object.entries(sessionStats).forEach(([event, sessionMap]) => {
      if (!sessionMap || typeof sessionMap !== "object") return;

      Object.values(sessionMap).forEach((stats) => {
        const count =
          stats && typeof stats.SolveCountTotal === "number"
            ? stats.SolveCountTotal
            : 0;

        if (count > 0) {
          eventCounts[event] = (eventCounts[event] || 0) + count;
        }
      });
    });

    const total = Object.values(eventCounts).reduce((sum, c) => sum + c, 0);

    if (total > 0) {
      const targetDots = 240;
      Object.entries(eventCounts).forEach(([event, count]) => {
        const share = count / total;
        const dots = Math.max(1, Math.round(share * targetDots));
        for (let i = 0; i < dots; i++) {
          pseudoSolves.push({ event });
        }
      });
    }
  }

  if (pseudoSolves.length === 0 && hasSessions) {
    pseudoSolves = Object.entries(sessions).flatMap(([event, sessionMap]) => {
      if (sessionMap && typeof sessionMap === "object") {
        return Object.values(sessionMap)
          .flat()
          .map((solve) => ({ ...solve, event }));
      }
      return [];
    });
  }

  return <PieChart solves={pseudoSolves} title="Event Breakdown" />;
}

export default EventCountPieChart;