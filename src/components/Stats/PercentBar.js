import React, { useState } from "react";
import PropTypes from "prop-types";
import PercentBarBuilder from "./PercentBarBuilder";
import Detail from "../Detail/Detail";
import "./Stats.css";

function PercentBar({
  solves,
  title,
  comparisonSeries = [],
  legendItems = [],
  seriesStyle = null,
  initialThresholdSeconds,
  compact = false,
}) {
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
        initialThresholdSeconds={initialThresholdSeconds}
        compact={compact}
        onSliceClick={(solvesArr) => setSelectedSolve(solvesArr?.[0] || null)}
      />

      {selectedSolve && <Detail solve={selectedSolve} onClose={() => setSelectedSolve(null)} />}
    </div>
  );
}

PercentBar.propTypes = {
  solves: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string,
  comparisonSeries: PropTypes.array,
  legendItems: PropTypes.array,
  seriesStyle: PropTypes.shape({
    mode: PropTypes.string,
    primary: PropTypes.string,
    accent: PropTypes.string,
    stops: PropTypes.arrayOf(PropTypes.string),
  }),
  initialThresholdSeconds: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  compact: PropTypes.bool,
};

PercentBar.defaultProps = {
  solves: [],
  title: "",
  comparisonSeries: [],
  legendItems: [],
  seriesStyle: null,
  initialThresholdSeconds: null,
  compact: false,
};

export default React.memo(PercentBar);
