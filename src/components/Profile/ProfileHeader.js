import React, { useState } from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import { formatTime, calculateAverage } from '../TimeList/TimeUtils'; // Ensure this is the correct path

function ProfileHeader({ user, sessions }) {
  const [selectedEvents, setSelectedEvents] = useState(['333', '222', '444', '555']); // Default selected events
  const [showEventSelector, setShowEventSelector] = useState(false);

  const handleOpenSelector = () => {
    setShowEventSelector(true);
  };

  const handleCloseSelector = () => {
    setShowEventSelector(false);
  };

  const handleSaveSelectedEvents = (events) => {
    setSelectedEvents(events);
    setShowEventSelector(false);
  };

  const getPersonalBest = (event, type) => {
    const times = (sessions[event] || []).map((solve) => solve.time);
    if (!times.length) return 'N/A';

    if (type === 'single') {
      return Math.min(...times);
    } else if (type === 'average') {
      if (times.length >= 5) {
        const avgData = calculateAverage(times.slice(-5), true);
        return avgData.average.toFixed(2);
      }
      return 'N/A';
    }
  };

  return (
    <div className='profileHeader'>
      <div className='profileAndName'>
        <div className='profilePicture'>
          <div className='profileCube'>
            <RubiksCubeSVG
              className="profileCube"
              n={"333"}
              faces={getScrambledFaces("U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'", "333")}
              isMusicPlayer={false}
              isTimerCube={false}
            />
          </div>
        </div>
        <div className='profileNameAndUsername'>
          <div className='profileName'>{user?.Name || 'Guest'}</div>
          <div className='profileUsername'>@{user?.UserID || 'guest'}</div>
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
      
      <button className="edit-events-button" onClick={handleOpenSelector}>
        Edit
      </button>

      <div className='profileStats'>
        <div>10 Followers</div>
        <div>40 Following</div>
        <div>2013DEAC01</div>
        <div>10,408 Solves</div>
        <div>CFOP</div>
        <div>May 4 2024</div>
      </div>

      {showEventSelector && (
        <EventSelectorDetail
          events={['222', '333', '444', '555', '666', '777', '333OH', '333BLD']}
          selectedEvents={selectedEvents}
          onClose={handleCloseSelector}
          onSave={handleSaveSelectedEvents}
        />
      )}
    </div>
  );
}

export default ProfileHeader;
