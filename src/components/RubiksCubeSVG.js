import React from 'react';
import './RubiksCubeSVG.css';

const RubiksCubeSVG = ({ n, scramble }) => {
  switch (n) {
    case '222':
      n = 2;
      break;
    case '333':
      n = 3;
      break;
    case '444':
      n = 4;
      break;
    case '555':
      n = 5;
      break;
    case '666':
      n = 6;
      break;
    case '777':
      n = 7;
      break;
    default:
      n = 3; // Default to 3x3 if currentEvent is not recognized
  }
  let size = 10; // Size of each sticker
  let gap = 1;   // Gap between stickers
  const faceSize = n * size + (n - 1) * gap; // Calculate the total size of a face

  let topFaceTop = 0;
  let topFaceLeft = 0;

  let rightFaceTop = 0;
  let rightFaceLeft = 0;
  
  switch (n) {
    case 2:
      size = 20;
      gap = 2;
      topFaceTop = -48;
      topFaceLeft = -7;

      rightFaceTop = -14;
      rightFaceLeft = 43;
      break;
    case 3:
      size = 20;
      gap = 2;
      topFaceTop = -60;
      topFaceLeft = 14;

      rightFaceTop = -1;
      rightFaceLeft = 65;
      break;
    case 4:
      size = 16;
      gap = 2;
      topFaceTop = -63;
      topFaceLeft = 20;
  
      rightFaceTop = 2;
      rightFaceLeft = 71;
      break;
    case 5:
      size = 15;
      gap = 2;
      topFaceTop = -70;
      topFaceLeft = 32;
  
      rightFaceTop = 10;
      rightFaceLeft = 84;
      break;
    case 6:
      size = 12;
      gap = 1;

      topFaceTop = -66;
      topFaceLeft = 26;
  
      rightFaceTop = 6;
      rightFaceLeft = 77;
      break;
    case 7:
      topFaceTop = -65;
      topFaceLeft = 25;
  
      rightFaceTop = 6;
      rightFaceLeft = 76;
      break;
  }

  const drawFace = (n) => {
    const stickers = [];
    let stickerColor = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        switch (scramble[row]) {
          case "yellow":
            stickerColor = "#FFF629";
            break;
          case "white":
            stickerColor = "#FDFFFC";
            break;
          case "red":
            stickerColor = "#FB596D";
            break;
          case "orange":
            stickerColor = "#FFA529";
            break;
          case "blue":
            stickerColor = "#50B6FF";
            break;
          case "green":
            stickerColor = "#12EA68";
            break;  

        }
        
        stickers.push(
          <rect
            x={(size + gap) * col}
            y={(size + gap) * row}
            rx={1}
            ry={1}
            width={size}
            height={size}
            fill={stickerColor} // Customize this as needed
            key={`sticker-${row}-${col}`}
          />
        );
      }
    }
    return stickers;
  };

  return (
    <div className="cube" style={{ '--face-size': `${faceSize}px` }}>
      <div className="face topFace" style={{ 'top': `${topFaceTop}px`, 'left': `${topFaceLeft}px` }}>
        <svg>{drawFace(n)}</svg>
      </div>
      <div className="face leftFace">
        <svg>{drawFace(n)}</svg>
      </div>
      <div className="face rightFace" style={{ 'top': `${rightFaceTop}px`, 'left': `${rightFaceLeft}px` }}>
        <svg>{drawFace(n)}</svg>
      </div>
    </div>
  );
};

export default RubiksCubeSVG;
