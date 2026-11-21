// src/components/PuzzleSVGs/PuzzleNetSVG.js
// Flat "cube map" view: every face of the puzzle laid out as an unfolded net.
// NxN / Skewb use the standard cross (U on top; L F R B across; D below F).
// Pyraminx unfolds around the green front face into one big triangle.
import React, { useMemo } from "react";
import { useCubeColors } from "../../utils/cubeColors";
import { getScrambledFaces } from "../scrambleUtils";
import { getSkewbFaces } from "./SkewbSVG";
import { getPyraminxFaces } from "./PyraminxSVG";


const NXN_SIZE_BY_EVENT = {
  "222": 2,
  "333": 3,
  "333OH": 3,
  "333BLD": 3,
  "444": 4,
  "555": 5,
  "666": 6,
  "777": 7,
};

export function supportsPuzzleNet(event) {
  return !!NXN_SIZE_BY_EVENT[event] || event === "SKEWB" || event === "PYRAMINX";
}

// Face indices follow scrambleUtils / SkewbSVG: 0 U, 1 F, 2 R, 3 B, 4 L, 5 D.
// [faceIndex, column, row] in the net grid.
const CROSS_LAYOUT = [
  [0, 1, 0],
  [4, 0, 1],
  [1, 1, 1],
  [2, 2, 1],
  [3, 3, 1],
  [5, 1, 2],
];

const FACE = 100;
const FACE_GAP = 8;
const CROSS_W = FACE * 4 + FACE_GAP * 3;
const CROSS_H = FACE * 3 + FACE_GAP * 2;

// Set per render from the user's colour scheme (see PuzzleNetSVG below).
let COLORS = {};
const fill = (name) => COLORS[name] || "#3a3f44";

function shrinkPolygon(points, factor) {
  const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  return points
    .map(([x, y]) => `${(cx + (x - cx) * factor).toFixed(2)},${(cy + (y - cy) * factor).toFixed(2)}`)
    .join(" ");
}

function renderCubeNet(n, faces) {
  const stickerGap = n <= 3 ? 6 : n <= 5 ? 4 : 3;
  const cell = (FACE - stickerGap * (n - 1)) / n;
  const radius = cell * 0.025;
  const out = [];

  CROSS_LAYOUT.forEach(([faceIndex, col, row]) => {
    const face = faces?.[faceIndex];
    const ox = col * (FACE + FACE_GAP);
    const oy = row * (FACE + FACE_GAP);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        out.push(
          <rect
            key={`${faceIndex}-${r}-${c}`}
            x={ox + c * (cell + stickerGap)}
            y={oy + r * (cell + stickerGap)}
            width={cell}
            height={cell}
            rx={radius}
            ry={radius}
            fill={fill(face?.[r]?.[c])}
          />
        );
      }
    }
  });

  return out;
}

// Skewb corner sticker slots (faces[i][1..4]) by screen corner of each net face.
// Every face lists TL, TR, BR, BL except L, whose last two slots are BL, BR.
const SKEWB_CORNER_ORDER = {
  default: ["tl", "tr", "br", "bl"],
  4: ["tl", "tr", "bl", "br"],
};

function renderSkewbNet(faces) {
  const out = [];
  const shrink = 0.84;

  CROSS_LAYOUT.forEach(([faceIndex, col, row]) => {
    const face = faces?.[faceIndex] || [];
    const x = col * (FACE + FACE_GAP);
    const y = row * (FACE + FACE_GAP);
    const s = FACE;
    const h = s / 2;

    const corners = {
      tl: [[x, y], [x + h, y], [x, y + h]],
      tr: [[x + s, y], [x + s, y + h], [x + h, y]],
      br: [[x + s, y + s], [x + h, y + s], [x + s, y + h]],
      bl: [[x, y + s], [x, y + h], [x + h, y + s]],
    };
    const center = [[x + h, y], [x + s, y + h], [x + h, y + s], [x, y + h]];

    out.push(
      <polygon
        key={`${faceIndex}-c`}
        points={shrinkPolygon(center, 0.9)}
        fill={fill(face[0])}
        strokeLinejoin="round"
      />
    );

    const order = SKEWB_CORNER_ORDER[faceIndex] || SKEWB_CORNER_ORDER.default;
    order.forEach((slot, i) => {
      out.push(
        <polygon
          key={`${faceIndex}-${slot}`}
          points={shrinkPolygon(corners[slot], shrink)}
          fill={fill(face[i + 1])}
        />
      );
    });
  });

  return out;
}

// Pyraminx: each face is given by its three tips [A (sticker 0), B (sticker 4),
// C (sticker 8)] as seen from outside. Unfolded around the front (green) face.
const PYRA_SIDE = 100;
const PYRA_H = (PYRA_SIDE * Math.sqrt(3)) / 2;
const PYRA_GAP = 7;

