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

  const getScrambleFontSize = (event) => {
    switch (event) {
      case "222": return "18px";
      case "333": return "16px";
      case "444": return "14px";
      case "555": return "12px";
      case "666":
      case "777": return "11px";
      case "CLOCK": return "14px";
      case "SKEWB":
      case "PYRAMINX": return "14px";
      case "MEGAMINX": return "10px";
      default: return "14px";
    }
  };

  const currentSolves = sessions[currentEvent] || [];

  return (
    <div
      className="player-bar"
      style={{ borderTop: `1px solid ${currentBorderColor}` }}
    >
      {/* LEFT: Timer + EventSelector */}
      <div className="playerbar-left">
        <div className="playerbar-timer">
          <Timer addTime={addTime} />
        </div>
        <div className="playerbar-selector">
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
            deleteTime={(index) => deleteTime(currentEvent, index)}
            inPlayerBar={true}
            addPost={addPost}
            rowsToShow={1}
          />
        </div>
      </div>

      {/* RIGHT: Puzzle SVG */}
      <div className="playerbar-cube">
        <PuzzleSVG
          event={currentEvent}
          scramble={scramble}
          isMusicPlayer={true}
          isTimerCube={false}
        />
      </div>
    </div>
  );
}

export default PlayerBar;
