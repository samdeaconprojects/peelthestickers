import React from "react";

function SharedStatCard({ statShare, detailed = false }) {
  const kind = statShare?.kind || "summary";
  const snapshot = statShare?.snapshot || {};
  const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
  const buckets = Array.isArray(snapshot.buckets) ? snapshot.buckets : [];
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const points = Array.isArray(snapshot.points) ? snapshot.points : [];
  const detailLines = Array.isArray(statShare?.detailLines)
    ? statShare.detailLines.filter(Boolean)
    : [];

  const pointValues = points
    .map((point) => (typeof point === "number" ? point : point?.value))
    .filter((value) => Number.isFinite(value));
  const maxPoint = pointValues.length ? Math.max(...pointValues, 1) : 1;
  const minPoint = pointValues.length ? Math.min(...pointValues, 0) : 0;
  const pointSpan = Math.max(1, maxPoint - minPoint);
  const linePath = points
    .map((point, index) => {
      const value = typeof point === "number" ? point : point?.value;
      if (!Number.isFinite(value)) return null;
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 100 - (((value - minPoint) / pointSpan) * 100);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .filter(Boolean)
    .join(" ");

  const maxBucket = buckets.length ? Math.max(...buckets.map((bucket) => bucket.count || 0), 1) : 1;

  return (
    <div className={`sharedStatCard sharedStatCard--${kind} ${detailed ? "is-detailed" : ""}`}>
      <div className="sharedStatHead">
        <div>
          <div className="sharedStatTitle">{statShare?.title || "Shared Stat"}</div>
          <div className="sharedStatContext">{statShare?.contextLabel || "Stats snapshot"}</div>
        </div>
        <div className="sharedStatHighlight">{statShare?.highlightValue || "Snapshot"}</div>
      </div>

      {detailLines.length > 0 ? (
        <div className="sharedStatDetails">
          {detailLines.map((line, index) => (
            <span key={index} className="sharedStatDetailPill">
              {line}
            </span>
          ))}
        </div>
      ) : null}

      {kind === "line" ? (
        <div className="sharedStatViz sharedStatViz--line">
          <svg viewBox="0 0 100 100" className="sharedStatLineSvg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sharedStatLineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#2ec4b6" />
                <stop offset="100%" stopColor="#5ab2ff" />
              </linearGradient>
            </defs>
            <path d={linePath || "M 0 100"} fill="none" stroke="url(#sharedStatLineGradient)" strokeWidth="3" />
          </svg>
          <div className="sharedStatLineLabels">
            <span>{points[0]?.label || ""}</span>
            <span>{points[points.length - 1]?.label || ""}</span>
          </div>
        </div>
      ) : null}

      {(kind === "distribution" || kind === "bar") ? (
        <div className="sharedStatViz sharedStatViz--bars">
          {buckets.map((bucket, index) => (
            <div key={index} className="sharedStatBarSlot">
              <div
                className="sharedStatBar"
                style={{ height: `${((bucket.count || 0) / maxBucket) * 100}%` }}
              />
              <div className="sharedStatBarLabel" title={bucket.label || ""}>
                {bucket.label || ""}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {kind === "table" ? (
        <div className="sharedStatViz sharedStatViz--table">
          {items.map((item, index) => (
            <div key={index} className="sharedStatTableCell">
              <div className="sharedStatTableLabel">{item?.label || `Item ${index + 1}`}</div>
              <div>{item?.value == null ? "—" : item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {kind === "summary" ? (
        <div className="sharedStatViz sharedStatViz--summary">
          {metrics.map((metric, index) => (
            <div key={index} className="sharedStatMetric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default SharedStatCard;
