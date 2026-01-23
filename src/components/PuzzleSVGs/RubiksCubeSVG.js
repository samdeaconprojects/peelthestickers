// src/components/PuzzleSVGs/RubiksCubeSVG.js
import React from "react";
import "./RubiksCubeSVG.css";

const RubiksCubeSVG = ({
  n,
  faces,
  isMusicPlayer,
  isTimerCube,
  isNameTagCube,
  isProfileCube,
}) => {
  // console.log(faces);

  // Convert event string -> numeric N
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

  // Scale variants
  if (isMusicPlayer) cubeScale = cubeScale / 2;
  if (isNameTagCube) cubeScale = cubeScale / 4;

  // Class variants
  let cubeClassName = "";
  if (isTimerCube) cubeClassName = "cube";
  else if (isProfileCube) cubeClassName = "nonTimerProfileCube";
  else if (isMusicPlayer) cubeClassName = "nonTimerCube";
  else if (isNameTagCube) cubeClassName = "nametagCube";

  const drawFace = (n, currFace) => {
    const stickers = [];
    let stickerColor = "";

    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        switch (faces[currFace][row][col]) {
          case "yellow": stickerColor = "#FFFF00"; break;
          case "white": stickerColor = "#FFFFFF"; break;
          case "red": stickerColor = "#F64258"; break;
          case "orange": stickerColor = "#FF8F0C"; break;
          case "blue": stickerColor = "#50B6FF"; break;
          case "green": stickerColor = "#12EA68"; break;
          default: break;
        }

        stickers.push(
          <rect
            x={(size + gap) * col}
            y={(size + gap) * row}
            rx={1}
            ry={1}
            width={size}
            height={size}
            fill={stickerColor}
            key={`sticker-${row}-${col}`}
          />
        );
      }
    }
    return stickers;
  };

  //  HUD offsets ONLY for the timer cube (do NOT affect profile/nametag/music)
  const hudDropByN = { 2: 55, 3: 60, 4: 55, 5: 60, 6: 62, 7: 64 };
  const hudShiftXByN = { 2: 25, 3: 10, 4: 0, 5: 0, 6: 0, 7: 0 };

  const hudDrop = isTimerCube ? (hudDropByN[n] ?? 0) : 0;
  const hudShiftX = isTimerCube ? (hudShiftXByN[n] ?? 0) : 0;

  // tweak values if needed: Y usually -12 to -26 is the sweet spot
  const nameTagNudgeY = isNameTagCube ? -30 : 0;
  const nameTagNudgeX = isNameTagCube ? 0 : 0;

  const transformOrigin =
    isTimerCube ? "top center" :
    isNameTagCube ? "top left" :
    "center";

  return (
    <div
      className={cubeClassName}
      style={{
        position: "relative",
        transform: `scale(${cubeScale / 100})`,
        transformOrigin,
      }}
    >
      {/* move the entire cube drawing together */}
      <div
        style={{
          position: "relative",
          transform: `translate(${hudShiftX + nameTagNudgeX}px, ${hudDrop + nameTagNudgeY}px)`,
        }}
      >
        <div
          className="face topFace"
          style={{ top: `${topFaceTop}px`, left: `${topFaceLeft}px` }}
        >
          <svg>{drawFace(n, 0)}</svg>
        </div>

        <div className="face leftFace">
          <svg>{drawFace(n, 1)}</svg>
        </div>

        <div
          className="face rightFace"
          style={{ top: `${rightFaceTop}px`, left: `${rightFaceLeft}px` }}
        >
          <svg>{drawFace(n, 2)}</svg>
        </div>
      </div>
    </div>
  );
};

export default RubiksCubeSVG;
