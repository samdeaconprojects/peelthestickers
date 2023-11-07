// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail";
import EmailTester from './components/EmailTester';
import { randomScrambleForEvent } from "cubing/scramble"; // Make sure to import this

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
    // ... other events if necessary
  });

  useEffect(() => {
    generateNewScramble(); // Generate an initial scramble when the app loads
  }, [currentEvent]); // Also regenerate when the current event changes

  const generateNewScramble = async () => {
    try {
      const newScramble = await randomScrambleForEvent(currentEvent);
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

  return (
    <div className="App">
      <Navigation />
      <div className="main-content">
        <select onChange={handleEventChange} value={currentEvent}>
          <option value="222">2x2x2</option>
          <option value="333">3x3x3</option>
          <option value="444">4x4x4</option>
          <option value="555">5x5x5</option>
          <option value="666">6x6x6</option>
          <option value="777">7x7x7</option>
          {/* Add more options for other events as needed */}
        </select>
      <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} />
  <Timer addTime={addSolve} />
  <TimeList times={sessions[currentEvent].map(solve => solve.time)} />
  <EmailTester />
</div>

      {showDetail && <Detail scramble={scramble} />}
    </div>
  );
}

export default App;
