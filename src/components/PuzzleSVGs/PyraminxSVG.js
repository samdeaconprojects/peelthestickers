// src/components/PuzzleSVGs/PyraminxSVG.js
import React, { useEffect, useRef, useState } from "react";
import { ReactComponent as PyraminxTemplate } from "../../assets/PyraminxSVG.svg";

const FACE_COLORS = {
  green: "#12EA68",
  blue: "#50B6FF",
  red: "#F64258",
  yellow: "#FFFF00",
};

const faceNames = ["green", "blue", "red", "yellow"];
const FRONT_LEFT_FACE_PATH_TO_STICKER = [0, 2, 1, 3, 4, 5, 6, 7, 8];
const FRONT_RIGHT_FACE_PATH_TO_STICKER = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const BACK_FACE_PATH_TO_STICKER = [8, 3, 7, 6, 0, 2, 1, 5, 4];

export default function PyraminxSVG({
  scramble = "B R U R' L U' L U l b",
  size = 40,          // controls rendered size
  showFront = true,   // ✅ controlled by PuzzleSVG flip button
}) {
  const containerRef = useRef(null);
  const isFrontView = !showFront;

  // faces[faceIndex][stickerIndex] where stickerIndex is 0..8
  const [faces, setFaces] = useState(
    faceNames.map((c) => Array(9).fill(c))
  );

  // --- scramble -> face stickers (your existing logic) ---
  useEffect(() => {
    const f = faceNames.map((color) => Array(9).fill(color));

    function Up(mod) {
      for (let i = 0; i < 4; i++) {
        [f[0][i], f[1][i], f[2][i]] =
          mod === "'"
            ? [f[2][i], f[0][i], f[1][i]]
            : [f[1][i], f[2][i], f[0][i]];
      }
    }
    function uCorner(mod) {
      [f[0][0], f[1][0], f[2][0]] =
        mod === "'"
          ? [f[2][0], f[0][0], f[1][0]]
          : [f[1][0], f[2][0], f[0][0]];
    }
    function Right(mod) {
      const swap = (a, b, c) => (mod === "'" ? [b, c, a] : [c, a, b]);
      [[8, 4, 4], [3, 6, 6], [7, 5, 5], [6, 1, 1]].forEach(([i0, i1, i2]) => {
        [f[0][i0], f[1][i1], f[3][i2]] = swap(f[0][i0], f[1][i1], f[3][i2]);
      });
    }
    function rCorner(mod) {
      [f[0][8], f[1][4], f[3][4]] =
        mod === "'"
          ? [f[1][4], f[3][4], f[0][8]]
          : [f[3][4], f[0][8], f[1][4]];
    }
    function Left(mod) {
      const swap = (a, b, c) => (mod === "'" ? [c, a, b] : [b, c, a]);
      [[4, 8, 8], [1, 6, 6], [5, 7, 7], [6, 3, 3]].forEach(([i0, i1, i2]) => {
        [f[0][i0], f[2][i1], f[3][i2]] = swap(f[0][i0], f[2][i1], f[3][i2]);
      });
    }
    function lCorner(mod) {
      [f[0][4], f[2][8], f[3][8]] =
        mod === "'"
          ? [f[3][8], f[0][4], f[2][8]]
          : [f[2][8], f[3][8], f[0][4]];
    }
    function Back(mod) {
      const swap = (a, b, c) => (mod === "'" ? [b, c, a] : [c, a, b]);
      [[8, 4, 0], [3, 6, 1], [7, 5, 2], [6, 1, 3]].forEach(([i1, i2, i3]) => {
        [f[1][i1], f[2][i2], f[3][i3]] = swap(f[1][i1], f[2][i2], f[3][i3]);
      });
    }
    function bCorner(mod) {
      [f[1][8], f[2][4], f[3][0]] =
        mod === "'"
          ? [f[2][4], f[3][0], f[1][8]]
          : [f[3][0], f[1][8], f[2][4]];
    }

    scramble?.trim()?.split(/\s+/).forEach((m) => {
      const face = m[0];
      const mod = m.includes("'") ? "'" : "";
      ({ U: Up, u: uCorner, R: Right, r: rCorner, L: Left, l: lCorner, B: Back, b: bCorner }[
        face
      ] || (() => {}))(mod);
    });

    setFaces(f);
  }, [scramble]);

  // --- apply colors into the Figma SVG paths ---
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // The rendered SVG element will be inside this container
    const svg = root.querySelector("svg");
    if (!svg) return;

    const paths = svg.querySelectorAll("path");
    if (!paths || paths.length < 18) return;

    // Match the p5 face layout:
    // front view = green, blue
    // back view = red, yellow
    const [leftFaceIdx, rightFaceIdx] = isFrontView ? [0, 1] : [2, 3];

    const left = faces[leftFaceIdx];
    const right = faces[rightFaceIdx];
    const leftPathToSticker = isFrontView
      ? FRONT_LEFT_FACE_PATH_TO_STICKER
      : BACK_FACE_PATH_TO_STICKER;
    const rightPathToSticker = isFrontView
      ? FRONT_RIGHT_FACE_PATH_TO_STICKER
      : BACK_FACE_PATH_TO_STICKER;

    // The template path order does not match the logical sticker order from the p5 model,
    // so we remap each visible face explicitly before writing colors.
    for (let i = 0; i < 9; i++) {
      const p = paths[i];
      const c = left?.[leftPathToSticker[i]];
      if (c && FACE_COLORS[c]) p.setAttribute("fill", FACE_COLORS[c]);
    }
    for (let i = 0; i < 9; i++) {
      const p = paths[i + 9];
      const c = right?.[rightPathToSticker[i]];
      if (c && FACE_COLORS[c]) p.setAttribute("fill", FACE_COLORS[c]);
    }
  }, [faces, isFrontView]);

  // Size the whole SVG nicely. Your SVG has a huge native viewBox,
  // so scaling via CSS width works great.
  const px = Math.round(size * 2.6);
  const pad = Math.max(4, Math.round(size * 0.08));

  return (
    <div
      ref={containerRef}
      style={{
        display: "inline-block",
        padding: pad,
        boxSizing: "border-box",
        width: px + pad * 2,
        height: "auto",
      }}
    >
      <PyraminxTemplate
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
    </div>
  );

}
