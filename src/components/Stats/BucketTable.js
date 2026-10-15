import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
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

const VIEW_STORAGE_KEY = "pts.bucketTable.view.v2";
const METRIC_STORAGE_KEY = "pts.bucketTable.calendarMetric.v2";
const STRENGTH_STORAGE_KEY = "pts.bucketTable.calendarStrength";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function readStored(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; the choice just won't persist.
  }
}

function dayKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Rank-based 0..1 scale so a single huge day (or a slow outlier) doesn't
// flatten every other square into the same shade.
function buildPercentile(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return () => null;
  if (sorted.length === 1) return (v) => (Number.isFinite(v) ? 1 : null);
  return (v) => {
    if (!Number.isFinite(v)) return null;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    let end = lo;
    while (end < sorted.length && sorted[end] === v) end += 1;
    return ((lo + end - 1) / 2) / (sorted.length - 1);
  };
}

// Squares keep their full color (profile color, or the time list's green ->
// red best/worst hue at 100% sat / 55% light) and never get darkened, so the
// hue stays pure. Strength (t: 0 = weakest, 1 = strongest) shows as how solid
// the square is: a full-color outline with an inner fill that grows from a
// small dot to the whole square, plus a light opacity dip. Hover / selection
// shows the square solid at full opacity.
// Two ways to show strength, picked in the calendar toolbar:
//   "fill": outline + inner fill from a tiny dot to solid, light opacity dip.
//   "fade": always solid, opacity alone carries strength (more contrast, but
//           low-alpha yellows/oranges read darker over the card).
const CELL_STRENGTH_STYLES = {
  fill: { minFill: 0.15, minAlpha: 0.75 },
  fade: { minFill: 1, minAlpha: 0.3 },
};

function cellVars(color, t, strengthStyle = "fill") {
  const { minFill, minAlpha } = CELL_STRENGTH_STYLES[strengthStyle] || CELL_STRENGTH_STYLES.fill;
  const strength = t ?? 0.5;
  const fill = minFill + (1 - minFill) * strength;
  return {
    "--cell-color": color,
    "--cell-fill": `${Math.round(fill * 100)}%`,
    "--cell-alpha": minAlpha + (1 - minAlpha) * strength,
  };
}

function timeListHue(meanPct) {
  return `hsl(${Math.round(120 * (1 - (meanPct ?? 0.5)))}, 100%, 55%)`;
}

// Count / Mean: profile color, more solves or faster mean = more solid.
// Both: hue from mean, solidness from solve count.
function cellStyle(metric, countPct, meanPct, profileColor, strengthStyle) {
  if (metric === "count") return countPct == null ? null : cellVars(profileColor, countPct, strengthStyle);
  if (metric === "mean") return meanPct == null ? null : cellVars(profileColor, 1 - meanPct, strengthStyle);
  if (countPct == null && meanPct == null) return null;
  return cellVars(timeListHue(meanPct), countPct, strengthStyle);
}

function LegendSquares({ color, strengthStyle }) {
  return (
    <span className="bucket-calendar-legend-squares" aria-hidden="true">
      {[0, 0.33, 0.66, 1].map((t) => (
        <span key={t} className="bucket-calendar-legend-square" style={cellVars(color, t, strengthStyle)} />
      ))}
    </span>
  );
}

LegendSquares.propTypes = {
  color: PropTypes.string.isRequired,
  strengthStyle: PropTypes.oneOf(["fill", "fade"]).isRequired,
};

const TOOLTIP_TIME_FIELDS = [
  ["Mean", "MeanMs"],
  ["Median", "MedianMs"],
  ["Best", "BestSingleMs"],
  ["Worst", "WorstSingleMs"],
  ["Mo3", "BestMo3Ms"],
  ["Ao5", "BestAo5Ms"],
  ["Ao12", "BestAo12Ms"],
  ["Ao25", "BestAo25Ms"],
  ["Ao50", "BestAo50Ms"],
  ["Ao100", "BestAo100Ms"],
  ["Ao1000", "BestAo1000Ms"],
  ["Worst Ao5", "WorstAo5Ms"],
  ["Worst Ao12", "WorstAo12Ms"],
];

function stdDevMs(item) {
  const n = Number(item?.SolveCountIncluded);
  const sum = Number(item?.SumFinalTimeMs);
  const sumSq = Number(item?.SumFinalTimeSqMs);
  if (!(n > 1) || !Number.isFinite(sum) || !Number.isFinite(sumSq)) return null;
  const variance = (sumSq - (sum * sum) / n) / (n - 1);
  return variance > 0 ? Math.sqrt(variance) : null;
}

