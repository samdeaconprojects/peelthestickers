import React, { useMemo } from "react";
import PropTypes from "prop-types";
import StatFocusModal from "../Stats/StatFocusModal";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import "./AverageDetailModal.css";

function getSolveValue(solve) {
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return "DNF";

  const time = Number(
    solve?.time ?? solve?.finalTimeMs ?? solve?.FinalTimeMs ?? solve?.rawTimeMs ?? solve?.RawTimeMs
  );
  return Number.isFinite(time) ? time : "DNF";
}

function formatDateTime(datetime) {
  if (!datetime) return "—";
  const date = new Date(datetime);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AverageDetailModal({
  isOpen,
  title,
  subtitle,
  solves,
  onClose,
  onSolveOpen,
}) {
  const detail = useMemo(() => {
    const items = Array.isArray(solves) ? solves.filter(Boolean) : [];
    if (!items.length) {
      return {
        average: null,
        minIndex: -1,
        maxIndex: -1,
        rows: [],
      };
    }

    const result = calculateAverage(items.map(getSolveValue), true);

    return {
      average: result?.average ?? null,
      minIndex: result?.minIndex ?? -1,
      maxIndex: result?.maxIndex ?? -1,
      rows: items.map((solve, index) => ({
        solve,
        index,
        isDropped:
          items.length > 3 &&
          (index === (result?.minIndex ?? -1) || index === (result?.maxIndex ?? -1)),
      })),
    };
  }, [solves]);

  return (
    <StatFocusModal
      isOpen={isOpen}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      actionButtons={[]}
    >
      <div className="averageDetailModal">
        <div className="averageDetailHero">
          <div className="averageDetailHeroLabel">Average</div>
          <div className="averageDetailHeroValue">
            {detail.average === "DNF"
              ? "DNF"
              : detail.average == null
                ? "—"
                : formatTime(detail.average, true)}
          </div>
          <div className="averageDetailHeroMeta">{detail.rows.length} solves</div>
        </div>

        <div className="averageDetailList">
          {detail.rows.map((row, idx) => {
            const solve = row.solve;
            const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
            const time = getSolveValue(solve);

            return (
              <button
                key={`${solve?.solveRef || solve?.SK || solve?.datetime || idx}-${idx}`}
                type="button"
                className={`averageDetailRow ${row.isDropped ? "is-dropped" : ""}`}
                onClick={() => onSolveOpen?.(solve)}
              >
                <div className="averageDetailRowIndex">{idx + 1}</div>
                <div className="averageDetailRowMain">
                  <div className="averageDetailRowTime">
                    {time === "DNF" ? "DNF" : formatTime(time, false, penalty === "+2" ? "+2" : null)}
                  </div>
                  <div className="averageDetailRowMeta">{formatDateTime(solve?.datetime || solve?.createdAt)}</div>
                </div>
                {row.isDropped ? (
                  <div className="averageDetailRowBadge">
                    {idx === detail.minIndex ? "drop low" : "drop high"}
                  </div>
                ) : (
                  <div className="averageDetailRowBadge averageDetailRowBadge--keep">counted</div>
                )}
              </button>
            );
          })}
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
