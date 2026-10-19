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

function PlayerBar({
  isSignedIn,
  sessions,
  currentEvent,
  currentSession,
  currentTags,
  currentTagColors,
  currentTagVisibility,
  tagConfig,
  onTagsChange,
  onTagVisibilityChange,
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
  hostedRoomMeta,
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
  onCloseHostedRoom,
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
  const sharedRoundLabel = `${Math.min(
    currentSharedIndex + 1,
    sharedAverageMeta?.count || 1
  )}/${sharedAverageMeta?.count || 1}`;
  return (
    <div
      className="player-bar"
      data-event={eventKey}
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

      {/* LEFT: event line + Timer */}
      <div className="playerbar-left">
        <div className="playerbar-eventline">
          <EventSelector
            textOnly
            currentEvent={currentEvent}
            handleEventChange={handleEventChange}
            currentSession={currentSession}
            setCurrentSession={setCurrentSession}
            sessions={sessionsList}
            customEvents={customEvents}
            userID={user?.UserID}
            profileColor={user?.Color || user?.color || "#2EC4B6"}
            onSessionChange={onSessionChange}
            onSelectSessionObj={onSelectSessionObj}
          />
          {sharedAverageMeta?.active ? (
            <div
              className="playerbar-shared-chip"
              title={
                sharedAverageMeta?.theirLabel
                  ? `Shared ${String(sharedAverageMeta?.modeLabel || "average").toLowerCase()} vs ${sharedAverageMeta.theirLabel}`
                  : "Shared average"
              }
            >
              <span className="playerbar-shared-chip__dot" aria-hidden="true" />
              <span className="playerbar-shared-chip__label">
                {sharedAverageMeta?.theirLabel || "Shared"}
              </span>
              <span className="playerbar-shared-chip__meta">{sharedRoundLabel}</span>
              {typeof onRefreshSharedAverage === "function" && (
                <button
                  type="button"
                  className="playerbar-shared-chip__button"
                  onClick={() => onRefreshSharedAverage()}
                  aria-label="Refresh shared average"
                  title="Refresh"
                >
                  ↻
                </button>
              )}
              {typeof onLeaveSharedSession === "function" && (
                <button
                  type="button"
                  className="playerbar-shared-chip__button"
                  onClick={() => onLeaveSharedSession()}
                  aria-label="Exit shared average"
                  title="Exit"
                >
                  ✕
                </button>
              )}
            </div>
          ) : null}
        </div>
        <div className="playerbar-timer">
          <Timer
            addTime={addTime}
            inPlayerBar={true}
            latestSolve={currentSolves[currentSolves.length - 1] || null}
          />
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
          {hostedRoomMeta?.active ? (
            <div className="playerbar-room-pill">
              <span className="playerbar-room-pill__label">
                {hostedRoomMeta.isHost ? "Hosting room" : "Following room"}
              </span>
              <span className="playerbar-room-pill__meta">{hostedRoomMeta.eventLabel}</span>
              {hostedRoomMeta.roomCode ? (
                <span className="playerbar-room-pill__meta">{hostedRoomMeta.roomCode}</span>
              ) : null}
              <button
                type="button"
                className="playerbar-room-pill__button"
                onClick={() => {
                  if (hostedRoomMeta.isHost) onCloseHostedRoom?.();
                  else onLeaveSharedSession?.();
                }}
              >
                {hostedRoomMeta.isHost ? "Stop" : "Leave"}
              </button>
            </div>
          ) : null}
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
        </div>
      </div>

      {/* RIGHT: tag list + cube */}
      <div className="playerbar-right">
        {isSignedIn && (
          <div
            className="playerbar-tagstrip"
            aria-label="Active solve tags"
          >
            <TagBar
              tags={currentTags}
              tagColors={currentTagColors}
              summaryVisibility={currentTagVisibility}
              onChange={onTagsChange}
              onSummaryVisibilityChange={onTagVisibilityChange}
              onTagColorsChange={onTagColorsChange}
              tagConfig={tagConfig}
              cubeModelOptions={cubeModelOptions}
              discoveredOptions={discoveredTagOptions}
              profileColor={user?.Color || user?.color || "#2EC4B6"}
              variant="home"
              hideAutomaticFields
              allowAdditions
            />
          </div>
        )}

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
    </div>
  );
}

export default PlayerBar;
