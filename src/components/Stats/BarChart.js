import React, { useEffect, useMemo, useRef, useState } from "react";

function BarChart({ solves }) {
  const containerRef = useRef(null);

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    count: 0,
    label: "",
  });

  const [size, setSize] = useState({ w: 0, h: 0 });

  // Measure the *container*, not the window
  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 0;
      const h = el.clientHeight || 0;
      setSize({ w, h });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep some breathing room for axes/labels
  const padding = Math.max(14, Math.min(26, Math.floor(size.w * 0.05)));
  const chartWidth = Math.max(0, size.w);
  const chartHeight = Math.max(0, size.h);

  const computed = useMemo(() => {
    if (!Array.isArray(solves) || solves.length === 0) return null;

    const times = solves.map((solve) => {
      if (solve.penalty === "+2") return (solve.originalTime || solve.time) + 2000;
      if (solve.penalty === "DNF") return "DNF";
      return solve.time;
    });

    const numericTimes = times.filter((t) => typeof t === "number" && isFinite(t));
    const dnfCount = times.filter((t) => t === "DNF").length;

    if (numericTimes.length === 0) {
      const counts = dnfCount > 0 ? [dnfCount] : [];
      return {
        counts,
        dnfCount,
        minTimeSec: 0,
        maxTimeSec: 0,
        maxCount: Math.max(...counts, 1),
      };
    }

    const minTimeSec = Math.floor(Math.min(...numericTimes) / 1000);
    const maxTimeSec = Math.ceil(Math.max(...numericTimes) / 1000);

    const bucketCount = Math.max(1, maxTimeSec - minTimeSec + 1);
    const counts = Array(bucketCount + (dnfCount > 0 ? 1 : 0)).fill(0);

    numericTimes.forEach((time) => {
      const bucketIndex = Math.floor(time / 1000) - minTimeSec;
      if (bucketIndex >= 0 && bucketIndex < bucketCount) counts[bucketIndex]++;
    });

    if (dnfCount > 0) counts[counts.length - 1] = dnfCount;

    const maxCount = Math.max(...counts, 1);

    return { counts, dnfCount, minTimeSec, maxTimeSec, maxCount };
  }, [solves]);

  if (!computed) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
        No data available for this chart.
      </div>
    );
  }

  // If the parent/card hasn't given us a real size yet
  if (chartWidth < 20 || chartHeight < 20) {
    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
  }

  const { counts, dnfCount, minTimeSec, maxTimeSec, maxCount } = computed;

  if (!counts || counts.length === 0) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
        No data available for this chart.
      </div>
    );
  }

  const innerW = Math.max(1, chartWidth - padding * 2);
  const innerH = Math.max(1, chartHeight - padding * 2);

  const barWidth = innerW / counts.length;

  const getColor = (index) => {
    if (dnfCount > 0 && index === counts.length - 1) return "crimson";
    const denom = maxTimeSec - minTimeSec || 1;
    const timeSec = minTimeSec + index;
    const normalized = (timeSec - minTimeSec) / denom;
    const r = Math.floor(255 * normalized);
    const g = Math.floor(255 * (1 - normalized));
    return `rgb(${r}, ${g}, 100)`;
  };

  // Reduce x-axis label density if many buckets
  const labelEvery = counts.length > 24 ? Math.ceil(counts.length / 12) : 1;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <svg width={chartWidth} height={chartHeight}>
        {/* Axes */}
        <line
          x1={padding}
          y1={chartHeight - padding}
          x2={chartWidth - padding}
          y2={chartHeight - padding}
          stroke="#ccc"
        />
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#ccc" />

        {/* Bars */}
        {counts.map((count, index) => {
          const h = (count / maxCount) * innerH;
          const x = padding + index * barWidth;
          const y = chartHeight - padding - h;

          const label =
            dnfCount > 0 && index === counts.length - 1 ? "DNF" : `${minTimeSec + index}`;

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={Math.max(1, barWidth - 2)}
                height={h}
                rx={4}
                ry={4}
                fill={getColor(index)}
                onMouseOver={() =>
                  setTooltip({
                    visible: true,
                    x: x + barWidth / 2,
                    y: y - 8,
                    count,
                    label,
                  })
                }
                onMouseOut={() =>
                  setTooltip({ visible: false, x: 0, y: 0, count: 0, label: "" })
                }
              />

              {/* X-axis labels (thinned) */}
              {index % labelEvery === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - padding + 14}
                  textAnchor="middle"
                  fontSize="10px"
                  fill="white"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {/* Y-axis labels */}
        {[0, maxCount].map((c, i) => (
          <text
            key={i}
            x={padding - 8}
            y={chartHeight - padding - (c / maxCount) * innerH + 4}
            textAnchor="end"
            fontSize="10px"
            fill="white"
          >
            {c}
          </text>
        ))}
      </svg>

      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "5px 8px",
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {tooltip.label}: {tooltip.count}
        </div>
      )}
    </div>
  );
}

export default React.memo(BarChart);
