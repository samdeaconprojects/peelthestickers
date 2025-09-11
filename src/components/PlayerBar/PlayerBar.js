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

  // Define border colors for different paths
  const borderColor = {
    "/": "blue", // Home page
    "/profile": "#2EC4B6",
    "/stats": "yellow",
    "/social": "#50B6FF",
    "/settings": "#F64258",
  };

  // Get the border color based on the current path, default to white if path not defined
  const currentBorderColor = borderColor[pathname] || "white";

  const getScrambleFontSize = (event) => {
    switch (event) {
      case "222":
        return "24px"; // Largest font size
      case "333":
        return "22px";
      case "444":
        return "18px";
      case "555":
        return "15px";
      case "666":
      case "777":
        return "12px"; // Smallest font size
      default:
        return "16px"; // Default font size
    }
  };

  // 🔹 Get solves for the current event + session
  const currentSolves = sessions[currentEvent] || [];

  return (
    <div
      className="player-bar"
      style={{ borderTop: `1px solid ${currentBorderColor}` }}
    >
      <Timer addTime={addTime} />

      <div className="scramble-timelist">
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

      {/* 🔹 Updated EventSelector props */}
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

      <RubiksCubeSVG
        n={currentEvent}
        faces={getScrambledFaces(scramble, currentEvent)}
        isMusicPlayer={true}
        isTimerCube={false}
      />
    </div>
  );
}

export default PlayerBar;
