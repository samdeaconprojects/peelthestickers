import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GanTimerClient, GanTimerState } from "../smart/ganTimerClient";
import { useSettings } from "./SettingsContext";

const GanTimerContext = createContext(null);

export const useGanTimer = () => useContext(GanTimerContext);

function parseDisplayTimeToMs(displayTime) {
  if (displayTime == null) return null;

  const n = Number(displayTime);
  if (Number.isFinite(n)) {
    if (n > 1000) return Math.round(n);
    return Math.round(n * 1000);
  }

  const s = String(displayTime).trim();
  if (!s) return null;

  if (s.includes(":")) {
    const [mStr, secStrRaw] = s.split(":");
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

function normalizePenaltyValue(penalty) {
  const value = String(penalty || "").trim().toUpperCase();
  if (value === "+2") return "+2";
  if (value === "DNF") return "DNF";
  return null;
}

function getSolveDisplayState(solve) {
  const penalty = normalizePenaltyValue(solve?.penalty ?? solve?.Penalty);
  if (penalty === "DNF") {
    return { penalty: "DNF", timeMs: 0 };
  }

  const finalTimeMs = Number(solve?.finalTimeMs);
  if (Number.isFinite(finalTimeMs) && finalTimeMs >= 0) {
    return { penalty, timeMs: finalTimeMs };
  }

  const rawTimeMs = Number(solve?.rawTimeMs);
  if (Number.isFinite(rawTimeMs) && rawTimeMs >= 0) {
    return { penalty, timeMs: penalty === "+2" ? rawTimeMs + 2000 : rawTimeMs };
  }

  const time = Number(solve?.time);
  if (Number.isFinite(time) && time >= 0 && time !== Number.MAX_SAFE_INTEGER) {
    return { penalty, timeMs: time };
  }

  return { penalty: null, timeMs: 0 };
}

function getSolveDisplaySignature(solve) {
  const { penalty, timeMs } = getSolveDisplayState(solve);
  return `${penalty || ""}|${Number.isFinite(timeMs) ? timeMs : "NaN"}`;
}

export function GanTimerProvider({ children }) {
  const { settings } = useSettings();
  const isGanMode = settings?.timerInput === "GAN Bluetooth";

  const [ganConnected, setGanConnected] = useState(false);
  const [ganConnecting, setGanConnecting] = useState(false);
  const [ganStatus, setGanStatus] = useState("");
  const [ganAwaitingFinal, setGanAwaitingFinal] = useState(false);
  const [ganReady, setGanReady] = useState(false);
  const [ganDot, setGanDot] = useState("disconnected");
  const [timerOn, setTimerOn] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [lastPenalty, setLastPenalty] = useState(null);

  const ganClientRef = useRef(null);
  const ganSaveLockRef = useRef(false);
  const ganReadFallbackLockRef = useRef(false);
  const addTimeHandlerRef = useRef(null);
  const intervalRef = useRef(null);
  const startRef = useRef(null);
  const lastSyncedSolveSignatureRef = useRef(null);

  const stopLocalStopwatch = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTimerOn(false);
  }, []);

  const startLocalStopwatch = useCallback(() => {
    startRef.current = Date.now();
    setElapsedTime(0);
    setTimerOn(true);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startRef.current);
    }, 10);
  }, []);

  const finalizeGanSolve = useCallback((ms) => {
    if (!Number.isFinite(ms) || ms < 0) return;

    setGanAwaitingFinal(false);
    stopLocalStopwatch();

    setElapsedTime(ms);
    setLastTime(ms);
    setLastPenalty(null);

    if (!ganSaveLockRef.current) {
      ganSaveLockRef.current = true;
      addTimeHandlerRef.current?.(ms);
    }
  }, [stopLocalStopwatch]);

  const tryFallbackReadFromTimer = useCallback(async () => {
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
  }, [finalizeGanSolve]);

  const disconnectGan = useCallback(async () => {
    try {
      await ganClientRef.current?.disconnect?.();
    } catch (_) {}

    setGanConnected(false);
    setGanConnecting(false);
    setGanStatus("");
    setGanAwaitingFinal(false);
    setGanReady(false);
    setGanDot("disconnected");

    ganSaveLockRef.current = false;
    ganReadFallbackLockRef.current = false;
    stopLocalStopwatch();
  }, [stopLocalStopwatch]);

  const connectGan = useCallback(async () => {
    if (ganConnecting) return;

    setGanStatus("");
    setGanConnecting(true);
    setGanDot("connecting");

    try {
      if (!ganClientRef.current) ganClientRef.current = new GanTimerClient();

      await ganClientRef.current.connect({
        onState: async (ev) => {
          if (ev?.state === GanTimerState.IDLE) setGanStatus("Idle");
          if (ev?.state === GanTimerState.RUNNING) setGanStatus("Solving…");
          if (ev?.state === GanTimerState.STOPPED) setGanStatus("Stopped");
          if (ev?.state === GanTimerState.FINISHED) setGanStatus("Finished");

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
        },

        onSolve: ({ ms }) => {
          finalizeGanSolve(ms);
        },

        onDisconnect: () => {
          setGanStatus("Disconnected");
          setGanConnected(false);
          setGanConnecting(false);
          setGanAwaitingFinal(false);
          setGanReady(false);
          setGanDot("disconnected");

          ganSaveLockRef.current = false;
          ganReadFallbackLockRef.current = false;
          stopLocalStopwatch();
        },

        onError: (err) => {
          console.error("GAN timer error:", err);
          setGanStatus("Error");
          setGanConnected(false);
          setGanConnecting(false);
          setGanAwaitingFinal(false);
          setGanReady(false);
          setGanDot("error");

          ganSaveLockRef.current = false;
          ganReadFallbackLockRef.current = false;
          stopLocalStopwatch();
        },
      });

      setGanConnected(true);
      setGanStatus("Connected");
      setGanDot("connected");
    } catch (e) {
      console.error("GAN connect failed:", e);
      setGanStatus("Connect failed");
      setGanConnected(false);
      setGanDot("error");
    } finally {
      setGanConnecting(false);
    }
  }, [finalizeGanSolve, ganConnecting, startLocalStopwatch, stopLocalStopwatch, tryFallbackReadFromTimer]);

  const registerAddTimeHandler = useCallback((handler) => {
    addTimeHandlerRef.current = typeof handler === "function" ? handler : null;
  }, []);

  const syncLatestSolve = useCallback((latestSolve) => {
    if (timerOn) return;

    const signature = getSolveDisplaySignature(latestSolve);
    if (signature === lastSyncedSolveSignatureRef.current) return;

    const { timeMs, penalty } = getSolveDisplayState(latestSolve);
    lastSyncedSolveSignatureRef.current = signature;
    setLastTime(timeMs);
    setLastPenalty(penalty);
  }, [timerOn]);

  useEffect(() => {
    if (!isGanMode && ganConnected) disconnectGan();
  }, [disconnectGan, ganConnected, isGanMode]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      try {
        ganClientRef.current?.disconnect?.();
      } catch (_) {}
    };
  }, []);

  const value = useMemo(
    () => ({
      ganConnected,
      ganConnecting,
      ganStatus,
      ganAwaitingFinal,
      ganReady,
      ganDot,
      timerOn,
      elapsedTime,
      lastTime,
      lastPenalty,
      connectGan,
      disconnectGan,
      registerAddTimeHandler,
      syncLatestSolve,
    }),
    [
      connectGan,
      disconnectGan,
      elapsedTime,
      ganAwaitingFinal,
      ganConnected,
      ganConnecting,
      ganDot,
      ganReady,
      ganStatus,
      lastPenalty,
      lastTime,
      registerAddTimeHandler,
      syncLatestSolve,
      timerOn,
    ]
  );

  return (
    <GanTimerContext.Provider value={value}>
      {children}
    </GanTimerContext.Provider>
  );
}
