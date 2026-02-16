import React, { useState } from "react";
import PercentBarBuilder from "./PercentBarBuilder";
import Detail from "../Detail/Detail";
import "./Stats.css";

function PercentBar({ solves, title }) {
  const [selectedSolve, setSelectedSolve] = useState(null);

  return (
    <div
      className="percentBar"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "5%" }}
    >
      {/*<ChartTitle text={title} />*/}

      <PercentBarBuilder
        width={150}
        height={300}
        solves={solves}
        onSliceClick={(solvesInSlice) => setSelectedSolve(solvesInSlice?.[0] || null)}
      />

      {selectedSolve && <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />}
    </div>
  );
}

export default React.memo(PercentBar);
