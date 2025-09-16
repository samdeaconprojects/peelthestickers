// src/components/Profile/ProfileHeader.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Profile.css';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import { formatTime, calculateAverage } from '../TimeList/TimeUtils';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';

export default function ProfileHeader({ user, sessions }) {
  const {
    Name,
    UserID,
    Color,
    WCAID,
    DateFounded,
    ProfileEvent,
    ProfileScramble,
    Friends = []
  } = user;

  const [selectedEvents, setSelectedEvents] = useState([ProfileEvent]);
  const [showEventSelector, setShowEventSelector] = useState(false);
  const [openWidget, setOpenWidget] = useState(null);

  const handleOpenSelector = () => setShowEventSelector(true);
  const handleCloseSelector = () => setShowEventSelector(false);
  const handleSaveSelectedEvents = ev => {
    setSelectedEvents(ev);
    setShowEventSelector(false);
  };

  // ✅ Flatten all sessions for the given event
  const getAllSolvesForEvent = (event) => {
    if (!sessions[event]) return [];
    if (Array.isArray(sessions[event])) return sessions[event]; // fallback
    return Object.values(sessions[event]).flat();
  };

  // helper to compute PBs
  const getPB = (event, type) => {
    const times = getAllSolvesForEvent(event).map(s => s.time).filter(t => typeof t === 'number');
    if (!times.length) return 'N/A';
    if (type === 'single') return Math.min(...times);
    if (type === 'average') {
      if (times.length < 5) return 'N/A';
      return calculateAverage(times.slice(-5), true).average.toFixed(2);
    }
  };

  const cubeTransforms = {
    222: 'translate(15px, 18px) scale(0.7)',
    333: 'scale(0.6)',
    444: 'translate(-1px, -5px) scale(0.55)',
    555: 'translate(-8px, -10px) scale(0.55)',
    666: 'translate(-4px, -7px) scale(0.54)',
    777: 'translate(-4px, -6px) scale(0.54)',
    CLOCK: 'translate(-7px, -44px) scale(0.55)',
    SKEWB: 'translate(-9px, -12px) scale(0.85)',
    MEGAMINX: 'translate(-4px, -16px) scale(0.8)',
    PYRAMINX: 'translate(0px, -18px) scale(0.88)',
  };

  const joinedDate = DateFounded
    ? new Date(DateFounded).toLocaleDateString()
    : '—';

  // build our widgets
  const widgets = [
    {
      key: 'friends',
      title: 'Friends',
      value: Friends.length,
      detail: (
        Friends.length
          ? <ul className="friendsList">
              {Friends.map(fid => (
                <li key={fid}>
                  <Link to={`/profile/${fid}`}>@{fid}</Link>
                </li>
              ))}
            </ul>
          : <div>You have no friends yet.</div>
      )
    },
    ...selectedEvents.flatMap(event => ([
      {
        key: `${event}-single`,
        title: `${event} PB`,
        value: formatTime(getPB(event, 'single')),
        detail: (
          <div>
            <h4>{event} Best Single</h4>
            <p>{formatTime(getPB(event, 'single'))}</p>
          </div>
        )
      },
      {
        key: `${event}-avg`,
        title: `${event} Avg5`,
        value: formatTime(getPB(event, 'average')),
        detail: (
          <div>
            <h4>{event} Best Avg5</h4>
            <p>{formatTime(getPB(event, 'average'))}</p>
          </div>
        )
      }
    ])),
    {
      key: 'wca',
      title: 'WCA ID',
      value: WCAID || '—',
      detail: <div>Your WCA ID is <strong>{WCAID || '—'}</strong></div>
    },
    {
      key: 'joined',
      title: 'Joined',
      value: joinedDate,
      detail: <div>You joined on <strong>{joinedDate}</strong></div>
    }
  ];

  return (
    <div className="profileHeader">
      <div className="profileAndName">
        <div className="profilePicture" style={{ border: `2px solid ${Color}` }}>
          <div
            className="profileCube"
            style={{
              transform: cubeTransforms[ProfileEvent] || 'scale(0.6)'
            }}
          >
            <PuzzleSVG
              className="profileCube"
              event={ProfileEvent}
              scramble={ProfileScramble}
              isMusicPlayer={false}
              isProfileCube={true}
              isTimerCube={false}
            />
         </div>
        </div>
        <div className="profileNameAndUsername">
          <div className="profileName">{Name || 'Guest'}</div>
          <div className="profileUsername">@{UserID || 'guest'}</div>
        </div>
      </div>

      <div className="widgetBar">
        {widgets.map(w => (
          <div
            key={w.key}
            className="widget"
            style={{ border: `2px solid ${Color}` }}
            onClick={() => setOpenWidget(openWidget === w.key ? null : w.key)}
          >
            <div className="widgetTitle">{w.title}</div>
            <div className="widgetValue">{w.value}</div>
          </div>
        ))}
      </div>

      {openWidget && (
        <>
          <div
            className="widgetOverlay"
            onClick={() => setOpenWidget(null)}
          />
          <div className="widgetDetail">
            {widgets.find(w => w.key === openWidget).detail}
          </div>
        </>
      )}

      {showEventSelector && (
        <EventSelectorDetail
          events={['222','333','444','555','666','777','333OH','333BLD']}
          selectedEvents={selectedEvents}
          onClose={handleCloseSelector}
          onSave={handleSaveSelectedEvents}
        />
      )}
    </div>
  );
}
