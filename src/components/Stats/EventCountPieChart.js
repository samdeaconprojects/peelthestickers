import React from "react";
import PieChart from "./PieChart";

function EventCountPieChart({ sessions, sessionStats }) {
  const hasStats = sessionStats && typeof sessionStats === "object";
  const hasSessions = sessions && typeof sessions === "object";

  if (!hasStats && !hasSessions) {
    return <PieChart data={[]} title="Event Breakdown" />;
  }

  const eventCounts = {};

  if (hasStats) {
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
  }

  if (Object.keys(eventCounts).length === 0 && hasSessions) {
    Object.entries(sessions).forEach(([event, solveList]) => {
      const count = Array.isArray(solveList) ? solveList.length : 0;
      if (count > 0) eventCounts[event] = count;
    });
  }

  const data = Object.entries(eventCounts).map(([event, count]) => ({
    label: event,
    value: count,
    solves: [],
  }));

  return <PieChart data={data} title="Event Breakdown" />;
}

export default EventCountPieChart;
