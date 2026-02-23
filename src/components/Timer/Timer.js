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

  // -------------------------
  // Inspection state
  // -------------------------
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionElapsed, setInspectionElapsed] = useState(0); // ms since inspection start

  const inspectionIntervalRef = useRef(null);
  const inspectionStartRef = useRef(null);

  const beep8FiredRef = useRef(false);
  const beep12FiredRef = useRef(false);

  // If inspection ran long, we apply +2 by adding 2000ms to the solve time when stopping.
  const inspectionExtraMsRef = useRef(0);

  const intervalRef = useRef();
  const startRef = useRef();
  const ignoreNextKeyUp = useRef(false);

  const keypadButtons = ['7','8','9','4','5','6','1','2','3','0','.','⌫',':','Enter'];

  const inspectionBeepsRef = useRef(!!settings.inspectionBeeps);
  useEffect(() => {
    inspectionBeepsRef.current = !!settings.inspectionBeeps;
  }, [settings.inspectionBeeps]);

  // ✅ NEW: hold-to-ready timeout (green)
  const holdTimeoutRef = useRef(null);

  // ✅ NEW: cancel out of pre-start hold/inspection (Escape)
  const cancelPreStart = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    setIsSpacebarHeld(false);
    setCanStart(false);

    // cancel inspection if it was running
    stopInspectionInterval();
    setIsInspecting(false);
    setInspectionElapsed(0);
    inspectionStartRef.current = null;

    // clear any pending inspection penalty
    inspectionExtraMsRef.current = 0;
  };

  // -------------------------
  // Simple beep helper (WebAudio)
  // -------------------------
  const beep = (count = 1) => {
    if (!inspectionBeepsRef.current) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();

      const playOne = (startAtSec) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.08;

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        const t0 = now + startAtSec;

        osc.start(t0);
        osc.stop(t0 + 0.09);
      };

      for (let i = 0; i < count; i++) playOne(i * 0.13);

      // close shortly after last beep
      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 400);
    } catch (_) {
      // ignore audio failures silently
    }
  };

  // -------------------------
  // Timer start/stop
  // -------------------------
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
    if (intervalRef.current) clearInterval(intervalRef.current);

    const finalElapsedTime = Date.now() - startRef.current;

    // Apply inspection +2 if earned
    const finalWithInspection = finalElapsedTime + (inspectionExtraMsRef.current || 0);

    setTimerOn(false);
    setElapsedTime(finalWithInspection);
    setLastTime(finalWithInspection);

    // reset inspection extra for next solve
    inspectionExtraMsRef.current = 0;

    ignoreNextKeyUp.current = true;
    addTime(finalWithInspection);
  };

  // -------------------------
  // Inspection start/stop
  // -------------------------
  const stopInspectionInterval = () => {
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
  };

  const startInspection = () => {
    // reset flags + state
    setIsInspecting(true);
    setInspectionElapsed(0);
    inspectionStartRef.current = Date.now();
    inspectionExtraMsRef.current = 0;

    beep8FiredRef.current = false;
    beep12FiredRef.current = false;

    stopInspectionInterval();
    inspectionIntervalRef.current = setInterval(() => {
      const ms = Date.now() - inspectionStartRef.current;
      setInspectionElapsed(ms);

      // Beep at 8s (single)
      if (!beep8FiredRef.current && ms >= 8000) {
        beep8FiredRef.current = true;
        beep(1);
      }

      // Beep at 12s (double)
      if (!beep12FiredRef.current && ms >= 12000) {
        beep12FiredRef.current = true;
        beep(2);
      }

      // WCA: after 15s -> +2 (we apply if you START the solve after 15s)
      // We don’t auto-stop inspection; we just note it when you start the timer.
    }, 25);
  };

  const commitInspectionAndStartTimer = () => {
    // decide +2 based on inspection time at the moment you start the solve
    const ms = Date.now() - (inspectionStartRef.current || Date.now());

    // If started after 15.00s, apply +2 (basic behavior)
    inspectionExtraMsRef.current = ms >= 15000 ? 2000 : 0;

    stopInspectionInterval();
    setIsInspecting(false);
    setInspectionElapsed(0);

    startTimer();
  };

  // -------------------------
  // Manual entry parsing
  // -------------------------
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
    return Math.round(parseFloat(input) * 1000);
  };

  const handleSubmitManualTime = () => {
    const ms = parseShorthandTime(manualTime);
    if (!isNaN(ms)) addTime(ms);
    setManualTime('');
  };

  // -------------------------
  // Keyboard handlers
  // -------------------------
  const handleKeyDown = (event) => {
    const target = event.target;
    const isTyping =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isTyping) return;

    // ✅ NEW: Escape cancels pre-start hold or inspection (before solve starts)
    if (settings.timerInput === 'Keyboard' && event.key === 'Escape') {
      if (!timerOn && (isSpacebarHeld || isInspecting)) {
        event.preventDefault();
        cancelPreStart();
      }
      return;
    }

    if (settings.timerInput === 'Keyboard') {
      if (event.code === 'Space') {
        event.preventDefault();

        //  ignore auto-repeat while holding space
        if (event.repeat) return;

        // If timer is running, Space stops immediately (existing behavior)
        if (timerOn) {
          stopTimer();
          return;
        }

        //  NEW: "hold to ready" behavior
        setIsSpacebarHeld(true);
        setCanStart(false);

        if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = setTimeout(() => {
          setCanStart(true); // becomes "ready" (green)
        }, 0);
      }
    } else {
      const flashKeypadButton = (val) => {
        const btn = document.getElementById(`keypad-${val}`);
        if (btn) {
          btn.classList.add('keypad-flash');
          setTimeout(() => btn.classList.remove('keypad-flash'), 150);
        }
      };

      if (/^[0-9.]$/.test(event.key)) {
        setManualTime(prev => prev + event.key);
        flashKeypadButton(event.key);
      }
      if (event.key === 'Backspace') {
        setManualTime(prev => prev.slice(0, -1));
        flashKeypadButton('⌫');
      }
      if (event.key === 'Enter') {
        handleSubmitManualTime();
        flashKeypadButton('Enter');
      }
      if (event.key === ':') {
        setManualTime(prev => prev + ':');
        flashKeypadButton(':');
      }
    }
  };

  const handleKeyUp = (event) => {
    const target = event.target;
    const isTyping =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isTyping || settings.timerInput !== 'Keyboard') return;

    if (event.code === 'Space') {
      event.preventDefault();
      setIsSpacebarHeld(false);

      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (ignoreNextKeyUp.current) {
        ignoreNextKeyUp.current = false;
        return;
      }

      // ✅ NEW: only start if we reached "ready" (green)
      if (!timerOn && canStart) {
        const inspectionOn = !!settings.inspectionEnabled;

        if (!inspectionOn) {
          startTimer();
        } else {
          // Inspection flow:
          // 1st ready release -> start inspection
          // 2nd ready release -> start timer (and apply +2 if inspection >= 15s)
          if (!isInspecting) startInspection();
          else commitInspectionAndStartTimer();
        }
      }

      // ✅ NEW: after release, reset ready so you must hold again next time
      setCanStart(false);
    }
  };

  // -------------------------
  // Manual pad clicks
  // -------------------------
  const handlePadClick = (val) => {
    const button = document.getElementById(`keypad-${val}`);
    if (button) {
      button.classList.add('keypad-flash');
      setTimeout(() => button.classList.remove('keypad-flash'), 150);
    }

    if (val === '⌫') {
      setManualTime(prev => prev.slice(0, -1));
    } else if (val === 'Enter') {
      handleSubmitManualTime();
    } else {
      setManualTime(prev => prev + val);
    }
  };

  // -------------------------
  // Effects / cleanup
  // -------------------------
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
    // NOTE: include isInspecting so key-up behavior sees current inspection state
  }, [settings.timerInput, manualTime, timerOn, isInspecting, settings.inspectionEnabled, isSpacebarHeld, canStart]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopInspectionInterval();
      // ✅ NEW: clear hold timeout
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, []);

  // -------------------------
  // Time formatting
  // -------------------------
  const formatMs = (timeToDisplay) => {
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

  // ✅ whole-number inspection display
  const formatInspection = () => {
    const mode = settings.inspectionCountDirection || "down";
    const ms = inspectionElapsed;

    if (mode === "up") {
      const secsUp = Math.floor(ms / 1000);
      return `${secsUp}`;
    }

    // countdown from 15
    const remainingMs = 15000 - ms;
    const remainingSecs = Math.ceil(remainingMs / 1000);
    return `${remainingSecs}`;
  };

  const formatTime = () => {
    if (isInspecting) return formatInspection();

    const timeToDisplay = timerOn ? elapsedTime : lastTime;
    return formatMs(timeToDisplay);
  };

  //  Inspection color phases (8 / 12 / 15)
  const getInspectionColor = () => {
    const ms = inspectionElapsed;
    if (ms >= 15000) return "#ff4d4d"; // 15+ red
    if (ms >= 12000) return "#ff9f1a"; // 12–15 orange
    if (ms >= 8000)  return "#ffd000"; // 8–12 yellow
    return "#ffffff";                  // 0–8 white
  };

  // ✅ Fullscreen inspection option
  const fullscreenInspectionOn = !!settings.inspectionFullscreen;

  // ✅ NEW: Ready-green state while holding space before start
  const readyGreen = isSpacebarHeld && canStart && !timerOn && !isInspecting;

  //  NEW: Decide display color (inspection colors take priority)
  const timerColorStyle = isInspecting
    ? { color: getInspectionColor(), transition: "color 120ms linear" }
    : readyGreen
    ? { color: "#2EC4B6", transition: "color 120ms linear" }
    : undefined;

  return (
    <div className='timer-display'>
      {settings.timerInput === 'Keyboard' ? (
        <div style={{ textAlign: "center" }}>
          {/* Fullscreen overlay during inspection (optional) */}
          {isInspecting && fullscreenInspectionOn ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: settings.primaryColor,   // ✅ CHANGED: use primary color
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                userSelect: "none",
              }}
            >
              <div
                className="Timer"
                style={{
                  color: getInspectionColor(),
                  transition: "color 120ms linear",
                  fontSize: "18vw",
                  lineHeight: 1,
                }}
              >
                {formatTime()}
              </div>
              <div style={{ fontSize: "14px", opacity: 0.3, marginTop: "16px", marginRight: "60px" }}>
                Inspection — press Space to start
                {inspectionElapsed >= 15000 ? " (+2)" : ""}
              </div>
            </div>
          ) : (
            <>
              <p
                className='Timer'
                style={timerColorStyle}
              >
                {formatTime()}
              </p>

              {/* Tiny hint under the time while inspecting */}
              {isInspecting && (
                <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "-10px" }}>
                  Inspection — press Space to start
                  {inspectionElapsed >= 15000 ? " (+2)" : ""}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="manual-entry-container">
          <div className="manual-display">{manualTime || '0.00'}</div>
          <div className="keypad-grid">
            {['0','1','2','3','4','5','6','7','8','9'].map((val, i) => (
              <button
                id={`keypad-${val}`}
                key={val}
                style={{ gridColumn: i + 1 }}
                onClick={() => handlePadClick(val)}
              >
                {val}
              </button>
            ))}

            <button id="keypad-." style={{ gridColumn: 4 }} onClick={() => handlePadClick('.')}>.</button>
            <button id="keypad-⌫" style={{ gridColumn: 5 }} onClick={() => handlePadClick('⌫')}>⌫</button>
            <button id="keypad-:" style={{ gridColumn: 6 }} onClick={() => handlePadClick(':')}>:</button>
            <button
              id="keypad-Enter"
              style={{ gridColumn: '7 / span 2' }}
              onClick={() => handlePadClick('Enter')}
            >
              Enter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Timer;