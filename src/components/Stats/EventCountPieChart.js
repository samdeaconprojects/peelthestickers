import React from 'react';
import PieChart from './PieChart';

function EventCountPieChart({ sessions }) {
  if (!sessions || typeof sessions !== "object") {
    return <PieChart solves={[]} title="Event Breakdown" />;
  }

  // Flatten across all sessions inside each event
  const allSolves = Object.entries(sessions).flatMap(([event, sessionMap]) => {
    if (sessionMap && typeof sessionMap === "object") {
      return Object.values(sessionMap)
        .flat()
        .map(solve => ({ ...solve, event }));
    }
    return [];
  });

  return <PieChart solves={allSolves} title="Event Breakdown" />;
}

export default EventCountPieChart;
