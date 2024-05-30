import React, { useState, useEffect, useRef } from 'react';
import './Timer.css';
import { useSettings } from '../../contexts/SettingsContext';


function Timer({ addTime }) {
  const { settings, updateSettings } = useSettings();
  const [manualTime, setManualTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [isSpacebarHeld, setIsSpacebarHeld] = useState(false);
  const [canStart, setCanStart] = useState(true); // Flag to control whether the timer can start on keyup
  const intervalRef = useRef();
  const startRef = useRef();

  const startTimer = () => {
    if (canStart) { // Check if we can start the timer
      startRef.current = Date.now();
      setElapsedTime(0);
      setTimerOn(true);
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startRef.current);
      }, 10);
    }
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    const finalElapsedTime = Date.now() - startRef.current;
    setTimerOn(false);
    setElapsedTime(finalElapsedTime);
    setLastTime(finalElapsedTime);
    addTime(finalElapsedTime);
    setCanStart(false); // Disable starting the timer immediately after stopping
  };

  const handleKeyDown = (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (timerOn) {
        stopTimer();
      }
      setIsSpacebarHeld(true);
    }
  };

  const handleKeyUp = (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      setIsSpacebarHeld(false);
      if (!timerOn && canStart) {
        startTimer();
      }
      setTimeout(() => setCanStart(true), 200); // Re-enable starting after a small delay
    }
  };

  const handleManualEntry = (event) => {
    setManualTime(event.target.value);
  };

  const handleSubmitManualTime = (event) => {
    if (event.key === 'Enter') {
      addTime(parseFloat(manualTime) * 1000);  // Converts seconds to milliseconds
      setManualTime('');  // Reset input after submission
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatTime = () => {
    const timeToDisplay = timerOn ? elapsedTime : lastTime;
    let totalSeconds = Math.floor(timeToDisplay / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let milliseconds = timeToDisplay % 1000;

    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = milliseconds.toString().padStart(3, '0').substring(0, 2);

    let formattedTime = minutes > 0
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}`
      : `${seconds}.${formattedMilliseconds}`;

    return formattedTime;
  };

  return (
    <div className='timer-display'>
      {settings.timerInput === 'Keyboard' ? (
        <p className='Timer'>{formatTime()}</p>
      ) : (
        <input
          type="text"
          value={manualTime}
          onChange={handleManualEntry}
          onKeyDown={handleSubmitManualTime}
          autoFocus
        />
      )}
    </div>
  );
}

export default Timer;
