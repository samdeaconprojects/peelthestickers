// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail/Detail";
import RubiksCubeSVG from "./components/RubiksCubeSVG";
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
  });

  useEffect(() => {
    setScramble(generateScramble()); // Generate an initial scramble when the app loads
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

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; // max is exclusive
  }
  
  function generateScramble() {
    let n;
    var currentEventToScramble = currentEvent
    switch (currentEvent) {
      case '222':
        n = 2;
        break;
      case '333':
        n = 3;
        break;
      case '444':
        n = 4;
        break;
      case '555':
        n = 5;
        break;
      case '666':
        n = 6;
        break;
      case '777':
        n = 7;
        break;
      default:
        n = 3; // Default to 3x3 if currentEvent is not recognized
    }

    console.log("n: " + n);
  
    let faceArray = ["U", "D", "R", "L", "B", "F"];
    const modArray = ["'", "", "2"];
    const nudgeArray = [-1, 0, 1];
    let moves;
  
    if (n === 2) {
      moves = 10;
      faceArray = ["U", "R", "F"];
    } else if (n === 4) {
      moves = 45;
    } else {
      moves = (n - 2) * 20;
    }
  
    moves += nudgeArray[getRandomInt(0, nudgeArray.length)];
    let randomScramble = "";
    let faceTemp = "";
  
    for (let i = 0; i < moves; i++) {
      let move = "";
      const layers = n > 3 ? getRandomInt(1, Math.floor(n / 2) + 1) : 1;
  
      if (layers === 1) {
        const faceIndex = getRandomInt(0, faceArray.length);
        if (i > 0) {
          faceArray.push(faceTemp);
        }
        move += faceArray[faceIndex];
        faceTemp = faceArray[faceIndex];
        faceArray.splice(faceIndex, 1);
      } else {
        if (layers > 2) {
          move += String(layers);
        }
  
        const faceIndex = getRandomInt(0, faceArray.length);
        if (i > 0) {
          faceArray.push(faceTemp);
        }
        move += faceArray[faceIndex];
        faceTemp = faceArray[faceIndex];
        faceArray.splice(faceIndex, 1);
  
        if (layers > 1) {
          move += "w";
        }
      }
  
      move += modArray[getRandomInt(0, modArray.length)];
      randomScramble += move + " ";
    }
  
    console.log("Moves:", moves);
    console.log("Scramble:", randomScramble);
    return randomScramble;
  }
  
  

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
    setScramble(generateScramble()); // Generate a new scramble after adding the solve
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
        <div className="scramble-select-container">
        <select onChange={handleEventChange} value={currentEvent} className="event-select">
          <option value="222">2x2</option>
          <option value="333">3x3</option>
          <option value="444">4x4</option>
          <option value="555">5x5</option>
          <option value="666">6x6</option>
          <option value="777">7x7</option>
          <option value="333OH">3x3 One-Handed</option>
          {/* Add more options for other events as needed */}
        </select>
        <RubiksCubeSVG n={currentEvent} scramble={['red', 'green', 'blue', 'orange', 'yellow', 'white']} />
        </div>
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
          <Timer addTime={addSolve} />
          <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} />
          <TimeList times={sessions[currentEvent].map(solve => solve.time)} />
        </div>
      )}
    </div>
  );
  
  
}

export default App;
