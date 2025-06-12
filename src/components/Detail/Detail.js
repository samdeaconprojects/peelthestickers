import React, { useEffect, useState } from 'react';
import './Detail.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';

function Detail({ solve, onClose, deleteTime, addPost, showNavButtons, onPrev, onNext }) {
  const isArray = Array.isArray(solve);
  const [notes, setNotes] = useState(
    isArray ? solve.map(s => s.note || '') : solve.note || 'double x-cross'
  );

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  const handleClickOutside = (event) => {
    if (event.target.className === 'detailPopup') {
      onClose();
    }
  };

  const getScrambleFontSize = (event) => {
    switch (event) {
      case '222': return '24px';
      case '333': return '22px';
      case '444': return '18px';
      case '555': return '15px';
      case '666': return '12px';
      case '777': return '12px';
      default: return '16px';
    }
  };

  const handleDelete = (index) => {
    if (!isArray) {
      deleteTime();
      onClose();
    } else if (typeof deleteTime === 'function') {
      deleteTime(index);
    }
  };

  const handleShare = (index) => {
    const item = isArray ? solve[index] : solve;
    addPost({
      note: isArray ? notes[index] : notes,
      event: item.event,
      solveList: [item],
      comments: []
    });
    onClose();
  };

  const renderSolveCard = (item, index) => (
    <div key={index} className="detailSolveCard">
      <div className='detailTopRow'>
        <div className='detailTime'>{formatTime(item.time)}</div>
        <div
          className='detailScramble'
          style={{ fontSize: getScrambleFontSize(item.event) }}
        >
          {item.scramble}
        </div>
      </div>
      <div className='detailBottomRow'>
        <div className='detailCube'>
          <RubiksCubeSVG
            n={item.event}
            faces={getScrambledFaces(item.scramble, item.event)}
            isMusicPlayer={false}
            isTimerCube={false}
          />
        </div>
        <div className='detailInfoSection'>
          <textarea
            className='detailNotes'
            value={notes[index]}
            onChange={(e) => {
              const updatedNotes = [...notes];
              updatedNotes[index] = e.target.value;
              setNotes(updatedNotes);
            }}
          />
        </div>
        <div className="detailActions">
          <button className="delete-button" onClick={() => handleDelete(index)}>Delete</button>
          <button className="share-button" onClick={() => handleShare(index)}>Share</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="detailPopup">
      <div className="detailPopupContent">
        <span className="closePopup" onClick={onClose}>x</span>

        {!isArray ? (
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
                <RubiksCubeSVG
                  n={solve.event}
                  faces={getScrambledFaces(solve.scramble, solve.event)}
                  isMusicPlayer={false}
                  isTimerCube={false}
                />
              </div>
              <div className='detailInfoSection'>
                <textarea
                  className='detailNotes'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="detailActions">
                <button className="delete-button" onClick={() => handleDelete()}>Delete</button>
                <button className="share-button" onClick={() => handleShare()}>Share</button>
              </div>
            </div>
            {showNavButtons && (
              <div className="detailNavButtons">
                <button onClick={onPrev}>Previous</button>
                <button onClick={onNext}>Next</button>
              </div>
            )}
          </div>
        ) : (
          <div className='detailFlexCol'>
            {solve.map((s, i) => renderSolveCard(s, i))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Detail;
