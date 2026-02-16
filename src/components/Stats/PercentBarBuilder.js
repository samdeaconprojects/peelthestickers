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

const PercentBarBuilder = ({ solves, onSliceClick }) => {
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

  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);

  // Layout inside the card
  const pad = 14;
  const barW = Math.max(44, Math.min(64, Math.floor(w * 0.22))); // nice chunky bar
  const gap = 16;

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
      {/* Left: bar */}
      <div
        style={{
          width: barW,
          height: "100%",
          maxHeight: h ? h - pad * 2 : "100%",
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
            backgroundColor: "#2EC4B6",
            transition: "height 0.25s ease-in-out",
            cursor: "pointer",
          }}
          onClick={() => onSliceClick(computed.below)}
        />
      </div>

      {/* Right: text */}
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
            fontSize: Math.max(32, Math.min(56, Math.floor(w * 0.14))),
            fontWeight: 800,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {computed.pct.toFixed(1)}%
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
  onSliceClick: PropTypes.func.isRequired,
};

export default React.memo(PercentBarBuilder);
