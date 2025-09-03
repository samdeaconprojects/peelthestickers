//copy of Pyra for now

// src/components/PuzzleSVGs/PyraminxSVG.js
import React, { useState, useEffect } from 'react';

const FACE_COLORS = {
  green:  '#12EA68',
  blue:   '#50B6FF',
  red:    '#F64258',
  yellow: '#FFFF00'
};

const faceNames = ['green', 'blue', 'red', 'yellow'];

export default function PyraminxSVG({
  scramble = "B R U R' L U' L U l b",
  size = 40
}) {
  const [faces, setFaces] = useState(faceNames.map(color => Array(9).fill(color)));
  const [pair, setPair] = useState(0); // 0: green/red, 1: red/blue, 2: blue/green, 3: yellow/green

  useEffect(() => {
    const f = faceNames.map(color => Array(9).fill(color));

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
      const swap = (a, b, c) =>
        mod === "'" ? [b, c, a] : [c, a, b];
      [[8, 4, 4], [3, 6, 6], [7, 5, 5], [6, 1, 1]].forEach(([i0, i1, i2]) => {
        [f[0][i0], f[1][i1], f[3][i2]] = swap(f[0][i0], f[1][i1], f[3][i2]);
      });
    }
    function rCorner(mod) {
      [f[0][8], f[1][4], f[3][4]] =
        mod === "'" ? [f[1][4], f[3][4], f[0][8]] : [f[3][4], f[0][8], f[1][4]];
    }
    function Left(mod) {
      const swap = (a, b, c) =>
        mod === "'" ? [c, a, b] : [b, c, a];
      [[4, 8, 8], [1, 6, 6], [5, 7, 7], [6, 3, 3]].forEach(([i0, i1, i2]) => {
        [f[0][i0], f[2][i1], f[3][i2]] = swap(f[0][i0], f[2][i1], f[3][i2]);
      });
    }
    function lCorner(mod) {
      [f[0][4], f[2][8], f[3][8]] =
        mod === "'" ? [f[3][8], f[0][4], f[2][8]] : [f[2][8], f[3][8], f[0][4]];
    }
    function Back(mod) {
      const swap = (a, b, c) =>
        mod === "'" ? [b, c, a] : [c, a, b];
      [[8, 4, 0], [3, 6, 1], [7, 5, 2], [6, 1, 3]].forEach(([i1, i2, i3]) => {
        [f[1][i1], f[2][i2], f[3][i3]] = swap(f[1][i1], f[2][i2], f[3][i3]);
      });
    }
    function bCorner(mod) {
      [f[1][8], f[2][4], f[3][0]] =
        mod === "'" ? [f[2][4], f[3][0], f[1][8]] : [f[3][0], f[1][8], f[2][4]];
    }

    scramble.trim().split(/\s+/).forEach(m => {
      const face = m[0];
      const mod = m.includes("'") ? "'" : '';
      ({ U: Up, u: uCorner, R: Right, r: rCorner, L: Left, l: lCorner, B: Back, b: bCorner }[face] || (() => {}))(mod);
    });

    setFaces(f);
  }, [scramble]);

  const h = Math.sqrt(3) / 2 * size;
  const triPts = `0,0 ${size / 2},${-h} ${-size / 2},${-h}`;

  function drawFace(faceCols, tx, ty, rot = 0, scale = 1) {
    return (
      <g transform={`translate(${tx},${ty}) rotate(${rot}) scale(${scale})`}>
        {/* center trio */}
        <g>
          <polygon points={triPts} fill={FACE_COLORS[faceCols[2]]} stroke="#000" />
          <g transform="rotate(120)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[7]]} stroke="#000" />
          </g>
          <g transform="rotate(240)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[5]]} stroke="#000" />
          </g>
        </g>
        {/* edges */}
        <g transform="rotate(60)">
          <polygon points={triPts} fill={FACE_COLORS[faceCols[3]]} stroke="#000" />
          <g transform="rotate(120)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[6]]} stroke="#000" />
            <g transform="rotate(120)">
              <polygon points={triPts} fill={FACE_COLORS[faceCols[1]]} stroke="#000" />
            </g>
          </g>
        </g>
        {/* corners */}
        {[0, 8, 4].map((idx, i) => (
          <g key={i} transform={`rotate(${120 * i}) translate(0,${-2 * h}) rotate(180)`}>
            <polygon points={triPts} fill={FACE_COLORS[faceCols[idx]]} stroke="#000" />
          </g>
        ))}
      </g>
    );
  }

  const facePairs = [
    [0, 2], // green + red
    [2, 1], // red + blue
    [1, 0], // blue + green
    [3, 0]  // yellow + green
  ];

  const [a, b] = facePairs[pair];
  const gapX = size * 3.8;
  const centerY = size * 4;

  return (
    <div>
      <svg
        width={gapX * 3}
        height={centerY * 2}
        viewBox={`0 0 ${gapX * 3} ${centerY * 2}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {drawFace(faces[a], gapX, centerY, -15, 1)}
        {drawFace(faces[b], gapX * 2.2, centerY, 15, 1)}
      </svg>
      <button onClick={() => setPair((pair + 1) % facePairs.length)} style={{ marginTop: '8px' }}>
        Switch Faces
      </button>
    </div>
  );
}
