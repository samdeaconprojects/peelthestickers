import React from 'react';
import './RubiksCubeSVG.css';

const RubiksCubeSVG = ({ n }) => {
  const size = 10; // Size of each sticker
  const gap = 1;   // Gap between stickers
  const faceSize = n * size + (n - 1) * gap; // Calculate the total size of a face

  const drawFace = (n) => {
    const stickers = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        stickers.push(
          <rect
            x={(size + gap) * col}
            y={(size + gap) * row}
            rx={1}
            ry={1}
            width={size}
            height={size}
            fill="yellow" // Customize this as needed
            key={`sticker-${row}-${col}`}
          />
        );
      }
    }
    return stickers;
  };

  return (
    <div className="cube" style={{ '--face-size': `${faceSize}px` }}>
      <div className="face topFace">
        <svg>{drawFace(n)}</svg>
      </div>
      <div className="face leftFace">
        <svg>{drawFace(n)}</svg>
      </div>
      <div className="face rightFace">
        <svg>{drawFace(n)}</svg>
      </div>
    </div>
  );
};

export default RubiksCubeSVG;
