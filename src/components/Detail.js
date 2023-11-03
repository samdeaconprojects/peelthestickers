// Detail.js
import React, { useEffect, useRef } from 'react';
import { TwistyPlayer } from "cubing/twisty";

function Detail({ scramble }) {
  const twistyRef = useRef(null);

  useEffect(() => {
    if (twistyRef.current && scramble) {

      // Clear previous visualization
      twistyRef.current.innerHTML = '';

      const player = new TwistyPlayer({
        puzzle: "3x3x3",
        alg: scramble,
      });
      twistyRef.current.appendChild(player);
    }
  }, [scramble]); // Run when the scramble changes

  return (
    <div className="Detail" style={{ display: scramble ? 'block' : 'none' }}>
      <div ref={twistyRef} />
    </div>
  );
}

export default Detail;
