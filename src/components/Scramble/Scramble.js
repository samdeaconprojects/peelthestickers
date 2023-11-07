// Scramble.js
import React from 'react';
import './Scramble.css'; // Ensure you have a Scramble.css file

function Scramble({ onScrambleClick, scramble }) {
  return (
    <div className="scramble-container">
      <p className="scramble-text" onClick={() => onScrambleClick(scramble)}>
        {scramble}
      </p>
    </div>
  );
}

export default Scramble;
