import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { formatTime } from "../TimeList/TimeUtils";

const STROKE = 1;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getNiceNumber(value, roundUp = false) {
  const safeValue = Math.max(0, Number(value) || 0);
  if (!safeValue) return 1;

  const exponent = Math.floor(Math.log10(safeValue));
  const fraction = safeValue / 10 ** exponent;
  let niceFraction;

  if (roundUp) {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

function getNiceYScale(minValue, maxValue, tickCount) {
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) ? maxValue : Math.max(1, safeMin + 1);
  const targetTicks = Math.max(2, Number(tickCount) || 2);
  const rawRange = Math.max(1, safeMax - safeMin);
  const step = getNiceNumber(rawRange / targetTicks, true);
  const niceMin = Math.max(0, Math.floor(safeMin / step) * step);
  const niceMax = Math.max(niceMin + step, Math.ceil(safeMax / step) * step);
  const tickTotal = Math.max(1, Math.round((niceMax - niceMin) / step));
  const values = Array.from({ length: tickTotal + 1 }, (_, index) => niceMin + step * index);

  return {
    min: niceMin,
    max: niceMax,
    step,
    values,
  };
}

function formatAxisTimeLabel(secondsValue, preferWholeSeconds = false) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds)) return "";

  if (seconds >= 60) {
    return formatTime(seconds * 1000).replace(/\.00$/, "");
  }

  if (preferWholeSeconds && Math.abs(seconds - Math.round(seconds)) < 0.001) {
    return `${Math.round(seconds)}s`;
  }

  return `${seconds.toFixed(1)}s`;
}

function getXAxisLabelIndices(data) {
  const safeData = Array.isArray(data) ? data : [];
  const count = safeData.length;

  if (count <= 0) return new Set();
  if (count <= 12) {
    return new Set(safeData.map((_, index) => index));
  }

  const isSequentialSolveCount = safeData.every((item, index) => Number(item?.label) === index + 1);
  if (isSequentialSolveCount) {
    const step = Math.max(1, Math.round(count / 5));
    const indices = new Set([0, count - 1]);

    safeData.forEach((item, index) => {
      const labelValue = Number(item?.label);
      if (Number.isFinite(labelValue) && labelValue % step === 0) {
        indices.add(index);
      }
    });

    return indices;
  }

  const fallbackStep = Math.max(1, Math.ceil(count / 6));
  const indices = new Set([0, count - 1]);
  safeData.forEach((_, index) => {
    if (index % fallbackStep === 0) indices.add(index);
  });
  return indices;
}

function getXTickEntries(data) {
  const safeData = Array.isArray(data) ? data : [];
  const labelIndices = getXAxisLabelIndices(safeData);
  return safeData
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => labelIndices.has(index));
}

