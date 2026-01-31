// src/components/Profile/Post.js
import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import NameTag from './NameTag';
import { getScrambledFaces } from '../cubeStructure';
import { currentEventToString } from "../../components/scrambleUtils";
import { formatTime } from '../TimeList/TimeUtils';

/* --- helper: add alpha to hex color --- */
const withAlpha = (hex, alpha = 0.12) => {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// NxN (and 3x3 variants) only
const isNxNEvent = (ev) => {
  const e = String(ev || '').toLowerCase();
  return (
    e === '222' ||
    e === '333' ||
    e === '444' ||
    e === '555' ||
    e === '666' ||
    e === '777' ||
    e === '333oh' ||
    e === '333bld'
  );
};

/* --- Date formatting --- */
const formatPostDateTime = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || isNaN(d.getTime())) return String(value ?? '');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays =
    Math.round((startOfToday - startOfThatDay) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;

  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // ⬇️ no "at" here
  return `${dateStr} ${timeStr}`;
};

function Post({ name, picture, user, date, solveList = [], postColor, onClick }) {
  const primary = solveList[0] || {};
  const { event, scramble, time } = primary;
  const singleOrAvg = solveList.length > 1 ? 'Average' : 'Single';
  const eventStr = currentEventToString(event || '333');

  // Make sure NameTag always gets something useful
  const safeUser = user || { Name: name, ProfilePic: picture };

  const nxn = isNxNEvent(event);
  const prettyDate = formatPostDateTime(date);

  return (
    <div
      className="post"
      style={{ border: `2px solid ${withAlpha(postColor, 0.5)}` }}
      onClick={onClick}
    >
      <div className="titleAndContent">
        <div className="postTitle">
          <div
            className={`postTitleCube ${
              nxn
                ? "postTitleCube--nxn"
                : `postTitleCube--other postTitleCube--${String(event || "333").toLowerCase()}`
            }`}
          >
            {nxn ? (
              <RubiksCubeSVG
                className="postCube"
                n={event || "333"}
                faces={getScrambledFaces(scramble || "", event || "333")}
                isMusicPlayer={false}
                isTimerCube={false}
              />
            ) : (
              <PuzzleSVG
                event={event || "333"}
                scramble={scramble || ""}
                isMusicPlayer={false}
                isTimerCube={false}
              />
            )}
          </div>

          <div className="titleText">
            {eventStr} {singleOrAvg} – {time != null ? formatTime(time) : '--'}
          </div>
        </div>
      </div>

      <div className="dateAndName">
        <div className="postDate">{prettyDate}</div>
        <div className="postNameAndPicture">
          <NameTag
            name={name}
            picture={picture}
            user={safeUser}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

export default Post;
