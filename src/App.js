// App.js
import React, { useState } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble";
import Navigation from "./components/Navigation";
import Detail from "./components/Detail";
import EmailTester from './components/EmailTester';

function App() {
  const [scramble, setScramble] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [times, setTimes] = useState([]);

  const handleScrambleClick = (scramble) => {
    setScramble(scramble);
    setShowDetail(true);
  };

  const addTime = (time) => {
    setTimes([...times, time]);
    // Optionally hide detail when new time is added
    setShowDetail(false);
  };

  return (
    <div className="App">
      
      <div className="main-content">
        {/* Pass times as a prop to Scramble */}
        <Scramble onScrambleClick={handleScrambleClick} times={times} />
        <Timer addTime={addTime} />
        <TimeList times={times} />
        <EmailTester />
      </div>
      {showDetail && <Detail scramble={scramble} />}
    </div>
  );
}

export default App;
