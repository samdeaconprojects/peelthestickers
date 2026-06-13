import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const BASE_VIEWBOX_SIZE = 220;
const CALLOUT_VIEWBOX_SIZE = 320;
const CALLOUT_VERTICAL_THRESHOLD = 0.34;
const CALLOUT_SIDE_ELBOW_OFFSET = 10;
const CALLOUT_MIN_GAP = 28;
const CALLOUT_TOP_BOUND = 22;
const CALLOUT_BOTTOM_BOUND = CALLOUT_VIEWBOX_SIZE - 22;
const CALLOUT_HORIZONTAL_STUB = 18;
const CALLOUT_TEXT_VERTICAL_SPREAD = 54;
const CALLOUT_TEXT_SIDE_PAD = 8;
const CALLOUT_NAME_SIDE_OFFSET = 36;
const CALLOUT_COMPACT_VERTICAL_DRIFT = 22;
const CALLOUT_COMPACT_SIDE_STEP = 10;
const CALLOUT_COMPACT_TEXT_STEP = 18;
const CALLOUT_TOP_COMPACT_VERTICAL_DRIFT = 48;
const CALLOUT_TOP_ZONE_Y = 86;
const DEFAULT_BOLD_PIE_PALETTE = [
  "#50B6FF",
  "#FB596D",
  "#FFB044",
  "#2EC4B6",
  "#FFE863",
  "#8B7DFF",
];

function normalizeCalloutLines(entry, percent) {
  if (Array.isArray(entry?.calloutLines) && entry.calloutLines.length) {
    return entry.calloutLines.map((line) => String(line));
  }
  return [`${entry?.value || 0} solves`, `${percent}%`];
}

function distributeCalloutPositions(callouts) {
  if (!callouts.length) return [];

  const sorted = [...callouts].sort((a, b) => a.textY - b.textY);
  let cursor = CALLOUT_TOP_BOUND;

  const pushedDown = sorted.map((callout) => {
    const nextY = Math.max(callout.textY, cursor);
    cursor = nextY + CALLOUT_MIN_GAP;
    return { ...callout, textY: nextY };
  });

  const overflow = pushedDown[pushedDown.length - 1].textY - CALLOUT_BOTTOM_BOUND;
  if (overflow <= 0) return pushedDown;

  const pulledUp = [...pushedDown];
  pulledUp[pulledUp.length - 1] = {
    ...pulledUp[pulledUp.length - 1],
    textY: Math.max(CALLOUT_TOP_BOUND, pulledUp[pulledUp.length - 1].textY - overflow),
  };

  for (let index = pulledUp.length - 2; index >= 0; index -= 1) {
    const next = pulledUp[index + 1];
    pulledUp[index] = {
      ...pulledUp[index],
      textY: Math.min(
        pulledUp[index].textY,
        next.textY - CALLOUT_MIN_GAP
      ),
    };
  }

  const underflow = CALLOUT_TOP_BOUND - pulledUp[0].textY;
  if (underflow <= 0) return pulledUp;

  return pulledUp.map((callout) => ({
    ...callout,
    textY: Math.min(CALLOUT_BOTTOM_BOUND, callout.textY + underflow),
  }));
}

function resolveCalloutSideLayout(callouts, direction, chartCenter, chartRadius) {
  return distributeCalloutPositions(callouts).map((callout) => {
    const verticalDrift = Math.abs(callout.textY - callout.outerY);
    const useCompactLayout =
      verticalDrift <= CALLOUT_COMPACT_VERTICAL_DRIFT ||
      (callout.nearVertical &&
        callout.outerY <= CALLOUT_TOP_ZONE_Y &&
        verticalDrift <= CALLOUT_TOP_COMPACT_VERTICAL_DRIFT);
    const elbowX =
      direction < 0
        ? useCompactLayout
          ? callout.outerX - CALLOUT_COMPACT_SIDE_STEP
          : Math.min(callout.outerX - 10, chartCenter - (chartRadius + CALLOUT_SIDE_ELBOW_OFFSET))
        : useCompactLayout
          ? callout.outerX + CALLOUT_COMPACT_SIDE_STEP
          : Math.max(callout.outerX + 10, chartCenter + chartRadius + CALLOUT_SIDE_ELBOW_OFFSET);
    const textX =
      direction < 0
        ? useCompactLayout
          ? callout.outerX - CALLOUT_COMPACT_TEXT_STEP
          : Math.min(elbowX - CALLOUT_TEXT_SIDE_PAD, callout.outerX - CALLOUT_HORIZONTAL_STUB)
        : useCompactLayout
          ? callout.outerX + CALLOUT_COMPACT_TEXT_STEP
          : Math.max(elbowX + CALLOUT_TEXT_SIDE_PAD, callout.outerX + CALLOUT_HORIZONTAL_STUB);

    return {
      ...callout,
      elbowX,
      elbowY: callout.textY,
      textX,
    };
  });
}

