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
import PlayerBar from "./components/PlayerBar/PlayerBar";
import EventSelector from "./components/EventSelector";
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
  const [showPlayerBar, setShowPlayerBar] = useState(true);

  useEffect(() => {
    setScramble(generateScramble(currentEvent));
  }, [currentEvent]);

  const handleScrambleClick = () => {
    setShowDetail(true);
  };

  const location = useLocation();
  const isHomePage = location.pathname === '/';

  const addSolve = (newTime) => {
    const newSolve = {
      time: newTime,
      scramble: scramble,
      event: currentEvent
    };
    setSessions(prevSessions => ({
      ...prevSessions,
      [currentEvent]: [...prevSessions[currentEvent], newSolve]
    }));
    console.log("SOLVE OBJECT");
    console.log(newSolve);
    setShowDetail(false);
    setScramble(generateScramble(currentEvent));
  };

  const deleteTime = (eventKey, index) => {
    const newEventTimes = sessions[eventKey].filter((_, idx) => idx !== index);
    setSessions(prevSessions => ({
      ...prevSessions,
      [eventKey]: newEventTimes
    }));
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
  };

  return (
    <SettingsProvider>
      <div className={`App ${!isHomePage ? 'music-player-mode' : ''}`}>
        <div className="navAndPage">
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
                  <TimeList solves={sessions[currentEvent]} deleteTime={(index) => deleteTime(currentEvent, index)} />
                </>
              } />
              <Route path="/profile" element={<Profile />} />
              <Route path="/stats" element={<Stats solves={sessions[currentEvent]} />} />
              <Route path="/social" element={<Social />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
        {!isHomePage && showPlayerBar && (
          <PlayerBar
            sessions={sessions}
            currentEvent={currentEvent}
            handleEventChange={handleEventChange}
            handleScrambleClick={handleScrambleClick}
            deleteTime={deleteTime}
            addTime={addSolve}
            scramble={scramble}
          />
        )}
        {!isHomePage && (
          <div className="toggle-bar">
            {showPlayerBar ? (
              <button className="toggle-button" onClick={() => setShowPlayerBar(false)}>&#x25BC;</button> // Down arrow
            ) : (
              <button className="toggle-button" onClick={() => setShowPlayerBar(true)}>&#x25B2;</button> // Up arrow
            )}
          </div>
        )}
      </div>
    </SettingsProvider>
  );
}

export default App;
