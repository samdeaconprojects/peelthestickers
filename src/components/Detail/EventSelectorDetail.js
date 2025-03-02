// EventSelectorDetail.js
import React, { useState, useEffect } from 'react';
import './EventSelectorDetail.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../scrambleUtils';

function EventSelectorDetail({ events, selectedEvents, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedEvents);

  // Default scramble to ensure RubiksCubeSVG renders without issues
  const defaultScramble = "U R U' R'"; // Replace with a valid scramble for all events

  const handleToggleEvent = (event) => {
    setSelected((prevSelected) => {
      if (prevSelected.includes(event)) {
        return prevSelected.filter((e) => e !== event);
      } else {
        if (prevSelected.length < 4) {
          return [...prevSelected, event];
        }
        return prevSelected;
      }
    });
  };

  const handleClickOutside = (event) => {
    if (event.target.className === 'eventSelectorPopup') {
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className="eventSelectorPopup">
      <div className="eventSelectorContent">
        <span className="closePopup" onClick={onClose}>x</span>
        <h3>Select Events</h3>
        <div className="eventIcons">
          {events.map((event) => (
            <div
              key={event}
              className={`eventIcon ${selected.includes(event) ? 'selected' : ''}`}
              onClick={() => handleToggleEvent(event)}
            >
              <RubiksCubeSVG
                className={"cubeIcon"}
                n={event}
                faces={getScrambledFaces(defaultScramble, event)} // Ensure valid faces
                isMusicPlayer={false}
                isTimerCube={false}
              />
              <p>{event}</p>
            </div>
          ))}
        </div>
        <button onClick={() => onSave(selected)} className="save-button">Save</button>
      </div>
    </div>
  );
}

export default EventSelectorDetail;