function resolveSliceColorIndex(entry, fallbackIndex) {
  return Number.isFinite(entry?.colorIndex) ? entry.colorIndex : fallbackIndex;
}

const PieChartBuilder = ({
  data,
  width,
  height,
  onSliceClick,
  legendValueMode,
  interactive,
  colorPalette,
  showLegend,
  showCenterLabel,
  maxLegendItems,
  promoteHoveredOverflowItem,
  reverseLayout,
  sortMode,
  showCallouts,
  maxCallouts,
  onSliceHover,
  onSliceLeave,
  centerFillColor,
}) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const viewboxSize = showCallouts ? CALLOUT_VIEWBOX_SIZE : BASE_VIEWBOX_SIZE;
  const chartCenter = viewboxSize / 2;
  const chartRadius = showCallouts ? 90 : 86;

  const resolvedPalette =
    Array.isArray(colorPalette) && colorPalette.length > 0
      ? colorPalette
      : DEFAULT_BOLD_PIE_PALETTE;

  const sortedData = useMemo(
    () => {
      const filtered = [...data].filter((entry) => entry.value > 0);
      if (sortMode === "none") return filtered;
      return filtered.sort((a, b) => b.value - a.value);
    },
    [data, sortMode]
  );
  const safeHoveredSlice =
    hoveredSlice != null && hoveredSlice >= 0 && hoveredSlice < sortedData.length
      ? hoveredSlice
      : null;

  useEffect(() => {
    if (hoveredSlice != null && safeHoveredSlice == null) {
      setHoveredSlice(null);
    }
  }, [hoveredSlice, safeHoveredSlice]);

  const legendData = useMemo(() => {
    const withIndex = sortedData.map((entry, index) => ({ entry, index }));
    if (!Number.isFinite(maxLegendItems) || maxLegendItems <= 0 || withIndex.length <= maxLegendItems) {
      return withIndex;
    }

    const limit = Math.max(1, Math.floor(maxLegendItems));
    const visible = withIndex.slice(0, limit);

    if (
      promoteHoveredOverflowItem &&
      safeHoveredSlice != null &&
      safeHoveredSlice >= limit &&
      withIndex[safeHoveredSlice]
    ) {
      return [...visible.slice(0, Math.max(0, limit - 1)), withIndex[safeHoveredSlice]];
    }

    return visible;
  }, [maxLegendItems, promoteHoveredOverflowItem, safeHoveredSlice, sortedData]);

  let cumulativeValue = 0;

  const slices = sortedData.map((entry, index) => {
    const startAngle = total > 0 ? (cumulativeValue / total) * 2 * Math.PI - Math.PI / 2 : -Math.PI / 2;
    cumulativeValue += entry.value;
    const endAngle = total > 0 ? (cumulativeValue / total) * 2 * Math.PI - Math.PI / 2 : -Math.PI / 2;

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    const startX = chartCenter + chartRadius * Math.cos(startAngle);
    const startY = chartCenter + chartRadius * Math.sin(startAngle);
    const endX = chartCenter + chartRadius * Math.cos(endAngle);
    const endY = chartCenter + chartRadius * Math.sin(endAngle);
    const fill = resolvedPalette[resolveSliceColorIndex(entry, index) % resolvedPalette.length];
    const isHovered = safeHoveredSlice === index;

    const pathData = [
      `M ${chartCenter} ${chartCenter}`,
      `L ${startX} ${startY}`,
      `A ${chartRadius} ${chartRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      "Z",
    ].join(" ");

    const handleSelect = () => {
      if (!interactive || typeof onSliceClick !== "function") return;
      onSliceClick(entry.solves, entry);
    };

    const handleMouseEnter = () => {
      setHoveredSlice(index);
      onSliceHover?.(entry, index);
    };

    const handleMouseLeave = () => {
      setHoveredSlice(null);
      onSliceLeave?.(entry, index);
    };

    return (
      <path
        key={entry.label}
        d={pathData}
        fill={isHovered ? fill : "transparent"}
        onClick={handleSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: interactive ? "pointer" : "default",
          transform: isHovered ? "scale(1.04)" : "scale(1)",
          transformOrigin: `${chartCenter}px ${chartCenter}px`,
          transition: "transform 0.2s ease-in-out, stroke-width 0.2s ease-in-out, fill 0.2s ease-in-out",
          stroke: fill,
          strokeWidth: "5px",
        }}
      />
    );
  });

  const activeSlice = safeHoveredSlice != null ? sortedData[safeHoveredSlice] : sortedData[0] || null;
  const activePercent = activeSlice && total > 0 ? Math.round((activeSlice.value / total) * 100) : 0;
  const showCalloutSet = showCallouts && sortedData.length > 0;
  const promotedCallouts = useMemo(() => {
    if (!showCalloutSet) return [];
    const withIndex = sortedData.map((entry, index) => ({ entry, index }));
    if (!Number.isFinite(maxCallouts) || maxCallouts <= 0 || withIndex.length <= maxCallouts) {
      return withIndex;
    }

    const limit = Math.max(1, Math.floor(maxCallouts));
    const pinned = withIndex.filter(({ entry }) => entry?.alwaysShowCallout);
    const visible = [...withIndex]
      .filter(({ entry }) => !entry?.alwaysShowCallout)
      .sort((a, b) => {
        if (b.entry.value !== a.entry.value) return b.entry.value - a.entry.value;
        return a.index - b.index;
      })
      .slice(0, Math.max(0, limit - pinned.length));
    const combined = [...pinned, ...visible];

    if (
      promoteHoveredOverflowItem &&
      safeHoveredSlice != null &&
      withIndex[safeHoveredSlice]
    ) {
      const hoveredEntry = withIndex[safeHoveredSlice];
      if (combined.some((item) => item.index === hoveredEntry.index)) {
        return combined;
      }
      return [...combined, hoveredEntry];
    }

    return combined;
  }, [maxCallouts, promoteHoveredOverflowItem, safeHoveredSlice, showCalloutSet, sortedData]);

  const callouts = useMemo(() => {
    if (!showCalloutSet) return [];

    const baseCallouts = promotedCallouts.map(({ entry, index }) => {
      const cumulativeBefore = sortedData
        .slice(0, index)
        .reduce((sum, current) => sum + current.value, 0);
      const sliceMidValue = cumulativeBefore + entry.value / 2;
      const midAngle = (sliceMidValue / total) * 2 * Math.PI - Math.PI / 2;
      const cosAngle = Math.cos(midAngle);
      const sinAngle = Math.sin(midAngle);
      const direction = cosAngle >= 0 ? 1 : -1;
      const nearVertical = Math.abs(cosAngle) < CALLOUT_VERTICAL_THRESHOLD;
      const outerX = chartCenter + (chartRadius + 4) * Math.cos(midAngle);
      const outerY = chartCenter + (chartRadius + 4) * Math.sin(midAngle);
      const percent = Math.round((entry.value / total) * 100);
      const lines = normalizeCalloutLines(entry, percent);
      const isActive = safeHoveredSlice == null ? index === 0 : safeHoveredSlice === index;
      const textSpread =
        Math.abs(sinAngle) > 0.9 ? CALLOUT_TEXT_VERTICAL_SPREAD * 0.52 : CALLOUT_TEXT_VERTICAL_SPREAD;

      return {
        entry,
        index,
        direction,
        preferredDirection: direction,
        nearVertical,
        midAngle,
        cosAngle,
        sinAngle,
        outerX,
        outerY,
        textY: outerY + sinAngle * textSpread,
        lines,
        isActive,
      };
    });

    const leftCallouts = resolveCalloutSideLayout(
      baseCallouts.filter((callout) => callout.direction < 0),
      -1,
      chartCenter,
      chartRadius
    );

    const rightCallouts = resolveCalloutSideLayout(
      baseCallouts.filter((callout) => callout.direction > 0),
      1,
      chartCenter,
      chartRadius
    );

    return [...leftCallouts, ...rightCallouts].sort((a, b) => a.index - b.index);
  }, [chartCenter, chartRadius, promotedCallouts, safeHoveredSlice, showCalloutSet, sortedData, total]);

  if (total === 0 || sortedData.length === 0) {
    return <p className="pieChartEmpty">No solves available</p>;
  }

  return (
    <div
      className={`pieChartRoot ${reverseLayout ? "pieChartRoot--reverse" : ""} ${!showLegend ? "pieChartRoot--chartOnly" : ""}`}
      style={{ width, height }}
    >
      <div className="pieChartCanvas">
        <svg
          className="pieChartSvg"
          viewBox={`0 0 ${viewboxSize} ${viewboxSize}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {slices}
          {callouts.map((callout) => {
            const fill =
              resolvedPalette[
                resolveSliceColorIndex(callout.entry, callout.index) % resolvedPalette.length
              ];
            const textAnchor = callout.direction > 0 ? "start" : "end";
            const nameX =
              callout.direction > 0
                ? callout.textX + CALLOUT_NAME_SIDE_OFFSET
                : callout.textX - CALLOUT_NAME_SIDE_OFFSET;
            const nameAnchor = callout.direction > 0 ? "start" : "end";
            return (
              <g
                key={`${callout.entry.label}-callout`}
                className={`pieChartCallout ${callout.isActive ? "is-active" : ""}`}
                onMouseEnter={() => {
                  setHoveredSlice(callout.index);
                  onSliceHover?.(callout.entry, callout.index);
                }}
                onMouseLeave={() => {
                  setHoveredSlice(null);
                  onSliceLeave?.(callout.entry, callout.index);
                }}
                onFocus={() => {
                  setHoveredSlice(callout.index);
                  onSliceHover?.(callout.entry, callout.index);
                }}
                onBlur={() => {
                  setHoveredSlice(null);
                  onSliceLeave?.(callout.entry, callout.index);
                }}
                onClick={() => {
                  if (!interactive || typeof onSliceClick !== "function") return;
                  onSliceClick(callout.entry.solves, callout.entry);
                }}
                style={{
                  cursor: interactive ? "pointer" : "default",
                  "--pie-callout-accent": fill,
                }}
              >
                <path
                  className="pieChartCalloutLine"
                  d={`M ${callout.outerX} ${callout.outerY} L ${callout.elbowX} ${callout.elbowY} L ${callout.textX} ${callout.textY}`}
                />
                <circle
                  className="pieChartCalloutDot"
                  cx={callout.outerX}
                  cy={callout.outerY}
                  r="2.75"
                />
                <text
                  x={callout.textX}
                  y={callout.textY - 3}
                    textAnchor={textAnchor}
                    className="pieChartCalloutSecondary"
                  >
                    {callout.lines[1]}
                  </text>
                {callout.lines[2] ? (
                  <text
                    x={callout.textX}
                    y={callout.textY + 11}
                    textAnchor={textAnchor}
                    className="pieChartCalloutSecondary"
                  >
                    {callout.lines[2]}
                  </text>
                ) : null}
                <text
                  x={nameX}
                  y={callout.textY + 4}
                  textAnchor={nameAnchor}
                  className="pieChartCalloutPrimary"
                >
                  {callout.lines[0]}
                </text>
              </g>
            );
          })}
          {showCenterLabel && (
            <>
              <circle
                cx={chartCenter}
                cy={chartCenter}
                r="42"
                fill={centerFillColor || "var(--primary-color, rgba(7, 12, 15, 0.88))"}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
              />
              <text x={chartCenter} y={chartCenter - 6} textAnchor="middle" className="pieChartCenterValue">
                {activePercent}%
              </text>
              <text x={chartCenter} y={chartCenter + 16} textAnchor="middle" className="pieChartCenterLabel">
                {activeSlice?.label || ""}
              </text>
            </>
          )}
        </svg>
      </div>

      {showLegend && (
        <div
          className={[
            "pieChartLegend",
            !maxLegendItems && sortedData.length > 6 ? "pieChartLegend--grid" : "",
            !maxLegendItems && sortedData.length > 10 ? "pieChartLegend--gridWide" : "",
            !maxLegendItems && sortedData.length > 14 ? "pieChartLegend--gridXL" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
        {legendData.map(({ entry, index }) => {
          const percent = Math.round((entry.value / total) * 100);
          const isActive = safeHoveredSlice === index;
          const legendMeta = legendValueMode === "count" ? `${entry.value}` : `${entry.value} · ${percent}%`;
          const legendColor =
            resolvedPalette[resolveSliceColorIndex(entry, index) % resolvedPalette.length];
          return (
            <button
              key={entry.label}
              type="button"
              className={`pieChartLegendItem ${isActive ? "is-active" : ""}`}
              style={{
                "--pie-legend-accent": legendColor,
                "--pie-legend-bar-width": `${Math.max(percent, 6)}%`,
              }}
              onClick={() => {
                if (!interactive || typeof onSliceClick !== "function") return;
                onSliceClick(entry.solves, entry);
              }}
              onMouseEnter={() => setHoveredSlice(index)}
              onMouseLeave={() => setHoveredSlice(null)}
              onFocus={() => setHoveredSlice(index)}
              onBlur={() => setHoveredSlice(null)}
            >
              <span className="pieChartLegendBar" aria-hidden="true">
                <span className="pieChartLegendBarFill" />
              </span>
              <span
                className="pieChartLegendSwatch"
                style={{ backgroundColor: legendColor }}
              />
              <span className="pieChartLegendText" title={entry.label}>
                {entry.label}
              </span>
              <span className="pieChartLegendMeta">
                {legendMeta}
              </span>
            </button>
          );
        })}
        </div>
      )}
    </div>
  );
};

PieChartBuilder.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      colorIndex: PropTypes.number,
      solves: PropTypes.arrayOf(
        PropTypes.shape({
          time: PropTypes.number.isRequired,
          scramble: PropTypes.string.isRequired,
          event: PropTypes.string.isRequired
        })
      ).isRequired
    })
  ).isRequired,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onSliceClick: PropTypes.func,
  legendValueMode: PropTypes.oneOf(["count", "count-percent"]),
  interactive: PropTypes.bool,
  colorPalette: PropTypes.arrayOf(PropTypes.string),
  showLegend: PropTypes.bool,
  showCenterLabel: PropTypes.bool,
  maxLegendItems: PropTypes.number,
  promoteHoveredOverflowItem: PropTypes.bool,
  reverseLayout: PropTypes.bool,
  sortMode: PropTypes.oneOf(["value-desc", "none"]),
  showCallouts: PropTypes.bool,
  maxCallouts: PropTypes.number,
  onSliceHover: PropTypes.func,
  onSliceLeave: PropTypes.func,
  centerFillColor: PropTypes.string,
};

PieChartBuilder.defaultProps = {
  width: "100%",
  height: "100%",
  onSliceClick: null,
  legendValueMode: "count-percent",
  interactive: true,
  colorPalette: undefined,
  showLegend: true,
  showCenterLabel: true,
  maxLegendItems: null,
  promoteHoveredOverflowItem: false,
  reverseLayout: false,
  sortMode: "value-desc",
  showCallouts: false,
  maxCallouts: null,
  onSliceHover: null,
  onSliceLeave: null,
  centerFillColor: null,
};

export default PieChartBuilder;
