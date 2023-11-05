// TimeItem.js
import React from 'react';
import './TimeItem.css';

function TimeItem({ time }) {
  // Add any click handlers or other logic you want for each time item here

  return (
    <li className="time-item">
      {/* Format and display your time here */}
      {time}
    </li>
  );
}

export default TimeItem;
