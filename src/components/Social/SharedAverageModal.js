// src/components/Social/SharedAverageModal.js
import React, { useState } from "react";
import "./SharedAverageModal.css";

function SharedAverageModal({ isOpen, onClose, onConfirm, defaultEvent = "333" }) {
  const [event, setEvent] = useState(defaultEvent);
  const [count, setCount] = useState(5);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(event, count);
    onClose();
  };

  return (
    <div className="sharedAverageOverlay">
      <div className="sharedAverageModal">
        <h2>Start Shared Average</h2>
        <label>
          Event:
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="222">2x2</option>
            <option value="333">3x3</option>
            <option value="444">4x4</option>
            <option value="555">5x5</option>
            <option value="666">6x6</option>
            <option value="777">7x7</option>
            <option value="OH">3x3 One-Handed</option>
            <option value="BLD">3x3 Blindfolded</option>
            <option value="SKEWB">Skewb</option>
            <option value="PYRAMINX">Pyraminx</option>
            <option value="MEGAMINX">Megaminx</option>
            <option value="CLOCK">Clock</option>
            <option value="SQ1">Square-1</option>
          </select>
        </label>

        <label>
          Count:
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={12}>12</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>

        <div className="sharedAverageButtons">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleConfirm}>Start</button>
        </div>
      </div>
    </div>
  );
}

export default SharedAverageModal;
