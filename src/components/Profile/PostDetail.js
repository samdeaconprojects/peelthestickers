// src/components/Profile/PostDetail.js
import React, { useState } from 'react';
import '../Detail/Detail.css';            // reuse your popup styles
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import { calculateAverage, formatTime } from '../TimeList/TimeUtils';
import { currentEventToString } from "../../components/scrambleUtils";

function PostDetail({
  author,
  date,
  solveList = [],
  comments = [],
  onClose,
  onDelete,
  onAddComment
}) {
  const [newComment, setNewComment] = useState('');
  // compute numeric times array
  const times = solveList.map(s => s.time);
  const avg = times.length
    ? calculateAverage(times, true).average
    : null;

  const handleAdd = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment.trim());
    setNewComment('');
  };

  return (
    <div className="detailPopup" onClick={e=> e.target.className==='detailPopup' && onClose()}>
      <div className="detailPopupContent" style={{ maxHeight:'80vh', overflowY:'auto' }}>
        <span className="closePopup" onClick={onClose}>×</span>

        <h2>{currentEventToString(solveList[0]?.event)} {solveList.length>1?'Average':'Single'}</h2>
        {avg != null && (
          <div style={{ marginBottom: '1em' }}>
            <strong>Avg:</strong> {formatTime(avg)}
          </div>
        )}

        <div className="solvesList" style={{ marginBottom:'1em' }}>
          {solveList.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', marginBottom:'0.5em' }}>
              <div style={{ width: '4em' }}>{formatTime(s.time)}</div>
              <RubiksCubeSVG
                n={s.event}
                faces={getScrambledFaces(s.scramble, s.event)}
                isMusicPlayer={false}
                isTimerCube={false}
                style={{ width: '40px', height: '40px', marginRight: '0.5em' }}
              />
              <code style={{ fontSize: '0.8em', wordBreak:'break-all' }}>
                {s.scramble}
              </code>
            </div>
          ))}
        </div>

        <div className="commentsSection" style={{ marginBottom:'1em' }}>
          <h3>Comments</h3>
          {comments.length === 0 && <p>No comments yet.</p>}
          {comments.map((c,i)=>(
            <div key={i} className="postComment" style={{ marginBottom:'0.5em' }}>{c}</div>
          ))}

          <div style={{ display:'flex', marginTop:'0.5em' }}>
            <input
              type="text"
              value={newComment}
              onChange={e=>setNewComment(e.target.value)}
              placeholder="Add a comment…"
              style={{ flex:1, marginRight:'0.5em' }}
            />
            <button onClick={handleAdd}>Post</button>
          </div>
        </div>

        <div style={{ textAlign:'right' }}>
          <button className="delete-button" onClick={onDelete}>Delete Post</button>
        </div>
      </div>
    </div>
  );
}

export default PostDetail;
