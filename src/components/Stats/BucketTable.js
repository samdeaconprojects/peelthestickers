import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { formatTime } from "../TimeList/TimeUtils";
import "./TimeTable.css";

function formatBucketDay(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dayKey || "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statTime(value) {
  return Number.isFinite(Number(value)) ? formatTime(Number(value)) : "—";
}

function statCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
}

function BucketTable({ bucketItems = [], selectedDay = "", onBucketSelect = null }) {
  const [limit, setLimit] = useState("100");

  const rows = useMemo(() => {
    const items = (Array.isArray(bucketItems) ? bucketItems : [])
      .filter((item) => item && item.BucketDay)
      .sort((a, b) => String(b.BucketDay).localeCompare(String(a.BucketDay)));

    if (limit === "all") return items;
    const n = Math.max(1, Number(limit || 0));
    return items.slice(0, n);
  }, [bucketItems, limit]);

  return (
    <div className="time-table-container bucket-table-container">
      <div className="time-table-toolbar bucket-table-toolbar">
        <div className="time-table-toolbar-group">
          <div className="bucket-table-summary">
            <span className="bucket-table-summary-label">Aggregated Days</span>
            <span className="bucket-table-summary-value">{rows.length}</span>
          </div>
        </div>
        <div className="time-table-toolbar-group">
          <label className="bucket-table-control">
            <span className="bucket-table-control-label">Rows</span>
            <select
              className="time-table-toggle bucket-table-select"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            >
              <option value="30">30</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
      </div>

      <div className="time-items-view bucket-items-view">
        {rows.map((item) => {
          const dayKey = String(item?.BucketDay || "").trim();
          const isSelected = !!selectedDay && dayKey === selectedDay;

          return (
            <button
              type="button"
              key={`${item.Event || "ALL"}-${item.SessionID || "ALL"}-${item.BucketDay}`}
              className="time-items-row bucket-items-row"
              aria-pressed={isSelected}
              onClick={() => {
                if (typeof onBucketSelect === "function" && dayKey) onBucketSelect(dayKey);
              }}
              style={isSelected ? {
                outline: "2px solid rgba(46,196,182,0.95)",
                outlineOffset: "-2px",
                boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
              } : undefined}
            >
              <div className="time-items-rank bucket-items-rank">
                {formatBucketDay(item.BucketDay)}
              </div>

              <div className="time-items-main bucket-items-main">
                <div className="bucket-items-primary">
                  <div className="bucket-items-primary-label">Solve Count</div>
                  <div className="bucket-items-primary-value">
                    {statCount(item.SolveCountTotal)}
                  </div>
                </div>

                <div className="bucket-items-stats">
                  <div className="bucket-items-stat">
                    <span className="bucket-items-stat-label">Mean</span>
                    <span className="bucket-items-stat-value">{statTime(item.MeanMs)}</span>
                  </div>
                  <div className="bucket-items-stat">
                    <span className="bucket-items-stat-label">Best</span>
                    <span className="bucket-items-stat-value">{statTime(item.BestSingleMs)}</span>
                  </div>
                  <div className="bucket-items-stat">
                    <span className="bucket-items-stat-label">MO3</span>
                    <span className="bucket-items-stat-value">{statTime(item.BestMo3Ms)}</span>
                  </div>
                  <div className="bucket-items-stat">
                    <span className="bucket-items-stat-label">AO5</span>
                    <span className="bucket-items-stat-value">{statTime(item.BestAo5Ms)}</span>
                  </div>
                  <div className="bucket-items-stat">
                    <span className="bucket-items-stat-label">AO12</span>
                    <span className="bucket-items-stat-value">{statTime(item.BestAo12Ms)}</span>
                  </div>
                  <div className="bucket-items-stat bucket-items-stat--count">
                    <span className="bucket-items-stat-label">DNF</span>
                    <span className="bucket-items-stat-value">{statCount(item.DNFCount)}</span>
                  </div>
                  <div className="bucket-items-stat bucket-items-stat--count">
                    <span className="bucket-items-stat-label">+2</span>
                    <span className="bucket-items-stat-value">{statCount(item.Plus2Count)}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {rows.length === 0 && (
          <div className="time-items-row bucket-items-row bucket-items-row--empty">
            <div className="bucket-items-empty">No bucket data available for this range.</div>
          </div>
        )}
      </div>
    </div>
  );
}

BucketTable.propTypes = {
  bucketItems: PropTypes.arrayOf(PropTypes.object),
  selectedDay: PropTypes.string,
  onBucketSelect: PropTypes.func,
};

export default React.memo(BucketTable);
