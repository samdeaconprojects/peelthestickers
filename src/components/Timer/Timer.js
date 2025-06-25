import React, { useState, useEffect, useRef } from 'react';
import './Timer.css';
import { useSettings } from '../../contexts/SettingsContext';

function Timer({ addTime }) {
  const { settings } = useSettings();
  const [manualTime, setManualTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [isSpacebarHeld, setIsSpacebarHeld] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const intervalRef = useRef();
  const startRef = useRef();
  const ignoreNextKeyUp = useRef(false);


  const keypadButtons = ['7','8','9','4','5','6','1','2','3','0','.','⌫',':','Enter'];

  const startTimer = () => {
    if (canStart && !timerOn) {
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
  ignoreNextKeyUp.current = true;

  addTime(finalElapsedTime);
};


  const parseShorthandTime = (input) => {
    if (input.includes(':')) {
      const [min, sec] = input.split(':').map(Number);
      return ((min || 0) * 60000) + ((sec || 0) * 1000);
    }
    if (input.startsWith('.')) return parseFloat('0' + input) * 1000;
    if (!input.includes('.')) {
      if (input.length <= 2) return parseInt(input) * 1000;
      const base = input.slice(0, -2);
      const decimal = input.slice(-2);
      return parseFloat(`${base}.${decimal}`) * 1000;
    }
    return parseFloat(input) * 1000;
  };

  const handleSubmitManualTime = () => {
    const ms = parseShorthandTime(manualTime);
    if (!isNaN(ms)) addTime(ms);
    setManualTime('');
  };

  const handleKeyDown = (event) => {
    if (settings.timerInput === 'Keyboard') {
      if (event.code === 'Space') {
        event.preventDefault();
        if (timerOn) stopTimer();
        setIsSpacebarHeld(true);
      }
    } else {
      if (/^[0-9.]$/.test(event.key)) setManualTime(prev => prev + event.key);
      if (event.key === 'Backspace') setManualTime(prev => prev.slice(0, -1));
      if (event.key === 'Enter') handleSubmitManualTime();
      if (event.key === ':') setManualTime(prev => prev + ':');
    }
  };

  const handleKeyUp = (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    setIsSpacebarHeld(false);

    if (ignoreNextKeyUp.current) {
      ignoreNextKeyUp.current = false;
      return;
    }

    if (!timerOn && canStart) {
      startTimer();
    }

    setTimeout(() => setCanStart(true), 200);
  }
};


  const handlePadClick = (val) => {
    if (val === '⌫') {
      setManualTime(prev => prev.slice(0, -1));
    } else if (val === 'Enter') {
      handleSubmitManualTime();
    } else {
      setManualTime(prev => prev + val);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [settings.timerInput, manualTime, timerOn]);

  useEffect(() => {
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, []);

  const formatTime = () => {
    const timeToDisplay = timerOn ? elapsedTime : lastTime;
    let totalSeconds = Math.floor(timeToDisplay / 1000);
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;
    let milliseconds = timeToDisplay % 1000;
    let formattedSeconds = seconds.toString().padStart(2, '0');
    let formattedMilliseconds = milliseconds.toString().padStart(3, '0').substring(0, 2);
    return minutes > 0
      ? `${minutes}:${formattedSeconds}.${formattedMilliseconds}`
      : `${seconds}.${formattedMilliseconds}`;
  };

  return (
    <div className='timer-display'>
      {settings.timerInput === 'Keyboard' ? (
        <p className='Timer'>{formatTime()}</p>
      ) : (
        <div className="manual-entry-container">
          <div className="manual-display">{manualTime || '0.00'}</div>
          <div className="keypad-grid">
            {keypadButtons.map((val, i) => (
              <button key={i} onClick={() => handlePadClick(val)}>
                {val}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Timer;
