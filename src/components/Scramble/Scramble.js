// Scramble.js
import React from 'react';
import './Scramble.css'; // Ensure you have a Scramble.css file

function Scramble({ onScrambleClick, scramble, currentEvent }) {

  let fontSize;
  let maxWidth;

  switch (currentEvent) {
    case '222':
      fontSize = 20;
      maxWidth = 100;
      break;
    case '333':
    case '333OH':
    case '333BLD':
      fontSize = 20;
      maxWidth = 80;
      break;
    case '444':
      fontSize = 20;
      maxWidth = 50;
      break;
    case '555':
      fontSize = 16;
      maxWidth = 50;
      break;
    case '666':
      fontSize = 14;
      maxWidth = 50;
      break;
    case '777':
      fontSize = 13;
      maxWidth = 50;
      break;
    default:
      fontSize = 20;
      maxWidth = 50; // Default to 3x3 if currentEvent is not recognized
  }

  return (
    <div className="scramble-container">
      <p className="scramble-text" style={{ 'font-size': `${fontSize}pt`, 'max-width': `${maxWidth}%` }} onClick={() => onScrambleClick(scramble)}>
        {scramble}
      </p>
    </div>
  );
}

export default Scramble;
