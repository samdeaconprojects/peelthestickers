import React from 'react';
import PieChart from './PieChart';

function EventCountPieChart({ sessions }) {
  // Convert sessions into a flat solves list
  const allSolves = Object.entries(sessions).flatMap(([event, solves]) =>
    solves.map(solve => ({ ...solve, event })) // Ensure each solve has an event property
  );

  return <PieChart solves={allSolves} title="Solve Counts per Event" />;
}

export default EventCountPieChart;
