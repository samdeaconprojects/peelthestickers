// src/components/PuzzleSVGs/PyraminxSVG.js
import React, { useState, useEffect } from 'react';

const FACE_COLORS = {
  green:  '#12EA68',
  blue:   '#50B6FF',
  red:    '#F64258',
  yellow: '#FFFF00'
};

export default function PyraminxSVG({
  scramble = "B R U R' L U' L U l b",
  size = 40       // triangle edge length
}) {
  const faceNames = ['green', 'blue', 'red', 'yellow'];
  // faces: array of 4 faces, each an array of 9 color‑strings
  const [faces, setFaces] = useState(
    faceNames.map(color => Array(9).fill(color))
  );

  useEffect(() => {
    // initialize faces
    const f = faceNames.map(color => Array(9).fill(color));

    // the six moves from your p5 code
    function Up(mod) {
      if (mod === "'") {
        for (let i = 0; i < 4; i++) {
          [f[0][i], f[1][i], f[2][i]] = [f[2][i], f[0][i], f[1][i]];
        }
      } else {
        for (let i = 0; i < 4; i++) {
          [f[0][i], f[1][i], f[2][i]] = [f[1][i], f[2][i], f[0][i]];
        }
      }
    }
    function uCorner(mod) {
      if (mod === "'") {
        [f[0][0], f[1][0], f[2][0]] = [f[2][0], f[0][0], f[1][0]];
      } else {
        [f[0][0], f[1][0], f[2][0]] = [f[1][0], f[2][0], f[0][0]];
      }
    }
    function Right(mod) {
      if (mod === "'") {
        [f[0][8],f[1][4],f[3][4]] = [f[1][4],f[3][4],f[0][8]];
        [f[0][3],f[1][6],f[3][6]] = [f[1][6],f[3][6],f[0][3]];
        [f[0][7],f[1][5],f[3][5]] = [f[1][5],f[3][5],f[0][7]];
        [f[0][6],f[1][1],f[3][1]] = [f[1][1],f[3][1],f[0][6]];
      } else {
        [f[0][8],f[1][4],f[3][4]] = [f[3][4],f[0][8],f[1][4]];
        [f[0][3],f[1][6],f[3][6]] = [f[3][6],f[0][3],f[1][6]];
        [f[0][7],f[1][5],f[3][5]] = [f[3][5],f[0][7],f[1][5]];
        [f[0][6],f[1][1],f[3][1]] = [f[3][1],f[0][6],f[1][1]];
      }
    }
    function rCorner(mod) {
      if (mod === "'") {
        [f[0][8],f[1][4],f[3][4]] = [f[1][4],f[3][4],f[0][8]];
      } else {
        [f[0][8],f[1][4],f[3][4]] = [f[3][4],f[0][8],f[1][4]];
      }
    }
    function Left(mod) {
      if (mod === "'") {
        [f[0][4],f[2][8],f[3][8]] = [f[3][8],f[0][4],f[2][8]];
        [f[0][1],f[2][6],f[3][6]] = [f[3][6],f[0][1],f[2][6]];
        [f[0][5],f[2][7],f[3][7]] = [f[3][7],f[0][5],f[2][7]];
        [f[0][6],f[2][3],f[3][3]] = [f[3][3],f[0][6],f[2][3]];
      } else {
        [f[0][4],f[2][8],f[3][8]] = [f[2][8],f[3][8],f[0][4]];
        [f[0][1],f[2][6],f[3][6]] = [f[2][6],f[3][6],f[0][1]];
        [f[0][5],f[2][7],f[3][7]] = [f[2][7],f[3][7],f[0][5]];
        [f[0][6],f[2][3],f[3][3]] = [f[2][3],f[3][3],f[0][6]];
      }
    }
    function lCorner(mod) {
      if (mod === "'") {
        [f[0][4],f[2][8],f[3][8]] = [f[3][8],f[0][4],f[2][8]];
      } else {
        [f[0][4],f[2][8],f[3][8]] = [f[2][8],f[3][8],f[0][4]];
      }
    }
    function Back(mod) {
      if (mod === "'") {
        [f[1][8],f[2][4],f[3][0]] = [f[2][4],f[3][0],f[1][8]];
        [f[1][3],f[2][6],f[3][1]] = [f[2][6],f[3][1],f[1][3]];
        [f[1][7],f[2][5],f[3][2]] = [f[2][5],f[3][2],f[1][7]];
        [f[1][6],f[2][1],f[3][3]] = [f[2][1],f[3][3],f[1][6]];
      } else {
        [f[1][8],f[2][4],f[3][0]] = [f[3][0],f[1][8],f[2][4]];
        [f[1][3],f[2][6],f[3][1]] = [f[3][1],f[1][3],f[2][6]];
        [f[1][7],f[2][5],f[3][2]] = [f[3][2],f[1][7],f[2][5]];
        [f[1][6],f[2][1],f[3][3]] = [f[3][3],f[1][6],f[2][1]];
      }
    }
    function bCorner(mod) {
      if (mod === "'") {
        [f[1][8],f[2][4],f[3][0]] = [f[2][4],f[3][0],f[1][8]];
      } else {
        [f[1][8],f[2][4],f[3][0]] = [f[3][0],f[1][8],f[2][4]];
      }
    }

    // parse & apply your scramble
    scramble.trim().split(/\s+/).forEach(m => {
      const face = m.replace(/[^A-Za-z]/g,'');
      const mod = m.includes("'") ? "'" : '';
      switch (face) {
        case 'U':  Up(mod);    break;
        case 'u':  uCorner(mod); break;
        case 'R':  Right(mod); break;
        case 'r':  rCorner(mod); break;
        case 'L':  Left(mod);  break;
        case 'l':  lCorner(mod); break;
        case 'B':  Back(mod);  break;
        case 'b':  bCorner(mod); break;
        default: break;
      }
    });

    setFaces(f);
  }, [scramble]);

  // equilateral triangle points, pointing up, with one vertex at (0,0)
  const h = Math.sqrt(3) / 2 * size;
  const triPts = `0,0 ${ size/2 },${ -h } ${ -size/2 },${ -h }`;

  // draw one face as an SVG <g>
  function drawFace(faceCols, tx) {
    return (
      <g key={tx} transform={`translate(${tx},${size*3})`}>
        {/* center trio */}
        <g>
          <polygon points={triPts} fill={FACE_COLORS[faceCols[2]]} stroke="#000"/>
          <g transform="rotate(120)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[7]]} stroke="#000"/>
          </g>
          <g transform="rotate(240)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[5]]} stroke="#000"/>
          </g>
        </g>
        {/* edges */}
        <g transform="rotate(60)">
          <polygon points={triPts} fill={FACE_COLORS[faceCols[3]]} stroke="#000"/>
          <g transform="rotate(120)">
            <polygon points={triPts} fill={FACE_COLORS[faceCols[6]]} stroke="#000"/>
            <g transform="rotate(120)">
              <polygon points={triPts} fill={FACE_COLORS[faceCols[1]]} stroke="#000"/>
            </g>
          </g>
        </g>
        {/* corners */}
        <g transform={`translate(0,${ -2*h }) rotate(180)`}>
          <polygon points={triPts} fill={FACE_COLORS[faceCols[0]]} stroke="#000"/>
        </g>
        <g transform="rotate(120)">
          <g transform={`translate(0,${ -2*h }) rotate(180)`}>
            <polygon points={triPts} fill={FACE_COLORS[faceCols[8]]} stroke="#000"/>
          </g>
        </g>
        <g transform="rotate(240)">
          <g transform={`translate(0,${ -2*h }) rotate(180)`}>
            <polygon points={triPts} fill={FACE_COLORS[faceCols[4]]} stroke="#000"/>
          </g>
        </g>
      </g>
    );
  }

  // spacing between face centers = 5×size
  const gap = size * 5;
  // we'll position at x = gap, 2·gap, 3·gap, 4·gap; y = 3·size
  const viewWidth  = gap * 5;
  const viewHeight = gap * 2;

  return (
    <svg
      width={viewWidth}
      height={viewHeight}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {faces.map((fc, i) => drawFace(fc, gap * (i + 1)))}
    </svg>
  );
}
