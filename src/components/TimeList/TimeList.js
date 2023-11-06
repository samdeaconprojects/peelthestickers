// TimeList.js
import React from 'react';
import './TimeList.css'; // Ensure this is the correct path to your CSS file

function TimeList({ times }) {
  const formatTime = (milliseconds) => {
    let totalSeconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let millisecondsLeft = milliseconds % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = millisecondsLeft.toString().padStart(3, '0').substring(0, 2);

    return minutes > 0 
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}` 
      : `${formattedSeconds}.${formattedMilliseconds}`;
  };

  return (
    <div className="time-list-container">
      <div className="TimeList">
        {times.map((time, index) => (
          <div className="TimeItem" key={index}>{formatTime(time)}</div>
        ))}
      </div>
    </div>
  );
}

export default TimeList;
