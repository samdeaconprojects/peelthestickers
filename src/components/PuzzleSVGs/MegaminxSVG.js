import React from "react";

// Put the SVG here:
// src/components/PuzzleSVGs/MegaminxSVG.svg
import { ReactComponent as MegaminxArt } from "../../assets/MegaminxSVG.svg";

export default function MegaminxSVG({
  scramble,         // not used yet (display-only for now)
  size = 45,
  gap = 2,          // not used yet
  showFront = true, // used for flip
}) {
  // Tune this multiplier to taste for your HUD size
  const px = Math.round(size * 3.6);

  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",

        // Flip the whole graphic horizontally when showFront is false
        transform: showFront ? "none" : "scaleX(-1)",
        transformOrigin: "center",

        // IMPORTANT: prevents clicks on the SVG from triggering anything underneath
        pointerEvents: "none",
      }}
    >
      <MegaminxArt
        width="100%"
        height="100%"
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      />
    </div>
  );
}
