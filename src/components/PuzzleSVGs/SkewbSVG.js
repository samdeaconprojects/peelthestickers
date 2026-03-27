import React, { useEffect, useMemo, useRef } from "react";
import { ReactComponent as SkewbTemplate } from "../../assets/ptsskewb.svg";
import "./SkewbSVG.css";

const colorMap = {
  white: "#FFFFFF",
  green: "#12EA68",
  red: "#F64258",
  blue: "#50B6FF",
  orange: "#FF8F0C",
  yellow: "#FFFF00",
};

const cornerTemplates = [
  ["white", "orange", "blue"],
  ["white", "blue", "red"],
  ["white", "red", "green"],
  ["white", "green", "orange"],
  ["yellow", "orange", "green"],
  ["yellow", "green", "red"],
  ["yellow", "red", "blue"],
  ["yellow", "blue", "orange"],
];

const centerTemplates = ["white", "green", "red", "blue", "orange", "yellow"];

const viewConfig = {
  front: {
    top: {
      faceIndex: 0,
      paths: [10, 11, 12, 13, 14],
      stickers: [4, 0, 1, 2, 3],
    },
    left: {
      faceIndex: 1,
      paths: [0, 1, 2, 3, 4],
      stickers: [2, 1, 0, 4, 3],
    },
    right: {
      faceIndex: 2,
      paths: [5, 6, 7, 8, 9],
      stickers: [1, 0, 4, 3, 2],
    },
  },
  back: {
    top: {
      faceIndex: 5,
      paths: [10, 11, 12, 13, 14],
      stickers: [1, 0, 2, 3, 4],
    },
    left: {
      faceIndex: 4,
      paths: [0, 1, 2, 3, 4],
      stickers: [0, 2, 3, 4, 1],
    },
    right: {
      faceIndex: 3,
      paths: [5, 6, 7, 8, 9],
      stickers: [3, 0, 2, 1, 4],
    },
  },
};

const cycleCW = (arr) => [arr[arr.length - 1], ...arr.slice(0, arr.length - 1)];
const cycleCCW = (arr) => [...arr.slice(1), arr[0]];

function computeFaces(corners, centers) {
  const faces = Array.from({ length: 6 }, (_, i) => [centers[i]]);

  faces[0][1] = corners[0][0];
  faces[0][2] = corners[1][0];
  faces[0][3] = corners[2][0];
  faces[0][4] = corners[3][0];

  faces[1][1] = corners[3][1];
  faces[1][2] = corners[2][2];
  faces[1][3] = corners[5][1];
  faces[1][4] = corners[4][2];

  faces[2][1] = corners[2][1];
  faces[2][2] = corners[1][2];
  faces[2][3] = corners[6][1];
  faces[2][4] = corners[5][2];

  faces[3][1] = corners[1][1];
  faces[3][2] = corners[0][2];
  faces[3][3] = corners[7][1];
  faces[3][4] = corners[6][2];

  faces[4][1] = corners[0][1];
  faces[4][2] = corners[3][2];
  faces[4][3] = corners[7][2];
  faces[4][4] = corners[4][1];

  faces[5][1] = corners[4][0];
  faces[5][2] = corners[5][0];
  faces[5][3] = corners[6][0];
  faces[5][4] = corners[7][0];

  return faces;
}

