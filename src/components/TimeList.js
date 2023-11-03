// TimeList.js
import React from 'react';

function TimeList({ times }) {
  const formatTime = (milliseconds) => {
    let totalSeconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let millisecondsLeft = milliseconds % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = millisecondsLeft.toString().padStart(3, '0').substring(0, 2);

    let formattedTime = minutes > 0 
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}` 
      : `${formattedSeconds}.${formattedMilliseconds}`;
    
    return formattedTime;
  };

  return (
    <div>
      <h2>Time List</h2>
      <ul>
        {times.map((time, index) => (
          <li key={index}>{formatTime(time)}</li>
        ))}
      </ul>
    </div>
  );
}

export default TimeList;
