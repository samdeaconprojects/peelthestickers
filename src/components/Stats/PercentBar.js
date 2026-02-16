import React, { useState } from "react";
import PercentBarBuilder from "./PercentBarBuilder";
import Detail from "../Detail/Detail";
import "./Stats.css";

function PercentBar({ solves, title }) {
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
        onSliceClick={(solvesArr) => setSelectedSolve(solvesArr?.[0] || null)}
      />

      {selectedSolve && <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />}
    </div>
  );
}

export default React.memo(PercentBar);
