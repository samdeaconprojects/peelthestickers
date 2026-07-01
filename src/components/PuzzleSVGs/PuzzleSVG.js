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
import ptsOH from "../../assets/ptsOH.svg";
import "./PuzzleSVG.css";

const PuzzleSVG = ({
  event,
  scramble,
  isMusicPlayer,
  isTimerCube,
  isNameTagCube,   // keep supported for other places if you already use it
  isProfileCube,
  isAvatarCube,    // ✅ NEW: for Social message avatars / name tiles
  isStatsHeaderIcon,
  forceWhite = false,
}) => {
  const faceBasedEvents = ["222", "333", "444", "555", "666", "777", "333OH", "333BLD"];
  const isRubikEvent = faceBasedEvents.includes(event);
  const showOneHandAsset = event === "333OH";
  const oneHandScale = showOneHandAsset ? 0.9 : 1;

  const headerSizeByEvent = {
    SKEWB: 20,
    SQ1: 18,
    MEGAMINX: 19,
    PYRAMINX: 22,
    CLOCK: 17,
  };

  // Base size for non-rubik puzzles
  const size = isStatsHeaderIcon
    ? headerSizeByEvent[event] || 44
    : event === "SQ1"
      ? 36
      : 45;
  const gap = 2;

  // Shared flip state
  const [showFront, setShowFront] = useState(true);

  useEffect(() => {
    setShowFront(event === "PYRAMINX" ? false : true);
  }, [event]);

  /**
   * ✅ Flip button:
   * - Keep only on interactive scramble surfaces
   * - Hide on passive profile / nametag / avatar renders
   */
  const showFlipButton = !isAvatarCube && !isProfileCube && !isNameTagCube && (isTimerCube || isMusicPlayer);

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

  const avatarNudge =
    isAvatarCube && !isStatsHeaderIcon
      ? avatarNudgeByEvent[event] || { x: 10, y: 10 }
      : { x: 0, y: 0 };

  const headerNudgeByEvent = {
    "222": { x: -21, y: 2 },
    "333": { x: -21, y: -2 },
    "444": { x: -21, y: -2 },
    "555": { x: -22, y: -3 },
    "666": { x: -22, y: -3 },
    "777": { x: -23, y: -4 },
    "333OH": { x: 2, y: -2 },
    "333BLD": { x: 2, y: -2 },
    PYRAMINX: { x: 2, y: 3 },
    MEGAMINX: { x: 2, y: 1 },
    CLOCK: { x: 2, y: 0 },
    SQ1: { x: 2, y: 0 },
    SKEWB: { x: 2, y: 0 },
  };

  const headerNudge = isStatsHeaderIcon ? headerNudgeByEvent[event] || { x: 0, y: 0 } : { x: 0, y: 0 };
  const headerScaleByEvent = {
    "222": 0.5075,
    "333": 0.5075,
    "444": 0.4725,
    "555": 0.4375,
    "666": 0.4025,
    "777": 0.385,
    "333OH": 0.26,
    "333BLD": 0.26,
    SKEWB: 1,
    SQ1: 1,
    MEGAMINX: 1,
    PYRAMINX: 1,
    CLOCK: 1,
  };
  const headerScale = isStatsHeaderIcon ? headerScaleByEvent[event] || 1 : 1;

  // Combine nudges (avatar + profile)
  const nudgeX = profileNudge.x + avatarNudge.x + headerNudge.x;
  const nudgeY = profileNudge.y + avatarNudge.y + headerNudge.y;

  if (isRubikEvent) {
    return (
      <div
        className={[
          "puzzle-svg-wrap",
          showOneHandAsset ? "puzzle-svg-wrap--oh" : "",
          isStatsHeaderIcon ? "puzzle-svg-wrap--statsHeader" : "",
          isMusicPlayer ? "puzzle-svg-wrap--musicPlayer" : "",
          isNameTagCube ? "puzzle-svg-wrap--nameTag" : "",
          isAvatarCube ? "puzzle-svg-wrap--avatar" : "",
          isProfileCube ? "puzzle-svg-wrap--profile" : "",
        ].filter(Boolean).join(" ")}
      >
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
        <div
          className={`puzzle-svg-inner${forceWhite ? " puzzle-svg-inner--white" : ""}`}
          style={{
            transform: `translate(${nudgeX}px, ${nudgeY}px) scale(${headerScale * oneHandScale})`,
            transformOrigin: "center",
          }}
        >
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

        {showOneHandAsset && (
          <img className="puzzle-svg-oh-hand" src={ptsOH} alt="" aria-hidden="true" />
        )}
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

      <div
        className={`puzzle-svg-inner${forceWhite ? " puzzle-svg-inner--white" : ""}`}
        style={{ transform: `translate(${nudgeX}px, ${nudgeY}px)` }}
      >
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
