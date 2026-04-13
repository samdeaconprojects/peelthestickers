import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import StatFocusModal from "../Stats/StatFocusModal";
import TimeTable from "../Stats/TimeTable";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { currentEventToString } from "../scrambleUtils";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import tagBadge from "../../assets/Tag.svg";
import {
  DEFAULT_TAG_CONFIG,
  getSharedTagFieldMeta,
  getSolveTagValue,
  getTagChipStyle,
} from "../TagBar/tagUtils";
import "./AverageDetailModal.css";
import "../TagBar/TagBar.css";

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

function getSolveSessionID(solve) {
  return solve?.sessionID || solve?.SessionID || solve?.SessionId || solve?.sessionId || "";
}

function getSolveSessionName(solve) {
  return solve?.sessionName || solve?.SessionName || solve?.session || solve?.Session || "";
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

function getSolveSessionIndex(solve) {
  const value = Number(solve?.fullIndex);
  return Number.isFinite(value) ? value : null;
}

function formatSessionIndexLabel(items) {
  const indices = (Array.isArray(items) ? items : [])
    .map(getSolveSessionIndex)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!indices.length) return null;

  const firstSolve = Array.isArray(items) ? items.find(Boolean) : null;
  const explicitSessionName = String(getSolveSessionName(firstSolve) || "").trim();
  const sessionID = String(getSolveSessionID(firstSolve) || "").trim();
  const sessionLabel = explicitSessionName || (sessionID === "main" ? "Main" : sessionID) || "Session";

  const display = indices.map((value) => value + 1);
  const first = display[0];
  const last = display[display.length - 1];
  const isContiguous = display.every((value, index) => index === 0 || value === display[index - 1] + 1);

  if (display.length === 1) return `${sessionLabel} ${first}`;
  if (isContiguous) return `${sessionLabel} ${first}-${last}`;
  return `${sessionLabel} ${display.join(", ")}`;
}

function AverageDetailModal({
  isOpen,
  title,
  subtitle,
  solves,
  onClose,
  onSolveOpen,
  addPost,
  tagConfig = DEFAULT_TAG_CONFIG,
  tagColors = {},
  profileColor = "#2EC4B6",
  embedded = false,
}) {
  const [displayMode, setDisplayMode] = useState("items");

  const detail = useMemo(() => {
    const items = Array.isArray(solves) ? solves.filter(Boolean) : [];
    const tagFields = getSharedTagFieldMeta(tagConfig);
    if (!items.length) {
      return {
        average: null,
        rows: [],
        solveRangeLabel: null,
        sessionIndexLabel: null,
        tagGroups: [],
      };
    }

    const values = items.map(getSolveValue);
    const result = calculateAverage(values, true);
    const tagGroups = tagFields
      .map((fieldMeta) => {
        const valuesForField = Array.from(
          new Set(items.map((solve) => getSolveTagValue(solve, fieldMeta.field)).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));

        if (!valuesForField.length) return null;

        return {
          ...fieldMeta,
          values: valuesForField,
        };
      })
      .filter(Boolean);

    return {
      average: result?.average ?? null,
      rows: items.map((solve, index) => ({
        solve,
        index,
      })),
      event: getSolveEvent(items[0]),
      scramble: getSolveScramble(items[0]),
      solveRangeLabel: formatSolveRangeLabel(items),
      sessionIndexLabel: formatSessionIndexLabel(items),
      tagGroups,
    };
  }, [solves, tagConfig]);

  const itemRowSize = detail.rows.length <= 5 ? 5 : 12;
  const canShare = !embedded && typeof addPost === "function" && detail.rows.length > 0;

  const handleShare = () => {
    if (!canShare) return;

    addPost({
      note: "",
      event: detail.event || "333",
      solveList: detail.rows.map((row) => row.solve),
      comments: [],
    });
    onClose?.();
  };

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
      embedded={embedded}
    >
      <div className="averageDetailModal">
        <div className="averageDetailTopRow">
          <div className="averageDetailSummary">
            <div className="averageDetailHeaderLine">
              <div className="averageDetailHeroValue">
                {detail.average === "DNF"
                  ? "DNF"
                  : detail.average == null
                    ? "—"
                    : formatTime(detail.average, true)}
              </div>
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
                  {detail.sessionIndexLabel ? (
                    <div className="averageDetailHeroDate">{detail.sessionIndexLabel}</div>
                  ) : null}
                </div>
              </div>
            </div>
            {detail.tagGroups.length ? (
              <div className="averageDetailTagSummary" aria-label="Tags used in this average">
                {detail.tagGroups.map((group) => (
                  <div className="averageDetailTagGroup" key={group.field}>
                    <div className="averageDetailTagGroupLabel">{group.label}</div>
                    <div className="averageDetailTagGroupValues">
                      {group.values.map((value) => (
                        <div
                          key={`${group.field}-${value}`}
                          className="tagHomeChip is-set averageDetailTagChip"
                          style={getTagChipStyle(group.field, value, tagColors, profileColor)}
                          title={value}
                        >
                          <span className="tagHomeChipIconWrap" aria-hidden="true">
                            <img src={tagBadge} alt="" className="tagHomeChipIcon" />
                          </span>
                          <span className="tagHomeChipText">
                            <span className="tagHomeChipValue">{value}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="averageDetailToolbar">
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
            {canShare ? (
              <button type="button" className="averageDetailShareButton" onClick={handleShare}>
                Share
              </button>
            ) : null}
          </div>
        </div>

        <div className={`averageDetailList averageDetailList--${displayMode}`}>
          <TimeTable
            key={displayMode}
            solves={detail.rows.map((row, idx) => ({
              ...row.solve,
              fullIndex:
                Number.isFinite(Number(row.solve?.fullIndex))
                  ? Number(row.solve.fullIndex)
                  : idx,
              sessionDisplayNumber: Number.isFinite(Number(row.solve?.fullIndex))
                ? Number(row.solve.fullIndex) + 1
                : undefined,
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
  addPost: PropTypes.func,
  tagConfig: PropTypes.object,
  tagColors: PropTypes.object,
  profileColor: PropTypes.string,
  embedded: PropTypes.bool,
};

export default AverageDetailModal;
