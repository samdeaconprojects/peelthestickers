import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../TimeList/TimeUtils";

function getSolveMs(solve) {
  if (!solve) return null;
  if (solve.penalty === "+2") return (solve.originalTime || solve.time) + 2000;
  if (solve.penalty === "DNF") return "DNF";
  return Number.isFinite(Number(solve.time)) ? Number(solve.time) : null;
}

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

function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "").trim();
  if (value.length !== 6) return `rgba(46, 196, 182, ${alpha})`;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  if (![r, g, b].every(Number.isFinite)) return `rgba(46, 196, 182, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function resolveStandardHeatColor(ratio) {
  const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (safeRatio <= 0.2) {
    return interpolateHexColor("#00ff00", "#00e676", safeRatio / 0.2);
  }
  if (safeRatio <= 0.6) {
    return interpolateHexColor("#00e676", "#ffff00", (safeRatio - 0.2) / 0.4);
  }
  if (safeRatio <= 0.8) {
    return interpolateHexColor("#ffff00", "#ffa500", (safeRatio - 0.6) / 0.2);
  }
  return interpolateHexColor("#ffa500", "#ff0000", (safeRatio - 0.8) / 0.2);
}

function formatBucketAxisLabel(value) {
  if (value === "DNF") return "DNF";

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  if (seconds >= 60) return formatTime(seconds * 1000).replace(/\.00$/, "");

  return String(seconds);
}

function buildHistogramSeries(
  solves,
  style = null,
  fallbackColor = "#2EC4B6",
  histogramCounts = null
) {
  const counts = new Map();
  let numericTimes = [];
  let dnfCount = 0;

  if (histogramCounts && typeof histogramCounts === "object" && !Array.isArray(histogramCounts)) {
    for (const [rawKey, rawValue] of Object.entries(histogramCounts)) {
      const count = Number(rawValue || 0);
      if (!count) continue;
      if (String(rawKey).toUpperCase() === "DNF") {
        dnfCount += count;
        counts.set("DNF", (counts.get("DNF") || 0) + count);
        continue;
      }

      const seconds = Number(rawKey);
      if (!Number.isFinite(seconds)) continue;
      counts.set(seconds, (counts.get(seconds) || 0) + count);
      for (let i = 0; i < count; i += 1) {
        numericTimes.push(seconds * 1000);
      }
    }
  } else {
    const times = (Array.isArray(solves) ? solves : []).map(getSolveMs);
    numericTimes = times.filter((value) => typeof value === "number" && isFinite(value));
    dnfCount = times.filter((value) => value === "DNF").length;

    numericTimes.forEach((time) => {
      const bucket = Math.floor(time / 1000);
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    });

    if (dnfCount > 0) counts.set("DNF", dnfCount);
  }

  if (numericTimes.length === 0 && dnfCount === 0) {
    return { minTimeSec: 0, maxTimeSec: 0, buckets: [] };
  }

  const minTimeSec = numericTimes.length ? Math.floor(Math.min(...numericTimes) / 1000) : 0;
  const maxTimeSec = numericTimes.length ? Math.ceil(Math.max(...numericTimes) / 1000) : minTimeSec;

  const orderedKeys = Array.from(counts.keys()).sort((a, b) => {
    if (a === "DNF") return 1;
    if (b === "DNF") return -1;
    return Number(a) - Number(b);
  });

  const span = Math.max(1, maxTimeSec - minTimeSec || 1);
  const buckets = orderedKeys.map((key) => {
    const ratio =
      key === "DNF"
        ? 1
        : span === 0
          ? 0.5
          : (Number(key) - minTimeSec) / span;
    return {
      key,
      label: formatBucketAxisLabel(key),
      count: counts.get(key) || 0,
      color:
        key === "DNF"
          ? "#dc143c"
          : style
            ? resolvePaletteColor(style, ratio, fallbackColor)
            : resolveStandardHeatColor(ratio),
    };
  });

  return { minTimeSec, maxTimeSec, buckets };
}

function BarChart({
  solves,
  histogramCounts = null,
  comparisonSeries = [],
  seriesStyle = null,
  legendItems = [],
  showAxes = true,
  showLabels = true,
  showLegend = true,
}) {
  const containerRef = useRef(null);
  const [showCountLabels, setShowCountLabels] = useState(false);

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    count: 0,
    label: "",
    series: "",
  });

  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({
        w: el.clientWidth || 0,
        h: el.clientHeight || 0,
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padding = Math.max(14, Math.min(26, Math.floor(size.w * 0.05)));
  const chartWidth = Math.max(0, size.w);
  const chartHeight = Math.max(0, size.h);
  const hasComparison = Array.isArray(comparisonSeries) && comparisonSeries.length > 0;

  const computed = useMemo(() => {
    const primary = buildHistogramSeries(solves, seriesStyle, "#2EC4B6", histogramCounts);
    const secondary = (comparisonSeries || []).map((series, index) => ({
      id: series?.id || `compare-${index}`,
      label: series?.label || `Compare ${index + 1}`,
      ...buildHistogramSeries(
        series?.solves || [],
        series?.style || null,
        "#7c8cff",
        series?.histogramCounts || null
      ),
    }));

    if (!hasComparison) {
      if (primary.buckets.length === 0) return null;
      const counts = primary.buckets.map((bucket) => bucket.count);
      return {
        mode: "single",
        buckets: primary.buckets,
        maxCount: Math.max(...counts, 1),
      };
    }

    const bucketKeySet = new Set(primary.buckets.map((bucket) => bucket.key));
    secondary.forEach((series) => {
      series.buckets.forEach((bucket) => bucketKeySet.add(bucket.key));
    });

    const orderedKeys = Array.from(bucketKeySet).sort((a, b) => {
      if (a === "DNF") return 1;
      if (b === "DNF") return -1;
      return Number(a) - Number(b);
    });

    const seriesList = [
      {
        id: "primary",
        label: legendItems[0]?.label || "Primary",
        buckets: primary.buckets,
      },
      ...secondary,
    ];

    const groups = orderedKeys.map((key) => ({
      key,
      label: formatBucketAxisLabel(key),
      bars: seriesList.map((series, index) => {
        const bucket = series.buckets.find((item) => item.key === key);
        return {
          id: `${series.id}-${key}`,
          seriesLabel: series.label,
          count: bucket?.count || 0,
          color:
            bucket?.color ||
            legendItems[index]?.color ||
            (index === 0 ? "#2EC4B6" : "#7c8cff"),
        };
      }),
    }));

    const maxCount = Math.max(
      1,
      ...groups.flatMap((group) => group.bars.map((bar) => bar.count))
    );

    return {
      mode: "compare",
      groups,
      maxCount,
    };
  }, [comparisonSeries, hasComparison, histogramCounts, legendItems, seriesStyle, solves]);

  if (!computed) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
        No data available for this chart.
      </div>
    );
  }

  if (chartWidth < 20 || chartHeight < 20) {
    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
  }

  const innerW = Math.max(1, chartWidth - padding * 2);
  const innerH = Math.max(1, chartHeight - padding * 2);
  const controlAccentColor =
    seriesStyle?.primary || legendItems[0]?.color || resolvePaletteColor(seriesStyle, 0.5, "#2EC4B6");
  const renderCountLabel = (x, y, width, height, count, key) => {
    if (!showCountLabels) return null;

    const numericCount = Number(count || 0);
    if (numericCount <= 0) return null;

    const isTallBar = height >= 24;
    const labelY = isTallBar ? y + 14 : Math.max(padding + 10, y - 6);

    return (
      <text
        key={key}
        x={x + width / 2}
        y={labelY}
        textAnchor="middle"
        fontSize="10px"
        fontWeight="700"
        fill={isTallBar ? "#081c15" : "white"}
        stroke={isTallBar ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.6)"}
        strokeWidth="0.75"
        paintOrder="stroke"
      >
        {numericCount}
      </text>
    );
  };

  const items = computed.mode === "compare" ? computed.groups : computed.buckets;
  const labelEvery = items.length > 24 ? Math.ceil(items.length / 12) : 1;

  return (
    <div
      ref={containerRef}
      className="barChart"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        "--line-chart-accent": controlAccentColor,
        "--line-chart-accent-soft": hexToRgba(controlAccentColor, 0.18),
        "--line-chart-accent-strong": hexToRgba(controlAccentColor, 0.55),
      }}
    >
      {showLegend && hasComparison && legendItems.length > 0 && (
        <div className="lineChartLegend lineChartLegend--bar">
          {legendItems.map((item) => (
            <div key={item.id || item.label} className="lineChartLegendItem">
              <span
                className="lineChartLegendSwatch"
                style={{ backgroundColor: item.color || "#2EC4B6" }}
              />
              <span className="lineChartLegendLabel">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="barChartControls">
        <button
          type="button"
          aria-pressed={showCountLabels}
          className={`statsToggleBtn barChartToggleBtn ${showCountLabels ? "is-active" : ""}`}
          onClick={() => setShowCountLabels((current) => !current)}
        >
          Labels
        </button>
      </div>

      <svg width={chartWidth} height={chartHeight}>
        {showAxes && (
          <>
            <line
              x1={padding}
              y1={chartHeight - padding}
              x2={chartWidth - padding}
              y2={chartHeight - padding}
              stroke="#ccc"
            />
            <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#ccc" />
          </>
        )}

        {computed.mode === "single" &&
          computed.buckets.map((bucket, index) => {
            const barWidth = innerW / Math.max(1, computed.buckets.length);
            const h = (bucket.count / computed.maxCount) * innerH;
            const x = padding + index * barWidth;
            const y = chartHeight - padding - h;

            return (
              <g key={bucket.key}>
                <rect
                  x={x}
                  y={y}
                  width={Math.max(1, barWidth - 2)}
                  height={h}
                  rx={4}
                  ry={4}
                  fill={bucket.color}
                  onMouseOver={() =>
                    setTooltip({
                      visible: true,
                      x: x + barWidth / 2,
                      y: y - 8,
                      count: bucket.count,
                      label: bucket.label,
                      series: "",
                    })
                  }
                  onMouseOut={() =>
                    setTooltip({ visible: false, x: 0, y: 0, count: 0, label: "", series: "" })
                  }
                />

                {renderCountLabel(x, y, Math.max(1, barWidth - 2), h, bucket.count, `count-${bucket.key}`)}

                {showLabels && index % labelEvery === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight - padding + 14}
                    textAnchor="middle"
                    fontSize="10px"
                    fill="white"
                  >
                    {bucket.label}
                  </text>
                )}
              </g>
            );
          })}

        {computed.mode === "compare" &&
          computed.groups.map((group, groupIndex) => {
            const groupWidth = innerW / Math.max(1, computed.groups.length);
            const gap = Math.min(6, groupWidth * 0.12);
            const barWidth = Math.max(3, (groupWidth - gap * 2) / Math.max(1, group.bars.length));

            return (
              <g key={group.key}>
                {group.bars.map((bar, barIndex) => {
                  const h = (bar.count / computed.maxCount) * innerH;
                  const x = padding + groupIndex * groupWidth + gap + barIndex * barWidth;
                  const y = chartHeight - padding - h;

                  return (
                    <g key={bar.id}>
                      <rect
                        x={x}
                        y={y}
                        width={Math.max(1, barWidth - 2)}
                        height={h}
                        rx={4}
                        ry={4}
                        fill={bar.color}
                        onMouseOver={() =>
                          setTooltip({
                            visible: true,
                            x: x + barWidth / 2,
                            y: y - 8,
                            count: bar.count,
                            label: group.label,
                            series: bar.seriesLabel,
                          })
                        }
                        onMouseOut={() =>
                          setTooltip({ visible: false, x: 0, y: 0, count: 0, label: "", series: "" })
                        }
                      />
                      {renderCountLabel(
                        x,
                        y,
                        Math.max(1, barWidth - 2),
                        h,
                        bar.count,
                        `count-${bar.id}`
                      )}
                    </g>
                  );
                })}

                {showLabels && groupIndex % labelEvery === 0 && (
                  <text
                    x={padding + groupIndex * groupWidth + groupWidth / 2}
                    y={chartHeight - padding + 14}
                    textAnchor="middle"
                    fontSize="10px"
                    fill="white"
                  >
                    {group.label}
                  </text>
                )}
              </g>
            );
          })}

        {showLabels && [0, computed.maxCount].map((value, index) => (
          <text
            key={index}
            x={padding - 8}
            y={chartHeight - padding - (value / computed.maxCount) * innerH + 4}
            textAnchor="end"
            fontSize="10px"
            fill="white"
          >
            {value}
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
          {tooltip.series ? `${tooltip.series} · ` : ""}
          {tooltip.label}: {tooltip.count}
        </div>
      )}
    </div>
  );
}

export default React.memo(BarChart);
