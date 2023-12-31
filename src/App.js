// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail/Detail";
import EmailTester from './components/EmailTester';
import { randomScrambleForEvent } from "cubing/scramble"; // Make sure to import this

function App() {
  const [currentEvent, setCurrentEvent] = useState('333');
  const [scramble, setScramble] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [isMusicPlayerMode, setIsMusicPlayerMode] = useState(false); // New state for toggling the layout
  const [sessions, setSessions] = useState({
    '222': [],
    '333': [],
    '444': [],
    '555': [],
    '666': [],
    '777': [],
    '333OH': [],
    // ... other events if necessary
  });

  useEffect(() => {
    generateNewScramble(); // Generate an initial scramble when the app loads
  }, [currentEvent]); // Also regenerate when the current event changes

  const generateNewScramble = async () => {
    try {
      var currentEventToScramble = currentEvent
      if (currentEventToScramble === "333OH") {
        currentEventToScramble = "333"
      }
      const newScramble = await randomScrambleForEvent(currentEventToScramble);
      setScramble(newScramble.toString());
    } catch (error) {
      console.error('Error generating scramble:', error);
    }
  };

  const handleScrambleClick = () => {
    setShowDetail(true);
  };

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
    generateNewScramble(); // Generate a new scramble after adding the solve
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    // No need to call generateNewScramble here since it's called by useEffect when currentEvent changes
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
  };

  const toggleMusicPlayerMode = () => {
    setIsMusicPlayerMode(!isMusicPlayerMode); // Toggle the layout mode
  };

  const resetToDefaultLayout = () => {
    setIsMusicPlayerMode(false);
  };

  return (
    <div className={`App ${isMusicPlayerMode ? 'music-player-mode' : ''}`}>
      <Navigation 
        onNavClick={toggleMusicPlayerMode}
        onMainLogoClick={resetToDefaultLayout}
      />
      <div className={`main-content ${isMusicPlayerMode ? 'hide-content' : ''}`}>
        <select onChange={handleEventChange} value={currentEvent}>
          <option value="222">2x2</option>
          <option value="333">3x3</option>
          <option value="444">4x4</option>
          <option value="555">5x5</option>
          <option value="666">6x6</option>
          <option value="777">7x7</option>
          <option value="333OH">3x3 One-Handed</option>
          {/* Add more options for other events as needed */}
        </select>
        {!isMusicPlayerMode && (
          <>
            <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} />
            <Timer addTime={addSolve} />
            <TimeList times={sessions[currentEvent].map(solve => solve.time)} />

          </>
        )}
      </div>
      {showDetail && <Detail scramble={scramble} currentEvent={currentEvent} onClose={handleCloseDetail} />}
      {isMusicPlayerMode && (
        <div className="player">
          <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} />
          <Timer addTime={addSolve} />
          <TimeList times={sessions[currentEvent].map(solve => solve.time)} />
        </div>
      )}
    </div>
  );
  
  
}

export default App;
