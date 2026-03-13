import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";

const STROKE = 1;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const LineChartBuilder = ({
  data,
  extraSeries,
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
}) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, time: "" });

  const FONT_SIZE = Math.max(10, Math.floor(width / 52));

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const safeComparisonSeries = useMemo(
    () => (Array.isArray(comparisonSeries) ? comparisonSeries : []),
    [comparisonSeries]
  );

  const {
    padding,
    chartWidth,
    chartHeight,
    minX,
    minimumYFromData,
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

    const digits = parseFloat(resolvedMaxY.toString()).toFixed(precision).length + 3;
    const yLabelRoom = digits * (FONT_SIZE * 0.62);

    const _padding = Math.ceil(Math.max(FONT_SIZE * 2.2, yLabelRoom)) + 10;

    return {
      padding: _padding,
      chartWidth: width - _padding * 2,
      chartHeight: height - _padding * 2,
      minX: _minX,
      maxX: _maxX,
      minimumYFromData: resolvedMinY,
      maximumYFromData: resolvedMaxY,
      yDenom: resolvedMaxY - resolvedMinY || 1,
      xDenom: (_maxX - _minX) || 1,
    };
  }, [safeComparisonSeries, safeData, width, height, FONT_SIZE, precision, yMin, yMax]);

  const mainPoints = useMemo(() => {
    if (!safeData.length) return "";
    return safeData
      .map((element) => {
        const x = ((element.x - minX) / xDenom) * chartWidth + padding;
        const rawY =
          chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + padding;
        const y = clamp(rawY, padding, chartHeight + padding);
        return `${x},${y}`;
      })
      .join(" ");
  }, [
    safeData,
    minX,
    xDenom,
    chartWidth,
    chartHeight,
    padding,
    minimumYFromData,
    yDenom,
  ]);

  const Axis = ({ points }) => <polyline fill="none" stroke="#ccc" strokeWidth=".7" points={points} />;
  const XAxis = () => <Axis points={`${padding},${height - padding} ${width - padding},${height - padding}`} />;
  const YAxis = () => <Axis points={`${padding},${padding} ${padding},${height - padding}`} />;

  const VerticalGuides = () => {
    const guideCount = numberOfVerticalGuides || Math.max(1, safeData.length - 1);
    const startY = padding;
    const endY = height - padding;
    return new Array(guideCount).fill(0).map((_, index) => {
      const ratio = (index + 1) / guideCount;
      const xCoordinate = padding + ratio * (width - padding * 2);
      return (
        <polyline
          key={index}
          fill="none"
          stroke="#c2c2c2"
          opacity=".2"
          strokeWidth=".7"
          points={`${xCoordinate},${startY} ${xCoordinate},${endY}`}
        />
      );
    });
  };

  const HorizontalGuides = () => {
    const startX = padding;
    const endX = width - padding;
    return new Array(numberOfHorizontalGuides).fill(0).map((_, index) => {
      const ratio = (index + 1) / numberOfHorizontalGuides;
      const yCoordinate = chartHeight - chartHeight * ratio + padding;
      return (
        <polyline
          key={index}
          fill="none"
          stroke="#c2c2c2"
          opacity=".2"
          strokeWidth=".7"
          points={`${startX},${yCoordinate} ${endX},${yCoordinate}`}
        />
      );
    });
  };

  const LabelsXAxis = () => {
    const y = height - padding + FONT_SIZE * 1.8;
    const n = safeData.length;
    const step = n <= 12 ? 1 : Math.ceil(n / 10);

    return safeData.map((element, index) => {
      if (index % step !== 0 && index !== n - 1) return null;

      const x = ((element.x - minX) / xDenom) * chartWidth + padding;
      return (
        <text
          key={index}
          x={x}
          y={y}
          textAnchor="middle"
          style={{ fill: "#808080", fontSize: FONT_SIZE, fontFamily: "Helvetica" }}
        >
          {element.label}
        </text>
      );
    });
  };

  const LabelsYAxis = () => {
    const PARTS = numberOfHorizontalGuides;
    return new Array(PARTS + 1).fill(0).map((_, index) => {
      const x = padding - FONT_SIZE * 0.8;
      const yCoordinate = chartHeight - chartHeight * (index / PARTS) + padding + FONT_SIZE / 3;
      return (
        <text
          key={index}
          x={x}
          y={yCoordinate}
          textAnchor="end"
          style={{ fill: "#808080", fontSize: FONT_SIZE, fontFamily: "Helvetica" }}
        >
          {(minimumYFromData + yDenom * (index / PARTS)).toFixed(1) + "s"}
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
        const x = ((p.x - minX) / xDenom) * chartWidth + padding;
        const rawY =
          chartHeight - ((p.y - minimumYFromData) / yDenom) * chartHeight + padding;
        const y = clamp(rawY, padding, chartHeight + padding);
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
        const x = ((point.x - minX) / xDenom) * chartWidth + padding;
        const rawY =
          chartHeight - ((point.y - minimumYFromData) / yDenom) * chartHeight + padding;
        const y = clamp(rawY, padding, chartHeight + padding);
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
        opacity={0.92}
        points={pts}
      />
    );
  });

  return (
    <div style={{ position: "relative", width: "100%", overflow: "visible" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <XAxis />
        <LabelsXAxis />
        <YAxis />
        <LabelsYAxis />

        {numberOfVerticalGuides && <VerticalGuides />}
        <HorizontalGuides />

        <polyline
          fill="none"
          stroke={primaryStroke || safeData[0]?.color || "#00FFFF"}
          strokeWidth={STROKE}
          points={mainPoints}
        />

        {comparisonPolylines}

        {safeData.map((element, index) => {
          const x = ((element.x - minX) / xDenom) * chartWidth + padding;
          const rawY =
            chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + padding;
          const y = clamp(rawY, padding, chartHeight + padding);

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

            const x = ((element.x - minX) / xDenom) * chartWidth + padding;
            const rawY =
              chartHeight - ((element.y - minimumYFromData) / yDenom) * chartHeight + padding;
            const y = clamp(rawY, padding, chartHeight + padding);

            return (
              <circle
                key={`${series.id}-${index}`}
                className="lineChartDot"
                data-interactive="solve-point"
                cx={x}
                cy={y}
                r={Math.max(2, dotRadius - 1)}
                fill={element.color || series.stroke || "#7c8cff"}
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
  comparisonSeries: [],
  primaryStroke: "#00FFFF",
  selectedIndices: new Set(),
  dotRadius: 5,
  selectedDotRadius: 8,
  yMin: null,
  yMax: null,
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
};

export default LineChartBuilder;
