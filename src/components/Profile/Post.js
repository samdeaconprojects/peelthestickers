// src/components/Profile/Post.js
import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import { currentEventToString } from "../../components/scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';

/**
 * Props:
 * - name: string
 * - date: string
 * - solveList: Array<{ event, scramble, time, note?, comments? }>
 * - postColor: string
 * - onClick: () => void      // opens the detail popup
 */
function Post({ name, date, solveList = [], postColor, onClick }) {
  const primary = solveList[0] || {};
  const { event, scramble, time } = primary;
  const singleOrAvg = solveList.length > 1 ? 'Average' : 'Single';
  const eventStr = currentEventToString(event || '333');

  return (
    <div 
      className="post" 
      style={{ border: `1px solid ${postColor}` }} 
      onClick={onClick}
    >
      <div className='titleAndContent'>
        <div className='postTitle'>
          <div className='postTitleCube'>
            <RubiksCubeSVG
              className="postCube"
              n={event || "333"}
              faces={getScrambledFaces(scramble || "", event || "333")}
              isMusicPlayer={false}
              isTimerCube={false}
            />
          </div>
          <div className='titleText'>
            {eventStr} {singleOrAvg} – {time != null ? formatTime(time) : '--'}
          </div>
        </div>
      </div>

      <div className='dateAndName'>
        <div className='postDate'>{date}</div>
        <div className='postNameAndPicture'>
          <div className='postName'>{name}</div>
        </div>
      </div>
    </div>
  );
}

export default Post;
