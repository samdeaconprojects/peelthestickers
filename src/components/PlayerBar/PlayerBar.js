import React from "react";
import "./PlayerBar.css";
import "../TagBar/TagBar.css";
import Timer from "../Timer/Timer";
import TimeList from "../TimeList/TimeList";
import EventSelector from "../EventSelector";
import Scramble from "../Scramble/Scramble";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import TagBar from "../TagBar/TagBar";
import { useLocation } from "react-router-dom";
import { formatTime } from "../TimeList/TimeUtils";

function PlayerBar({
  sessions,
  currentEvent,
  currentSession,
  currentTags,
  currentTagColors,
  tagConfig,
  onTagsChange,
  onTagColorsChange,
  cubeModelOptions = [],
  discoveredTagOptions = {},
  setCurrentSession,
  handleEventChange,
  deleteTime,
  addTime,
  scramble,
  onScrambleClick,
  goForwardScramble,
  goBackwardScramble,
  addPost,
  user,
  applyPenalty,
  customEvents,
  sessionsList,
  onHide,
  sharedSession,
  sharedAverageMeta,
  onRefreshSharedAverage,
  onLeaveSharedSession,
  onSessionChange,
  onSelectSessionObj,
}) {
  const location = useLocation();
  const { pathname } = location;

  const borderColor = {
    "/": "blue",
    "/profile": "#2EC4B6",
    "/stats": "yellow",
    "/social": "#50B6FF",
    "/settings": "#F64258",
  };
  const currentBorderColor = borderColor[pathname] || "white";

  const eventKey = String(currentEvent || "").toUpperCase();
  const allEventSolves = Array.isArray(sessions?.[eventKey]) ? sessions[eventKey] : [];
  const currentSolves = allEventSolves.filter(
    (s) =>
      String(s?.sessionID || s?.SessionID || "main") ===
      String(currentSession || "main")
  );
  const sharedRows = Array.isArray(sharedAverageMeta?.rows) ? sharedAverageMeta.rows : [];
  const currentSharedIndex = Number.isFinite(Number(sharedAverageMeta?.currentIndex))
    ? Number(sharedAverageMeta.currentIndex)
    : 0;
  const currentSharedRow = sharedRows[currentSharedIndex] || null;
  const playerBarSharedRows = sharedRows.slice(Math.max(0, currentSharedIndex - 2), currentSharedIndex + 3);
  return (
    <div
      className="player-bar"
      style={{ borderTop: `1px solid ${currentBorderColor}` }}
    >
      <button
        type="button"
        className="playerbar-toggle-inbar"
        onClick={onHide}
        aria-label="Hide player bar"
        title="Hide player bar"
      >
        <span className="playerbar-toggle-glyph" aria-hidden="true">▼</span>
      </button>

      {/* LEFT: Timer */}
      <div className="playerbar-left">
        <div className="playerbar-timer">
          <Timer addTime={addTime} inPlayerBar={true} />
        </div>
      </div>

      {/* MIDDLE: scramble + mini timelist */}
      <div className="playerbar-center">
        <div className="scramble-box">
          <Scramble
            onScrambleClick={onScrambleClick}
            scramble={currentSharedRow?.scramble || scramble}
            currentEvent={currentEvent}
            isMusicPlayer={true}
            onForwardScramble={goForwardScramble}
            onBackwardScramble={goBackwardScramble}
          />
        </div>

        <div className="playerbar-timelist">
          {sharedAverageMeta?.active ? (
            <div className="playerbar-shared-strip">
              <div className="playerbar-shared-header">
                <span className="playerbar-shared-name">
                  {sharedAverageMeta?.theirLabel || "Shared"}
                </span>
                <span className="playerbar-shared-meta">
                  {`Round ${Math.min(currentSharedIndex + 1, sharedAverageMeta?.count || 1)} / ${
                    sharedAverageMeta?.count || 1
                  }`}
                </span>
                {((typeof onRefreshSharedAverage === "function") ||
                  (sharedAverageMeta?.active && typeof onLeaveSharedSession === "function")) && (
                  <div className="playerbar-shared-actions">
                    {typeof onRefreshSharedAverage === "function" && (
                      <button
                        type="button"
                        className="playerbar-shared-refresh"
                        onClick={() => onRefreshSharedAverage()}
                      >
                        Refresh
                      </button>
                    )}
                    {sharedAverageMeta?.active && typeof onLeaveSharedSession === "function" && (
                      <button
                        type="button"
                        className="playerbar-shared-refresh"
                        onClick={() => onLeaveSharedSession()}
                      >
                        Exit
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="playerbar-shared-row">
                {playerBarSharedRows.map((row) => {
                  const isCurrent = row.index === currentSharedIndex;
                  return (
                    <div
                      key={`pb-shared-${row.index}`}
                      className={`playerbar-shared-item ${isCurrent ? "is-current" : ""}`}
                      title={`Round ${row.index + 1}${row.scramble ? `: ${row.scramble}` : ""}`}
                    >
                      <span className="playerbar-shared-index">{row.index + 1}</span>
                      <span className="playerbar-shared-time">
                        {row.yourTime != null ? formatTime(row.yourTime) : "—"}
                      </span>
                      <span className="playerbar-shared-peer">
                        {row.theirTime != null ? formatTime(row.theirTime) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <TimeList
              user={user}
              applyPenalty={applyPenalty}
              solves={currentSolves}
              deleteTime={(solveRefOrIndex) => deleteTime(eventKey, solveRefOrIndex)}
              inPlayerBar={true}
              addPost={addPost}
              rowsToShow={1}
              sessionsList={sessionsList}
              currentEvent={currentEvent}
              currentSession={currentSession}
              eventKey={currentEvent}
              practiceMode={false}
              sharedAverageMeta={sharedAverageMeta}
              onRefreshSharedAverage={onRefreshSharedAverage}
            />
          )}
        </div>
      </div>

      {/* RIGHT: selector + cube */}
      <div className="playerbar-right">
        <div className="playerbar-right-top">
          <div className="playerbar-selector-wrap">
            <EventSelector
              currentEvent={currentEvent}
              handleEventChange={handleEventChange}
              currentSession={currentSession}
              setCurrentSession={setCurrentSession}
              userID={user?.UserID}
              onSessionChange={onSessionChange}
              onSelectSessionObj={onSelectSessionObj}
            />
          </div>

          <div className="playerbar-cube">
            <div className="playerbar-cube-shell">
              <PuzzleSVG
                event={currentEvent}
                scramble={scramble}
                isMusicPlayer={true}
                isTimerCube={false}
              />
            </div>
          </div>
        </div>

        <div
          className="playerbar-tagstrip"
          aria-label="Active solve tags"
        >
          <TagBar
            tags={currentTags}
            tagColors={currentTagColors}
            onChange={onTagsChange}
            onTagColorsChange={onTagColorsChange}
            tagConfig={tagConfig}
            cubeModelOptions={cubeModelOptions}
            discoveredOptions={discoveredTagOptions}
            profileColor={user?.Color || user?.color || "#2EC4B6"}
            variant="home"
            allowAdditions
          />
        </div>

      </div>
    </div>
  );
}

export default PlayerBar;
