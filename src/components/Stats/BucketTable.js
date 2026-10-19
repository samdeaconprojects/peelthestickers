import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

function BucketDayTooltip({ item, anchor, allEvents = false, competitions = [] }) {
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
  // Times pooled across different puzzles don't mean anything, so an
  // all-events day only shows its counts.
  const sd = allEvents ? null : stdDevMs(item);
  const timeRows = allEvents ? [] : TOOLTIP_TIME_FIELDS.filter(([, field]) => Number(item?.[field]) > 0);

  return (
    <div ref={ref} className="bucket-calendar-tooltip" style={{ left: pos.left, top: pos.top }} role="tooltip">
      <div className="bucket-calendar-tooltip-title">{formatBucketDay(item.BucketDay)}</div>
      {competitions.map((comp) => (
        <div key={comp.CompetitionID} className="bucket-calendar-tooltip-competition">
          <span className="bucket-competition-badge">WCA</span>
          {comp.Name || comp.CompetitionID}
        </div>
      ))}
      <div className="bucket-calendar-tooltip-headline">
        <span>{statCount(total)}</span> solves{allEvents ? " · all events" : ""}
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
      <div className="bucket-calendar-tooltip-hint">
        {competitions.length ? "Click for the competition or this day" : "Click to open this day"}
      </div>
    </div>
  );
}

BucketDayTooltip.propTypes = {
  item: PropTypes.object.isRequired,
  anchor: PropTypes.object,
  allEvents: PropTypes.bool,
  competitions: PropTypes.arrayOf(PropTypes.object),
};

const MAX_COMPETITION_SPAN_DAYS = 14;

