import React, { useMemo } from "react";
import PieChartBuilder from "./PieChartBuilder";
import "./Stats.css";

function PieChart({ solves, data: dataProp, title }) {
  const data = useMemo(() => {
    if (Array.isArray(dataProp) && dataProp.length > 0) {
      return dataProp
        .filter((entry) => Number(entry?.value) > 0)
        .map((entry) => ({
          label: String(entry?.label || "Unknown"),
          value: Number(entry?.value || 0),
          solves: Array.isArray(entry?.solves) ? entry.solves : [],
        }));
    }

    const grouped = new Map();

    for (const solve of Array.isArray(solves) ? solves : []) {
      const event = String(solve?.event || solve?.Event || "").trim() || "Unknown";
      if (!grouped.has(event)) grouped.set(event, []);
      grouped.get(event).push(solve);
    }

    return Array.from(grouped.entries()).map(([label, eventSolves]) => ({
      label,
      value: eventSolves.length,
      solves: eventSolves,
    }));
  }, [dataProp, solves]);

  return (
    <div className="pieChartPanel">
      {/*<ChartTitle text={title} />*/}

      <PieChartBuilder
        width="100%"
        height="100%"
        data={data}
        legendValueMode="count"
        interactive={false}
      />
    </div>
  );
}

export default React.memo(PieChart);
