import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import "./Stats.css";

const BASE_VIEWBOX_SIZE = 220;
const CALLOUT_VIEWBOX_SIZE = 320;
const CENTER_RADIUS = 42;
const CALLOUT_SIDE_ELBOW_OFFSET = 10;
const CALLOUT_MIN_GAP = 28;
const CALLOUT_TOP_BOUND = 22;
const CALLOUT_BOTTOM_BOUND = CALLOUT_VIEWBOX_SIZE - 22;
const CALLOUT_CHART_CLEARANCE = 16;
const CALLOUT_TEXT_VERTICAL_SPREAD = 54;
const CALLOUT_TEXT_SIDE_PAD = 8;
const CALLOUT_NAME_SIDE_OFFSET = 36;
const DEFAULT_BOLD_PIE_PALETTE = [
  "#50B6FF",
  "#FB596D",
  "#FFB044",
  "#2EC4B6",
  "#FFE863",
  "#8B7DFF",
];

// Colours the app already uses for penalties; clean solves keep the palette colour.
export const PENALTY_SLICE_COLORS = { "+2": "#FFE863", DNF: "#FB596D" };

// Thinner outlines as the chart gets crowded so narrow slices stay readable.
export function getPieSliceStrokeWidth(sliceCount) {
  if (sliceCount <= 8) return 4;
  if (sliceCount <= 14) return 3;
  return 2.25;
}

function normalizeCalloutLines(entry, percent) {
  if (Array.isArray(entry?.calloutLines) && entry.calloutLines.length) {
    return entry.calloutLines.map((line) => String(line));
  }
  return [`${entry?.value || 0} solves`, `${percent}%`];
}

