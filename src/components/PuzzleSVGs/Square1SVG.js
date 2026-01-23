// src/components/PuzzleSVGs/Square1SVG.js
import React, { useRef, useEffect, useState } from 'react';

const sin15 = Math.sin(Math.PI / 180 * 15);

export default function Square1SVG({
  scramble = "(-5,0)/ (3,6)/ (5,-4)/ (-3,0)/ (1,-3)/ (0,-3)/ (0,-2)/ (0,-1)/ (-4,0)/ (0,-1)/ (4,0)/ (-3,-5)/",
  size = 50,
  backThickness = 10,
  showFront = true, // ✅ controlled by PuzzleSVG (true = show top, false = show bottom)
}) {
  const square1 = useRef({
    group1: [['yellow','orange','green'], ['yellow','green'], ['yellow','green','red'], ['yellow','red']],
    group2: [['yellow','red','blue'],    ['yellow','blue'],  ['yellow','blue','orange'], ['yellow','orange']],
    group3: [['white','red'],            ['white','red','green'], ['white','green'], ['white','green','orange']],
    group4: [['white','orange','blue'],  ['white','blue'],   ['white','blue','red'],   ['white','red']],
    middleEdge: 0
  });

  const [, setVersion] = useState(0);

  function slash() {
    const s = square1.current;
    const top = s.group1, bot = s.group3;
    const count = g => g.reduce((sum,p) => sum + (p.length===2 ? 1 : 2), 0);
    if (count(top) === 6 && count(bot) === 6) {
      [s.group1, s.group3] = [s.group3, s.group1];
      s.middleEdge++;
    }
  }

  function turnClockwise(isTop, count) {
    const s = square1.current;
    const right = isTop ? s.group1 : s.group3;
    const left  = isTop ? s.group2 : s.group4;

    let pr = 0, i = 0;
    while (pr < count && i < right.length) {
      pr += right[i].length === 2 ? 1 : 2;
      i++;
    }
    if (pr !== count) return;

    let pl = 0, j = 0;
    while (pl < count && j < left.length) {
      pl += left[j].length === 2 ? 1 : 2;
      j++;
    }
    if (pl !== count) return;

    for (let k = 0; k < i; k++) left.unshift(right.shift());
    for (let k = 0; k < j; k++) right.unshift(left.shift());
  }

  function turnCounterClockwise(isTop, count) {
    const s = square1.current;
    const right = isTop ? s.group1 : s.group3;
    const left  = isTop ? s.group2 : s.group4;

    let pr = 0, i = 0;
    while (pr < count && i < right.length) {
      pr += right[right.length - 1 - i].length === 2 ? 1 : 2;
      i++;
    }
    if (pr !== count) return;

    let pl = 0, j = 0;
    while (pl < count && j < left.length) {
      pl += left[left.length - 1 - j].length === 2 ? 1 : 2;
      j++;
    }
    if (pl !== count) return;

    for (let k = 0; k < i; k++) left.push(right.pop());
    for (let k = 0; k < j; k++) right.push(left.pop());
  }

  function parseAlgorithm(alg) {
    const toks = alg.match(/\([^)]*\)|\//g) || [];
    toks.forEach(t => {
      if (t === '/') {
        slash();
      } else {
        const [a,b] = t.slice(1,-1).split(',').map(Number);
        if      (a > 0) turnClockwise(true,  a);
        else if (a < 0) turnCounterClockwise(true, -a);
        if      (b > 0) turnClockwise(false, b);
        else if (b < 0) turnCounterClockwise(false, -b);
      }
    });
    setVersion(v => v + 1);
  }

  useEffect(() => {
    square1.current = {
      group1: [['yellow','orange','green'], ['yellow','green'], ['yellow','green','red'], ['yellow','red']],
      group2: [['yellow','red','blue'],    ['yellow','blue'],  ['yellow','blue','orange'], ['yellow','orange']],
      group3: [['white','red'],            ['white','red','green'], ['white','green'], ['white','green','orange']],
      group4: [['white','orange','blue'],  ['white','blue'],   ['white','blue','red'],   ['white','red']],
      middleEdge: 0
    };
    parseAlgorithm(scramble);
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