function BucketDayTooltip({ item, anchor }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const box = el.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
    let top = anchor.top - box.height - margin;
    if (top < margin) top = anchor.bottom + margin;
    setPos({ left, top });
  }, [anchor, item]);

  const total = Number(item?.SolveCountTotal);
  const included = Number(item?.SolveCountIncluded);
  const sd = stdDevMs(item);
  const timeRows = TOOLTIP_TIME_FIELDS.filter(([, field]) => Number(item?.[field]) > 0);

  return (
    <div ref={ref} className="bucket-calendar-tooltip" style={{ left: pos.left, top: pos.top }} role="tooltip">
      <div className="bucket-calendar-tooltip-title">{formatBucketDay(item.BucketDay)}</div>
      <div className="bucket-calendar-tooltip-headline">
        <span>{statCount(total)}</span> solves
        {Number.isFinite(included) && included !== total && (
          <em> ({statCount(included)} counted)</em>
        )}
      </div>
      <div className="bucket-calendar-tooltip-grid">
        {timeRows.map(([label, field]) => (
          <React.Fragment key={field}>
            <span>{label}</span>
            <strong>{statTime(item[field])}</strong>
          </React.Fragment>
        ))}
        {sd != null && (
          <>
            <span>Std dev</span>
            <strong>{statTime(sd)}</strong>
          </>
        )}
        <span>DNF</span>
        <strong>{statCount(item.DNFCount ?? 0)}</strong>
        <span>+2</span>
        <strong>{statCount(item.Plus2Count ?? 0)}</strong>
      </div>
      <div className="bucket-calendar-tooltip-hint">Click to open this day</div>
    </div>
  );
}

BucketDayTooltip.propTypes = {
  item: PropTypes.object.isRequired,
  anchor: PropTypes.object,
};