function pyraFaceTips() {
  const s = PYRA_SIDE;
  const h = PYRA_H;
  const U = [s, 0];
  const L = [s / 2, h];
  const R = [(3 * s) / 2, h];
  return [
    { faceIndex: 0, tips: [U, L, R] }, // green, front
    { faceIndex: 2, tips: [U, [0, 0], L] }, // red, left (U, B, L)
    { faceIndex: 1, tips: [U, R, [2 * s, 0]] }, // blue, right (U, R, B)
    { faceIndex: 3, tips: [[s, 2 * h], R, L] }, // yellow, bottom (B, R, L)
  ];
}

function renderPyraminxNet(faces) {
  const out = [];
  const faceDefs = pyraFaceTips();
  const centroid = (pts) => [
    pts.reduce((a, [x]) => a + x, 0) / pts.length,
    pts.reduce((a, [, y]) => a + y, 0) / pts.length,
  ];
  const [fx, fy] = centroid(faceDefs[0].tips);

  faceDefs.forEach(({ faceIndex, tips }) => {
    // push outer faces away from the front face to open a gap between them
    const [cx, cy] = centroid(tips);
    const dx = cx - fx;
    const dy = cy - fy;
    const len = Math.hypot(dx, dy) || 1;
    const offset = faceIndex === 0 ? [0, 0] : [(dx / len) * PYRA_GAP, (dy / len) * PYRA_GAP];
    const [A, B, C] = tips.map(([x, y]) => [x + offset[0], y + offset[1]]);

    const P = (i, j) => [
      A[0] + ((B[0] - A[0]) * i) / 3 + ((C[0] - B[0]) * j) / 3,
      A[1] + ((B[1] - A[1]) * i) / 3 + ((C[1] - B[1]) * j) / 3,
    ];

    const face = faces?.[faceIndex] || [];
    let sticker = 0;
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k <= r; k++) {
        const up = [P(r, k), P(r + 1, k), P(r + 1, k + 1)];
        out.push(
          <polygon
            key={`${faceIndex}-${sticker}`}
            points={shrinkPolygon(up, 0.8)}
            fill={fill(face[sticker])}
          />
        );
        sticker++;
        if (k < r) {
          const down = [P(r, k), P(r, k + 1), P(r + 1, k + 1)];
          out.push(
            <polygon
              key={`${faceIndex}-${sticker}`}
              points={shrinkPolygon(down, 0.8)}
              fill={fill(face[sticker])}
            />
          );
          sticker++;
        }
      }
    }
  });

  return out;
}

// viewBox for the pyraminx net including the gap offsets
const PYRA_PAD = PYRA_GAP + 1;
const PYRA_VIEWBOX = `${-PYRA_PAD} ${-PYRA_PAD} ${2 * PYRA_SIDE + PYRA_PAD * 2} ${2 * PYRA_H + PYRA_PAD * 2}`;

/**
 * width: rendered pixel width of the net. Height follows the net's aspect.
 */
export default function PuzzleNetSVG({ event, scramble, width = 160 }) {
  const cubeColors = useCubeColors();
  const content = useMemo(() => {
    COLORS = cubeColors;
    const n = NXN_SIZE_BY_EVENT[event];
    if (n) {
      return {
        viewBox: `0 0 ${CROSS_W} ${CROSS_H}`,
        aspect: CROSS_H / CROSS_W,
        shapes: renderCubeNet(n, getScrambledFaces(scramble || "", event)),
      };
    }
    if (event === "SKEWB") {
      return {
        viewBox: `0 0 ${CROSS_W} ${CROSS_H}`,
        aspect: CROSS_H / CROSS_W,
        shapes: renderSkewbNet(getSkewbFaces(scramble || "")),
      };
    }
    if (event === "PYRAMINX") {
      return {
        viewBox: PYRA_VIEWBOX,
        aspect: (2 * PYRA_H + PYRA_PAD * 2) / (2 * PYRA_SIDE + PYRA_PAD * 2),
        shapes: renderPyraminxNet(getPyraminxFaces(scramble || "")),
      };
    }
    return null;
  }, [event, scramble, cubeColors]);

  if (!content) return null;

  const height = Math.round(width * content.aspect);

  return (
    <svg
      className="puzzle-net-svg"
      viewBox={content.viewBox}
      // inline size wins over container rules like `.playerbar-cube svg`
      style={{ width: `${width}px`, height: `${height}px`, display: "block", overflow: "visible" }}
      role="img"
      aria-label={`${event} scramble map`}
    >
      {content.shapes}
    </svg>
  );
}
