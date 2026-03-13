import React, { useMemo, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

// Median helper (numeric only)
const calculateMedianTime = (solves) => {
  const sorted = solves
    .map((s) => s.time)
    .filter((t) => typeof t === "number" && isFinite(t))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return 10000; // 10s fallback
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const PercentBarBuilder = ({ solves, comparisonSeries = [], legendItems = [], onSliceClick }) => {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [threshold, setThreshold] = useState(10);

  // Measure the *card/container*, not window
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth || 0, h: el.clientHeight || 0 });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // set threshold to median (seconds) when solves change
  useEffect(() => {
    if (Array.isArray(solves) && solves.length > 0) {
      const medianSec = calculateMedianTime(solves) / 1000;
      setThreshold(Number(medianSec.toFixed(2)));
    }
  }, [solves]);

  const computed = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];

    const total = input.length;
    if (total === 0) {
      return { below: [], pct: 0 };
    }

    const th = Number(threshold);
    const below = input.filter((s) => (s.time ?? Infinity) / 1000 < th);
    const pct = total > 0 ? (below.length / total) * 100 : 0;

    return { below, pct };
  }, [solves, threshold]);

  const comparisonComputed = useMemo(() => {
    return (Array.isArray(comparisonSeries) ? comparisonSeries : []).map((series, index) => {
      const input = Array.isArray(series?.solves) ? series.solves : [];
      const total = input.length;
      if (total === 0) {
        return {
          id: series?.id || `compare-${index}`,
          label: series?.label || `Compare ${index + 1}`,
          color: legendItems[index + 1]?.color || series?.style?.primary || "#7c8cff",
          below: [],
          pct: 0,
        };
      }

      const th = Number(threshold);
      const below = input.filter((s) => (s.time ?? Infinity) / 1000 < th);
      return {
        id: series?.id || `compare-${index}`,
        label: series?.label || `Compare ${index + 1}`,
        color: legendItems[index + 1]?.color || series?.style?.primary || "#7c8cff",
        below,
        pct: total > 0 ? (below.length / total) * 100 : 0,
      };
    });
  }, [comparisonSeries, legendItems, threshold]);

  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);

  // Layout inside the card
  const pad = 14;
  const barW = Math.max(44, Math.min(64, Math.floor(w * 0.22))); // nice chunky bar
  const gap = 16;
  const hasComparison = comparisonComputed.length > 0;
  const seriesRows = [
    {
      id: "primary",
      label: legendItems[0]?.label || "Primary",
      color: legendItems[0]?.color || "#50B6FF",
      pct: computed.pct,
      solves: computed.below,
    },
    ...comparisonComputed.map((item) => ({
      id: item.id,
      label: item.label,
      color: item.color,
      pct: item.pct,
      solves: item.below,
    })),
  ];
  const chartHeight = Math.max(96, h ? h - pad * 2 : 160);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: pad,
        boxSizing: "border-box",
      }}
    >
      {!hasComparison ? (
        <div
          style={{
            width: barW,
            height: chartHeight,
            borderRadius: 8,
            border: "2px solid white",
            overflow: "hidden",
            position: "relative",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: 0,
              width: "100%",
              height: `${computed.pct}%`,
              backgroundColor: "#50B6FF",
              transition: "height 0.25s ease-in-out",
              cursor: "pointer",
            }}
            onClick={() => onSliceClick(computed.below)}
          />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${seriesRows.length}, ${barW}px)`,
            gap,
            alignItems: "end",
            height: chartHeight,
            flex: "0 0 auto",
          }}
        >
          {seriesRows.map((series) => (
            <div
              key={series.id}
              style={{
                display: "grid",
                gridTemplateRows: "minmax(0, 1fr) auto",
                gap: 8,
                height: "100%",
                justifyItems: "center",
              }}
            >
              <div
                style={{
                  width: barW,
                  height: "100%",
                  borderRadius: 8,
                  border: "2px solid white",
                  overflow: "hidden",
                  position: "relative",
                  alignSelf: "stretch",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    width: "100%",
                    height: `${series.pct}%`,
                    backgroundColor: series.color,
                    transition: "height 0.25s ease-in-out",
                    cursor: "pointer",
                  }}
                  onClick={() => onSliceClick(series.solves)}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.8)",
                  textAlign: "center",
                  maxWidth: barW + 12,
                  lineHeight: 1.15,
                }}
              >
                {series.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: gap,
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <label
          style={{
            color: "white",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            whiteSpace: "nowrap",
          }}
        >
          Sub
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="percent-bar-input"
            style={{
              width: 90,
              padding: "4px 6px",
              fontSize: 18,
              background: "transparent",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 6,
              outline: "none",
            }}
          />
        </label>

        <div
          style={{
            color: "white",
            fontSize: Math.max(24, Math.min(48, Math.floor(w * 0.11))),
            fontWeight: 800,
            lineHeight: 1,
            display: "grid",
            gap: 6,
          }}
        >
          {!hasComparison ? (
            <div style={{ whiteSpace: "nowrap" }}>{computed.pct.toFixed(1)}%</div>
          ) : (
            seriesRows.map((series) => (
              <div key={`pct-${series.id}`} style={{ whiteSpace: "nowrap" }}>
                <span style={{ color: series.color }}>{series.pct.toFixed(1)}%</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

PercentBarBuilder.propTypes = {
  solves: PropTypes.arrayOf(
    PropTypes.shape({
      time: PropTypes.number,
      scramble: PropTypes.string,
      event: PropTypes.string,
    })
  ).isRequired,
  comparisonSeries: PropTypes.array,
  legendItems: PropTypes.array,
  onSliceClick: PropTypes.func.isRequired,
};

export default React.memo(PercentBarBuilder);
