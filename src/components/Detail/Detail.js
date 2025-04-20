import React, { useEffect, useState } from 'react';
import './Detail.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';

function Detail({ solve, onClose, deleteTime, addPost }) {
  const [notes, setNotes] = useState(solve.notes || 'double x-cross'); 

  const handleNoteChange = (e) => {
    setNotes(e.target.value);
  };

  const handleClickOutside = (event) => {
    if (event.target.className === 'detailPopup') {
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  const getScrambleFontSize = (event) => {
    switch (event) {
      case '222':
        return '24px'; 
      case '333':
        return '22px';
      case '444':
        return '18px';
      case '555':
        return '15px';
      case '666':
        return '12px';
      case '777':
        return '12px'; 
      default:
        return '16px'; 
    }
  };

  const handleDelete = () => {
    deleteTime(); 
    onClose(); 
  };

  const handleShare = () => {
    addPost({
      note: notes,
      event: solve.event,
      solveList: [solve],
      comments: []
    });
    onClose();
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
              style={{ fontSize: getScrambleFontSize(solve.event) }} 
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
            <div className="detailActions">
            <button className="delete-button" onClick={handleDelete}>Delete</button>
            <button className="share-button" onClick={handleShare}>Share</button>
          </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

export default Detail;
