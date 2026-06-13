// src/components/Timer/Timer.js
import React, { useState, useEffect, useRef } from 'react';
import './Timer.css';
import { useSettings } from '../../contexts/SettingsContext';
import { useGanTimer } from '../../contexts/GanTimerContext';

import { createSmartCubeClient } from '../../smart/createSmartCubeClient';
import { getSmartCubeProviderLabel } from '../../smart/smartCubeProviderMeta';
import { computeBasicCFOPSplits } from '../../smart/solveSplits';

function normalizePenaltyValue(penalty) {
  const value = String(penalty || '').trim().toUpperCase();
  if (value === '+2') return '+2';
  if (value === 'DNF') return 'DNF';
  return null;
}

function getSolveDisplayState(solve) {
  const penalty = normalizePenaltyValue(solve?.penalty ?? solve?.Penalty);
  if (penalty === 'DNF') {
    return { penalty: 'DNF', timeMs: 0 };
  }

  const finalTimeMs = Number(solve?.finalTimeMs);
  if (Number.isFinite(finalTimeMs) && finalTimeMs >= 0) {
    return { penalty, timeMs: finalTimeMs };
  }

  const rawTimeMs = Number(solve?.rawTimeMs);
  if (Number.isFinite(rawTimeMs) && rawTimeMs >= 0) {
    return { penalty, timeMs: penalty === '+2' ? rawTimeMs + 2000 : rawTimeMs };
  }

  const time = Number(solve?.time);
  if (Number.isFinite(time) && time >= 0 && time !== Number.MAX_SAFE_INTEGER) {
    return { penalty, timeMs: time };
  }

  return { penalty: null, timeMs: 0 };
}

