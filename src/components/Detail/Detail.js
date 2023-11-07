// Detail.js
import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from "cubing/twisty";
import './Detail.css';

function Detail({ scramble, currentEvent, onClose }) {
  const twistyRef = useRef(null);

  useEffect(() => {
    if (twistyRef.current && scramble) {
      // Clear previous visualization
      twistyRef.current.innerHTML = '';

      // Map event codes to puzzle types
      const puzzleTypeMap = {
        '222': '2x2x2',
        '333': '3x3x3',
        '444': '4x4x4',
        '555': '5x5x5',
        '666': '6x6x6',
        '777': '7x7x7',
        // add more mappings for different puzzles if necessary
      };

      // Get the puzzle type based on the current event
      const puzzleType = puzzleTypeMap[currentEvent] || '3x3x3'; // default to '3x3x3' if not found

      const player = new TwistyPlayer({
        puzzle: puzzleType,
        alg: scramble,
      });
      twistyRef.current.appendChild(player);
    }
  }, [scramble, currentEvent]); // Run when the scramble or currentEvent changes

  return (
    <div className="Detail" style={{ display: scramble ? 'block' : 'none' }}>
        <button onClick={onClose} className="close-button">Close</button>
      <div className='visualization' ref={twistyRef} />
    </div>
  );
}

export default Detail;