// Spreads label rows apart around their preferred positions (rather than only
// pushing later ones down), then keeps the stack inside the vertical bounds.
function distributeCalloutPositions(callouts) {
  if (!callouts.length) return [];

  const sorted = [...callouts].sort((a, b) => a.textY - b.textY);
  const ys = sorted.map((callout) => callout.textY);

  for (let pass = 0; pass < 80; pass += 1) {
    let moved = false;
    for (let index = 0; index < ys.length - 1; index += 1) {
      const deficit = CALLOUT_MIN_GAP - (ys[index + 1] - ys[index]);
      if (deficit > 0.01) {
        ys[index] -= deficit / 2;
        ys[index + 1] += deficit / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }

  ys[ys.length - 1] = Math.min(ys[ys.length - 1], CALLOUT_BOTTOM_BOUND);
  for (let index = ys.length - 2; index >= 0; index -= 1) {
    ys[index] = Math.min(ys[index], ys[index + 1] - CALLOUT_MIN_GAP);
  }
  ys[0] = Math.max(ys[0], CALLOUT_TOP_BOUND);
  for (let index = 1; index < ys.length; index += 1) {
    ys[index] = Math.max(ys[index], ys[index - 1] + CALLOUT_MIN_GAP);
  }

  return sorted.map((callout, index) => ({ ...callout, textY: ys[index] }));
}

// Each label hugs the outside of the chart at its own row: the elbow sits just
// past the circle's edge at that height, so text never lands on the slices.
function resolveCalloutSideLayout(callouts, direction, chartCenter, chartRadius) {
  const clearRadius = chartRadius + CALLOUT_CHART_CLEARANCE;

  return distributeCalloutPositions(callouts).map((callout) => {
    const dy = Math.abs(callout.textY - chartCenter);
    const halfWidth = dy < clearRadius ? Math.sqrt(clearRadius * clearRadius - dy * dy) : 0;
    const clearX = chartCenter + direction * halfWidth;
    const leadX = chartCenter + clearRadius * callout.cosAngle;
    const leadY = chartCenter + clearRadius * callout.sinAngle;
    const elbowX =
      direction < 0
        ? Math.min(clearX, leadX - CALLOUT_SIDE_ELBOW_OFFSET)
        : Math.max(clearX, leadX + CALLOUT_SIDE_ELBOW_OFFSET);

    return {
      ...callout,
      leadX,
      leadY,
      elbowX,
      elbowY: callout.textY,
      textX: elbowX + direction * CALLOUT_TEXT_SIDE_PAD,
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
  highlightedKey,
  sliceStrokeWidth,
  showInnerOutline,
  centerFillColor,
}) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const lastHoveredShapeRef = useRef(null);
  const viewboxSize = showCallouts ? CALLOUT_VIEWBOX_SIZE : BASE_VIEWBOX_SIZE;
  const chartCenter = viewboxSize / 2;
  const chartRadius = showCallouts ? 108 : 86;

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
  const ownHoveredSlice =
    hoveredSlice != null && hoveredSlice >= 0 && hoveredSlice < sortedData.length
      ? hoveredSlice
      : null;

  useEffect(() => {
    if (hoveredSlice != null && ownHoveredSlice == null) {
      setHoveredSlice(null);
    }
  }, [hoveredSlice, ownHoveredSlice]);

  // A slice hovered from outside the chart (e.g. a legend row elsewhere on the
  // page) is drawn exactly like one hovered on the chart itself.
  const highlightedSlice = useMemo(() => {
    if (highlightedKey == null || highlightedKey === "") return null;
    const index = sortedData.findIndex((entry) => entry.key === highlightedKey);
    return index >= 0 ? index : null;
  }, [highlightedKey, sortedData]);
  const safeHoveredSlice = ownHoveredSlice ?? highlightedSlice;

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
  let hoveredShape = null;

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

    // With an inner outline the slice is a ring segment whose inner edge sits
    // just outside the center disc, so its stroke stays visible around the hole.
    const innerRadius = showInnerOutline && showCenterLabel ? CENTER_RADIUS + sliceStrokeWidth / 2 : 0;
    const pathData = innerRadius
      ? [
          `M ${chartCenter + innerRadius * Math.cos(startAngle)} ${chartCenter + innerRadius * Math.sin(startAngle)}`,
          `L ${startX} ${startY}`,
          `A ${chartRadius} ${chartRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          `L ${chartCenter + innerRadius * Math.cos(endAngle)} ${chartCenter + innerRadius * Math.sin(endAngle)}`,
          `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${chartCenter + innerRadius * Math.cos(startAngle)} ${chartCenter + innerRadius * Math.sin(startAngle)}`,
          "Z",
        ].join(" ")
      : [
          `M ${chartCenter} ${chartCenter}`,
          `L ${startX} ${startY}`,
          `A ${chartRadius} ${chartRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          "Z",
        ].join(" ");

    if (isHovered) hoveredShape = { pathData, fill };

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
          strokeWidth: `${sliceStrokeWidth}px`,
        }}
      />
    );
  });

  // SVG paints in DOM order, so later slices would cover a hovered earlier one.
  // A non-interactive copy drawn after all slices lifts the hovered slice on top;
  // it keeps the last shape while fading out so the un-hover still animates.
  if (hoveredShape) lastHoveredShapeRef.current = hoveredShape;
  const overlayShape = hoveredShape || lastHoveredShapeRef.current;
  const hoveredOverlay = overlayShape ? (
    <path
      d={overlayShape.pathData}
      fill={overlayShape.fill}
      style={{
        pointerEvents: "none",
        opacity: hoveredShape ? 1 : 0,
        transform: hoveredShape ? "scale(1.04)" : "scale(1)",
        transformOrigin: `${chartCenter}px ${chartCenter}px`,
        transition: "transform 0.2s ease-in-out, opacity 0.2s ease-in-out",
        stroke: overlayShape.fill,
        strokeWidth: `${sliceStrokeWidth}px`,
      }}
    />
  ) : null;

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
          {hoveredOverlay}
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
                  d={`M ${callout.outerX} ${callout.outerY} L ${callout.leadX} ${callout.leadY} L ${callout.elbowX} ${callout.elbowY} L ${callout.textX} ${callout.textY}`}
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
                r={CENTER_RADIUS}
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
  highlightedKey: PropTypes.string,
  sliceStrokeWidth: PropTypes.number,
  showInnerOutline: PropTypes.bool,
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
  highlightedKey: null,
  sliceStrokeWidth: 5,
  showInnerOutline: false,
  centerFillColor: null,
};

export default PieChartBuilder;
