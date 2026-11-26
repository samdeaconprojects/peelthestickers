// src/components/PuzzleSVGs/FTOSVG.js
import React, { useEffect, useMemo, useRef } from "react";
import { ReactComponent as FTOTemplate } from "../../assets/FTOSVG.svg";
import { useCubeColors } from "../../utils/cubeColors";
import { getFTOFaces } from "./ftoFaces";

// FTO needs two colours the cube palette doesn't have.
const FTO_EXTRA_COLORS = {
  purple: "#A35CFF",
  gray: "#9E9E9E",
};

// The template is a square cut along its diagonals into four faces, 9 paths
// each: paths 0-8 top, 9-17 bottom, 18-26 left, 27-35 right. Every face's
// paths list its stickers in the same order (sticker 0 = the tip at the
// centre of the view).
const PATH_TO_STICKER = [8, 7, 5, 2, 4, 6, 3, 1, 0];

// Which face sits in each block, matching the p5 layout:
// front view U top, F bottom, L left, R right; back view D, B, BL, BR.
const FRONT_BLOCKS = [0, 2, 1, 3];
const BACK_BLOCKS = [4, 6, 5, 7];

export default function FTOSVG({
  scramble = "",
  size = 45,
  showFront = true,
  isTimerCube = false,
  isMusicPlayer = false,
}) {
  // Only the timer HUD and player bar draw the flip button.
  const hasFlipButton = isTimerCube || isMusicPlayer;
  const containerRef = useRef(null);
  const cubeColors = useCubeColors();
  const faces = useMemo(() => getFTOFaces(scramble), [scramble]);

  useEffect(() => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const paths = svg.querySelectorAll("path");
    if (paths.length < 36) return;

    const blocks = showFront ? FRONT_BLOCKS : BACK_BLOCKS;
    blocks.forEach((faceIdx, block) => {
      for (let i = 0; i < 9; i++) {
        const name = faces[faceIdx][PATH_TO_STICKER[i]];
        const fill = cubeColors[name] || FTO_EXTRA_COLORS[name];
        if (fill) paths[block * 9 + i].setAttribute("fill", fill);
      }
    });
  }, [faces, showFront, cubeColors]);

  // Square art fills the corner where the flip button sits, so keep it a
  // little smaller than the triangle puzzles.
  const px = Math.round(size * 2.1);

  return (
    <div
      ref={containerRef}
      style={{
        width: px,
        height: px,
        // clear the flip button that sits on the wrapper's top-right corner
        // and, on the home timer, sit centred over the event name.
        margin: hasFlipButton ? "8px 10px 0 0" : 0,
        transform: hasFlipButton && !isMusicPlayer ? "translateX(-18px)" : undefined,
        display: "block",
        pointerEvents: "none",
      }}
    >
      <FTOTemplate
        width="100%"
        height="100%"
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      />
    </div>
  );
}
