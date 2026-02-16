import React, { useState } from "react";
import PropTypes from "prop-types";

const STROKE = 1;

const LineChartBuilder = ({
  data,
  height,
  width,
  horizontalGuides: numberOfHorizontalGuides,
  verticalGuides: numberOfVerticalGuides,
  precision,
  useDateMode,
  onDotClick
}) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, time: '' });

  const FONT_SIZE = width / 50;

  const maxX = Math.max(...data.map(e => e.x));
  const minX = Math.min(...data.map(e => e.x));
  const maxY = Math.max(...data.map(e => e.y));

  const maximumYFromData = Math.ceil(maxY / 10) * 10;

  const digits = parseFloat(maximumYFromData.toString()).toFixed(precision).length + 1;
  const padding = (FONT_SIZE + digits) * 3;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // ✅ prevent division by zero when only 1 point
  const xDenom = (maxX - minX) || 1;

  const points = data
    .map(element => {
      const x = ((element.x - minX) / xDenom) * chartWidth + padding;
      const y = chartHeight - (element.y / maximumYFromData) * chartHeight + padding;
      return `${x},${y}`;
    })
    .join(" ");

  const Axis = ({ points }) => (
    <polyline fill="none" stroke="#ccc" strokeWidth=".5" points={points} />
  );

  const XAxis = () => (
    <Axis points={`${padding},${height - padding} ${width - padding},${height - padding}`} />
  );

  const YAxis = () => (
    <Axis points={`${padding},${padding} ${padding},${height - padding}`} />
  );

  const VerticalGuides = () => {
    const guideCount = numberOfVerticalGuides || data.length - 1;
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
          opacity={".2"}
          strokeWidth=".5"
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
          opacity={".2"}
          strokeWidth=".5"
          points={`${startX},${yCoordinate} ${endX},${yCoordinate}`}
        />
      );
    });
  };

  const LabelsXAxis = () => {
    const y = height - padding + FONT_SIZE * 2;
    return data.map((element, index) => {
      const x = ((element.x - minX) / xDenom) * chartWidth + padding - FONT_SIZE / 2;
      return (
        <text
          key={index}
          x={x}
          y={y}
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
      const x = FONT_SIZE;
      const yCoordinate = chartHeight - chartHeight * (index / PARTS) + padding + FONT_SIZE / 2;
      return (
        <text
          key={index}
          x={x}
          y={yCoordinate}
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

  const handleMouseOut = () => {
    setTooltip({ visible: false, x: 0, y: 0, time: '' });
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`}>
        <XAxis />
        <LabelsXAxis />
        <YAxis />
        <LabelsYAxis />
        {numberOfVerticalGuides && <VerticalGuides />}
        <HorizontalGuides />

        <polyline
          fill="none"
          stroke="#00FFFF"
          strokeWidth={STROKE}
          points={points}
        />

        {data.map((element, index) => {
          const x = ((element.x - minX) / xDenom) * chartWidth + padding;
          const y = chartHeight - (element.y / maximumYFromData) * chartHeight + padding;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={element.isDNF ? 6 : 5}
              fill={element.isDNF ? 'none' : element.color}
              stroke={element.isDNF ? 'red' : 'none'}
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
            position: 'absolute',
            left: tooltip.x - 100,
            top: tooltip.y - 100,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            padding: '5px',
            borderRadius: '5px',
            pointerEvents: 'none'
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
  precision: 2
};

LineChartBuilder.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number,
      label: PropTypes.string,
      color: PropTypes.string,
      time: PropTypes.string,
      solve: PropTypes.object,
      solveIndex: PropTypes.number
    })
  ).isRequired,
  height: PropTypes.number,
  width: PropTypes.number,
  horizontalGuides: PropTypes.number,
  verticalGuides: PropTypes.number,
  precision: PropTypes.number,
  useDateMode: PropTypes.bool,
  onDotClick: PropTypes.func.isRequired
};

export default LineChartBuilder;
