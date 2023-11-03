// Scramble.js
import React, { useEffect, useState } from 'react';
import { randomScrambleForEvent } from "cubing/scramble";

function Scramble({ onScrambleClick, times }) {  // Add `times` as a prop
  const [scramble, setScramble] = useState('');

  useEffect(() => {
    const generateScramble = async () => {
      try {
        const scrambleStr = await randomScrambleForEvent("333");
        setScramble(scrambleStr.toString());
      } catch (error) {
        console.error('Error generating scramble:', error);
      }
    };

    generateScramble();
  }, [times]); // Dependency array now includes `times`, it runs when `times` changes

  return (
    <div>
      <p className="scramble-text" onClick={() => onScrambleClick(scramble)} style={{ cursor: 'pointer' }}>
        {scramble}
      </p>
    </div>
  );
}

export default Scramble;