// dayKey -> competitions held that day. A competition covers StartDay..EndDay.
function buildCompetitionsByDay(competitions) {
  const byDay = new Map();
  for (const comp of Array.isArray(competitions) ? competitions : []) {
    const start = String(comp?.StartDay || "").trim();
    const end = String(comp?.EndDay || start).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const cursor = new Date(`${start}T12:00:00`);
    for (let i = 0; i < MAX_COMPETITION_SPAN_DAYS; i += 1) {
      const key = dayKeyOf(cursor);
      if (key > end) break;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(comp);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return byDay;
}

function formatCompetitionDates(comp) {
  const start = String(comp?.StartDay || "");
  const end = String(comp?.EndDay || start);
  if (!start) return "";
  if (start === end) return formatBucketDay(start);
  return `${formatBucketDay(start)} – ${formatBucketDay(end)}`;
}

// Day buckets carry per-tag totals, so a competition day can say how many of
// its solves came from the competition and how many were ordinary sessions.
function competitionSolveCount(item) {
  const summaries = Array.isArray(item?.TagSummaries) ? item.TagSummaries : null;
  if (!summaries) return null;
  return summaries
    .filter((entry) => entry?.TagKey === "Competition")
    .reduce((sum, entry) => sum + (Number(entry?.SolveCountTotal) || 0), 0);
}

function CompetitionDayCard({ dayKey, item, competitions, anchor, onOpenCompetition, onOpenDay, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const box = el.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
    let top = anchor.bottom + margin;
    if (top + box.height > window.innerHeight - margin) top = anchor.top - box.height - margin;
    setPos({ left, top: Math.max(margin, top) });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);

  const total = Number(item?.SolveCountTotal) || 0;
  const fromCompetition = competitionSolveCount(item);
  const others = fromCompetition == null ? null : Math.max(0, total - fromCompetition);

  return (
    <div
      ref={ref}
      className="bucket-competition-card"
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-label={`${formatBucketDay(dayKey)} options`}
    >
      <div className="bucket-competition-card-day">{formatBucketDay(dayKey)}</div>
      {competitions.map((comp) => (
        <button
          key={comp.CompetitionID}
          type="button"
          className="bucket-competition-card-comp"
          onClick={() => onOpenCompetition(comp.CompetitionID)}
        >
          <span className="bucket-competition-badge">WCA</span>
          <span className="bucket-competition-card-comp-text">
            <strong>{comp.Name || comp.CompetitionID}</strong>
            <span>
              {[comp.City, formatCompetitionDates(comp)].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="bucket-competition-card-cta">All results ›</span>
        </button>
      ))}
      {item ? (
        <button type="button" className="bucket-competition-card-day-btn" onClick={() => onOpenDay(dayKey)}>
          <strong>All solves this day</strong>
          <span>
            {statCount(total)} solves
            {others != null && fromCompetition > 0
              ? ` · ${statCount(fromCompetition)} competition, ${statCount(others)} other`
              : ""}
          </span>
        </button>
      ) : (
        <div className="bucket-competition-card-note">No solves in this view on this day.</div>
      )}
    </div>
  );
}

CompetitionDayCard.propTypes = {
  dayKey: PropTypes.string.isRequired,
  item: PropTypes.object,
  competitions: PropTypes.arrayOf(PropTypes.object).isRequired,
  anchor: PropTypes.object,
  onOpenCompetition: PropTypes.func.isRequired,
  onOpenDay: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

// Squares grow to fill the width when only a few months are shown (a 2-week
// range gets big squares with day numbers); long ranges stay at the compact
// minimum so a full year still fits in a couple of rows.
const CAL_MIN_CELL = 16;
const CAL_MAX_CELL = 52;
const CAL_MONTH_GAP = 12;
const CAL_MONTH_CHROME = 22; // month card padding + border

function calendarGapFor(cell) {
  return Math.max(3, Math.round(cell * 0.15));
}

function calendarMonthWidth(cell) {
  return cell * 7 + calendarGapFor(cell) * 6 + CAL_MONTH_CHROME;
}

function calendarSizing(width, monthCount) {
  if (!(width > 0) || !(monthCount > 0)) {
    return { cell: CAL_MIN_CELL, gap: calendarGapFor(CAL_MIN_CELL), showDayNumbers: false };
  }
  const maxPerRow = Math.max(
    1,
    Math.floor((width + CAL_MONTH_GAP) / (calendarMonthWidth(CAL_MIN_CELL) + CAL_MONTH_GAP))
  );
  const perRow = Math.min(monthCount, maxPerRow);
  const monthWidth = (width - (perRow - 1) * CAL_MONTH_GAP) / perRow;
  let cell = CAL_MAX_CELL;
  while (cell > CAL_MIN_CELL && calendarMonthWidth(cell) > monthWidth) cell -= 1;
  return { cell, gap: calendarGapFor(cell), showDayNumbers: cell >= 30 };
}

function BucketCalendar({
  rows,
  metric,
  strengthStyle,
  profileColor,
  allEvents = false,
  selectedDay,
  competitionsByDay,
  onDayClick,
}) {
  const [hover, setHover] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeObserverRef = useRef(null);
  // Callback ref: the calendar node only mounts once there is data, so watch
  // it whenever it (re)appears rather than once on first render.
  const containerRef = useCallback((node) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) return;
    setContainerWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

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

  const sizing = calendarSizing(containerWidth, months.length);

  if (!scale) {
    return <div className="bucket-items-empty">No bucket data available for this range.</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`bucket-calendar${sizing.showDayNumbers ? " show-day-numbers" : ""}`}
      style={{ "--cal-cell": `${sizing.cell}px`, "--cal-gap": `${sizing.gap}px` }}
    >
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
                const dayCompetitions = competitionsByDay?.get(cell.key) || null;
                const competitionLabel = dayCompetitions
                  ? `, WCA: ${dayCompetitions.map((comp) => comp.Name || comp.CompetitionID).join(", ")}`
                  : "";
                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={`bucket-calendar-cell${cell.item ? " has-data" : ""}${dayCompetitions ? " has-competition" : ""}${isSelected ? " is-selected" : ""}`}
                    style={cellVars || undefined}
                    aria-label={`${formatBucketDay(cell.key)}${competitionLabel}`}
                    aria-pressed={isSelected}
                    disabled={!cell.item && !dayCompetitions}
                    onMouseEnter={(e) => {
                      if (cell.item) setHover({ item: cell.item, competitions: dayCompetitions || [], anchor: e.currentTarget.getBoundingClientRect() });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => {
                      if (cell.item) setHover({ item: cell.item, competitions: dayCompetitions || [], anchor: e.currentTarget.getBoundingClientRect() });
                    }}
                    onBlur={() => setHover(null)}
                    onClick={(e) => {
                      setHover(null);
                      onDayClick(cell.key, cell.item, e.currentTarget.getBoundingClientRect());
                    }}
                  >
                    {sizing.showDayNumbers ? <span className="bucket-calendar-day-number">{cell.day}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hover && (
        <BucketDayTooltip
          item={hover.item}
          anchor={hover.anchor}
          allEvents={allEvents}
          competitions={hover.competitions}
        />
      )}

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
  allEvents: PropTypes.bool,
  selectedDay: PropTypes.string,
  competitionsByDay: PropTypes.instanceOf(Map),
  onDayClick: PropTypes.func.isRequired,
};

function BucketTable({
  bucketItems = [],
  profileColor = "#2EC4B6",
  selectedDay = "",
  onBucketSelect = null,
  competitions = [],
  onCompetitionOpen = null,
}) {
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

  // All-events day buckets pool every puzzle together, so only the total
  // solve count is meaningful: shade by count and hide the mean-based modes.
  const isAllEventsScope =
    rows.length > 0 && rows.every((item) => item.Scope === "ALL" || !item.Event);
  const calendarMetric = isAllEventsScope ? "count" : metric;

  const competitionsByDay = useMemo(
    () => (typeof onCompetitionOpen === "function" ? buildCompetitionsByDay(competitions) : new Map()),
    [competitions, onCompetitionOpen]
  );
  // A competition day can also hold ordinary solves, so clicking it asks
  // which one to open instead of guessing.
  const [dayCard, setDayCard] = useState(null);
  const closeDayCard = useCallback(() => setDayCard(null), []);
  const handleDayClick = useCallback(
    (dayKey, item, anchor) => {
      const dayCompetitions = competitionsByDay.get(dayKey);
      if (dayCompetitions?.length) {
        setDayCard({ dayKey, item, competitions: dayCompetitions, anchor });
        return;
      }
      if (item && typeof onBucketSelect === "function") onBucketSelect(dayKey);
    },
    [competitionsByDay, onBucketSelect]
  );

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
          {view === "calendar" && !isAllEventsScope && (
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
          metric={calendarMetric}
          allEvents={isAllEventsScope}
          strengthStyle={strengthStyle}
          profileColor={profileColor || "#2EC4B6"}
          selectedDay={selectedDay}
          competitionsByDay={competitionsByDay}
          onDayClick={handleDayClick}
        />
      ) : (
      <div className="time-items-view bucket-items-view">
        {rows.map((item) => {
          const dayKey = String(item?.BucketDay || "").trim();
          const isSelected = !!selectedDay && dayKey === selectedDay;
          const dayCompetitions = competitionsByDay.get(dayKey);

          return (
            <button
              type="button"
              key={`${item.Event || "ALL"}-${item.SessionID || "ALL"}-${item.BucketDay}`}
              className="time-items-row bucket-items-row"
              aria-pressed={isSelected}
              onClick={(e) => {
                if (dayKey) handleDayClick(dayKey, item, e.currentTarget.getBoundingClientRect());
              }}
              style={isSelected ? {
                outline: "2px solid rgba(46,196,182,0.95)",
                outlineOffset: "-2px",
                boxShadow: "0 0 0 3px rgba(46,196,182,0.18)",
              } : undefined}
            >
              <div className="time-items-rank bucket-items-rank">
                {formatBucketDay(item.BucketDay)}
                {dayCompetitions?.map((comp) => (
                  <span key={comp.CompetitionID} className="bucket-items-competition">
                    <span className="bucket-competition-badge">WCA</span>
                    {comp.Name || comp.CompetitionID}
                  </span>
                ))}
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

      {dayCard && (
        <CompetitionDayCard
          dayKey={dayCard.dayKey}
          item={dayCard.item}
          competitions={dayCard.competitions}
          anchor={dayCard.anchor}
          onClose={closeDayCard}
          onOpenCompetition={(competitionID) => {
            setDayCard(null);
            onCompetitionOpen(competitionID);
          }}
          onOpenDay={(dayKey) => {
            setDayCard(null);
            if (typeof onBucketSelect === "function") onBucketSelect(dayKey);
          }}
        />
      )}
    </div>
  );
}

BucketTable.propTypes = {
  bucketItems: PropTypes.arrayOf(PropTypes.object),
  profileColor: PropTypes.string,
  selectedDay: PropTypes.string,
  onBucketSelect: PropTypes.func,
  competitions: PropTypes.arrayOf(PropTypes.object),
  onCompetitionOpen: PropTypes.func,
};

export default React.memo(BucketTable);
