import React, { useState } from 'react';
import PieChartBuilder from "./PieChartBuilder";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';

function PieChart({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);

  // Count solves per category
  const data = Object.entries(
    solves.reduce((acc, solve) => {
      acc[solve.event] = (acc[solve.event] || 0) + 1;
      return acc;
    }, {})
  ).map(([event, count]) => ({
    label: event,
    value: count,
    solves: solves.filter(solve => solve.event === event),
  }));

  return (
    <div className='pieChart'>
      <div className='chartTitle'>
        <ChartTitle text={title} />
      </div>
      <div className='chartWrapper'>
        <PieChartBuilder
          width={300}
          height={300}
          data={data}
          onSliceClick={(solves) => setSelectedSolve(solves[0])}
        />
      </div>
      {selectedSolve && (
        <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />
      )}
    </div>
  );
}

export default PieChart;
