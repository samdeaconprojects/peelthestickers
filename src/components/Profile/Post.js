import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import { currentEventToString } from "../../components/scrambleUtils";

/**
 * Post component now reads scramble/time either directly or from solveList
 * Props:
 * - name
 * - date
 * - event
 * - scramble
 * - singleOrAverage
 * - time
 * - solveList: [{ event, scramble, time, ... }]
 * - deletePost
 * - postColor
 */
function Post({ name, date, event, scramble, singleOrAverage, time, solveList = [], deletePost, postColor }) {
  // Derive display values, falling back to solveList if top-level props missing
  const primarySolve = solveList[0] || {};
  const displayEvent = event || primarySolve.event;
  const displayScramble = scramble || primarySolve.scramble;
  const displayTime = time || primarySolve.time;
  const displaySingleOrAvg = singleOrAverage || (solveList.length > 1 ? 'Average' : 'Single');

  const eventToString = currentEventToString(displayEvent);

  const styles = {
    postBorder: { border: `1px solid ${postColor}` }
  };

  return (
    <div className="post" style={styles.postBorder}>
      <div className='titleAndContent'>
        <div className='postTitle'>
          <div className='postTitleCube'>
            <RubiksCubeSVG
              className="postCube"
              n={displayEvent || "333"}
              faces={getScrambledFaces(displayScramble || "", displayEvent || "333")}
              isMusicPlayer={false}
              isTimerCube={false}
            />
          </div>
          <div className='titleText'>
            {eventToString} {displaySingleOrAvg} - {displayTime || '--'}
          </div>
        </div>
        {/* Optionally render a note or description here */}
        <div className='postContent'></div>
      </div>

      <div className='dateAndName'>
        <div className='postDate'>{date}</div>
        <div className='postNameAndPicture'>
          <div className='postName'>{name}</div>
          <div className='profilePicturePost'>
            {/* You could also use user color here if you pass it */}
          </div>
        </div>
      </div>

      {/* Uncomment to enable delete button
      <div className='belowPost'>
        <button className="deletePostButton" onClick={deletePost}>Delete</button>
      </div>
      */}
    </div>
  );
}

export default Post;
