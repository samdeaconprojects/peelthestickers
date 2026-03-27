// src/components/PuzzleSVGs/Square1SVG.js
import React, { useRef, useEffect, useState } from 'react';

const sin15 = Math.sin(Math.PI / 180 * 15);
const createSolvedSquare1 = () => ({
  group1: [['yellow', 'orange', 'green'], ['yellow', 'green'], ['yellow', 'green', 'red'], ['yellow', 'red']],
  group2: [['yellow', 'red', 'blue'], ['yellow', 'blue'], ['yellow', 'blue', 'orange'], ['yellow', 'orange']],
  group3: [['white', 'red'], ['white', 'red', 'green'], ['white', 'green'], ['white', 'green', 'orange']],
  group4: [['white', 'orange'], ['white', 'orange', 'blue'], ['white', 'blue'], ['white', 'blue', 'red']],
  middleEdge: 0,
});

export default function Square1SVG({
  scramble = "(-5,0)/ (3,6)/ (5,-4)/ (-3,0)/ (1,-3)/ (0,-3)/ (0,-2)/ (0,-1)/ (-4,0)/ (0,-1)/ (4,0)/ (-3,-5)/",
  size = 50,
  backThickness = 10,
  showFront = true, // ✅ controlled by PuzzleSVG (true = show top, false = show bottom)
}) {
  const square1 = useRef(createSolvedSquare1());

  const [, setVersion] = useState(0);

  function pieceUnits(piece) {
    return piece.length === 2 ? 1 : 2;
  }

  function isSlashable(topRight, bottomRight) {
    const topUnits = topRight.reduce((sum, piece) => sum + pieceUnits(piece), 0);
    const bottomUnits = bottomRight.reduce((sum, piece) => sum + pieceUnits(piece), 0);
    return topUnits === 6 && bottomUnits === 6;
  }

  function rotateClockwise(rightGroup, leftGroup, pieceCountRight, pieceCountLeft) {
    for (let i = 0; i < pieceCountRight; i++) {
      const lastElementRight = rightGroup.pop();
      leftGroup.unshift(lastElementRight);
    }

    for (let i = 0; i < pieceCountLeft; i++) {
      const lastElementLeft = leftGroup.pop();
      rightGroup.unshift(lastElementLeft);
    }
  }

  function rotateCounterClockwise(rightGroup, leftGroup, pieceCountRight, pieceCountLeft) {
    for (let i = 0; i < pieceCountRight; i++) {
      const firstElementRight = rightGroup.shift();
      leftGroup.push(firstElementRight);
    }

    for (let i = 0; i < pieceCountLeft; i++) {
      const firstElementLeft = leftGroup.shift();
      rightGroup.push(firstElementLeft);
    }
  }

  function slash() {
    const s = square1.current;
    if (isSlashable(s.group1, s.group3)) {
      [s.group1, s.group3] = [s.group3, s.group1];
      s.middleEdge++;
    }
  }

  function turnClockwise(isTop, count) {
    const s = square1.current;
    const rightGroup = isTop ? s.group1 : s.group3;
    const leftGroup = isTop ? s.group2 : s.group4;

    let pieceCountRight = 0;
    let pieceCountLeft = 0;

    for (let i = 0; i < count; i++) {
      const piece = rightGroup[rightGroup.length - 1 - pieceCountRight];
      if (!piece) return;
      if (piece.length !== 2) {
        i++;
      }
      pieceCountRight++;
    }

    for (let i = 0; i < count; i++) {
      const piece = leftGroup[leftGroup.length - 1 - pieceCountLeft];
      if (!piece) return;
      if (piece.length === 2) {
        pieceCountLeft++;
      } else {
        i++;
        if (i !== count) {
          pieceCountLeft++;
        }
      }
    }

    rotateClockwise(rightGroup, leftGroup, pieceCountRight, pieceCountLeft);
  }

  function turnCounterClockwise(isTop, count) {
    const s = square1.current;
    const rightGroup = isTop ? s.group1 : s.group3;
    const leftGroup = isTop ? s.group2 : s.group4;

    let pieceCountRight = 0;
    let pieceCountLeft = 0;

    for (let i = 0; i < count; i++) {
      const piece = rightGroup[pieceCountRight];
      if (!piece) return;
      if (piece.length === 2) {
        pieceCountRight++;
      } else {
        i++;
        if (i !== count) {
          pieceCountRight++;
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const piece = leftGroup[pieceCountLeft];
      if (!piece) return;
      if (piece.length !== 2) {
        i++;
      }
      pieceCountLeft++;
    }

    rotateCounterClockwise(rightGroup, leftGroup, pieceCountRight, pieceCountLeft);
  }

  useEffect(() => {
    square1.current = createSolvedSquare1();
    const tokens = String(scramble || "").match(/\([^)]*\)|\//g) || [];

    tokens.forEach((token) => {
      if (token === '/') {
        slash();
        return;
      }

      const [topMove, bottomMove] = token
        .slice(1, -1)
        .split(',')
        .map(Number);

      if (topMove > 0) {
        turnClockwise(true, topMove);
      } else if (topMove < 0) {
        turnCounterClockwise(true, Math.abs(topMove));
      }

      if (bottomMove > 0) {
        turnClockwise(false, bottomMove);
      } else if (bottomMove < 0) {
        turnCounterClockwise(false, Math.abs(bottomMove));
      }
    });

    setVersion((v) => v + 1);
  }, [scramble]);

  function drawFace(gA, gB) {
    const all = [...gA, ...gB];
    let acc = 0;

    return all.map((piece, i) => {
      const isEdge = piece.length === 2;
      const rot = acc + (isEdge ? 30 : 0);
      acc += isEdge ? 30 : 60;

      if (isEdge) {
        return (
          <g key={i} transform={`rotate(${rot})`}>
            <path
              d={`M0 0 L${-size*sin15} ${-size} L${size*sin15} ${-size}Z`}
              fill={piece[0]} stroke="#000"
            />
            <path
              d={`M${-size*sin15} ${-size} L${size*sin15} ${-size}
                  L${size*sin15} ${-size-backThickness} L${-size*sin15} ${-size-backThickness}Z`}
              fill={piece[1]} stroke="#000"
            />
          </g>
        );
      }

      return (
        <g key={i} transform={`rotate(${rot})`}>
          <path
            d={`M0 0 L${size*sin15} ${-size} L${size} ${-size} L${size} ${-size*sin15}Z`}
            fill={piece[0]} stroke="#000"
          />
          <path
            d={`M${size*sin15} ${-size} L${size} ${-size}
                L${size} ${-size-backThickness} L${size*sin15} ${-size-backThickness}Z`}
            fill={piece[1]} stroke="#000"
          />
          <path
            d={`M${size} ${-size*sin15} L${size} ${-size}
                L${size+backThickness} ${-size} L${size+backThickness} ${-size*sin15}Z`}
            fill={piece[2]} stroke="#000"
          />
        </g>
      );
    });
  }

const r = size + backThickness;
//const pad = Math.max(4, backThickness); 
const pad = 34;
const W = (r * 2) + (pad * 2);
const H = (r * 2) + (pad * 2);
const cx = pad + r;
const cy = pad + r;


  const faceA = showFront ? square1.current.group1 : square1.current.group3;
  const faceB = showFront ? square1.current.group2 : square1.current.group4;

  return (
    <svg
  width={W}
  height={H}
  viewBox={`0 0 ${W} ${H}`}
  xmlns="http://www.w3.org/2000/svg"
>
  <g transform={`translate(${cx},${cy})`}>
    {drawFace(faceA, faceB)}
  </g>
</svg>

  );
}
