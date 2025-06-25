import React, { useEffect, useState } from 'react';
import './Detail.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';
import { updateSolvePenalty } from '../../services/updateSolvePenalty';

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

  const handlePenaltyChange = async (penalty, index = null) => {
  const solveToUpdate = isArray ? solve[index] : solve;
  const originalTime = solveToUpdate.originalTime || solveToUpdate.time;
  const timestamp =
  solveToUpdate?.SK?.startsWith("SOLVE#")
    ? solveToUpdate.SK.split("SOLVE#")[1]
    : solveToUpdate.DateTime;



  const userID = solveToUpdate.PK?.split('USER#')[1] || solveToUpdate.userID;

  if (!userID || !timestamp) {
    console.error('Missing userID or timestamp in solve:', solveToUpdate);
    return;
  }

  const newTime = penalty === '+2' ? originalTime + 2000
                : penalty === 'DNF' ? Number.MAX_SAFE_INTEGER
                : originalTime;

  await updateSolvePenalty(userID, timestamp, originalTime, penalty);

  if (isArray) {
    const updated = [...solve];
    updated[index].penalty = penalty;
    updated[index].time = newTime;
    setNotes(updated.map(s => s.note || ''));
  } else {
    solve.penalty = penalty;
    solve.time = newTime;
    setNotes(solve.note || '');
  }
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
          <div className="penalty-buttons">
            <button onClick={() => handlePenaltyChange('+2', index)}>+2</button>
            <button onClick={() => handlePenaltyChange('DNF', index)}>DNF</button>
            <button onClick={() => handlePenaltyChange(null, index)}>Clear</button>
          </div>
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
                <div className="penalty-buttons">
                  <button onClick={() => handlePenaltyChange('+2')}>+2</button>
                  <button onClick={() => handlePenaltyChange('DNF')}>DNF</button>
                  <button onClick={() => handlePenaltyChange(null)}>Clear</button>
                </div>
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
