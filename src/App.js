// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail/Detail";
import RubiksCubeSVG from "./components/RubiksCubeSVG";
import { generateScramble, getScrambledFaces } from "./scrambleUtils";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import { Routes, Route, useLocation } from 'react-router-dom';


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

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    // No need to call generateNewScramble here since it's called by useEffect when currentEvent changes
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
  };

  return (
   
    <div className={`App ${!isHomePage ? 'music-player-mode' : ''}`}>
      <Navigation/>
      <Routes>
          <Route path="/" />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/social" element={<Social />} />
          <Route path="/settings" element={<Settings />} />
      </Routes>
      <div className={`main-content ${!isHomePage ? 'hide-content' : ''}`}>
        <div className="scramble-select-container">
        <select onChange={handleEventChange} value={currentEvent} className="event-select">
          <option value="222">2x2</option>
          <option value="333">3x3</option>
          <option value="444">4x4</option>
          <option value="555">5x5</option>
          <option value="666">6x6</option>
          <option value="777">7x7</option>
          <option value="333OH">3x3 OH</option>
          <option value="333BLD">3x3 BLD</option>
          {/* Add more options for other events as needed */}
        </select>
        <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} currentEvent={currentEvent} isMusicPlayer={!isHomePage} />

        <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scramble, currentEvent)} isMusicPlayer={!isHomePage} />
        </div>
        {isHomePage && (
          <>
            <Timer addTime={addSolve} />
            <TimeList times={sessions[currentEvent].map(solve => solve.time)} />

          </>
        )}
      </div>
      {showDetail && <Detail scramble={scramble} currentEvent={currentEvent} onClose={handleCloseDetail} />}
      {!isHomePage && (
        <div className="player">
          <Timer addTime={addSolve} />
          <TimeList times={sessions[currentEvent].map(solve => solve.time)} />
        </div>
      )}
      
    
    </div>
      
  );
  
  
}

export default App;
