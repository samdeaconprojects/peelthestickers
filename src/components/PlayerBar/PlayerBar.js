// PlayerBar.js
import React from "react";
import "./PlayerBar.css";
import Timer from "../Timer/Timer";
import TimeList from "../TimeList/TimeList";
import EventSelector from "../EventSelector";
import Scramble from "../Scramble/Scramble";
import RubiksCubeSVG from "../PuzzleSVGs/RubiksCubeSVG";
import { getScrambledFaces } from "../scrambleUtils";
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
      case "222": return "24px";
      case "333": return "22px";
      case "444": return "18px";
      case "555": return "15px";
      case "666":
      case "777": return "12px";
      default: return "16px";
    }
  };

  const currentSolves = sessions[currentEvent] || [];

  return (
    <div
      className="player-bar"
      style={{ borderTop: `1px solid ${currentBorderColor}` }}
    >
      {/* Left: Timer */}
      <div className="playerbar-timer">
        <Timer addTime={addTime} />
      </div>

      {/* Middle: Scramble + TimeList */}
      <div className="playerbar-scramble-timelist">
        <Scramble
          style={{ fontSize: getScrambleFontSize(currentEvent) }}
          onScrambleClick={onScrambleClick}
          scramble={scramble}
          currentEvent={currentEvent}
          isMusicPlayer={true}
        />
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

      {/* Right: EventSelector */}
      <div className="playerbar-eventselector">
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

      {/* Far Right: Cube */}
      <div className="playerbar-cube">
        <RubiksCubeSVG
          n={currentEvent}
          faces={getScrambledFaces(scramble, currentEvent)}
          isMusicPlayer={true}
          isTimerCube={false}
        />
      </div>
    </div>
  );
}

export default PlayerBar;
