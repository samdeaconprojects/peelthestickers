// src/components/SkewbSVG/SkewbSVG.js
import React, { useState, useEffect } from 'react';
import './SkewbSVG.css';

const colorMap = {
  white:  '#FFFFFF',
  green:  '#12EA68',
  red:    '#F64258',
  blue:   '#50B6FF',
  orange: '#FF8F0C',
  yellow: '#FFFF00'
};

export default function SkewbSVG({ scramble = 'U R B L U B L U', size = 60, gap = 0 }) {
  const cornerTemplates = [
    ['white','orange','blue'],
    ['white','blue','red'],
    ['white','red','green'],
    ['white','green','orange'],
    ['yellow','orange','green'],
    ['yellow','green','red'],
    ['yellow','red','blue'],
    ['yellow','blue','orange']
  ];
  const centerTemplates = ['white','green','red','blue','orange','yellow'];

  const [corners, setCorners] = useState(cornerTemplates.map(c=>[...c]));
  const [centers, setCenters] = useState([...centerTemplates]);
  const [faces, setFaces]     = useState([]);
  const [showFront, setShowFront] = useState(true);

  const cycleCW  = arr => [arr[arr.length-1], ...arr.slice(0,arr.length-1)];
  const cycleCCW = arr => [...arr.slice(1), arr[0]];

  function computeFaces(ctr, cen) {
    const f = Array(6).fill(0).map((_,i)=>[ cen[i] ]);
    f[0][1]=ctr[0][0]; f[0][2]=ctr[1][0]; f[0][3]=ctr[2][0]; f[0][4]=ctr[3][0];
    f[1][1]=ctr[3][1]; f[1][2]=ctr[2][2]; f[1][3]=ctr[5][1]; f[1][4]=ctr[4][2];
    f[2][1]=ctr[2][1]; f[2][2]=ctr[1][2]; f[2][3]=ctr[6][1]; f[2][4]=ctr[5][2];
    f[3][1]=ctr[1][1]; f[3][2]=ctr[0][2]; f[3][3]=ctr[7][1]; f[3][4]=ctr[6][2];
    f[4][1]=ctr[0][1]; f[4][2]=ctr[3][2]; f[4][3]=ctr[7][2]; f[4][4]=ctr[4][1];
    f[5][1]=ctr[4][0]; f[5][2]=ctr[5][0]; f[5][3]=ctr[6][0]; f[5][4]=ctr[7][0];
    return f;
  }

  function moveU(mod) {
    setCenters(c=>{const x=[...c];
      if(mod==="'" ) [x[0],x[3],x[4]]=[x[4],x[0],x[3]];
      else            [x[0],x[3],x[4]]=[x[3],x[4],x[0]];
      return x;
    });
    setCorners(c=>{const x=c.map(r=>[...r]);
      if(mod==="'" ){
        x[0]=cycleCCW(x[0]);
        [x[1],x[3],x[7]]=[cycleCW(x[3]),cycleCW(x[7]),cycleCW(x[1])];
      } else {
        x[0]=cycleCW(x[0]);
        [x[1],x[3],x[7]]=[cycleCCW(x[7]),cycleCCW(x[1]),cycleCCW(x[3])];
      }
      return x;
    });
  }
  function moveR(mod) {
    setCenters(c=>{const x=[...c];
      if(mod==="'" ) [x[2],x[3],x[5]]=[x[3],x[5],x[2]];
      else            [x[2],x[3],x[5]]=[x[5],x[2],x[3]];
      return x;
    });
    setCorners(c=>{const x=c.map(r=>[...r]);
      if(mod==="'" ){
        x[6]=cycleCCW(x[6]);
        [x[1],x[7],x[5]]=[cycleCW(x[7]),cycleCW(x[5]),cycleCW(x[1])];
      } else {
        x[6]=cycleCW(x[6]);
        [x[1],x[7],x[5]]=[cycleCCW(x[5]),cycleCCW(x[1]),cycleCCW(x[7])];
      }
      return x;
    });
  }
  function moveL(mod) {
    setCenters(c=>{const x=[...c];
      if(mod==="'" ) [x[1],x[4],x[5]]=[x[5],x[1],x[4]];
      else            [x[1],x[4],x[5]]=[x[4],x[5],x[1]];
      return x;
    });
    setCorners(c=>{const x=c.map(r=>[...r]);
      if(mod==="'" ){
        x[4]=cycleCCW(x[4]);
        [x[3],x[5],x[7]]=[cycleCW(x[5]),cycleCW(x[7]),cycleCW(x[3])];
      } else {
        x[4]=cycleCW(x[4]);
        [x[3],x[5],x[7]]=[cycleCCW(x[7]),cycleCCW(x[3]),cycleCCW(x[5])];
      }
      return x;
    });
  }
  function moveB(mod) {
    setCenters(c=>{const x=[...c];
      if(mod==="'" ) [x[3],x[4],x[5]]=[x[4],x[5],x[3]];
      else            [x[3],x[4],x[5]]=[x[5],x[3],x[4]];
      return x;
    });
    setCorners(c=>{const x=c.map(r=>[...r]);
      if(mod==="'" ){
        x[7]=cycleCCW(x[7]);
        [x[0],x[4],x[6]]=[cycleCW(x[4]),cycleCW(x[6]),cycleCW(x[0])];
      } else {
        x[7]=cycleCW(x[7]);
        [x[0],x[4],x[6]]=[cycleCCW(x[6]),cycleCCW(x[0]),cycleCCW(x[4])];
      }
      return x;
    });
  }

  function applyAlg(alg) {
    alg.trim().split(/\s+/).forEach(m=>{
      const f=m[0], md=m.length>1?m.substr(1):'';
      switch(f) {
        case 'U': moveU(md); break;
        case 'R': moveR(md); break;
        case 'L': moveL(md); break;
        case 'B': moveB(md); break;
      }
    });
  }

  useEffect(() => {
    setCorners(cornerTemplates.map(c=>[...c]));
    setCenters([...centerTemplates]);
  }, [scramble]);

  useEffect(() => {
    setFaces(computeFaces(corners, centers));
  }, [corners, centers]);

  useEffect(() => {
    if (scramble) applyAlg(scramble);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners.length]);

  const drawFace = (faceCols, idx) => {
    const s = size, g = gap, h = s/2;
    const centerPts = [
      `${h},0`,
      `${s},${h}`,
      `${h},${s}`,
      `0,${h}`
    ].join(' ');
    const triPts = [
      [`${h},0`,`0,${h}`,`0,0`],
      [`${h},0`,`${s},${h}`,`${s},0`],
      [`${s},${h}`,`${h},${s}`,`${s},${s}`],
      [`0,${h}`,`${h},${s}`,`0,${s}`]
    ];
    return (
      <svg key={idx} className="skewbFace" width={s+g} height={s+g}>
        <polygon points={centerPts}
          fill={colorMap[faceCols[0]]}
          stroke="#000" strokeWidth="1" />
        {triPts.map((pts,i)=>( 
          <polygon key={i}
            points={pts.join(' ')}
            fill={colorMap[faceCols[i+1]]}
            stroke="#000" strokeWidth="1" />
        ))}
      </svg>
    );
  };

  const frontClasses  = ['topFace','leftFace','rightFace'];
  const backClasses   = ['backFace','leftBackFace','bottomFace'];
  const frontIdxs     = [0,1,2];
  const backIdxs      = [3,4,5];

  return (
    <div className="skewbContainer">
      <button className="flipButton" onClick={()=>setShowFront(f=>!f)}>
        {showFront?'Show Back':'Show Front'}
      </button>
      {(showFront ? frontIdxs : backIdxs).map((idx,i) => (
        <div
          key={idx}
          className={`skewbFaceContainer ${
            showFront ? frontClasses[i] : backClasses[i]
          }`}
        >
          {faces[idx] && drawFace(faces[idx], idx)}
        </div>
      ))}
    </div>
  );
}
