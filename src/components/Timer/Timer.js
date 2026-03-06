// src/components/Timer/Timer.js
import React, { useState, useEffect, useRef } from 'react';
import './Timer.css';
import { useSettings } from '../../contexts/SettingsContext';

import { GanTimerClient, GanTimerState } from '../../smart/ganTimerClient';
import { GanCubeClient } from '../../smart/ganCubeClient';
import { computeBasicCFOPSplits } from '../../smart/solveSplits';

function parseDisplayTimeToMs(displayTime) {
  if (displayTime == null) return null;

  const n = Number(displayTime);
  if (Number.isFinite(n)) {
    if (n > 1000) return Math.round(n);
    return Math.round(n * 1000);
  }

  const s = String(displayTime).trim();
  if (!s) return null;

  if (s.includes(':')) {
    const [mStr, secStrRaw] = s.split(':');
    const m = Number(mStr);
    const sec = Number(secStrRaw);
    if (!Number.isFinite(m) || !Number.isFinite(sec)) return null;
    return Math.round(m * 60000 + sec * 1000);
  }

  const sec = Number(s);
  if (!Number.isFinite(sec)) return null;
  return Math.round(sec * 1000);
}

function normalizeGanRecordedTimeToMs(ev) {
  const raw = ev?.recordedTime ?? ev?.time ?? ev?.ms;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/**
 * Returns true if facelets represent a solved cube (each face is uniform).
 * Works regardless of whether the cube uses U/R/F/D/L/B letters or color letters.
 */
function isFaceletsSolved(facelets) {
  if (!facelets) return false;
  const s = String(facelets).trim();
  if (s.length !== 54) return false;

  for (let f = 0; f < 6; f++) {
    const start = f * 9;
    const c = s[start];
    if (!c) return false;
    for (let i = 1; i < 9; i++) {
      if (s[start + i] !== c) return false;
    }
  }
  return true;
}

// Normalize move tokens so scramble tokens can match cube tokens.
function normalizeMoveToken(m) {
  if (!m) return "";
  let s = String(m).trim();

  s = s.replace(/’/g, "'");

  // Ri / Rp / R-  -> R'
  if (/[iIpP-]$/.test(s) && !s.endsWith("2")) {
    s = s.slice(0, -1) + "'";
  }

  s = s.replace(/\s+/g, "");
  return s;
}

/**
 * Step-based scramble tokens:
 * returns an array of "expected step options".
 * Each entry is an array of acceptable move strings for that quarter-turn step.
 *
 *  - "D'"  -> [["D'"]]
 *  - "B"   -> [["B"]]
 *  - "B2"  -> [["B","B'"], ["B","B'"]]
 */
function tokenizeScramble(scramble) {
  const tokens = String(scramble || "")
    .trim()
    .split(/\s+/)
    .map((t) => normalizeMoveToken(t))
    .filter(Boolean);

  const steps = [];

  for (const tok of tokens) {
    if (tok.endsWith("2")) {
      const base = tok.slice(0, -1);
      const face = base.endsWith("'") ? base.slice(0, -1) : base;
      steps.push([face, `${face}'`]);
      steps.push([face, `${face}'`]);
    } else if (tok.endsWith("'")) {
      const face = tok.slice(0, -1);
      steps.push([`${face}'`]);
    } else {
      steps.push([tok]);
    }
  }

  return steps;
}

function Timer({ addTime, inPlayerBar = false, activeScramble = "" }) {
  const { settings } = useSettings();

  // ✅ NEW: keep latest addTime in a ref so Bluetooth callbacks always save
  // to the CURRENT session/event (not whatever it was when you connected).
  const addTimeRef = useRef(addTime);
  useEffect(() => {
    addTimeRef.current = addTime;
  }, [addTime]);

  const [manualTime, setManualTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [isSpacebarHeld, setIsSpacebarHeld] = useState(false);
  const [canStart, setCanStart] = useState(true);

  // -------------------------
  // GAN TIMER
  // -------------------------
  const isGanMode = settings?.timerInput === 'GAN Bluetooth';
  const [ganConnected, setGanConnected] = useState(false);
  const [ganConnecting, setGanConnecting] = useState(false);
  const [ganStatus, setGanStatus] = useState('');
  const [ganAwaitingFinal, setGanAwaitingFinal] = useState(false);
  const [ganReady, setGanReady] = useState(false);
  const [ganDot, setGanDot] = useState('disconnected');

  const ganClientRef = useRef(null);
  const ganSaveLockRef = useRef(false);
  const ganReadFallbackLockRef = useRef(false);

  // -------------------------
  // GAN CUBE
  // -------------------------
  const isCubeMode = settings?.timerInput === 'GAN Cube';
  const [cubeConnected, setCubeConnected] = useState(false);
  const [cubeConnecting, setCubeConnecting] = useState(false);
  const [cubeDot, setCubeDot] = useState('disconnected');

  const [cubeArmed, setCubeArmed] = useState(false);
  const [cubeSolving, setCubeSolving] = useState(false);

  // ✅ NEW: catch-and-recover state (prevents whole app crash on rare gan-web-bluetooth internal error)
  const [cubeFatalError, setCubeFatalError] = useState(null);

  const cubeClientRef = useRef(null);

  // timing samples for elapsed ms (ONLY solution moves)
  const cubeSamplesRef = useRef([]); // [{cubeTs, hostTs}]

  // move log for solution
  const cubeMoveLogRef = useRef([]); // [{move, cubeTs, hostTs, facelets}]

  // latest facelets from cube
  const cubeFaceletsRef = useRef(null);

  // ✅ FIFO queue of move indices waiting for facelets
  const pendingFaceletsQueueRef = useRef([]);
  const faceletsRequestInFlightRef = useRef(false);
  const faceletsRequestAgainRef = useRef(false);

  // phases:
  //   awaiting_scramble
  //   scrambling
  //   armed
  //   solving
  //   finalizing
  const cubePhaseRef = useRef('awaiting_scramble');
  const cubeArmedRef = useRef(false);
  const cubeSolvingRef = useRef(false);

  const scrambleTokensRef = useRef([]);
  const scrambleIndexRef = useRef(0);
  const scrambleTextRef = useRef("");
  const lastProgressEmitRef = useRef(-1);

  const cubeIdleTimeoutRef = useRef(null);
  const cubeSaveLockRef = useRef(false);

  const cubeFinalizingRef = useRef(false);
  const solveScrambleRef = useRef("");

  // -------------------------
  // Inspection state
  // -------------------------
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionElapsed, setInspectionElapsed] = useState(0);

  const showKeypad = !inPlayerBar && !settings?.disableKeypad;
  const forceKeyboardView = !!inPlayerBar;

  const inspectionIntervalRef = useRef(null);
  const inspectionStartRef = useRef(null);

  const beep8FiredRef = useRef(false);
  const beep12FiredRef = useRef(false);

  const inspectionExtraMsRef = useRef(0);

  const intervalRef = useRef();
  const startRef = useRef();
  const ignoreNextKeyUp = useRef(false);

  const inspectionBeepsRef = useRef(!!settings.inspectionBeeps);
  useEffect(() => {
    inspectionBeepsRef.current = !!settings.inspectionBeeps;
  }, [settings.inspectionBeeps]);

  const holdTimeoutRef = useRef(null);

  const stopInspectionInterval = () => {
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
  };

  const cancelPreStart = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    setIsSpacebarHeld(false);
    setCanStart(false);

    stopInspectionInterval();
    setIsInspecting(false);
    setInspectionElapsed(0);
    inspectionStartRef.current = null;

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

      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 400);
    } catch (_) {}
  };

  // -------------------------
  // Local stopwatch for live display
  // -------------------------
  const startLocalStopwatch = () => {
    startRef.current = Date.now();
    setElapsedTime(0);
    setTimerOn(true);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startRef.current);
    }, 10);
  };

  const stopLocalStopwatch = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTimerOn(false);
  };

  // -------------------------
  // Keyboard timer start/stop
  // -------------------------
  const startTimer = () => {
    if (canStart && !timerOn) startLocalStopwatch();
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const finalElapsedTime = Date.now() - startRef.current;
    const finalWithInspection = finalElapsedTime + (inspectionExtraMsRef.current || 0);

    setTimerOn(false);
    setElapsedTime(finalWithInspection);
    setLastTime(finalWithInspection);

    inspectionExtraMsRef.current = 0;

    ignoreNextKeyUp.current = true;

    // ✅ use ref (not strictly necessary here, but keeps behavior consistent)
    addTimeRef.current?.(finalWithInspection);
  };

  // -------------------------
  // Inspection start/stop
  // -------------------------
  const startInspection = () => {
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

      if (!beep8FiredRef.current && ms >= 8000) {
        beep8FiredRef.current = true;
        beep(1);
      }
      if (!beep12FiredRef.current && ms >= 12000) {
        beep12FiredRef.current = true;
        beep(2);
      }
    }, 25);
  };

  const commitInspectionAndStartTimer = () => {
    const ms = Date.now() - (inspectionStartRef.current || Date.now());
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
    if (!isNaN(ms)) addTimeRef.current?.(ms);
    setManualTime('');
  };

  // -------------------------
  // GAN TIMER finalization helper
  // -------------------------
  const finalizeGanSolve = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return;

    setGanAwaitingFinal(false);
    stopLocalStopwatch();

    setElapsedTime(ms);
    setLastTime(ms);

    if (!ganSaveLockRef.current) {
      ganSaveLockRef.current = true;
      // ✅ use ref so save always targets the current session/event
      addTimeRef.current?.(ms);
    }
  };

  const tryFallbackReadFromTimer = async () => {
    if (ganReadFallbackLockRef.current) return;
    ganReadFallbackLockRef.current = true;

    try {
      const rec = await ganClientRef.current?.getRecordedTimes?.();
      const ms = parseDisplayTimeToMs(rec?.displayTime);

      if (ms != null) {
        finalizeGanSolve(ms);
      } else {
        const pt0 = rec?.previousTimes?.[0];
        const ms2 = parseDisplayTimeToMs(pt0);
        if (ms2 != null) finalizeGanSolve(ms2);
      }
    } catch (e) {
      console.error("GAN getRecordedTimes fallback failed:", e);
    }
  };

  // -------------------------
  // GAN TIMER connect / disconnect
  // -------------------------
  const connectGan = async () => {
    if (ganConnecting) return;

    setGanStatus('');
    setGanConnecting(true);
    setGanDot('connecting');

    try {
      if (!ganClientRef.current) ganClientRef.current = new GanTimerClient();

      await ganClientRef.current.connect({
        onState: async (ev) => {
          if (ev?.state === GanTimerState.IDLE) setGanStatus('Idle');
          if (ev?.state === GanTimerState.RUNNING) setGanStatus('Solving…');
          if (ev?.state === GanTimerState.STOPPED) setGanStatus('Stopped');
          if (ev?.state === GanTimerState.FINISHED) setGanStatus('Finished');
          if (ev?.state === GanTimerState.DISCONNECT) setGanStatus('Disconnected');

          if (ev?.state === GanTimerState.GET_SET) setGanReady(true);
          if (
            ev?.state === GanTimerState.HANDS_ON ||
            ev?.state === GanTimerState.HANDS_OFF ||
            ev?.state === GanTimerState.IDLE
          ) {
            setGanReady(false);
          }

          if (ev?.state === GanTimerState.RUNNING) {
            ganSaveLockRef.current = false;
            ganReadFallbackLockRef.current = false;

            setGanReady(false);

            stopInspectionInterval();
            setIsInspecting(false);
            setInspectionElapsed(0);
            inspectionExtraMsRef.current = 0;

            setGanAwaitingFinal(false);
            startLocalStopwatch();
          }

          if (ev?.state === GanTimerState.STOPPED || ev?.state === GanTimerState.FINISHED) {
            stopLocalStopwatch();

            const ms = normalizeGanRecordedTimeToMs(ev);

            if (ms != null) {
              finalizeGanSolve(ms);
            } else {
              setGanAwaitingFinal(true);
              await tryFallbackReadFromTimer();
            }
          }

          if (ev?.state === GanTimerState.DISCONNECT) {
            setGanConnected(false);
            setGanConnecting(false);
            setGanAwaitingFinal(false);
            setGanReady(false);
            setGanDot('disconnected');

            ganSaveLockRef.current = false;
            ganReadFallbackLockRef.current = false;
            stopLocalStopwatch();
          }
        },

        onSolve: ({ ms }) => {
          finalizeGanSolve(ms);
        },

        onDisconnect: () => {
          setGanConnected(false);
          setGanConnecting(false);
          setGanAwaitingFinal(false);
          setGanReady(false);
          setGanDot('disconnected');

          ganSaveLockRef.current = false;
          ganReadFallbackLockRef.current = false;
          stopLocalStopwatch();
        },

        onError: (err) => {
          console.error('GAN timer error:', err);
          setGanStatus('Error');
          setGanConnected(false);
          setGanConnecting(false);
          setGanAwaitingFinal(false);
          setGanReady(false);
          setGanDot('error');

          ganSaveLockRef.current = false;
          ganReadFallbackLockRef.current = false;
          stopLocalStopwatch();
        }
      });

      setGanConnected(true);
      setGanStatus('Connected');
      setGanDot('connected');
    } catch (e) {
      console.error('GAN connect failed:', e);
      setGanStatus('Connect failed');
      setGanConnected(false);
      setGanDot('error');
    } finally {
      setGanConnecting(false);
    }
  };

  const disconnectGan = async () => {
    try {
      await ganClientRef.current?.disconnect?.();
    } catch (_) {}

    setGanConnected(false);
    setGanConnecting(false);
    setGanStatus('');
    setGanAwaitingFinal(false);
    setGanReady(false);
    setGanDot('disconnected');

    ganSaveLockRef.current = false;
    ganReadFallbackLockRef.current = false;
    stopLocalStopwatch();
  };

  useEffect(() => {
    if (!isGanMode && ganConnected) disconnectGan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGanMode]);

  // -------------------------
  // Cube scramble tokens update (from displayed scramble)
  // -------------------------
  useEffect(() => {
    const txt = String(activeScramble || "").trim();
    const tokens = tokenizeScramble(txt);

    scrambleTextRef.current = txt;
    scrambleTokensRef.current = tokens;

    scrambleIndexRef.current = 0;
    lastProgressEmitRef.current = -1;

    if (isCubeMode && tokens.length) {
      cubePhaseRef.current = 'scrambling';
      cubeArmedRef.current = false;
      setCubeArmed(false);

      try {
        window.dispatchEvent(
          new CustomEvent('pts:cubeScrambleProgress', {
            detail: { scramble: txt, progress: 0, total: tokens.length },
          })
        );
      } catch (_) {}
    } else if (isCubeMode) {
      cubePhaseRef.current = 'awaiting_scramble';
      cubeArmedRef.current = false;
      setCubeArmed(false);
      try {
        window.dispatchEvent(
          new CustomEvent('pts:cubeScrambleProgress', {
            detail: { scramble: txt, progress: 0, total: tokens.length },
          })
        );
      } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScramble, isCubeMode]);

  // -------------------------
  // GAN CUBE helpers
  // -------------------------
  const clearCubeIdleTimer = () => {
    if (cubeIdleTimeoutRef.current) {
      clearTimeout(cubeIdleTimeoutRef.current);
      cubeIdleTimeoutRef.current = null;
    }
  };

  const emitCubeSolveEvent = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent('pts:cubeSolve', { detail: payload }));
    } catch (_) {}
  };

  // ✅ Controlled facelets requests so we can align 1 FACELETS -> 1 MOVE (FIFO)
  const requestFaceletsControlled = () => {
    if (!cubeClientRef.current) return;

    if (faceletsRequestInFlightRef.current) {
      faceletsRequestAgainRef.current = true;
      return;
    }

    faceletsRequestInFlightRef.current = true;
    try {
      cubeClientRef.current.requestFacelets?.();
    } catch (_) {
      faceletsRequestInFlightRef.current = false;
    }
  };

  // ✅ NEW: resilience to rare gan-web-bluetooth internal crash (toKociembaFacelets)
  useEffect(() => {
    const looksLikeGanWebBluetoothCrash = (eventLike) => {
      const msg = String(
        eventLike?.message ||
          eventLike?.error?.message ||
          eventLike?.reason?.message ||
          ""
      );
      const stack = String(eventLike?.error?.stack || eventLike?.reason?.stack || "");
      return (
        msg.includes("toKociembaFacelets") ||
        stack.includes("toKociembaFacelets") ||
        stack.includes("GanGen3ProtocolDriver.handleStateEvent") ||
        stack.includes("GanCubeClassicConnection.onStateUpdate")
      );
    };

    const hardResetCube = (label, eventLike) => {
      if (!isCubeMode) return;

      const message = String(
        eventLike?.message ||
          eventLike?.error?.message ||
          eventLike?.reason?.message ||
          "GAN cube internal error"
      );

      console.error(`⚠️ Caught ${label} (GAN cube)`, eventLike);

      setCubeFatalError({ label, message });

      // Stop everything and disconnect so it doesn't keep crashing
      clearCubeIdleTimer();
      try { cubeClientRef.current?.disconnect?.(); } catch (_) {}

      setCubeConnected(false);
      setCubeConnecting(false);
      setCubeDot('error');

      cubePhaseRef.current = 'awaiting_scramble';
      cubeArmedRef.current = false;
      cubeSolvingRef.current = false;

      setCubeArmed(false);
      setCubeSolving(false);

      cubeSamplesRef.current = [];
      cubeMoveLogRef.current = [];
      cubeFaceletsRef.current = null;

      pendingFaceletsQueueRef.current = [];
      faceletsRequestInFlightRef.current = false;
      faceletsRequestAgainRef.current = false;

      cubeSaveLockRef.current = false;
      cubeFinalizingRef.current = false;
      solveScrambleRef.current = "";

      scrambleIndexRef.current = 0;
      emitScrambleProgress(0, scrambleTokensRef.current.length);

      stopLocalStopwatch();
    };

    const onError = (e) => {
      if (!looksLikeGanWebBluetoothCrash(e)) return;
      try { e.preventDefault?.(); } catch (_) {}
      hardResetCube("window.error", e);
    };

    const onRejection = (e) => {
      if (!looksLikeGanWebBluetoothCrash(e)) return;
      try { e.preventDefault?.(); } catch (_) {}
      hardResetCube("unhandledrejection", e);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCubeMode]);

  const finalizeCubeSolve = async (reason = 'unknown') => {
    if (cubeFinalizingRef.current) return;
    cubeFinalizingRef.current = true;

    cubePhaseRef.current = 'finalizing';
    cubeSolvingRef.current = false;
    setCubeSolving(false);

    clearCubeIdleTimer();

    const samples = cubeSamplesRef.current || [];
    const ms = cubeClientRef.current?.computeElapsedMs?.(samples);

    const moves = cubeMoveLogRef.current || [];

    // ask for a fresh final facelets snapshot
    try {
      cubeClientRef.current?.requestFacelets?.();
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 60));

    const finalFacelets = cubeFaceletsRef.current;

    cubeArmedRef.current = true;
    cubePhaseRef.current = 'armed';
    setCubeArmed(true);

    stopLocalStopwatch();

    if (Number.isFinite(ms) && ms >= 0) {
      setElapsedTime(ms);
      setLastTime(ms);

      const splits = computeBasicCFOPSplits(moves, { totalMs: ms, finalFacelets });

      const smartMeta = {
        source: "GAN_CUBE",
        reason,
        scramble: solveScrambleRef.current || scrambleTextRef.current || "",
        ms,
        moves,
        finalFacelets,
        splits,
        startedAtHostTs: moves?.[0]?.hostTs ?? null,
        endedAtHostTs: moves?.[moves.length - 1]?.hostTs ?? null,
        startedAtISO: moves?.[0]?.hostTs ? new Date(moves[0].hostTs).toISOString() : null,
        endedAtISO: moves?.[moves.length - 1]?.hostTs ? new Date(moves[moves.length - 1].hostTs).toISOString() : null,
      };

      emitCubeSolveEvent(smartMeta);

      if (!cubeSaveLockRef.current) {
        cubeSaveLockRef.current = true;

        // ✅ use ref so saves follow CURRENT session/event
        Promise.resolve(addTimeRef.current?.(ms, smartMeta)).catch((err) => {
          console.error("addTime failed (unlocking cubeSaveLock):", err);
          cubeSaveLockRef.current = false;
        });
      }
    } else {
      emitCubeSolveEvent({
        ms: null,
        reason,
        moves,
        finalFacelets,
        scramble: solveScrambleRef.current || scrambleTextRef.current || "",
      });
    }
  };

  const scheduleCubeAutoStop = () => {
    clearCubeIdleTimer();
    const idleMs = Number(settings?.cubeStopIdleMs ?? 5000) || 5000;
    cubeIdleTimeoutRef.current = setTimeout(() => {
      if (cubeSolvingRef.current) finalizeCubeSolve('idle');
    }, Math.max(200, idleMs));
  };

  const emitScrambleProgress = (progress, total) => {
    if (progress === lastProgressEmitRef.current) return;
    lastProgressEmitRef.current = progress;

    try {
      window.dispatchEvent(
        new CustomEvent('pts:cubeScrambleProgress', {
          detail: {
            scramble: scrambleTextRef.current || "",
            progress,
            total,
          },
        })
      );
    } catch (_) {}
  };

  const connectCube = async () => {
    if (cubeConnecting) return;

    setCubeFatalError(null); // ✅ NEW: clear any previous fatal error banner

    setCubeConnecting(true);
    setCubeDot('connecting');

    try {
      if (!cubeClientRef.current) cubeClientRef.current = new GanCubeClient();

      cubeSamplesRef.current = [];
      cubeMoveLogRef.current = [];
      cubeFaceletsRef.current = null;

      pendingFaceletsQueueRef.current = [];
      faceletsRequestInFlightRef.current = false;
      faceletsRequestAgainRef.current = false;

      cubeSaveLockRef.current = false;
      cubeFinalizingRef.current = false;
      solveScrambleRef.current = "";

      cubePhaseRef.current = (scrambleTokensRef.current?.length ? 'scrambling' : 'awaiting_scramble');
      cubeArmedRef.current = false;
      cubeSolvingRef.current = false;

      setCubeArmed(false);
      setCubeSolving(false);

      scrambleIndexRef.current = 0;
      lastProgressEmitRef.current = -1;
      emitScrambleProgress(0, scrambleTokensRef.current.length);

      await cubeClientRef.current.connect({
        onFacelets: ({ facelets }) => {
          cubeFaceletsRef.current = facelets;

          // Attach facelets to the oldest waiting move (FIFO)
          if (cubePhaseRef.current === "solving") {
            const q = pendingFaceletsQueueRef.current || [];
            const idx = q.shift();
            const log = cubeMoveLogRef.current || [];
            if (idx != null && idx >= 0 && idx < log.length) {
              log[idx].facelets = facelets;
            }
          }

          // mark request complete
          faceletsRequestInFlightRef.current = false;

          // if more moves are waiting (or we requested again), request next
          if (cubePhaseRef.current === "solving") {
            if (faceletsRequestAgainRef.current || (pendingFaceletsQueueRef.current?.length > 0)) {
              faceletsRequestAgainRef.current = false;
              requestFaceletsControlled();
            }
          }

          // ignore solve completion while finalizing
          if (cubePhaseRef.current === 'finalizing') return;

          const solved = isFaceletsSolved(facelets);

          if (cubePhaseRef.current === 'solving' && solved) {
            finalizeCubeSolve('solved');
            return;
          }

          // If cube is solved and we're not solving, track scramble but not armed.
          if (solved && cubePhaseRef.current !== 'solving') {
            cubeArmedRef.current = false;
            setCubeArmed(false);

            if (scrambleTokensRef.current.length) {
              cubePhaseRef.current = 'scrambling';
              scrambleIndexRef.current = 0;
              emitScrambleProgress(0, scrambleTokensRef.current.length);
            } else {
              cubePhaseRef.current = 'awaiting_scramble';
            }
          }
        },

        onMove: ({ move, cubeTs, hostTs }) => {
          const mv = normalizeMoveToken(move);
          if (!mv) return;

          if (cubePhaseRef.current === 'finalizing') return;

          // -----------------------------
          // SCRAMBLE MATCHING
          // -----------------------------
          if (cubePhaseRef.current === 'scrambling') {
            const tokens = scrambleTokensRef.current || [];
            if (!tokens.length) return;

            const idx = scrambleIndexRef.current;
            const expectedOptions = tokens[idx] || null;

            if (expectedOptions && expectedOptions.includes(mv)) {
              const nextIdx = idx + 1;
              scrambleIndexRef.current = nextIdx;
              emitScrambleProgress(nextIdx, tokens.length);

              if (nextIdx >= tokens.length) {
                cubePhaseRef.current = 'armed';
                cubeArmedRef.current = true;
                setCubeArmed(true);

                cubeSamplesRef.current = [];
                cubeMoveLogRef.current = [];
                cubeSaveLockRef.current = false;

                pendingFaceletsQueueRef.current = [];
                faceletsRequestInFlightRef.current = false;
                faceletsRequestAgainRef.current = false;

                // NOTE: don't start timer here; next move starts solve.
              }
              return;
            }

            const firstOptions = tokens[0] || [];
            if (firstOptions.includes(mv)) {
              scrambleIndexRef.current = 1;
              emitScrambleProgress(1, tokens.length);
            } else {
              scrambleIndexRef.current = 0;
              emitScrambleProgress(0, tokens.length);
            }
            return;
          }

          // -----------------------------
          // ARMED -> first move starts solve
          // -----------------------------
          if (cubePhaseRef.current === 'armed') {
            if (!settings?.cubeAutoStart) return;

            stopInspectionInterval();
            setIsInspecting(false);
            setInspectionElapsed(0);
            inspectionExtraMsRef.current = 0;

            cubeFinalizingRef.current = false;
            solveScrambleRef.current = scrambleTextRef.current || "";

            cubePhaseRef.current = 'solving';
            cubeSolvingRef.current = true;
            cubeArmedRef.current = false;

            setCubeSolving(true);
            setCubeArmed(false);

            cubeSamplesRef.current = [];
            cubeMoveLogRef.current = [];
            cubeSaveLockRef.current = false;

            pendingFaceletsQueueRef.current = [];
            faceletsRequestInFlightRef.current = false;
            faceletsRequestAgainRef.current = false;

            cubeSamplesRef.current.push({ cubeTs, hostTs });

            cubeMoveLogRef.current.push({
              move: mv,
              cubeTs,
              hostTs,
              facelets: null,
            });

            const idx = cubeMoveLogRef.current.length - 1;
            pendingFaceletsQueueRef.current.push(idx);
            requestFaceletsControlled();

            startLocalStopwatch();

            if (!!settings?.cubeAutoStop) scheduleCubeAutoStop();
            return;
          }

          // -----------------------------
          // SOLVING
          // -----------------------------
          if (cubePhaseRef.current === 'solving') {
            cubeSamplesRef.current.push({ cubeTs, hostTs });

            cubeMoveLogRef.current.push({
              move: mv,
              cubeTs,
              hostTs,
              facelets: null,
            });

            const idx = cubeMoveLogRef.current.length - 1;
            pendingFaceletsQueueRef.current.push(idx);
            requestFaceletsControlled();

            if (!!settings?.cubeAutoStop) scheduleCubeAutoStop();
            return;
          }

          // -----------------------------
          // awaiting_scramble -> enter scrambling if we have tokens
          // -----------------------------
          if (cubePhaseRef.current === 'awaiting_scramble') {
            const tokens = scrambleTokensRef.current || [];
            if (tokens.length) {
              cubePhaseRef.current = 'scrambling';
              scrambleIndexRef.current = 0;
              emitScrambleProgress(0, tokens.length);
            }
          }
        },

        onDisconnect: () => {
          clearCubeIdleTimer();

          setCubeConnected(false);
          setCubeConnecting(false);
          setCubeDot('disconnected');

          cubePhaseRef.current = 'awaiting_scramble';
          cubeArmedRef.current = false;
          cubeSolvingRef.current = false;

          setCubeArmed(false);
          setCubeSolving(false);

          cubeSamplesRef.current = [];
          cubeMoveLogRef.current = [];
          cubeFaceletsRef.current = null;

          pendingFaceletsQueueRef.current = [];
          faceletsRequestInFlightRef.current = false;
          faceletsRequestAgainRef.current = false;

          cubeSaveLockRef.current = false;
          cubeFinalizingRef.current = false;
          solveScrambleRef.current = "";

          scrambleIndexRef.current = 0;
          emitScrambleProgress(0, scrambleTokensRef.current.length);

          stopLocalStopwatch();
        },

        onError: (err) => {
          console.error('GAN cube error:', err);
          clearCubeIdleTimer();

          setCubeConnected(false);
          setCubeConnecting(false);
          setCubeDot('error');

          cubePhaseRef.current = 'awaiting_scramble';
          cubeArmedRef.current = false;
          cubeSolvingRef.current = false;

          setCubeArmed(false);
          setCubeSolving(false);

          cubeSamplesRef.current = [];
          cubeMoveLogRef.current = [];
          cubeFaceletsRef.current = null;

          pendingFaceletsQueueRef.current = [];
          faceletsRequestInFlightRef.current = false;
          faceletsRequestAgainRef.current = false;

          cubeSaveLockRef.current = false;
          cubeFinalizingRef.current = false;
          solveScrambleRef.current = "";

          scrambleIndexRef.current = 0;
          emitScrambleProgress(0, scrambleTokensRef.current.length);

          stopLocalStopwatch();
        }
      });

      setCubeConnected(true);
      setCubeDot('connected');

      // prime facelets once connected
      cubeClientRef.current?.requestFacelets?.();
    } catch (e) {
      console.error('GAN cube connect failed:', e);
      setCubeConnected(false);
      setCubeDot('error');
    } finally {
      setCubeConnecting(false);
    }
  };

  const disconnectCube = async () => {
    clearCubeIdleTimer();
    try {
      await cubeClientRef.current?.disconnect?.();
    } catch (_) {}

    setCubeConnected(false);
    setCubeConnecting(false);
    setCubeDot('disconnected');

    cubePhaseRef.current = 'awaiting_scramble';
    cubeArmedRef.current = false;
    cubeSolvingRef.current = false;

    setCubeArmed(false);
    setCubeSolving(false);

    cubeSamplesRef.current = [];
    cubeMoveLogRef.current = [];
    cubeFaceletsRef.current = null;

    pendingFaceletsQueueRef.current = [];
    faceletsRequestInFlightRef.current = false;
    faceletsRequestAgainRef.current = false;

    cubeSaveLockRef.current = false;
    cubeFinalizingRef.current = false;
    solveScrambleRef.current = "";

    scrambleIndexRef.current = 0;
    emitScrambleProgress(0, scrambleTokensRef.current.length);

    stopLocalStopwatch();
  };

  useEffect(() => {
    if (!isCubeMode && cubeConnected) disconnectCube();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCubeMode]);

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

    if (settings.timerInput === 'Keyboard' && event.key === 'Escape') {
      if (!timerOn && (isSpacebarHeld || isInspecting)) {
        event.preventDefault();
        cancelPreStart();
      }
      return;
    }

    if (isGanMode || isCubeMode) return;

    if (settings.timerInput === 'Keyboard') {
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;

        if (timerOn) {
          stopTimer();
          return;
        }

        setIsSpacebarHeld(true);
        setCanStart(false);

        if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = setTimeout(() => {
          setCanStart(true);
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

    if (isTyping) return;

    if (isGanMode || isCubeMode) return;
    if (settings.timerInput !== 'Keyboard') return;

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

      if (!timerOn && canStart) {
        const inspectionOn = !!settings.inspectionEnabled;
        if (!inspectionOn) startTimer();
        else {
          if (!isInspecting) startInspection();
          else commitInspectionAndStartTimer();
        }
      }

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

    if (val === '⌫') setManualTime(prev => prev.slice(0, -1));
    else if (val === 'Enter') handleSubmitManualTime();
    else setManualTime(prev => prev + val);
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
  }, [settings.timerInput, manualTime, timerOn, isInspecting, settings.inspectionEnabled, isSpacebarHeld, canStart, isGanMode, isCubeMode]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopInspectionInterval();
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);

      try { ganClientRef.current?.disconnect?.(); } catch (_) {}
      try { cubeClientRef.current?.disconnect?.(); } catch (_) {}
      clearCubeIdleTimer();
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

  const formatInspection = () => {
    const mode = settings.inspectionCountDirection || "down";
    const ms = inspectionElapsed;

    if (mode === "up") return `${Math.floor(ms / 1000)}`;

    const remainingMs = 15000 - ms;
    const remainingSecs = Math.ceil(remainingMs / 1000);
    return `${remainingSecs}`;
  };

  const formatTime = () => {
    if (isInspecting) return formatInspection();
    const timeToDisplay = timerOn ? elapsedTime : lastTime;
    return formatMs(timeToDisplay);
  };

  const getInspectionColor = () => {
    const ms = inspectionElapsed;
    if (ms >= 15000) return "#ff4d4d";
    if (ms >= 12000) return "#ff9f1a";
    if (ms >= 8000)  return "#ffd000";
    return "#ffffff";
  };

  const fullscreenInspectionOn = !!settings.inspectionFullscreen;

  const readyGreen = isSpacebarHeld && canStart && !timerOn && !isInspecting;

  const timerColorStyle = isInspecting
    ? { color: getInspectionColor(), transition: "color 120ms linear" }
    : readyGreen
    ? { color: "#2EC4B6", transition: "color 120ms linear" }
    : undefined;

  const typePlaceholderStyle = manualTime
    ? { opacity: 1, transition: "opacity 120ms linear" }
    : { opacity: 0.35, transition: "opacity 120ms linear" };

  const ganGreenStyle =
    isGanMode && ganConnected && ganReady && !timerOn
      ? { color: "#2EC4B6", transition: "color 120ms linear" }
      : undefined;

  const cubeGreenStyle =
    isCubeMode && cubeConnected && cubeArmed && !timerOn
      ? { color: "#2EC4B6", transition: "color 120ms linear" }
      : undefined;

  const showGanControls = isGanMode && !inPlayerBar;
  const showCubeControls = isCubeMode && !inPlayerBar;

  const showKeyboardOrGanOrCube =
    settings.timerInput === 'Keyboard' || forceKeyboardView || isGanMode || isCubeMode;

  return (
    <div className="timer-display">
      {showKeyboardOrGanOrCube ? (
        <div className="timer-center-wrap">
  <div className="gan-side-controls">
    {/* GAN Timer controls */}
    {showGanControls && (
      <div className="gan-controls">
        {!ganConnected ? (
          <button
            onClick={connectGan}
            disabled={ganConnecting}
            style={{ opacity: ganConnecting ? 0.6 : 1 }}
          >
            {ganConnecting ? "Connecting…" : "Connect GAN"}
          </button>
        ) : (
          <button onClick={disconnectGan}>Disconnect</button>
        )}

        <span
          className={`gan-dot ${ganDot}`}
          title={
            ganDot === "connected" ? "GAN connected" :
            ganDot === "connecting" ? "Connecting…" :
            ganDot === "error" ? "GAN error" :
            "GAN disconnected"
          }
        />
      </div>
    )}

    {/* GAN Cube controls */}
    {showCubeControls && (
      <div className="gan-controls">
        {!cubeConnected ? (
          <button
            onClick={connectCube}
            disabled={cubeConnecting}
            style={{ opacity: cubeConnecting ? 0.6 : 1 }}
          >
            {cubeConnecting ? "Connecting…" : "Connect Cube"}
          </button>
        ) : (
          <button onClick={disconnectCube}>Disconnect</button>
        )}

        <span
          className={`gan-dot ${cubeDot}`}
          title={
            cubeDot === "connected" ? "Cube connected" :
            cubeDot === "connecting" ? "Connecting…" :
            cubeDot === "error" ? "Cube error" :
            "Cube disconnected"
          }
        />

        {cubeFatalError && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            Cube disconnected after an internal update error.
            <button
              style={{ marginLeft: 8 }}
              onClick={() => {
                setCubeFatalError(null);
                connectCube();
              }}
            >
              Reconnect
            </button>
          </div>
        )}
      </div>
    )}
  </div>

  {/* FULLSCREEN INSPECTION (unchanged) */}
  {isInspecting && fullscreenInspectionOn && !isGanMode && !isCubeMode ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: settings.primaryColor,
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

      <div
        style={{
          fontSize: "14px",
          opacity: 0.3,
          marginTop: "16px",
          marginRight: "60px"
        }}
      >
        Inspection — press Space to start
        {inspectionElapsed >= 15000 ? " (+2)" : ""}
      </div>
    </div>
  ) : (
    <>
      {/* MAIN TIMER DISPLAY (unchanged) */}
      <p
        className="Timer"
        style={
          isGanMode
            ? ganGreenStyle
            : isCubeMode
            ? cubeGreenStyle
            : (settings.timerInput === "Keyboard")
            ? timerColorStyle
            : typePlaceholderStyle
        }
      >
        {(isGanMode || isCubeMode)
          ? formatTime()
          : settings.timerInput === "Keyboard"
          ? formatTime()
          : (manualTime || "Type")}
      </p>
    </>
  )}
</div>
      ) : (
        <div className="manual-entry-container">
          <div className="manual-display" style={typePlaceholderStyle}>
            {manualTime || "Type"}
          </div>

          {showKeypad && (
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
          )}
        </div>
      )}
    </div>
  );
}

export default Timer;