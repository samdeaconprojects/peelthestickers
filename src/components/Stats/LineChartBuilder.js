import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";

const STROKE = 1;

const LineChartBuilder = ({
  data,
  extraSeries,
  height,
  width,
  horizontalGuides: numberOfHorizontalGuides,
  verticalGuides: numberOfVerticalGuides,
  precision,
  onDotClick,
}) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, time: "" });

  const FONT_SIZE = Math.max(10, Math.floor(width / 52));

  const safeData = Array.isArray(data) ? data : [];

  const { padding, chartWidth, chartHeight, minX, maxX, maximumYFromData, xDenom } = useMemo(() => {
    const xs = safeData.map((e) => e.x);
    const ys = safeData.map((e) => e.y).filter((v) => typeof v === "number" && isFinite(v));

    const _maxX = xs.length ? Math.max(...xs) : 1;
    const _minX = xs.length ? Math.min(...xs) : 0;

    const _maxY = ys.length ? Math.max(...ys) : 1;

    const maxYRounded = Math.ceil(_maxY / 10) * 10 || 1;
    const digits = parseFloat(maxYRounded.toString()).toFixed(precision).length + 3; // include "s"
    const yLabelRoom = digits * (FONT_SIZE * 0.62);

    // More bottom space so X labels are visible
    const _padding = Math.ceil(Math.max(FONT_SIZE * 2.2, yLabelRoom)) + 10;

    return {
      padding: _padding,
      chartWidth: width - _padding * 2,
      chartHeight: height - _padding * 2,
      minX: _minX,
      maxX: _maxX,
      maximumYFromData: maxYRounded,
      xDenom: (_maxX - _minX) || 1,
    };
  }, [safeData, width, height, FONT_SIZE, precision]);

  const mainPoints = useMemo(() => {
    if (!safeData.length) return "";
    return safeData
      .map((element) => {
        const x = ((element.x - minX) / xDenom) * chartWidth + padding;
        const y = chartHeight - (element.y / maximumYFromData) * chartHeight + padding;
        return `${x},${y}`;
      })
      .join(" ");
  }, [safeData, minX, xDenom, chartWidth, chartHeight, padding, maximumYFromData]);

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

  // Thin X labels if there are many points (prevents overlap + clipping)
  const LabelsXAxis = () => {
    const y = height - padding + FONT_SIZE * 1.8;
    const n = safeData.length;

    // show at most ~10 labels
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
          {(maximumYFromData * (index / PARTS)).toFixed(1) + "s"}
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
        const y = chartHeight - (p.y / maximumYFromData) * chartHeight + padding;
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

  return (
    <div style={{ position: "relative", width: "100%", overflow: "visible" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <XAxis />
        <LabelsXAxis />
        <YAxis />
        <LabelsYAxis />

        {numberOfVerticalGuides && <VerticalGuides />}
        <HorizontalGuides />

        {/* main line */}
        <polyline fill="none" stroke="#00FFFF" strokeWidth={STROKE} points={mainPoints} />

        {/* overlays (Ao5 / Ao12) */}
        {extraPolylines}

        {/* dots */}
        {safeData.map((element, index) => {
          const x = ((element.x - minX) / xDenom) * chartWidth + padding;
          const y = chartHeight - (element.y / maximumYFromData) * chartHeight + padding;

          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={element.isDNF ? 6 : 5}
              fill={element.isDNF ? "none" : element.color}
              stroke={element.isDNF ? "red" : "none"}
              strokeWidth={element.isDNF ? 2 : 0}
              onMouseOver={(e) => handleMouseOver(e, element.time)}
              onMouseOut={handleMouseOut}
              onClick={() => onDotClick(element.solve, element.fullIndex)}
            />
          );
        })}
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
          y: PropTypes.number, // allow nulls; we filter them out
        })
      ).isRequired,
    })
  ),

  height: PropTypes.number,
  width: PropTypes.number,
  horizontalGuides: PropTypes.number,
  verticalGuides: PropTypes.number,
  precision: PropTypes.number,
  onDotClick: PropTypes.func.isRequired,
};

export default LineChartBuilder;
