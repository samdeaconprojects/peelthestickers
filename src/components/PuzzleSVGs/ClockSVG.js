// src/components/PuzzleSVGs/ClockSVG.js
import React, { useRef, useEffect, useState } from 'react';

const COLOR1    = '#D792DE';   // marking color front
const COLOR2    = '#F9D19E';   // marking color back
const NOON_COLOR= '#ED5336';   // 12-hour marker

export default function ClockSVG({
  scramble = 'UR3- DR5+ DL0+ UL4+ U3- R0+ D3- L3+ ALL2+ y2 U4- R4- D3- L2- ALL4+',
  size 
}) {
  const [showFront, setShowFront] = useState(true);
  // 3×3 grid, spacing between centers:
  const spacing = size ;
  const dialR   = size / 3;
  const pinR    = dialR / 3;
  const width   = spacing * 4;
  const height  = spacing * 4;

  // internal cube state:
  const frontFace = useRef(Array.from({ length: 3 }, () => [0,0,0]));
  const backFace  = useRef(Array.from({ length: 3 }, () => [0,0,0]));
  const pins      = useRef([[true,true],[true,true]]);

  // helper to wrap clock numbers
  function wrap(n) {
    if      (n > 12) n -= 12;
    else if (n <  0) n += 12;
    return (n === 0 || n === 12) ? 0 : n;
  }

  // all your move functions, mutating frontFace.current, backFace.current & pins.current…
  function UR(c) {
    const f = frontFace.current, b = backFace.current;
    [f[0][1],f[0][2],f[1][1],f[1][2]] = [c,c,c,c].map((d,i)=>wrap([f[0][1],f[0][2],f[1][1],f[1][2]][i]+d));
    b[0][0] = wrap(b[0][0] - c);
    pins.current = [[false,true],[false,false]];
  }
  function UL(c) {
    const f = frontFace.current, b = backFace.current;
    [f[0][0],f[0][1],f[1][0],f[1][1]] = [c,c,c,c].map((d,i)=>wrap([f[0][0],f[0][1],f[1][0],f[1][1]][i]+d));
    b[0][2] = wrap(b[0][2] - c);
    pins.current = [[true,false],[false,false]];
  }
  function DR(c) {
    const f = frontFace.current, b = backFace.current;
    [f[1][1],f[1][2],f[2][1],f[2][2]] = [c,c,c,c].map((d,i)=>wrap([f[1][1],f[1][2],f[2][1],f[2][2]][i]+d));
    b[2][0] = wrap(b[2][0] - c);
    pins.current = [[false,false],[false,true]];
  }
  function DL(c) {
    const f = frontFace.current, b = backFace.current;
    [f[1][0],f[1][1],f[2][0],f[2][1]] = [c,c,c,c].map((d,i)=>wrap([f[1][0],f[1][1],f[2][0],f[2][1]][i]+d));
    b[2][2] = wrap(b[2][2] - c);
    pins.current = [[false,false],[true,false]];
  }
  function U(c) { UR(c); [frontFace.current[0][0],frontFace.current[1][0]]=[c,c].map(d=>wrap(frontFace.current[0][0]+d)); backFace.current[0][2]=wrap(backFace.current[0][2]-c); pins.current=[[true,true],[false,false]]; }
  function D(c) { DR(c); [frontFace.current[1][0],frontFace.current[2][0]]=[c,c].map(d=>wrap(frontFace.current[1][0]+d)); backFace.current[2][2]=wrap(backFace.current[2][2]-c); pins.current=[[false,false],[true,true]]; }
  function R(c) { UR(c); [frontFace.current[2][1],frontFace.current[2][2]]=[c,c].map(d=>wrap(frontFace.current[2][1]+d)); backFace.current[2][0]=wrap(backFace.current[2][0]-c); pins.current=[[false,true],[false,true]]; }
  function L(c) { UL(c); [frontFace.current[2][0],frontFace.current[2][1]]=[c,c].map(d=>wrap(frontFace.current[2][0]+d)); backFace.current[2][2]=wrap(backFace.current[2][2]-c); pins.current=[[true,false],[true,false]]; }
  function ALL(c) { U(c); [frontFace.current[2][0],frontFace.current[2][1],frontFace.current[2][2]]=[c,c,c].map(d=>wrap(frontFace.current[2][0]+d)); [backFace.current[2][0],backFace.current[2][2]]=[-c,-c].map(d=>wrap(backFace.current[2][0]+d)); pins.current=[[true,true],[true,true]]; }
  function y2() { [frontFace.current,backFace.current]=[backFace.current,frontFace.current]; pins.current = [[!pins.current[0][1],!pins.current[0][0]],[!pins.current[1][1],!pins.current[1][0]]]; }

  // apply the whole scramble once
  useEffect(() => {
    frontFace.current = Array.from({ length: 3 }, () => [0,0,0]);
    backFace.current  = Array.from({ length: 3 }, () => [0,0,0]);
    pins.current      = [[true,true],[true,true]];

    const parts = scramble.trim().split(/\s+/);
    parts.forEach(mv => {
      if (mv === 'y2') { y2(); return; }
      const m = mv.match(/(UR|UL|DR|DL|U|D|R|L|ALL)(\d+)([+-])/);
      if (!m) return;
      const [, face, num, sign] = m;
      const cnt = Number(num) * (sign==='+'?1:-1);
      ({ UR,UL,DR,DL,U,D,R,L,ALL,y2 }[face])?.(cnt);
    });
  }, [scramble]);

  // helper to render one dial
  function renderDial(x, y, pos, isFront) {
    const mark = isFront ? COLOR1 : COLOR2;
    const back = isFront ? COLOR2 : COLOR1;
    const ticks = [];
    for (let i=0; i<12; i++) {
      const angle = (i*30) * Math.PI/180;
      const inner = i%3===0 ? dialR+4 : dialR+6;
      const outer = i===0
        ? dialR+10
        : i%3===0
          ? dialR+10
          : dialR+6;
      // draw major tick
      ticks.push(
        <line
          key={`t${i}`}
          x1={x + inner*Math.sin(angle)}
          y1={y - inner*Math.cos(angle)}
          x2={x + outer*Math.sin(angle)}
          y2={y - outer*Math.cos(angle)}
          stroke={i===0 ? NOON_COLOR : mark}
          strokeWidth={i===0 || i%3===0 ? 2 : 1}
        />
      );
    }

    // hand
    const handAngle = (pos*30) * Math.PI/180;
    const hx = x + (dialR-8)*Math.sin(handAngle);
    const hy = y - (dialR-8)*Math.cos(handAngle);

    return (
      <g key={`d${x}-${y}`}>
        {/* dial circle */}
        <circle cx={x} cy={y} r={dialR} fill={mark} />
        {/* ticks */}
        {ticks}
        {/* hand */}
        <line
          x1={x} y1={y} x2={hx} y2={hy}
          stroke={back} strokeWidth={4}
        />
      </g>
    );
  }

  // helper to render the four pins
  function renderPins(isFront) {
    const mark = isFront ? COLOR1 : COLOR2;
    return [0,1].flatMap(r => [0,1].map(c => {
      const on = isFront
        ? pins.current[c][r]
        : !pins.current[r][c];
      const cx = r*spacing + spacing/2;
      const cy = c*spacing + spacing/2;
      return (
        <circle
          key={`p${r}${c}`}
          cx={cx}
          cy={cy}
          r={pinR}
          fill={on ? mark : 'none'}
          stroke={on ? 'none' : mark}
          strokeWidth={2}
        />
      );
    }));
  }

  // finally render the SVG
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setShowFront(f => !f)}
        style={{
          position: 'absolute', top: -28, right: 0,
          padding: '4px 8px', background: '#2EC4B6',
          color: '#fff', border: 'none', borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        {showFront ? 'Show Back' : 'Show Front'}
      </button>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        
      >
        {/* big background circle */}
        <circle
          cx={spacing*1.5} cy={spacing*1.5}
          r={spacing * 1.5 + spacing/10}
          fill={showFront ? COLOR2 : COLOR1}
        />

        {/* dial knobs */}
        <circle
          cx={spacing/2} cy={spacing/2}
          r={dialR*1.5}
          fill={showFront ? COLOR2 : COLOR1}
        />

        <circle
          cx={(spacing/2) + spacing*2} cy={spacing/2}
          r={dialR*1.5}
          fill={showFront ? COLOR2 : COLOR1}
        />

        <circle
          cx={spacing/2} cy={(spacing/2) + spacing*2}
          r={dialR*1.5}
          fill={showFront ? COLOR2 : COLOR1}
        />

        <circle
          cx={(spacing/2) + spacing*2} cy={(spacing/2) + spacing*2}
          r={dialR*1.5}
          fill={showFront ? COLOR2 : COLOR1}
        />

        {renderPins(showFront)}

        {/* 3×3 grid of dials */}
        {Array.from({ length: 3 }).flatMap((_, r) =>
          Array.from({ length: 3 }).map((_, c) => {
            const pos = showFront
              ? frontFace.current[c][r]
              : backFace.current[c][r];
            return renderDial(
              r*spacing + spacing/2,
              c*spacing + spacing/2,
              pos,
              showFront
            );
          })
        )}
      </svg>
    </div>
  );
}
