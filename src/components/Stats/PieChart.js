import React, { useState, useEffect } from 'react';
import PieChartBuilder from "./PieChartBuilder";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';

function PieChart({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [chartSize, setChartSize] = useState({
    width: window.innerWidth * 0.2,
    height: window.innerWidth * 0.2,
  });

  useEffect(() => {
    const handleResize = () => {
      setChartSize({
        width: window.innerWidth * 0.2, // 40% of window width
        height: window.innerWidth * 0.2, // Keep aspect ratio
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    <div className='pieChart' style={{ textAlign: 'center' }}>
      <div className='chartTitle'>
        <ChartTitle text={title} />
      </div>
      <div className='chartWrapper'>
        <PieChartBuilder
          width={chartSize.width}
          height={chartSize.height}
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
