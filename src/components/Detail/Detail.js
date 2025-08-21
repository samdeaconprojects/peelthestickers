import React, { useEffect, useState } from 'react';
import './Detail.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';
import { updateSolvePenalty } from '../../services/updateSolvePenalty';

function Detail({ solve, userID, onClose, deleteTime, addPost, showNavButtons, onPrev, onNext, applyPenalty, setSessions }) {
  const isArray = Array.isArray(solve);
  const [notes, setNotes] = useState(
    isArray ? solve.map(s => s.note || '') : solve.note || 'Add a note'
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

  const handlePenaltyChange = async (penalty, index = null) => {
    console.log("🧠 Resolved userID:", userID);
    
    const s = isArray ? solve[index] : solve;
    const originalTime = s.originalTime || s.time;
    const timestamp = s.datetime;
    const resolvedUserID = userID || s.PK?.split('USER#')[1] || s.userID;

    if (!resolvedUserID || !timestamp) {
      console.error('❌ Missing userID or timestamp:', { resolvedUserID, timestamp, s });
      return;
    }

    const newTime =
      penalty === '+2' ? originalTime + 2000 :
      penalty === 'DNF' ? Number.MAX_SAFE_INTEGER :
      originalTime;

    try {
      await updateSolvePenalty(resolvedUserID, timestamp, originalTime, penalty);

      const updatedSolve = {
        ...s,
        penalty,
        time: newTime,
        originalTime,
      };

      if (typeof setSessions === "function") {
        setSessions(prev => {
          const updated = { ...prev };
          const session = updated[s.event] || [];
          const i = session.findIndex(sol => sol.datetime === s.datetime);
          if (i !== -1) session[i] = updatedSolve;
          return updated;
        });
      }

      if (!isArray) {
        Object.assign(s, updatedSolve); // In-place update
      }

      if (typeof applyPenalty === "function") {
        applyPenalty(timestamp, penalty, newTime);
      }
    } catch (err) {
      console.error("❌ Penalty update failed:", err);
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
        <div className='detailTime'>{formatTime(item.time, false, item.penalty)}</div>
        <div className='detailScramble' style={{ fontSize: getScrambleFontSize(item.event) }}>
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
          <div className="penalty-buttons">
            <button onClick={() => handlePenaltyChange('+2', index)}>+2</button>
            <button onClick={() => handlePenaltyChange('DNF', index)}>DNF</button>
            <button onClick={() => handlePenaltyChange(null, index)}>Clear</button>
          </div>
          <button className="share-button" onClick={() => handleShare(index)}>Share</button>
          <button className="delete-button" onClick={() => handleDelete(index)}>Delete</button>
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
              <div className='detailTime'>{formatTime(solve.time, false, solve.penalty)}</div>
              <div className='detailScramble' style={{ fontSize: getScrambleFontSize(solve.event) }}>
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
                <div className="penalty-buttons">
                  <button onClick={() => handlePenaltyChange('+2')}>+2</button>
                  <button onClick={() => handlePenaltyChange('DNF')}>DNF</button>
                  <button onClick={() => handlePenaltyChange(null)}>Clear</button>
                </div>
                <button className="share-button" onClick={() => handleShare()}>Share</button>
                <button className="delete-button" onClick={() => handleDelete()}>Delete</button>
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
