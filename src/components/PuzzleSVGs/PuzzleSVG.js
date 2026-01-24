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
  isNameTagCube,   // keep supported for other places if you already use it
  isProfileCube,
  isAvatarCube,    // ✅ NEW: for Social message avatars / name tiles
}) => {
  const faceBasedEvents = ["222", "333", "444", "555", "666", "777", "333OH", "333BLD"];
  const isRubikEvent = faceBasedEvents.includes(event);

  // Base size for non-rubik puzzles
  const size = event === "SQ1" ? 36 : 45;
  const gap = 2;

  // Shared flip state
  const [showFront, setShowFront] = useState(true);

  useEffect(() => {
    setShowFront(true);
  }, [event]);

  /**
   * ✅ Flip button:
   * - Keep for timer HUD + profile header if you want
   * - DON'T show it on Social avatars (isAvatarCube)
   */
  const showFlipButton = !isAvatarCube && (isTimerCube || isProfileCube || isMusicPlayer);

  /**
   * ✅ Wrapper nudges (THIS is the knob):
   * - NxN avatars: leave at 0 (they were already correct)
   * - non-NxN avatars: nudge down/right so they're centered in the rounded square
   * - profile cubes: optional nudge if you still need it (separate from avatars)
   */
  const profileNudge = isProfileCube && !isTimerCube ? { x: 10, y: 10 } : { x: 0, y: 0 };

  // ✅ ONLY applies when isAvatarCube === true (Social)
  // Tune these numbers to taste.
  const avatarNudgeByEvent = {
    // Keep NxN untouched:
    "222": { x: 0, y: 0 },
    "333": { x: 0, y: 0 },
    "333OH": { x: 0, y: 0 },
    "333BLD": { x: 0, y: 0 },
    "444": { x: 0, y: 0 },
    "555": { x: 0, y: 0 },
    "666": { x: 0, y: 0 },
    "777": { x: 0, y: 0 },

    // ✅ Non-NxN: push DOWN/RIGHT (fix “too high + left”)
    "PYRAMINX": { x: 12, y: 14 },
    "MEGAMINX": { x: 10, y: 12 },
    "SKEWB": { x: 12, y: 12 },
    "CLOCK": { x: 10, y: 10 },
    "SQ1": { x: 10, y: 10 },
  };

  const avatarNudge = isAvatarCube ? (avatarNudgeByEvent[event] || { x: 10, y: 10 }) : { x: 0, y: 0 };

  // Combine nudges (avatar + profile)
  const nudgeX = profileNudge.x + avatarNudge.x;
  const nudgeY = profileNudge.y + avatarNudge.y;

  if (isRubikEvent) {
    return (
      <div className="puzzle-svg-wrap">
        {showFlipButton && (
          <button
            className="puzzle-flip-btn"
            aria-label="Flip cube"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowFront((f) => !f);
            }}
          >
            <img className="puzzle-flip-icon" src={FlipIcon} alt="" />
          </button>
        )}

        {/* ✅ wrapper nudge does NOT change RubiksCubeSVG scaling */}
        <div className="puzzle-svg-inner" style={{ transform: `translate(${nudgeX}px, ${nudgeY}px)` }}>
          <RubiksCubeSVG
            n={event}
            faces={getScrambledFaces(scramble, event)}
            isMusicPlayer={isMusicPlayer}
            isTimerCube={isTimerCube}
            isNameTagCube={isNameTagCube} // only affects scale if YOU set it true somewhere
            isProfileCube={isProfileCube}
            showFront={showFront}
          />
        </div>
      </div>
    );
  }

  const eventMap = {
    SKEWB: SkewbSVG,
    SQ1: Square1SVG,
    MEGAMINX: MegaminxSVG,
    PYRAMINX: PyraminxSVG,
    CLOCK: ClockSVG,
  };

  const SpecificPuzzle = eventMap[event];
  if (!SpecificPuzzle) return null;

  return (
    <div className="puzzle-svg-wrap">
      {showFlipButton && (
        <button
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

      <div className="puzzle-svg-inner" style={{ transform: `translate(${nudgeX}px, ${nudgeY}px)` }}>
        <SpecificPuzzle
          scramble={scramble}
          size={size}
          gap={gap}
          showFront={showFront}
          isProfileCube={isProfileCube}
          isNameTagCube={isNameTagCube}
          isTimerCube={isTimerCube}
          isMusicPlayer={isMusicPlayer}
        />
      </div>
    </div>
  );
};

export default PuzzleSVG;