function getSolveDisplaySignature(solve) {
  const { penalty, timeMs } = getSolveDisplayState(solve);
  return `${penalty || ''}|${Number.isFinite(timeMs) ? timeMs : 'NaN'}`;
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

function Timer({
  addTime,
  inPlayerBar = false,
  activeScramble = "",
  compact = false,
  latestSolve = null,
}) {
  const { settings } = useSettings();
  const {
    ganConnected,
    ganConnecting,
    ganReady,
    ganDot,
    timerOn: ganTimerOn,
    elapsedTime: ganElapsedTime,
    lastTime: ganLastTime,
    lastPenalty: ganLastPenalty,
    connectGan,
    disconnectGan,
    registerAddTimeHandler,
    syncLatestSolve,
  } = useGanTimer();

  // ✅ keep latest addTime in a ref so Bluetooth callbacks always save
  // to the CURRENT session/event (not whatever it was when you connected).
  const addTimeRef = useRef(addTime);
  useEffect(() => {
    addTimeRef.current = addTime;
  }, [addTime]);

  const [manualTime, setManualTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [lastPenalty, setLastPenalty] = useState(null);
  const [timerOn, setTimerOn] = useState(false);
  const [isSpacebarHeld, setIsSpacebarHeld] = useState(false);
  const [canStart, setCanStart] = useState(true);

  // -------------------------
  // GAN TIMER
  // -------------------------
  const isGanMode = settings?.timerInput === 'GAN Bluetooth';

  // -------------------------
  // SMART CUBE
  // -------------------------
  const isCubeMode = settings?.timerInput === 'GAN Cube';
  const smartCubeProvider = settings?.smartCubeProvider || 'gan';
  const smartCubeProviderLabel = getSmartCubeProviderLabel(smartCubeProvider);

  const [cubeConnected, setCubeConnected] = useState(false);
  const [cubeConnecting, setCubeConnecting] = useState(false);
  const [cubeDot, setCubeDot] = useState('disconnected');

  const [cubeArmed, setCubeArmed] = useState(false);
  const [cubeSolving, setCubeSolving] = useState(false);

  // catch-and-recover state (prevents whole app crash on rare internal errors)
  const [cubeFatalError, setCubeFatalError] = useState(null);

  const cubeClientRef = useRef(null);

  // timing samples for elapsed ms (ONLY solution moves)
  const cubeSamplesRef = useRef([]); // [{cubeTs, hostTs}]

  // move log for solution
  const cubeMoveLogRef = useRef([]); // [{move, cubeTs, hostTs, facelets}]

  // latest facelets from cube
  const cubeFaceletsRef = useRef(null);

  // FIFO queue of move indices waiting for facelets
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
  const lastSyncedSolveSignatureRef = useRef(null);
  useEffect(() => {
    inspectionBeepsRef.current = !!settings.inspectionBeeps;
  }, [settings.inspectionBeeps]);

  useEffect(() => {
    if (isGanMode) {
      syncLatestSolve(latestSolve);
      return;
    }

    if (timerOn || isInspecting) return;

    const signature = getSolveDisplaySignature(latestSolve);
    if (signature === lastSyncedSolveSignatureRef.current) return;

    const { timeMs, penalty } = getSolveDisplayState(latestSolve);
    lastSyncedSolveSignatureRef.current = signature;
    setLastTime(timeMs);
    setLastPenalty(penalty);
  }, [isGanMode, isInspecting, latestSolve, syncLatestSolve, timerOn]);

  useEffect(() => {
    registerAddTimeHandler(addTimeRef.current);
  }, [registerAddTimeHandler, addTime]);

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
    setLastPenalty(null);

    inspectionExtraMsRef.current = 0;

    ignoreNextKeyUp.current = true;

    Promise.resolve(addTimeRef.current?.(finalWithInspection))
      .then((didKeepSolve) => {
        if (didKeepSolve === false) {
          // A confirm dialog can consume the original keyup; clear the one-shot
          // guard so the next hold-release starts immediately.
          ignoreNextKeyUp.current = false;
          setIsSpacebarHeld(false);
          setCanStart(false);
        }
      })
      .catch((err) => {
        console.error('Failed to save solve:', err);
      });
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
  // SMART CUBE helpers
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

  // Controlled facelets requests so we can align 1 FACELETS -> 1 MOVE (FIFO)
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

  useEffect(() => {
    const looksLikeLibraryCrash = (eventLike) => {
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
          "Smart cube internal error"
      );

      console.error(`⚠️ Caught ${label} (smart cube)`, eventLike);

      setCubeFatalError({ label, message });

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
      if (!looksLikeLibraryCrash(e)) return;
      try { e.preventDefault?.(); } catch (_) {}
      hardResetCube("window.error", e);
    };

    const onRejection = (e) => {
      if (!looksLikeLibraryCrash(e)) return;
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
      setLastPenalty(null);

      const splits = computeBasicCFOPSplits(moves, { totalMs: ms, finalFacelets });

      const smartMeta = {
        source: "SMART_CUBE",
        provider: smartCubeProvider,
        providerLabel: smartCubeProviderLabel,
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

        Promise.resolve(addTimeRef.current?.(ms, smartMeta)).catch((err) => {
          console.error("addTime failed (unlocking cubeSaveLock):", err);
          cubeSaveLockRef.current = false;
        });
      }
    } else {
      emitCubeSolveEvent({
        ms: null,
        reason,
        provider: smartCubeProvider,
        providerLabel: smartCubeProviderLabel,
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

    setCubeFatalError(null);
    setCubeConnecting(true);
    setCubeDot('connecting');

    try {
      cubeClientRef.current = createSmartCubeClient(smartCubeProvider);

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

          if (cubePhaseRef.current === "solving") {
            const q = pendingFaceletsQueueRef.current || [];
            const idx = q.shift();
            const log = cubeMoveLogRef.current || [];
            if (idx != null && idx >= 0 && idx < log.length) {
              log[idx].facelets = facelets;
            }
          }

          faceletsRequestInFlightRef.current = false;

          if (cubePhaseRef.current === "solving") {
            if (faceletsRequestAgainRef.current || (pendingFaceletsQueueRef.current?.length > 0)) {
              faceletsRequestAgainRef.current = false;
              requestFaceletsControlled();
            }
          }

          if (cubePhaseRef.current === 'finalizing') return;

          const solved = isFaceletsSolved(facelets);

          if (cubePhaseRef.current === 'solving' && solved) {
            finalizeCubeSolve('solved');
            return;
          }

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
          console.error('Smart cube error:', err);
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

      cubeClientRef.current?.requestFacelets?.();
    } catch (e) {
      console.error('Smart cube connect failed:', e);
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

  useEffect(() => {
    if (!cubeConnected) return;
    disconnectCube();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartCubeProvider]);

  // -------------------------
  // Keyboard handlers
  // -------------------------
  const handleKeyDown = (event) => {
    if (event?.__ptsTagBindingConsumed || event.defaultPrevented) return;

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
    if (event?.__ptsTagBindingConsumed || event.defaultPrevented) return;

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

  const effectiveTimerOn = isGanMode ? ganTimerOn : timerOn;
  const effectiveElapsedTime = isGanMode ? ganElapsedTime : elapsedTime;
  const effectiveLastTime = isGanMode ? ganLastTime : lastTime;
  const effectiveLastPenalty = isGanMode ? ganLastPenalty : lastPenalty;

  const formatTime = () => {
    if (isInspecting) return formatInspection();
    if (!effectiveTimerOn && effectiveLastPenalty === 'DNF') return 'DNF';
    const timeToDisplay = effectiveTimerOn ? effectiveElapsedTime : effectiveLastTime;
    return formatMs(timeToDisplay);
  };

  const displayTime = formatTime();
  const displayHasMinutes = displayTime.includes(':');
  const displayHasPenaltySuffix = !effectiveTimerOn && effectiveLastPenalty === '+2';
  const useCondensedTimerLayout = displayHasMinutes && !compact && !inPlayerBar;

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
    isGanMode && ganConnected && ganReady && !effectiveTimerOn
      ? { color: "#2EC4B6", transition: "color 120ms linear" }
      : undefined;

  const cubeGreenStyle =
    isCubeMode && cubeConnected && cubeArmed && !effectiveTimerOn
      ? { color: "#2EC4B6", transition: "color 120ms linear" }
      : undefined;

  const showGanControls = isGanMode && !inPlayerBar;
  const showCubeControls = isCubeMode && !inPlayerBar;

  const showKeyboardOrGanOrCube =
    settings.timerInput === 'Keyboard' || forceKeyboardView || isGanMode || isCubeMode;

  return (
    <div className={`timer-display ${compact ? "timer-display--compact" : ""} ${inPlayerBar ? "timer-display--playerbar" : ""}`}>
      {showKeyboardOrGanOrCube ? (
        <div className={`timer-center-wrap ${inPlayerBar ? "timer-center-wrap--playerbar" : ""}`}>
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
                    {ganConnecting ? "Connecting…" : "Connect GAN Timer"}
                  </button>
                ) : (
                  <button onClick={disconnectGan}>Disconnect</button>
                )}

                <span
                  className={`gan-dot ${ganDot}`}
                  title={
                    ganDot === "connected" ? "GAN timer connected" :
                    ganDot === "connecting" ? "Connecting…" :
                    ganDot === "error" ? "GAN timer error" :
                    "GAN timer disconnected"
                  }
                />
              </div>
            )}

            {/* Smart Cube controls */}
            {showCubeControls && (
              <div className="gan-controls">
                {!cubeConnected ? (
                  <button
                    onClick={connectCube}
                    disabled={cubeConnecting}
                    style={{ opacity: cubeConnecting ? 0.6 : 1 }}
                    title={smartCubeProviderLabel}
                  >
                    {cubeConnecting ? "Connecting…" : `Connect ${smartCubeProviderLabel}`}
                  </button>
                ) : (
                  <button onClick={disconnectCube}>Disconnect</button>
                )}

                <span
                  className={`gan-dot ${cubeDot}`}
                  title={
                    cubeDot === "connected" ? `${smartCubeProviderLabel} connected` :
                    cubeDot === "connecting" ? `Connecting ${smartCubeProviderLabel}…` :
                    cubeDot === "error" ? `${smartCubeProviderLabel} error` :
                    `${smartCubeProviderLabel} disconnected`
                  }
                />

                {cubeFatalError && (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    {smartCubeProviderLabel} disconnected after an internal update error.
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

          {/* FULLSCREEN INSPECTION */}
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
                className="Timer Timer--static"
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
              <p
                className={`Timer ${displayHasMinutes ? "Timer--with-minutes" : ""} ${useCondensedTimerLayout ? "Timer--home-long" : ""} ${(isGanMode || isCubeMode || settings.timerInput === "Keyboard") ? "Timer--static" : ""} ${compact ? "Timer--compact" : ""} ${inPlayerBar ? "Timer--playerbar" : ""}`}
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
                  ? (
                    <span className="Timer__content">
                      <span>{displayTime}</span>
                      {displayHasPenaltySuffix ? <span className="Timer__penalty">+</span> : null}
                    </span>
                  )
                  : settings.timerInput === "Keyboard"
                  ? (
                    <span className="Timer__content">
                      <span>{displayTime}</span>
                      {displayHasPenaltySuffix ? <span className="Timer__penalty">+</span> : null}
                    </span>
                  )
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
