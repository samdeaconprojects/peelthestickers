import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import StatFocusModal from "../Stats/StatFocusModal";
import TimeTable from "../Stats/TimeTable";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { currentEventToString } from "../scrambleUtils";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import "./AverageDetailModal.css";

function getSolvePenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
}

function getSolveValue(solve) {
  if (getSolvePenalty(solve) === "DNF") return "DNF";

  const time = Number(
    solve?.time ??
      solve?.finalTimeMs ??
      solve?.FinalTimeMs ??
      solve?.rawTimeMs ??
      solve?.RawTimeMs
  );

  return Number.isFinite(time) ? time : "DNF";
}

function getSolveDateTime(solve) {
  return solve?.datetime || solve?.createdAt || solve?.CreatedAt || solve?.DateTime || null;
}

function getSolveEvent(solve) {
  return solve?.event || solve?.Event || "333";
}

function getSolveScramble(solve) {
  return solve?.scramble || solve?.Scramble || "";
}

function parseValidDate(dateLike) {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameCalendarDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateOnly(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSolveRangeLabel(items) {
  if (!Array.isArray(items) || !items.length) return null;

  const dates = items
    .map(getSolveDateTime)
    .map(parseValidDate)
    .filter(Boolean);

  if (!dates.length) return null;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (isSameCalendarDay(first, last)) {
    const dateLabel = formatDateOnly(first);

    if (first.getTime() === last.getTime()) {
      return `${dateLabel} · ${formatTimeOnly(first)}`;
    }

    return `${dateLabel} · ${formatTimeOnly(first)} – ${formatTimeOnly(last)}`;
  }

  return `${formatDateOnly(first)} – ${formatDateOnly(last)}`;
}

function AverageDetailModal({ isOpen, title, subtitle, solves, onClose, onSolveOpen }) {
  const [displayMode, setDisplayMode] = useState("items");

  const detail = useMemo(() => {
    const items = Array.isArray(solves) ? solves.filter(Boolean) : [];
    if (!items.length) {
      return {
        average: null,
        rows: [],
        solveRangeLabel: null,
      };
    }

    const values = items.map(getSolveValue);
    const result = calculateAverage(values, true);

    return {
      average: result?.average ?? null,
      rows: items.map((solve, index) => ({
        solve,
        index,
      })),
      event: getSolveEvent(items[0]),
      scramble: getSolveScramble(items[0]),
      solveRangeLabel: formatSolveRangeLabel(items),
    };
  }, [solves]);

  const itemRowSize = detail.rows.length <= 5 ? 5 : 12;

  return (
    <StatFocusModal
      isOpen={isOpen}
      title=""
      subtitle=""
      onClose={onClose}
      actionButtons={[]}
      overlayClassName="averageDetailOverlay"
      modalClassName="averageDetailFrame"
      bodyClassName="averageDetailBody"
    >
      <div className="averageDetailModal">
        <div className="averageDetailTopRow">
          <div className="averageDetailSummary">
            <div className="averageDetailHeaderLine">
              <div className="averageDetailEventIcon" aria-hidden="true">
                <div className="averageDetailEventIconStage">
                  <PuzzleSVG
                    event={detail.event}
                    scramble={detail.scramble}
                    isAvatarCube
                  />
                </div>
              </div>
              <div className="averageDetailTitleRow">
                <div className="averageDetailTitleCopy">
                  <div className="averageDetailHeroLabel">
                    {currentEventToString(detail.event)} Average of {detail.rows.length}
                  </div>
                  {detail.solveRangeLabel ? (
                    <div className="averageDetailHeroDate">{detail.solveRangeLabel}</div>
                  ) : null}
                </div>
                <div className="averageDetailHeroValue">
                  {detail.average === "DNF"
                    ? "DNF"
                    : detail.average == null
                      ? "—"
                      : formatTime(detail.average, true)}
                </div>
              </div>
            </div>

          </div>
          <div className="averageDetailViewToggle" role="tablist" aria-label="Average detail view">
            <button
              type="button"
              className={`averageDetailViewBtn ${displayMode === "items" ? "is-active" : ""}`}
              onClick={() => setDisplayMode("items")}
            >
              Time Items
            </button>
            <button
              type="button"
              className={`averageDetailViewBtn ${displayMode === "table" ? "is-active" : ""}`}
              onClick={() => setDisplayMode("table")}
            >
              Table
            </button>
          </div>
        </div>

        <div className={`averageDetailList averageDetailList--${displayMode}`}>
          <TimeTable
            key={displayMode}
            solves={detail.rows.map((row, idx) => ({
              ...row.solve,
              fullIndex: idx,
              datetime: getSolveDateTime(row.solve),
            }))}
            onSolveOpen={onSolveOpen}
            showToolbar={false}
            showBulkControls={false}
            initialDisplayMode={displayMode}
            initialItemRowSize={itemRowSize}
            initialTableLimit="all"
            preserveInputOrder={true}
            showSolveAverages={false}
            containerClassName="averageDetailEmbeddedTable"
          />
        </div>
      </div>
    </StatFocusModal>
  );
}

AverageDetailModal.propTypes = {
  isOpen: PropTypes.bool,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  solves: PropTypes.arrayOf(PropTypes.object),
  onClose: PropTypes.func,
  onSolveOpen: PropTypes.func,
};

export default AverageDetailModal;
