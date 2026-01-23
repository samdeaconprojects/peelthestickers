// src/components/PuzzleSVGs/RubiksCubeSVG.js
import React from "react";
import "./RubiksCubeSVG.css";

const RubiksCubeSVG = ({
  n,
  faces,
  showFront = true, // ✅ NEW: controls which face set is shown (no mirroring)
  isMusicPlayer,
  isTimerCube,
  isNameTagCube,
  isProfileCube,
}) => {
  // console.log(faces);

  switch (n) {
    case "222": n = 2; break;
    case "333": n = 3; break;
    case "444": n = 4; break;
    case "555": n = 5; break;
    case "666": n = 6; break;
    case "777": n = 7; break;
    default: n = 3;
  }

  let size = 10;
  let gap = 1;
  let cubeScale = 90;

  let topFaceTop = 0;
  let topFaceLeft = 0;

  let rightFaceTop = 0;
  let rightFaceLeft = 0;

  switch (n) {
    case 2:
      size = 20;
      gap = 2;
      cubeScale = 120;

      topFaceTop = -48;
      topFaceLeft = -7;

      rightFaceTop = -14;
      rightFaceLeft = 43;
      break;

    case 3:
      size = 20;
      gap = 2;

      topFaceTop = -60;
      topFaceLeft = 14;

      rightFaceTop = -1;
      rightFaceLeft = 65;
      break;

    case 4:
      size = 16;
      gap = 2;

      topFaceTop = -63;
      topFaceLeft = 20;

      rightFaceTop = 2;
      rightFaceLeft = 71;
      break;

    case 5:
      size = 15;
      gap = 2;
      cubeScale = 80;

      topFaceTop = -70;
      topFaceLeft = 32;

      rightFaceTop = 10;
      rightFaceLeft = 84;
      break;

    case 6:
      size = 12;
      gap = 1;

      topFaceTop = -66;
      topFaceLeft = 26;

      rightFaceTop = 6;
      rightFaceLeft = 77;
      break;

    case 7:
      topFaceTop = -65;
      topFaceLeft = 25;

      rightFaceTop = 6;
      rightFaceLeft = 76;
      break;

    default:
      break;
  }

  if (isMusicPlayer) cubeScale = cubeScale / 2;
  if (isNameTagCube) cubeScale = cubeScale / 4;

  let cubeClassName = "";
  if (isTimerCube) cubeClassName = "cube";
  else if (isProfileCube) cubeClassName = "nonTimerProfileCube";
  else if (isMusicPlayer) cubeClassName = "nonTimerCube";
  else if (isNameTagCube) cubeClassName = "nametagCube";

  const faceToHex = (color) => {
    switch (color) {
      case "yellow": return "#FFFF00";
      case "white": return "#FFFFFF";
      case "red": return "#F64258";
      case "orange": return "#FF8F0C";
      case "blue": return "#50B6FF";
      case "green": return "#12EA68";
      default: return "#000000";
    }
  };

  // ✅ Face mapping: your faces array order is [U, F, R, B, L, D]
  // Front view: U + F + R  -> indices [0,1,2]
  // Back  view: U + B + L  -> indices [0,3,4]
  const TOP_FACE = 0;
  const LEFT_FACE = showFront ? 1 : 3;   // F or B
  const RIGHT_FACE = showFront ? 2 : 4;  // R or L

  const drawFace = (faceIndex) => {
    const stickers = [];
    const face = faces?.[faceIndex];
    if (!face) return stickers;

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        stickers.push(
          <rect
            x={(size + gap) * col}
            y={(size + gap) * row}
            rx={1}
            ry={1}
            width={size}
            height={size}
            fill={faceToHex(face?.[row]?.[col])}
            key={`sticker-${faceIndex}-${row}-${col}`}
          />
        );
      }
    }
    return stickers;
  };

  // your existing tuning
  const hudDropByN = {
    2: 55,
    3: 60,
    4: 60,
    5: 65,
    6: 62,
    7: 64,
  };
  const hudDrop = hudDropByN[n] ?? 0;

  const hudShiftXByN = {
    2: 30,
    3: 10,
    4: 5,
    5: -10,
    6: 0,
    7: 0,
  };
  const hudShiftX = hudShiftXByN[n] ?? 0;

  return (
    <div
      className={cubeClassName}
      style={{
        position: "relative",
        transform: `scale(${cubeScale / 100})`,
        transformOrigin: "top center",
      }}
    >
      {/* move the entire cube drawing down + right together */}
      <div
        style={{
          position: "relative",
          transform: `translate(${hudShiftX}px, ${hudDrop}px)`,
        }}
      >
        <div
          className="face topFace"
          style={{ top: `${topFaceTop}px`, left: `${topFaceLeft}px` }}
        >
          <svg>{drawFace(TOP_FACE)}</svg>
        </div>

        <div className="face leftFace">
          <svg>{drawFace(LEFT_FACE)}</svg>
        </div>

        <div
          className="face rightFace"
          style={{ top: `${rightFaceTop}px`, left: `${rightFaceLeft}px` }}
        >
          <svg>{drawFace(RIGHT_FACE)}</svg>
        </div>
      </div>
    </div>
  );
};

export default RubiksCubeSVG;
