// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail/Detail";
import RubiksCubeSVG from "./components/RubiksCubeSVG";
import { generateScramble, getScrambledFaces } from "./components/scrambleUtils";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import PlayerBar from "./components/PlayerBar/PlayerBar"; // Import the new component
import EventSelector from "./components/EventSelector"; // Import the new component
import { Routes, Route, useLocation } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';


function App() {
  const [currentEvent, setCurrentEvent] = useState('333');
  const [scramble, setScramble] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [sessions, setSessions] = useState({
        '222': [],
        '333': [],
        '444': [],
        '555': [],
        '666': [],
        '777': [],
        '333OH': [],
        '333BLD': [],
    });

  useEffect(() => {
    setScramble(generateScramble(currentEvent)); // Generate an initial scramble when the app loads
  }, [currentEvent]); // Also regenerate when the current event changes

  const handleScrambleClick = () => {
    setShowDetail(true);
  };

  const location = useLocation();
  const isHomePage = location.pathname === '/';

  const addSolve = (newTime) => {
    /*
    let timeString = newTime.toString();

    if (!timeString.includes('.')) {
      // Input is in milliseconds without decimal point, convert to seconds
      let timeInMilliseconds = parseInt(timeString, 10);
      newTime = (timeInMilliseconds / 1000).toFixed(2);
    } // If it includes a dot, it's assumed to be already in correct format
    */

    const newSolve = {
      time: newTime, // Ensure that newTime is a number
      scramble: scramble,
      event: currentEvent
    };
    setSessions(prevSessions => ({
      ...prevSessions,
      [currentEvent]: [...prevSessions[currentEvent], newSolve]
    }));
    setShowDetail(false); // Optionally hide detail when new time is added
    setScramble(generateScramble(currentEvent)); // Generate a new scramble after adding the solve
  };

  // Function to delete a time from the sessions
  const deleteTime = (eventKey, index) => {
    const newEventTimes = sessions[eventKey].filter((_, idx) => idx !== index);
    setSessions(prevSessions => ({
      ...prevSessions,
      [eventKey]: newEventTimes
    }));
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    // No need to call generateNewScramble here since it's called by useEffect when currentEvent changes
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
  };

  return (
    <SettingsProvider>
      <div className={`App ${!isHomePage ? 'music-player-mode' : ''}`}>
        <Navigation />
        <div className="main-content">
        <Routes>
          <Route path="/" element={
            <>
              <div className="scramble-select-container">
                <EventSelector currentEvent={currentEvent} handleEventChange={handleEventChange} />
                <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} currentEvent={currentEvent} isMusicPlayer={!isHomePage} />
                <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scramble, currentEvent)} isMusicPlayer={!isHomePage} isTimerCube={true} />
              </div>
              <Timer addTime={addSolve} />
              <TimeList times={sessions[currentEvent].map(solve => solve.time)} deleteTime={(index) => deleteTime(currentEvent, index)} />            </>
          } />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/social" element={<Social />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        {!isHomePage && (
           <PlayerBar sessions={sessions} currentEvent={currentEvent} handleEventChange={handleEventChange} deleteTime={deleteTime} addTime={addSolve} scramble={scramble} />
        )}
      </div>
      </div>
    </SettingsProvider>
  );

  
  
}

export default App;