function BucketCalendar({ rows, metric, strengthStyle, profileColor, selectedDay, onBucketSelect }) {
  const [hover, setHover] = useState(null);

  const { months, scale } = useMemo(() => {
    const byDay = new Map();
    for (const item of rows) {
      const key = String(item?.BucketDay || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) byDay.set(key, item);
    }
    const keys = [...byDay.keys()].sort();
    if (keys.length === 0) return { months: [], scale: null };

    const countPct = buildPercentile(
      [...byDay.values()].map((item) => Number(item.SolveCountTotal)).filter((n) => n > 0)
    );
    const meanPct = buildPercentile(
      [...byDay.values()].map((item) => Number(item.MeanMs)).filter((n) => n > 0)
    );

    const first = new Date(`${keys[0]}T12:00:00`);
    const last = new Date(`${keys[keys.length - 1]}T12:00:00`);
    const out = [];
    let cursor = new Date(last.getFullYear(), last.getMonth(), 1, 12);
    const stop = new Date(first.getFullYear(), first.getMonth(), 1, 12);
    while (cursor >= stop) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < cursor.getDay(); i += 1) cells.push(null);
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = dayKeyOf(new Date(year, month, d, 12));
        const item = byDay.get(key) || null;
        const count = Number(item?.SolveCountTotal);
        const mean = Number(item?.MeanMs);
        cells.push({
          key,
          day: d,
          item,
          countPct: item && count > 0 ? countPct(count) : null,
          meanPct: item && mean > 0 ? meanPct(mean) : null,
        });
      }
      out.push({
        key: `${year}-${month}`,
        label: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        cells,
      });
      cursor = new Date(year, month - 1, 1, 12);
    }
    return { months: out, scale: true };
  }, [rows]);

  if (!scale) {
    return <div className="bucket-items-empty">No bucket data available for this range.</div>;
  }

  return (
    <div className="bucket-calendar">
      <div className="bucket-calendar-months">
        {months.map((month) => (
          <div key={month.key} className="bucket-calendar-month">
            <div className="bucket-calendar-month-label">{month.label}</div>
            <div className="bucket-calendar-grid">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={`wd-${i}`} className="bucket-calendar-weekday">{label}</div>
              ))}
              {month.cells.map((cell, i) => {
                if (!cell) return <div key={`pad-${i}`} className="bucket-calendar-pad" />;
                const cellVars = cell.item ? cellStyle(metric, cell.countPct, cell.meanPct, profileColor, strengthStyle) : null;
                const isSelected = !!selectedDay && cell.key === selectedDay;
                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={`bucket-calendar-cell${cell.item ? " has-data" : ""}${isSelected ? " is-selected" : ""}`}
                    style={cellVars || undefined}
                    aria-label={formatBucketDay(cell.key)}
                    aria-pressed={isSelected}
                    disabled={!cell.item}
                    onMouseEnter={(e) => {
                      if (cell.item) setHover({ item: cell.item, anchor: e.currentTarget.getBoundingClientRect() });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => {
                      if (cell.item) setHover({ item: cell.item, anchor: e.currentTarget.getBoundingClientRect() });
                    }}
                    onBlur={() => setHover(null)}
                    onClick={() => {
                      setHover(null);
                      if (typeof onBucketSelect === "function") onBucketSelect(cell.key);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hover && <BucketDayTooltip item={hover.item} anchor={hover.anchor} />}

      <div className="bucket-calendar-legend">
        {metric === "both" ? (
          <>
            <span className="bucket-calendar-legend-label">Mean</span>
            <span>slow</span>
            <span className="bucket-calendar-legend-bar" style={{ background: "linear-gradient(90deg, hsl(0,100%,55%), hsl(30,100%,55%), hsl(60,100%,55%), hsl(120,100%,55%))" }} />
            <span>fast</span>
            <span className="bucket-calendar-legend-gap" />
            <span className="bucket-calendar-legend-label">Count</span>
            <span>few</span>
            <LegendSquares color="hsl(120, 100%, 55%)" strengthStyle={strengthStyle} />
            <span>many</span>
          </>
        ) : (
          <>
            <span className="bucket-calendar-legend-label">{metric === "mean" ? "Mean" : "Solves"}</span>
            <span>{metric === "mean" ? "slow" : "few"}</span>
            <LegendSquares color={profileColor} strengthStyle={strengthStyle} />
            <span>{metric === "mean" ? "fast" : "many"}</span>
          </>
        )}
      </div>
    </div>
  );
}

BucketCalendar.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  metric: PropTypes.oneOf(["count", "mean", "both"]).isRequired,
  strengthStyle: PropTypes.oneOf(["fill", "fade"]).isRequired,
  profileColor: PropTypes.string.isRequired,
  selectedDay: PropTypes.string,
  onBucketSelect: PropTypes.func,
};

function BucketTable({ bucketItems = [], profileColor = "#2EC4B6", selectedDay = "", onBucketSelect = null }) {
  const [limit, setLimit] = useState("all");
  const [view, setViewState] = useState(() => readStored(VIEW_STORAGE_KEY, ["list", "calendar"], "calendar"));
  const [metric, setMetricState] = useState(() =>
    readStored(METRIC_STORAGE_KEY, ["count", "mean", "both"], "both")
  );
  const [strengthStyle, setStrengthStyleState] = useState(() =>
    readStored(STRENGTH_STORAGE_KEY, ["fill", "fade"], "fill")
  );
  const setStrengthStyle = (next) => {
    setStrengthStyleState(next);
    writeStored(STRENGTH_STORAGE_KEY, next);
  };
  const setView = (next) => {
    setViewState(next);
    writeStored(VIEW_STORAGE_KEY, next);
  };
  const setMetric = (next) => {
    setMetricState(next);
    writeStored(METRIC_STORAGE_KEY, next);
  };

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
          <div className="bucket-table-segment" role="group" aria-label="Bucket view">
            {[["list", "List"], ["calendar", "Calendar"]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`time-table-toggle${view === value ? " active" : ""}`}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "calendar" && (
            <div className="bucket-table-segment" role="group" aria-label="Calendar shading">
              {[["count", "Count"], ["mean", "Mean"], ["both", "Both"]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`time-table-toggle${metric === value ? " active" : ""}`}
                  aria-pressed={metric === value}
                  onClick={() => setMetric(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {view === "calendar" && (
            <div className="bucket-table-segment" role="group" aria-label="Calendar strength style">
              {[
                ["fill", "Fill", "Fuller square = more"],
                ["fade", "Fade", "More opaque = more"],
              ].map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  className={`time-table-toggle${strengthStyle === value ? " active" : ""}`}
                  aria-pressed={strengthStyle === value}
                  title={title}
                  onClick={() => setStrengthStyle(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
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

      {view === "calendar" ? (
        <BucketCalendar
          rows={rows}
          metric={metric}
          strengthStyle={strengthStyle}
          profileColor={profileColor || "#2EC4B6"}
          selectedDay={selectedDay}
          onBucketSelect={onBucketSelect}
        />
      ) : (
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
      )}
    </div>
  );
}

BucketTable.propTypes = {
  bucketItems: PropTypes.arrayOf(PropTypes.object),
  profileColor: PropTypes.string,
  selectedDay: PropTypes.string,
  onBucketSelect: PropTypes.func,
};

export default React.memo(BucketTable);
