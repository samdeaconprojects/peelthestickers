import React, { useState } from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import { formatTime, calculateAverage } from '../TimeList/TimeUtils';

function ProfileHeader({ user, sessions }) {
  // Destructure user profile fields
  const {
    Name,
    UserID,
    Color,
    WCAID,
    DateFounded,
    ProfileEvent,
    ProfileScramble
  } = user;

  const [selectedEvents, setSelectedEvents] = useState([ProfileEvent]);
  const [showEventSelector, setShowEventSelector] = useState(false);

  const handleOpenSelector = () => setShowEventSelector(true);
  const handleCloseSelector = () => setShowEventSelector(false);
  const handleSaveSelectedEvents = (events) => {
    setSelectedEvents(events);
    setShowEventSelector(false);
  };

  const getPersonalBest = (event, type) => {
    const times = (sessions[event] || []).map((solve) => solve.time);
    if (!times.length) return 'N/A';
    if (type === 'single') return Math.min(...times);
    if (type === 'average') {
      if (times.length >= 5) {
        const avgData = calculateAverage(times.slice(-5), true);
        return avgData.average.toFixed(2);
      }
      return 'N/A';
    }
  };

  // Format date founded
  const joinedDate = DateFounded
    ? new Date(DateFounded).toLocaleDateString()
    : '—';

  return (
    <div className='profileHeader'>
      <div className='profileAndName'>
        <div className='profilePicture' style={{ border: `2px solid ${Color}` }}>
          <div className='profileCube'>
            <RubiksCubeSVG
              className="profileCube"
              n={ProfileEvent}
              faces={getScrambledFaces(ProfileScramble, ProfileEvent)}
              color={Color}
              isMusicPlayer={false}
              isTimerCube={false}
            />
          </div>
        </div>
        <div className='profileNameAndUsername'>
          <div className='profileName'>{Name || 'Guest'}</div>
          <div className='profileUsername'>@{UserID || 'guest'}</div>
        </div>
      </div>

      <div className='personalBests'>
        {selectedEvents.map((event, index) => (
          <div className='pb' key={index}>
            <div className='pbTitle'>{event} Single</div>
            <div className='pbTime'>{formatTime(getPersonalBest(event, 'single'))}</div>
            <div className='pbTitle'>{event} Average</div>
            <div className='pbTime'>{formatTime(getPersonalBest(event, 'average'))}</div>
          </div>
        ))}
      </div>

      <button className="edit-events-button" onClick={handleOpenSelector}>Edit Events</button>

      <div className='profileStats' style={{ border: `2px solid ${Color}` }}>
        <div><strong>WCA ID:</strong> {WCAID || '—'}</div>
        <div><strong>Joined:</strong> {joinedDate}</div>
      </div>

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

export default ProfileHeader;
