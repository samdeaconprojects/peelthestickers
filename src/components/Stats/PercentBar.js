import React, { useState } from "react";
import PercentBarBuilder from "./PercentBarBuilder";
import Detail from "../Detail/Detail";
import "./Stats.css";

function PercentBar({ solves, title, comparisonSeries = [], legendItems = [], seriesStyle = null }) {
  const [selectedSolve, setSelectedSolve] = useState(null);

  return (
    <div
      className="percentBar"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
      }}
    >
      <PercentBarBuilder
        solves={solves}
        comparisonSeries={comparisonSeries}
        legendItems={legendItems}
        seriesStyle={seriesStyle}
        onSliceClick={(solvesArr) => setSelectedSolve(solvesArr?.[0] || null)}
      />

      {selectedSolve && <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />}
    </div>
  );
}

export default React.memo(PercentBar);
