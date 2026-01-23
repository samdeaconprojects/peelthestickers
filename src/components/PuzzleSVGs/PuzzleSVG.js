import React, { useEffect, useState } from "react";
import RubiksCubeSVG from "./RubiksCubeSVG";
import SkewbSVG from "./SkewbSVG";
import Square1SVG from "./Square1SVG";
import PyraminxSVG from "./PyraminxSVG";
import MegaminxSVG from "./MegaminxSVG";
import ClockSVG from "./ClockSVG";
import { getScrambledFaces } from "../scrambleUtils";
import FlipIcon from "../../assets/Flip.svg";
import "./PuzzleSVG.css";

const PuzzleSVG = ({
  event,
  scramble,
  isMusicPlayer,
  isTimerCube,
  isNameTagCube,
  isProfileCube,
}) => {
  const faceBasedEvents = ["222", "333", "444", "555", "666", "777", "333OH", "333BLD"];
  const isRubikEvent = faceBasedEvents.includes(event);

  // Base size for non-rubik puzzles
  const size = event === "SQ1" ? 36 : 45;
  const gap = 2;

  // Shared flip state
  const [showFront, setShowFront] = useState(true);

  // Reset to front when event changes
  useEffect(() => {
    setShowFront(true);
  }, [event]);

  // ✅ Only show flip button on the TIMER HUD cube
  // (no profile, no nametag, no music player by default)
  const showFlipButton = Boolean(isTimerCube) && !isProfileCube && !isNameTagCube;

  const eventMap = {
    SKEWB: SkewbSVG,
    SQ1: Square1SVG,
    MEGAMINX: MegaminxSVG,
    PYRAMINX: PyraminxSVG,
    CLOCK: ClockSVG,
  };

  // Wrap everything so the flip button can sit in the puzzle corner
  return (
    <div className="puzzle-svg-wrapper">
      {showFlipButton && (
        <button
          type="button"
          className="puzzle-flip-btn"
          aria-label="Flip puzzle"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowFront((f) => !f);
          }}
        >
          <img className="puzzle-flip-icon" src={FlipIcon} alt="" />
        </button>
      )}

      {isRubikEvent ? (
        <RubiksCubeSVG
          n={event}
          faces={getScrambledFaces(scramble, event)}
          showFront={showFront}              // ✅ NxN flip support
          isMusicPlayer={isMusicPlayer}
          isTimerCube={isTimerCube}
          isNameTagCube={isNameTagCube}
          isProfileCube={isProfileCube}
        />
      ) : (
        (() => {
          const SpecificPuzzle = eventMap[event];
          if (!SpecificPuzzle) return null;
          return (
            <SpecificPuzzle
              scramble={scramble}
              size={size}
              gap={gap}
              showFront={showFront}
            />
          );
        })()
      )}
    </div>
  );
};

export default PuzzleSVG;
