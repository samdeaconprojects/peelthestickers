// src/components/PuzzleSVGs/ClockSVG.js
import React, { useRef, useEffect, useState } from 'react';

const COLOR1     = '#FFFDF4';
const COLOR2     = '#1211E7';
const NOON_COLOR = '#ED5336';

export default function ClockSVG({ scramble, size, showFront = true }) {
  const [version, setVersion] = useState(0); // force rerender

  const spacing = size;
  const dialR   = size / 3;
  const pinR    = dialR / 3;
  const width   = spacing * 4;
  const height  = spacing * 4;
  const offsetX = 20;

  const frontFace = useRef(Array.from({ length: 3 }, () => [0, 0, 0]));
  const backFace  = useRef(Array.from({ length: 3 }, () => [0, 0, 0]));
  const pins      = useRef([[true, true], [true, true]]);

  function wrap(n) {
    if (n > 12) n -= 12;
    if (n < 0) n += 12;
    return (n === 12 || n === 0) ? 0 : n;
  }

  function UR(c) {
    const f = frontFace.current, b = backFace.current;
    [f[0][1], f[0][2], f[1][1], f[1][2]] = [f[0][1], f[0][2], f[1][1], f[1][2]].map(val => wrap(val + c));
    b[0][0] = wrap(b[0][0] - c);
    pins.current = [[false, true], [false, false]];
  }

  function UL(c) {
    const f = frontFace.current, b = backFace.current;
    [f[0][0], f[0][1], f[1][0], f[1][1]] = [f[0][0], f[0][1], f[1][0], f[1][1]].map(val => wrap(val + c));
    b[0][2] = wrap(b[0][2] - c);
    pins.current = [[true, false], [false, false]];
  }

  function DR(c) {
    const f = frontFace.current, b = backFace.current;
    [f[1][1], f[1][2], f[2][1], f[2][2]] = [f[1][1], f[1][2], f[2][1], f[2][2]].map(val => wrap(val + c));
    b[2][0] = wrap(b[2][0] - c);
    pins.current = [[false, false], [false, true]];
  }

  function DL(c) {
    const f = frontFace.current, b = backFace.current;
    [f[1][0], f[1][1], f[2][0], f[2][1]] = [f[1][0], f[1][1], f[2][0], f[2][1]].map(val => wrap(val + c));
    b[2][2] = wrap(b[2][2] - c);
    pins.current = [[false, false], [true, false]];
  }

  function U(c) {
    UR(c);
    frontFace.current[0][0] = wrap(frontFace.current[0][0] + c);
    frontFace.current[1][0] = wrap(frontFace.current[1][0] + c);
    backFace.current[0][2] = wrap(backFace.current[0][2] - c);
    pins.current = [[true, true], [false, false]];
  }

  function D(c) {
    DR(c);
    frontFace.current[1][0] = wrap(frontFace.current[1][0] + c);
    frontFace.current[2][0] = wrap(frontFace.current[2][0] + c);
    backFace.current[2][2] = wrap(backFace.current[2][2] - c);
    pins.current = [[false, false], [true, true]];
  }

  function R(c) {
    UR(c);
    frontFace.current[2][1] = wrap(frontFace.current[2][1] + c);
    frontFace.current[2][2] = wrap(frontFace.current[2][2] + c);
    backFace.current[2][0] = wrap(backFace.current[2][0] - c);
    pins.current = [[false, true], [false, true]];
  }

  function L(c) {
    UL(c);
    frontFace.current[2][0] = wrap(frontFace.current[2][0] + c);
    frontFace.current[2][1] = wrap(frontFace.current[2][1] + c);
    backFace.current[2][2] = wrap(backFace.current[2][2] - c);
    pins.current = [[true, false], [true, false]];
  }

  function ALL(c) {
    U(c);
    frontFace.current[2][0] = wrap(frontFace.current[2][0] + c);
    frontFace.current[2][1] = wrap(frontFace.current[2][1] + c);
    frontFace.current[2][2] = wrap(frontFace.current[2][2] + c);
    backFace.current[2][0] = wrap(backFace.current[2][0] - c);
    backFace.current[2][2] = wrap(backFace.current[2][2] - c);
    pins.current = [[true, true], [true, true]];
  }

  function y2() {
    [frontFace.current, backFace.current] = [backFace.current, frontFace.current];
    const old = pins.current;
    pins.current = [
      [!old[0][1], !old[0][0]],
      [!old[1][1], !old[1][0]]
    ];
  }

  useEffect(() => {
    frontFace.current = Array.from({ length: 3 }, () => [0, 0, 0]);
    backFace.current  = Array.from({ length: 3 }, () => [0, 0, 0]);
    pins.current      = [[true, true], [true, true]];

    scramble?.trim()?.split(/\s+/).forEach(mv => {
      if (mv === 'y2') return y2();
      const m = mv.match(/(UR|UL|DR|DL|U|D|R|L|ALL)(\d+)([+-])/);
      if (!m) return;
      const [, face, num, sign] = m;
      const count = Number(num) * (sign === '+' ? 1 : -1);
      ({ UR, UL, DR, DL, U, D, R, L, ALL }[face])?.(count);
    });

    setVersion(v => v + 1);
  }, [scramble]);

  function renderDial(x, y, pos, isFront) {
    const mark = isFront ? COLOR2 : COLOR1;
    const back = isFront ? COLOR1 : COLOR2;
    const angle = pos * 30 * Math.PI / 180;
    const vx = Math.sin(angle), vy = -Math.cos(angle);
    const px = -vy, py = vx;

    const innerW = 5, outerW = 1;
    const x1 = offsetX + x + px * (innerW / 2), y1 = y + py * (innerW / 2);
    const x2 = offsetX + x - px * (innerW / 2), y2 = y - py * (innerW / 2);
    const tx = offsetX + x + vx * dialR, ty = y + vy * dialR;
    const x3 = tx - px * (outerW / 2), y3 = ty - py * (outerW / 2);
    const x4 = tx + px * (outerW / 2), y4 = ty + py * (outerW / 2);

    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const ang = i * 30 * Math.PI / 180;
      const inner = i % 3 === 0 ? dialR + 4 : dialR + 6;
      const outer = i === 0 || i % 3 === 0 ? dialR + 10 : dialR + 6;
      ticks.push(
        <line key={i}
          x1={offsetX + x + inner * Math.sin(ang)}
          y1={y - inner * Math.cos(ang)}
          x2={offsetX + x + outer * Math.sin(ang)}
          y2={y - outer * Math.cos(ang)}
          stroke={i === 0 ? NOON_COLOR : mark}
          strokeWidth={i === 0 || i % 3 === 0 ? 2 : 1}
        />
      );
    }

    return (
      <g key={`${x}-${y}`}>
        <circle cx={offsetX + x} cy={y} r={dialR} fill={mark} />
        {ticks}
        <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`} fill={back} />
      </g>
    );
  }

  function renderPins(isFront) {
    const mark = isFront ? COLOR2 : COLOR1;
    return [0, 1].flatMap(row =>
      [0, 1].map(col => {
        const on = isFront
          ? pins.current[col][row]
          : !pins.current[col][1 - row];
        return (
          <circle key={`${row}${col}`}
            cx={offsetX + row * spacing + spacing / 2}
            cy={col * spacing + spacing / 2}
            r={pinR}
            fill={on ? mark : 'none'}
            stroke={on ? 'none' : mark}
            strokeWidth={2}
          />
        );
      })
    );
  }

  return (
    <svg key={version} width={width} height={height} viewBox={`0 0 ${width + offsetX} ${height}`}>
      <g>
        <circle cx={offsetX + spacing * 1.5} cy={spacing * 1.5} r={spacing * 1.5 + spacing / 10} fill={showFront ? COLOR1 : COLOR2} />
        {[ [0,0], [2,0], [0,2], [2,2] ].map(([r, c]) => (
          <circle key={`${r}${c}`}
            cx={offsetX + r * spacing + spacing / 2}
            cy={c * spacing + spacing / 2}
            r={dialR * 1.5}
            fill={showFront ? COLOR1 : COLOR2}
          />
        ))}
        {renderPins(showFront)}
        {Array.from({ length: 3 }).flatMap((_, r) =>
          Array.from({ length: 3 }).map((_, c) => {
            const pos = showFront
              ? frontFace.current[c][r]
              : backFace.current[c][r];
            return renderDial(r * spacing + spacing / 2, c * spacing + spacing / 2, pos, showFront);
          })
        )}
      </g>
    </svg>
  );
}
