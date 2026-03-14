import React, { useMemo, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

function interpolateHexColor(a, b, ratio) {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  const parse = (hex) => String(hex || "").replace("#", "");
  const start = parse(a);
  const end = parse(b);
  if (start.length !== 6 || end.length !== 6) return a || b || "#ffffff";

  const parts = [0, 2, 4].map((offset) => {
    const av = parseInt(start.slice(offset, offset + 2), 16);
    const bv = parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(av + (bv - av) * safeRatio).toString(16).padStart(2, "0");
  });

  return `#${parts.join("")}`;
}

function resolvePaletteColor(style, ratio, fallback = "#2EC4B6") {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (!style) return fallback;
  if (style.mode === "gradient" && Array.isArray(style.stops) && style.stops.length >= 3) {
    if (safeRatio <= 0.5) {
      return interpolateHexColor(style.stops[0], style.stops[1], safeRatio / 0.5);
    }
    return interpolateHexColor(style.stops[1], style.stops[2], (safeRatio - 0.5) / 0.5);
  }
  return style.primary || fallback;
}

function resolveDefaultPercentColor(ratio) {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (safeRatio <= 0.2) {
    return interpolateHexColor("#ff0000", "#ffa500", safeRatio / 0.2);
  }
  if (safeRatio <= 0.4) {
    return interpolateHexColor("#ffa500", "#ffff00", (safeRatio - 0.2) / 0.2);
  }
  if (safeRatio <= 0.7) {
    return interpolateHexColor("#ffff00", "#00e676", (safeRatio - 0.4) / 0.3);
  }
  return interpolateHexColor("#00e676", "#00ff00", (safeRatio - 0.7) / 0.3);
}

function resolvePercentFillColor(style, pct, fallback = "#50B6FF") {
  const ratio = Math.min(1, Math.max(0, Number(pct) || 0)) / 100;
  if (style) {
    return resolvePaletteColor(style, ratio, fallback);
  }
  return resolveDefaultPercentColor(ratio);
}

function resolvePercentFillPaint(style, pct, fallback = "#50B6FF") {
  const baseColor = resolvePercentFillColor(style, pct, fallback);
  return {
    backgroundImage: `linear-gradient(180deg, ${interpolateHexColor(baseColor, "#ffffff", 0.18)} 0%, ${baseColor} 100%)`,
    backgroundColor: baseColor,
  };
}

function buildGradientFillBackground(style, fallback = "#50B6FF") {
  if (!style) {
    return "linear-gradient(180deg, #ff0000 0%, #ffff00 50%, #00ff00 100%)";
  }

  if (!(style.mode === "gradient" && Array.isArray(style.stops) && style.stops.length >= 3)) {
    return `linear-gradient(180deg, ${interpolateHexColor(fallback, "#ffffff", 0.18)} 0%, ${fallback} 100%)`;
  }

  return `linear-gradient(180deg, ${style.stops[2] || fallback} 0%, ${style.stops[1] || fallback} 50%, ${style.stops[0] || fallback} 100%)`;
}

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

const PercentBarBuilder = ({
  solves,
  comparisonSeries = [],
  legendItems = [],
  seriesStyle = null,
  initialThresholdSeconds = null,
  compact = false,
  onSliceClick,
}) => {
  const containerRef = useRef(null);
  const dragBarRef = useRef(null);
  const pointerDragRef = useRef({ active: false, moved: false });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [threshold, setThreshold] = useState(10);
  const [isDragging, setIsDragging] = useState(false);

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
    if (initialThresholdSeconds != null && initialThresholdSeconds !== "") {
      const seededThreshold = Number(initialThresholdSeconds);
      if (Number.isFinite(seededThreshold) && seededThreshold > 0) {
        setThreshold(Number(seededThreshold.toFixed(2)));
        return;
      }
    }

    if (Array.isArray(solves) && solves.length > 0) {
      const medianSec = calculateMedianTime(solves) / 1000;
      setThreshold(Number(medianSec.toFixed(2)));
    }
  }, [initialThresholdSeconds, solves]);

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

  const numericSolveTimesSec = useMemo(() => {
    return (Array.isArray(solves) ? solves : [])
      .map((s) => {
        const time = Number(s?.time);
        return Number.isFinite(time) && time >= 0 ? time / 1000 : null;
      })
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
  }, [solves]);

  const thresholdFromPct = (targetPct) => {
    if (!numericSolveTimesSec.length) return Number(threshold) || 0;

    const safePct = Math.min(100, Math.max(0, Number(targetPct) || 0));
    const totalSolveCount = Array.isArray(solves) ? solves.length : 0;
    const desiredBelow = Math.max(
      0,
      Math.min(numericSolveTimesSec.length, Math.round((safePct / 100) * totalSolveCount))
    );

    if (desiredBelow <= 0) {
      return Math.max(0, numericSolveTimesSec[0] - 0.01);
    }

    if (desiredBelow >= numericSolveTimesSec.length) {
      return numericSolveTimesSec[numericSolveTimesSec.length - 1] + 0.01;
    }

    return numericSolveTimesSec[desiredBelow - 1] + 0.01;
  };

  const updateThresholdFromPointer = (clientY) => {
    const el = dragBarRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (!rect.height) return;

    const pct = ((rect.bottom - clientY) / rect.height) * 100;
    const nextThreshold = thresholdFromPct(pct);
    setThreshold(Number(nextThreshold.toFixed(2)));
  };

  const stopControlEvent = (event) => {
    event.stopPropagation();
  };

  const handleBarPointerDown = (event) => {
    event.stopPropagation();
    event.preventDefault();
    pointerDragRef.current = { active: true, moved: false };
    setIsDragging(true);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    updateThresholdFromPointer(event.clientY);
  };

  const handleBarPointerMove = (event) => {
    if (!pointerDragRef.current.active) return;
    event.stopPropagation();
    event.preventDefault();
    pointerDragRef.current.moved = true;
    updateThresholdFromPointer(event.clientY);
  };

  const handleBarPointerUp = (event) => {
    if (!pointerDragRef.current.active) return;
    event.stopPropagation();
    pointerDragRef.current.active = false;
    setIsDragging(false);
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore if the pointer capture was already released.
      }
    }
    requestAnimationFrame(() => {
      pointerDragRef.current.moved = false;
    });
  };

  const handleSliceClick = (event, solvesArr) => {
    event.stopPropagation();
    if (pointerDragRef.current.moved) return;
    onSliceClick(solvesArr);
  };

  const comparisonComputed = useMemo(() => {
    return (Array.isArray(comparisonSeries) ? comparisonSeries : []).map((series, index) => {
      const input = Array.isArray(series?.solves) ? series.solves : [];
      const total = input.length;
      if (total === 0) {
        return {
          id: series?.id || `compare-${index}`,
          label: series?.label || `Compare ${index + 1}`,
          color: resolvePercentFillColor(series?.style || null, 0, "#7c8cff"),
          fillPaint: resolvePercentFillPaint(series?.style || null, 0, "#7c8cff"),
          below: [],
          pct: 0,
        };
      }

      const th = Number(threshold);
      const below = input.filter((s) => (s.time ?? Infinity) / 1000 < th);
      const pct = (below.length / total) * 100;
      return {
        id: series?.id || `compare-${index}`,
        label: series?.label || `Compare ${index + 1}`,
        color: resolvePercentFillColor(series?.style || null, pct, "#7c8cff"),
        fillPaint: resolvePercentFillPaint(series?.style || null, pct, "#7c8cff"),
        below,
        pct,
      };
    });
  }, [comparisonSeries, threshold]);

  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);

  // Layout inside the card
  const pad = compact ? 0 : 14;
  const barW = Math.max(44, Math.min(64, Math.floor(w * 0.22))); // nice chunky bar
  const gap = 16;
  const hasComparison = comparisonComputed.length > 0;
  const seriesRows = [
    {
      id: "primary",
      label: legendItems[0]?.label || "Primary",
      color: resolvePercentFillColor(seriesStyle, computed.pct, "#50B6FF"),
      fillPaint: resolvePercentFillPaint(seriesStyle, computed.pct, "#50B6FF"),
      pct: computed.pct,
      solves: computed.below,
    },
    ...comparisonComputed.map((item) => ({
      id: item.id,
      label: item.label,
      color: item.color,
      fillPaint: item.fillPaint,
      pct: item.pct,
      solves: item.below,
    })),
  ];
  const chartHeight = Math.max(96, h ? h - pad * 2 : 160);
  const primaryGradientFill = buildGradientFillBackground(seriesStyle, "#50B6FF");
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
          ref={dragBarRef}
          data-interactive="percent-bar-control"
          style={{
            width: barW,
            height: chartHeight,
            borderRadius: 8,
            border: compact ? "0" : "2px solid white",
            overflow: "hidden",
            position: "relative",
            flex: "0 0 auto",
          }}
          onClickCapture={stopControlEvent}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
        >
          <div
            data-interactive="percent-bar-control"
            style={{
              position: "absolute",
              bottom: 0,
              width: "100%",
              height: `${computed.pct}%`,
              backgroundColor: seriesRows[0].fillPaint.backgroundColor,
              transition: isDragging ? "none" : "height 0.18s ease-out, background-color 0.18s ease-out",
              overflow: "hidden",
              cursor: "pointer",
            }}
            onClick={(e) => handleSliceClick(e, computed.below)}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: "100%",
                height: chartHeight,
                backgroundImage: primaryGradientFill || seriesRows[0].fillPaint.backgroundImage,
                backgroundColor: seriesRows[0].fillPaint.backgroundColor,
              }}
            />
          </div>
        </div>
      ) : (
        <div
          ref={dragBarRef}
          data-interactive="percent-bar-control"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${seriesRows.length}, ${barW}px)`,
            gap,
            alignItems: "end",
            height: chartHeight,
            flex: "0 0 auto",
          }}
          onClickCapture={stopControlEvent}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
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
                  border: compact ? "0" : "2px solid white",
                  overflow: "hidden",
                  position: "relative",
                  alignSelf: "stretch",
                }}
              >
                <div
                  data-interactive="percent-bar-control"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    width: "100%",
                    height: `${series.pct}%`,
                    backgroundColor: series.fillPaint.backgroundColor,
                    transition: isDragging ? "none" : "height 0.18s ease-out, background-color 0.18s ease-out",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  onClick={(e) => handleSliceClick(e, series.solves)}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      width: "100%",
                      height: chartHeight,
                      backgroundImage:
                        buildGradientFillBackground(
                          series.id === "primary"
                            ? seriesStyle
                            : comparisonSeries.find((item, index) => (
                              (item?.id || `compare-${index}`) === series.id
                            ))?.style,
                          series.color
                        ) || series.fillPaint.backgroundImage,
                      backgroundColor: series.fillPaint.backgroundColor,
                    }}
                  />
                </div>
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

      {!compact && (
      <div
        data-interactive="percent-bar-control"
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: gap,
          justifyContent: "center",
          minWidth: 0,
        }}
        onClickCapture={stopControlEvent}
      >
        <label
          data-interactive="percent-bar-control"
          style={{
            color: "white",
            fontSize: 20,
            fontWeight: 800,
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
            data-interactive="percent-bar-control"
            style={{
              width: 108,
              padding: "6px 10px",
              fontSize: 22,
              fontWeight: 800,
              background: "transparent",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 6,
              outline: "none",
            }}
            onClickCapture={stopControlEvent}
            onPointerDownCapture={stopControlEvent}
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
                <span>{series.pct.toFixed(1)}%</span>
              </div>
            ))
          )}
        </div>
      </div>
      )}
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
  seriesStyle: PropTypes.shape({
    mode: PropTypes.string,
    primary: PropTypes.string,
    accent: PropTypes.string,
    stops: PropTypes.arrayOf(PropTypes.string),
  }),
  initialThresholdSeconds: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  compact: PropTypes.bool,
  onSliceClick: PropTypes.func.isRequired,
};

export default React.memo(PercentBarBuilder);
