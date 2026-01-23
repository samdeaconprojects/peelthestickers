// src/components/PuzzleSVGs/PuzzleSVG.js
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
  const faceBasedEvents = [
    "222",
    "333",
    "444",
    "555",
    "666",
    "777",
    "333OH",
    "333BLD",
  ];
  const isRubikEvent = faceBasedEvents.includes(event);

  // Base size for non-rubik puzzles
  const size = event === "SQ1" ? 36 : 45;
  const gap = 2;

  // flip state (used for everything)
  const [isFlipped, setIsFlipped] = useState(false);

  // Reset flip when event changes
  useEffect(() => {
    setIsFlipped(false);
  }, [event]);

  const eventMap = {
    SKEWB: SkewbSVG,
    SQ1: Square1SVG,
    MEGAMINX: MegaminxSVG,
    PYRAMINX: PyraminxSVG,
    CLOCK: ClockSVG,
  };

  const SpecificPuzzle = eventMap[event];

  return (
    <div className="puzzle-wrapper">
      {/* ✅ Flip button now exists for NxN AND non-rubik */}
      <button
        className="puzzle-flip"
        aria-label="Flip puzzle"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation(); // ✅ stops opening EventSelector
          setIsFlipped((f) => !f);
        }}
      >
        <img src={FlipIcon} alt="" />
      </button>

      {/* ✅ Everything renders inside a flippable wrapper */}
      <div className={`puzzle-content ${isFlipped ? "flipped" : ""}`}>
        {isRubikEvent ? (
          <RubiksCubeSVG
            n={event}
            faces={getScrambledFaces(scramble, event)}
            isMusicPlayer={isMusicPlayer}
            isTimerCube={isTimerCube}
            isNameTagCube={isNameTagCube}
            isProfileCube={isProfileCube}
          />
        ) : SpecificPuzzle ? (
          <SpecificPuzzle
            scramble={scramble}
            size={size}
            gap={gap}
            showFront={!isFlipped} // keeps your existing "front/back" logic working
          />
        ) : null}
      </div>
    </div>
  );
};

export default PuzzleSVG;
