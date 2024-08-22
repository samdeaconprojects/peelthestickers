import React, { useEffect, useState } from 'react';
import './Detail.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';

function Detail({ solve, onClose }) {
  const [notes, setNotes] = useState(solve.notes || 'double x-cross'); // Use state to handle the editable text

  const handleNoteChange = (e) => {
    setNotes(e.target.value);
  };

  // Close the detail when clicking outside of the detailPopupContent
  const handleClickOutside = (event) => {
    if (event.target.className === 'detailPopup') {
      onClose();
    }
  };

  // Add event listener when the component mounts
  useEffect(() => {
    document.addEventListener('click', handleClickOutside);

    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  // Determine font size based on event type
  const getScrambleFontSize = (event) => {
    switch (event) {
      case '222':
        return '24px'; // Largest font size
      case '333':
        return '22px';
      case '444':
        return '18px';
      case '555':
        return '15px';
      case '666':
        return '12px';
      case '777':
        return '12px'; // Smallest font size
      default:
        return '16px'; // Default font size
    }
  };

  return (
    <div className="detailPopup">
      <div className="detailPopupContent">
        <span className="closePopup" onClick={onClose}>x</span>
        <div className='detailFlexCol'>
          <div className='detailTopRow'>
            <div className='detailTime'>{formatTime(solve.time)}</div>
            <div 
              className='detailScramble'
              style={{ fontSize: getScrambleFontSize(solve.event) }} // Apply dynamic font size
            >
              {solve.scramble}
            </div>
          </div>
          <div className='detailBottomRow'>
            <div className='detailCube'>
              <RubiksCubeSVG n={solve.event} faces={getScrambledFaces(solve.scramble, solve.event)} isMusicPlayer={false} isTimerCube={false} />
            </div>
            <div className='detailInfoSection'>
              <textarea
                className='detailNotes'
                value={notes}
                onChange={handleNoteChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Detail;
