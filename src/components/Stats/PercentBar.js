import React, { useState } from 'react';
import PercentBarBuilder from "./PercentBarBuilder";
import ChartTitle from "./ChartTitle";
import Detail from '../Detail/Detail';
import './Stats.css';

function PercentBar({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);

  return (
    <div className='percentBar' style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: "5%" }}>
      {/*<ChartTitle text={title} />*/}

      <PercentBarBuilder
        width={150}
        height={300}
        solves={solves} // Just send solves; no threshold management here
        onSliceClick={(solves) => setSelectedSolve(solves[0])}
      />

      {selectedSolve && <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />}
    </div>
  );
}

export default PercentBar;