function applyMove(face, mod, corners, centers) {
  switch (face) {
    case "U":
      if (mod === "'") {
        [centers[0], centers[3], centers[4]] = [centers[4], centers[0], centers[3]];
        corners[0] = cycleCCW(corners[0]);
        [corners[1], corners[3], corners[7]] = [
          cycleCW(corners[3]),
          cycleCW(corners[7]),
          cycleCW(corners[1]),
        ];
      } else {
        [centers[0], centers[3], centers[4]] = [centers[3], centers[4], centers[0]];
        corners[0] = cycleCW(corners[0]);
        [corners[1], corners[3], corners[7]] = [
          cycleCCW(corners[7]),
          cycleCCW(corners[1]),
          cycleCCW(corners[3]),
        ];
      }
      break;

    case "R":
      if (mod === "'") {
        [centers[2], centers[3], centers[5]] = [centers[3], centers[5], centers[2]];
        corners[6] = cycleCCW(corners[6]);
        [corners[1], corners[7], corners[5]] = [
          cycleCW(corners[7]),
          cycleCW(corners[5]),
          cycleCW(corners[1]),
        ];
      } else {
        [centers[2], centers[3], centers[5]] = [centers[5], centers[2], centers[3]];
        corners[6] = cycleCW(corners[6]);
        [corners[1], corners[7], corners[5]] = [
          cycleCCW(corners[5]),
          cycleCCW(corners[1]),
          cycleCCW(corners[7]),
        ];
      }
      break;

    case "L":
      if (mod === "'") {
        [centers[1], centers[4], centers[5]] = [centers[5], centers[1], centers[4]];
        corners[4] = cycleCCW(corners[4]);
        [corners[3], corners[5], corners[7]] = [
          cycleCW(corners[5]),
          cycleCW(corners[7]),
          cycleCW(corners[3]),
        ];
      } else {
        [centers[1], centers[4], centers[5]] = [centers[4], centers[5], centers[1]];
        corners[4] = cycleCW(corners[4]);
        [corners[3], corners[5], corners[7]] = [
          cycleCCW(corners[7]),
          cycleCCW(corners[3]),
          cycleCCW(corners[5]),
        ];
      }
      break;

    case "B":
      if (mod === "'") {
        [centers[3], centers[4], centers[5]] = [centers[4], centers[5], centers[3]];
        corners[7] = cycleCCW(corners[7]);
        [corners[0], corners[4], corners[6]] = [
          cycleCW(corners[4]),
          cycleCW(corners[6]),
          cycleCW(corners[0]),
        ];
      } else {
        [centers[3], centers[4], centers[5]] = [centers[5], centers[3], centers[4]];
        corners[7] = cycleCW(corners[7]);
        [corners[0], corners[4], corners[6]] = [
          cycleCCW(corners[6]),
          cycleCCW(corners[0]),
          cycleCCW(corners[4]),
        ];
      }
      break;

    default:
      break;
  }
}

function getFaces(scramble) {
  const corners = cornerTemplates.map((corner) => [...corner]);
  const centers = [...centerTemplates];
  const moves = String(scramble || "").trim().split(/\s+/).filter(Boolean);

  for (const move of moves) {
    applyMove(move[0], move.slice(1), corners, centers);
  }

  return computeFaces(corners, centers);
}

export default function SkewbSVG({
  scramble = "U R B L U B L U",
  size = 60,
  showFront = true,
}) {
  const containerRef = useRef(null);
  const faces = useMemo(() => getFaces(scramble), [scramble]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const svg = root.querySelector("svg");
    if (!svg) return;

    const paths = svg.querySelectorAll("path");
    if (!paths || paths.length < 15) return;

    const config = showFront ? viewConfig.front : viewConfig.back;

    Object.values(config).forEach(({ faceIndex, paths: facePaths, stickers }) => {
      const face = faces[faceIndex];
      if (!face) {
        return;
      }

      facePaths.forEach((pathIndex, pathOrderIndex) => {
        const stickerIndex = stickers[pathOrderIndex];
        const color = colorMap[face[stickerIndex]];
        if (color && paths[pathIndex]) {
          paths[pathIndex].setAttribute("fill", color);
        }
      });
    });
  }, [faces, showFront]);

  const px = Math.round(size * 2.45);

  return (
    <div
      ref={containerRef}
      className="skewbContainer"
      style={{ width: `${px}px` }}
    >
      <SkewbTemplate className="skewbArt" />
    </div>
  );
}