const LineChartBuilder = ({
  data,
  extraSeries,
  referenceLines,
  comparisonSeries,
  primaryStroke,
  height,
  width,
  horizontalGuides: numberOfHorizontalGuides,
  verticalGuides: numberOfVerticalGuides,
  precision,
  onDotClick,
  selectedIndices = new Set(),
  dotRadius = 5,
  selectedDotRadius = 8,
  yMin = null,
  yMax = null,
  showAxes = true,
  showGuides = true,
  showAxisLabels = true,
}) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, time: "" });
  const containerRef = useRef(null);
  const [size, setSize] = useState({
    width: Math.max(1, Number(width) || 1),
    height: Math.max(1, Number(height) || 1),
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const nextWidth = Math.max(1, Math.round(node.clientWidth || width || 1));
      const nextHeight = Math.max(1, Math.round(node.clientHeight || height || 1));
      setSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, width]);

  const resolvedWidth = Math.max(1, Number(size.width) || Number(width) || 1);
  const resolvedHeight = Math.max(1, Number(size.height) || Number(height) || 1);

  const FONT_SIZE = Math.max(10, Math.floor(resolvedWidth / 52));

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const safeComparisonSeries = useMemo(
    () => (Array.isArray(comparisonSeries) ? comparisonSeries : []),
    [comparisonSeries]
  );
  const multiSeriesOpacity = safeComparisonSeries.length > 0 ? 0.75 : 1;

  const {
    leftPadding,
    rightPadding,
    topPadding,
    bottomPadding,
    chartWidth,
    chartHeight,
    minX,
    minimumYFromData,
    yTicks,
    yDenom,
    xDenom,
  } = useMemo(() => {
    const xs = [
      ...safeData.map((e) => e.x),
      ...safeComparisonSeries.flatMap((series) => (series.points || []).map((point) => point?.x)),
    ].filter((value) => typeof value === "number" && isFinite(value));
    const ys = [
      ...safeData.map((e) => e.y),
      ...safeComparisonSeries.flatMap((series) => (series.points || []).map((point) => point?.y)),
    ].filter((v) => typeof v === "number" && isFinite(v));

    const _maxX = xs.length ? Math.max(...xs) : 1;
    const _minX = xs.length ? Math.min(...xs) : 0;

    const dataMinY = ys.length ? Math.min(...ys) : 0;
    const dataMaxY = ys.length ? Math.max(...ys) : 1;
    const parsedYMin = Number(yMin);
    const parsedYMax = Number(yMax);
    const hasCustomRange =
      Number.isFinite(parsedYMin) &&
      Number.isFinite(parsedYMax) &&
      parsedYMax > parsedYMin;

    const resolvedMinY = hasCustomRange ? parsedYMin : 0;
    const resolvedMaxY = hasCustomRange
      ? parsedYMax
      : Math.max(1, Math.ceil(Math.max(dataMaxY, dataMinY, 1)));
    const niceScale = getNiceYScale(
      resolvedMinY,
      resolvedMaxY,
      Math.max(2, numberOfHorizontalGuides || 4)
    );

    const digits = parseFloat(niceScale.max.toString()).toFixed(precision).length + 3;
    const yLabelRoom = digits * (FONT_SIZE * 0.62);

    const computedLeftPadding = Math.ceil(Math.max(FONT_SIZE * 1.9, yLabelRoom)) + 2;
    const computedRightPadding = Math.max(18, Math.ceil(FONT_SIZE * 1.4));
    const computedTopPadding = Math.max(13, Math.ceil(FONT_SIZE * 1.0));
    const computedBottomPadding = showAxisLabels
      ? Math.max(28, Math.ceil(FONT_SIZE * 2.4))
      : Math.max(14, Math.ceil(FONT_SIZE * 1.1));

    return {
      leftPadding: computedLeftPadding,
      rightPadding: computedRightPadding,
      topPadding: computedTopPadding,
      bottomPadding: computedBottomPadding,
      chartWidth: Math.max(1, resolvedWidth - computedLeftPadding - computedRightPadding),
      chartHeight: Math.max(1, resolvedHeight - computedTopPadding - computedBottomPadding),
      minX: _minX,
      maxX: _maxX,
      minimumYFromData: niceScale.min,
      maximumYFromData: niceScale.max,
      yTicks: niceScale.values,
      yDenom: niceScale.max - niceScale.min || 1,
      xDenom: (_maxX - _minX) || 1,
    };
  }, [
    numberOfHorizontalGuides,
    safeComparisonSeries,
    safeData,
    resolvedWidth,
    resolvedHeight,
    FONT_SIZE,
    precision,
    yMin,
    yMax,
    showAxisLabels,
  ]);

  const mainPoints = useMemo(() => {
    if (!safeData.length) return "";
    return safeData
      .map((element) => {
        const x = ((element.x - minX) / xDenom) * chartWidth + leftPadding;
        const rawY =
          chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
        const y = clamp(rawY, topPadding, chartHeight + topPadding);
        return `${x},${y}`;
      })
      .join(" ");
  }, [
    safeData,
    minX,
    xDenom,
    chartWidth,
    chartHeight,
    leftPadding,
    topPadding,
    minimumYFromData,
    yDenom,
  ]);

  const Axis = ({ points }) => (
    <polyline fill="none" stroke="rgba(204, 204, 204, 0.58)" strokeWidth=".7" points={points} />
  );
  const XAxis = () =>
    <Axis
      points={`${leftPadding},${resolvedHeight - bottomPadding} ${resolvedWidth - rightPadding},${resolvedHeight - bottomPadding}`}
    />;
  const YAxis = () =>
    <Axis points={`${leftPadding},${topPadding} ${leftPadding},${resolvedHeight - bottomPadding}`} />;

  const VerticalGuides = () => {
    const tickEntries = getXTickEntries(safeData);
    const startY = topPadding;
    const endY = resolvedHeight - bottomPadding;
    return tickEntries.slice(1, -1).map(({ item, index }) => {
      const xCoordinate = ((item.x - minX) / xDenom) * chartWidth + leftPadding;
      return (
        <polyline
          key={`x-guide-${index}-${item.label}`}
          fill="none"
          stroke="rgba(194, 194, 194, 0.14)"
          strokeWidth=".7"
          points={`${xCoordinate},${startY} ${xCoordinate},${endY}`}
        />
      );
    });
  };

  const HorizontalGuides = () => {
    const startX = leftPadding;
    const endX = resolvedWidth - rightPadding;
    return (yTicks || []).slice(1, -1).map((tickValue) => {
      const ratio = (tickValue - minimumYFromData) / yDenom;
      const yCoordinate = chartHeight - chartHeight * ratio + topPadding;
      return (
        <polyline
          key={`y-guide-${tickValue}`}
          fill="none"
          stroke="rgba(194, 194, 194, 0.14)"
          strokeWidth=".7"
          points={`${startX},${yCoordinate} ${endX},${yCoordinate}`}
        />
      );
    });
  };

  const LabelsXAxis = () => {
    const y = resolvedHeight - bottomPadding + FONT_SIZE * 1.7;
    const tickEntries = getXTickEntries(safeData);

    return tickEntries.map(({ item: element, index }) => {
      const x = ((element.x - minX) / xDenom) * chartWidth + leftPadding;
      return (
        <text
          key={index}
          x={x}
          y={y}
          textAnchor="middle"
          style={{ fill: "rgba(128, 128, 128, 0.72)", fontSize: FONT_SIZE, fontFamily: "Helvetica" }}
        >
          {element.label}
        </text>
      );
    });
  };

  const LabelsYAxis = () => {
    const shouldUseWholeSeconds = (yTicks?.[1] ?? 1) - (yTicks?.[0] ?? 0) >= 1;
    return (yTicks || []).map((tickValue) => {
      const x = leftPadding - FONT_SIZE * 0.7;
      const ratio = (tickValue - minimumYFromData) / yDenom;
      const yCoordinate = chartHeight - chartHeight * ratio + topPadding + FONT_SIZE / 3;
      return (
        <text
          key={`y-label-${tickValue}`}
          x={x}
          y={yCoordinate}
          textAnchor="end"
          style={{
            fill: "rgba(219, 221, 225, 0.82)",
            fontSize: FONT_SIZE + 1,
            fontFamily: "Helvetica",
          }}
        >
          {formatAxisTimeLabel(tickValue, shouldUseWholeSeconds)}
        </text>
      );
    });
  };

  const handleMouseOver = (event, time) => {
    const { clientX, clientY } = event;
    setTooltip({ visible: true, x: clientX, y: clientY, time });
  };

  const handleMouseOut = () => setTooltip({ visible: false, x: 0, y: 0, time: "" });

  const extraPolylines = (Array.isArray(extraSeries) ? extraSeries : []).map((s) => {
    const pts = (s.points || [])
      .filter((p) => p && typeof p.y === "number" && isFinite(p.y))
      .map((p) => {
        const x = ((p.x - minX) / xDenom) * chartWidth + leftPadding;
        const rawY =
          chartHeight - ((p.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
        const y = clamp(rawY, topPadding, chartHeight + topPadding);
        return `${x},${y}`;
      })
      .join(" ");

    if (!pts) return null;

    return (
      <polyline
        key={s.id}
        fill="none"
        stroke={s.stroke}
        strokeWidth={2}
        opacity={0.95}
        points={pts}
      />
    );
  });

  const comparisonPolylines = safeComparisonSeries.map((series) => {
    const pts = (series.points || [])
      .filter((point) => point && typeof point.y === "number" && isFinite(point.y))
      .map((point) => {
        const x = ((point.x - minX) / xDenom) * chartWidth + leftPadding;
        const rawY =
          chartHeight - ((point.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
        const y = clamp(rawY, topPadding, chartHeight + topPadding);
        return `${x},${y}`;
      })
      .join(" ");

    if (!pts) return null;

    return (
      <polyline
        key={series.id}
        fill="none"
        stroke={series.stroke || "#7c8cff"}
        strokeWidth={2.6}
        opacity={multiSeriesOpacity}
        points={pts}
      />
    );
  });

  const renderedReferenceLines = (Array.isArray(referenceLines) ? referenceLines : [])
    .filter((line) => typeof line?.y === "number" && isFinite(line.y))
    .map((line, index) => {
      const rawY =
        chartHeight - ((line.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
      const y = clamp(rawY, topPadding, chartHeight + topPadding);

      return (
        <g key={line.id || `reference-${index}`}>
          <line
            x1={leftPadding}
            y1={y}
            x2={resolvedWidth - rightPadding}
            y2={y}
            stroke={line.stroke || "#FFD54A"}
            strokeWidth={1.5}
            strokeDasharray={line.dashed ? "6 5" : undefined}
            opacity={0.95}
          />
        </g>
      );
    });

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <svg
        viewBox={`0 0 ${resolvedWidth} ${resolvedHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", overflow: "hidden", display: "block" }}
      >
        {showAxes && <XAxis />}
        {showAxisLabels && <LabelsXAxis />}
        {showAxes && <YAxis />}
        {showAxisLabels && <LabelsYAxis />}

        {showGuides && numberOfVerticalGuides && <VerticalGuides />}
        {showGuides && <HorizontalGuides />}
        {renderedReferenceLines}

        <polyline
          fill="none"
          stroke={primaryStroke || safeData[0]?.color || "#00FFFF"}
          strokeWidth={STROKE}
          opacity={multiSeriesOpacity}
          points={mainPoints}
        />

        {comparisonPolylines}

        {safeData.map((element, index) => {
          const x = ((element.x - minX) / xDenom) * chartWidth + leftPadding;
          const rawY =
            chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
          const y = clamp(rawY, topPadding, chartHeight + topPadding);

          const isSelected =
            element.selectionIndex != null && selectedIndices?.has?.(element.selectionIndex);

          return (
            <circle
              key={index}
              className="lineChartDot"
              data-interactive="solve-point"
              cx={x}
              cy={y}
              r={isSelected ? selectedDotRadius : Math.max(2, dotRadius)}
              fill={element.isDNF ? "none" : element.color}
              opacity={multiSeriesOpacity}
              stroke={
                isSelected
                  ? "#2EC4B6"
                  : element.isDNF
                    ? "red"
                    : "none"
              }
              strokeWidth={isSelected ? 3 : element.isDNF ? 2 : 0}
              onMouseOver={(e) => handleMouseOver(e, element.time)}
              onMouseOut={handleMouseOut}
              onClick={(event) => onDotClick(event, element.solve, element.fullIndex, element)}
            />
          );
        })}

        {extraPolylines}

        {safeComparisonSeries.map((series) =>
          (series.points || []).map((element, index) => {
            if (!element || typeof element.y !== "number" || !isFinite(element.y)) return null;

            const x = ((element.x - minX) / xDenom) * chartWidth + leftPadding;
            const rawY =
              chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + topPadding;
            const y = clamp(rawY, topPadding, chartHeight + topPadding);

            return (
              <circle
                key={`${series.id}-${index}`}
                className="lineChartDot"
                data-interactive="solve-point"
                cx={x}
                cy={y}
                r={Math.max(2, dotRadius - 1)}
                fill={element.color || series.stroke || "#7c8cff"}
                opacity={multiSeriesOpacity}
                stroke="rgba(5,10,14,0.6)"
                strokeWidth={1}
                onMouseOver={(e) => handleMouseOver(e, `${series.label || "Compare"} · ${element.time}`)}
                onMouseOut={handleMouseOut}
                onClick={(event) => onDotClick(event, element.solve, element.fullIndex, element)}
              />
            );
          })
        )}
      </svg>

      {tooltip.visible && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            color: "white",
            padding: "6px 8px",
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 9999,
            fontSize: 12,
          }}
        >
          {tooltip.time}
        </div>
      )}
    </div>
  );
};

LineChartBuilder.defaultProps = {
  height: 200,
  width: 500,
  horizontalGuides: 4,
  verticalGuides: null,
  precision: 2,
  extraSeries: [],
  referenceLines: [],
  comparisonSeries: [],
  primaryStroke: "#00FFFF",
  selectedIndices: new Set(),
  dotRadius: 5,
  selectedDotRadius: 8,
  yMin: null,
  yMax: null,
  showAxes: true,
  showGuides: true,
  showAxisLabels: true,
};

LineChartBuilder.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
      label: PropTypes.string,
      color: PropTypes.string,
      time: PropTypes.string,
      solve: PropTypes.object,
      fullIndex: PropTypes.number,
      isDNF: PropTypes.bool,
      isBucket: PropTypes.bool,
      selectionIndex: PropTypes.number,
    })
  ).isRequired,

  extraSeries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      stroke: PropTypes.string.isRequired,
      points: PropTypes.arrayOf(
        PropTypes.shape({
          x: PropTypes.number.isRequired,
          y: PropTypes.number,
        })
      ).isRequired,
    })
  ),
  referenceLines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      y: PropTypes.number.isRequired,
      label: PropTypes.string,
      stroke: PropTypes.string,
      dashed: PropTypes.bool,
    })
  ),
  comparisonSeries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      stroke: PropTypes.string,
      points: PropTypes.arrayOf(PropTypes.object).isRequired,
    })
  ),
  primaryStroke: PropTypes.string,

  height: PropTypes.number,
  width: PropTypes.number,
  horizontalGuides: PropTypes.number,
  verticalGuides: PropTypes.number,
  precision: PropTypes.number,
  onDotClick: PropTypes.func.isRequired,
  selectedIndices: PropTypes.object,
  dotRadius: PropTypes.number,
  selectedDotRadius: PropTypes.number,
  yMin: PropTypes.number,
  yMax: PropTypes.number,
  showAxes: PropTypes.bool,
  showGuides: PropTypes.bool,
  showAxisLabels: PropTypes.bool,
};

export default LineChartBuilder;
