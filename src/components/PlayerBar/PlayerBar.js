// src/components/PlayerBar/PlayerBar.js
import React from "react";
import "./PlayerBar.css";
import Timer from "../Timer/Timer";
import TimeList from "../TimeList/TimeList";
import EventSelector from "../EventSelector";
import Scramble from "../Scramble/Scramble";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { useLocation } from "react-router-dom";

function PlayerBar({
  sessions,
  currentEvent,
  currentSession,
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
    (s) => String(s?.sessionID || s?.SessionID || "main") === String(currentSession || "main")
  );

  return (
    <div
      className="player-bar"
      style={{ borderTop: `1px solid ${currentBorderColor}` }}
    >
      {/* LEFT: Timer + EventSelector */}
      <div className="playerbar-left">
        <div className="playerbar-timer">
          <Timer addTime={addTime} inPlayerBar={true} />
        </div>
      </div>

      {/* MIDDLE: Scramble + TimeList */}
      <div className="playerbar-center">
        <div className="scramble-box">
          <Scramble
            onScrambleClick={onScrambleClick}
            scramble={scramble}
            currentEvent={currentEvent}
            isMusicPlayer={true}
            onForwardScramble={goForwardScramble}
            onBackwardScramble={goBackwardScramble}
          />
        </div>
        <div className="playerbar-timelist">
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
          />
        </div>
      </div>

      {/* RIGHT: Puzzle SVG */}
      <div className="playerbar-right">
        <button
          type="button"
          className="playerbar-toggle-inbar"
          onClick={onHide}
          aria-label="Hide player bar"
          title="Hide player bar"
        >
          ▼
        </button>
        <div className="playerbar-selector-wrap">
          <EventSelector
            currentEvent={currentEvent}
            handleEventChange={handleEventChange}
            currentSession={currentSession}
            setCurrentSession={setCurrentSession}
            sessions={sessionsList}
            customEvents={customEvents}
            userID={user?.UserID}
            dropUp={true}
          />
        </div>
        <div className="playerbar-cube">
          <PuzzleSVG
            event={currentEvent}
            scramble={scramble}
            isMusicPlayer={true}
            isTimerCube={false}
          />
        </div>
      </div>
    </div>
  );
}

export default PlayerBar;
