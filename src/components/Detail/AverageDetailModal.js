import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import StatFocusModal from "../Stats/StatFocusModal";
import TimeTable from "../Stats/TimeTable";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import "./AverageDetailModal.css";

function getSolvePenalty(solve) {
  return String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
}

function getSolveValue(solve) {
  if (getSolvePenalty(solve) === "DNF") return "DNF";

  const time = Number(
    solve?.time ?? solve?.finalTimeMs ?? solve?.FinalTimeMs ?? solve?.rawTimeMs ?? solve?.RawTimeMs
  );
  return Number.isFinite(time) ? time : "DNF";
}

function getSolveDateTime(solve) {
  return solve?.datetime || solve?.createdAt || solve?.CreatedAt || solve?.DateTime || null;
}

function AverageDetailModal({ isOpen, title, subtitle, solves, onClose, onSolveOpen }) {
  const [displayMode, setDisplayMode] = useState("items");

  const detail = useMemo(() => {
    const items = Array.isArray(solves) ? solves.filter(Boolean) : [];
    if (!items.length) {
      return {
        average: null,
        rows: [],
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
    };
  }, [solves]);

  const itemRowSize = detail.rows.length <= 5 ? 5 : 12;

  return (
    <StatFocusModal
      isOpen={isOpen}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      actionButtons={[]}
      overlayClassName="averageDetailOverlay"
      modalClassName="averageDetailFrame"
      bodyClassName="averageDetailBody"
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
          <div className="averageDetailHeroMeta">{detail.rows.length} solves in this window</div>
        </div>

        <div className="averageDetailSection">
          <div className="averageDetailSectionHeader">
            <div>
              <div className="averageDetailSectionTitle">
                {displayMode === "items" ? "Time Items" : "Table"}
              </div>
              <div className="averageDetailSectionMeta">Tap a solve to open its detail</div>
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
