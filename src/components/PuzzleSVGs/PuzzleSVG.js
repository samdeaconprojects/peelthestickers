// src/components/PuzzleSVGs/PuzzleSVG.js
import React from 'react';
import RubiksCubeSVG from './RubiksCubeSVG';
import SkewbSVG from './SkewbSVG';
import Square1SVG from './Square1SVG';
import PyraminxSVG from './PyraminxSVG';
import MegaminxSVG from './MegaminxSVG';
import ClockSVG from './ClockSVG';
import { getScrambledFaces } from '../scrambleUtils';

const PuzzleSVG = ({ event, scramble, isMusicPlayer, isTimerCube, isNameTagCube, isProfileCube }) => {
  const faceBasedEvents = ["222", "333", "444", "555", "666", "777", "333OH", "333BLD"];
  const isRubikEvent = faceBasedEvents.includes(event);
  const size = 45;
  const gap = 2;

  if (isRubikEvent) {
    return (
      <RubiksCubeSVG
        n={event}
        faces={getScrambledFaces(scramble, event)}
        isMusicPlayer={isMusicPlayer}
        isTimerCube={isTimerCube}
        isNameTagCube={isNameTagCube}
        isProfileCube={isProfileCube}
      />
    );
  }

  const eventMap = {
    SKEWB: SkewbSVG,
    SQ1: Square1SVG,
    MEGAMINX: MegaminxSVG,
    PYRAMINX: PyraminxSVG,
    CLOCK: ClockSVG
  };

  const SpecificPuzzle = eventMap[event];

  return SpecificPuzzle ? (
    <SpecificPuzzle scramble={scramble} size={size} gap={gap} />
  ) : null;
};

export default PuzzleSVG;
