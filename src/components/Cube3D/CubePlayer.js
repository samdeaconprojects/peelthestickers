// src/components/Cube3D/CubePlayer.js
//
// Replays a move list on our 3D cube at the solve's real pace: each move
// finishes at its recorded time (moves[k].t, ms) and animates over a short
// window before it. Scrub, step, change speed, or play one range (a step of
// the reconstruction) via the ref.
//
// Props
//   startState   facelets before moves[0]
//   moves        [{ text, t, rotation? }]
//   onPosition   (count) => void — how many moves are done; fires on change
//
// Ref API: playRange(from, to), seekToCount(count), pause()

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Cube3D from "./Cube3D";
import { SOLVED, applyMove, parseToken } from "../../smart/recon/cube3";
import "./CubePlayer.css";

const QUARTER_MS = 120;
const DOUBLE_MS = 170;
const ROTATION_MS = 240;
const SPEEDS = [0.25, 0.5, 1, 2];

function durationOf(m) {
  if (m.rotation) return ROTATION_MS;
  const p = parseToken(m.text);
  return p && p.amount === 2 ? DOUBLE_MS : QUARTER_MS;
}

// Animation windows. Every physical move finishes exactly at its recorded
// time, so the replay keeps the solve's real pace: a move animates for up to
// its usual duration, squeezed when it follows the previous one more closely
// (fast turns, double turns) and instant when they were simultaneous. A
// rotation is not a physical move; it plays in the pause before the next move
// (instantly if there is none).
export function buildSchedule(moves) {
  const out = [];
  let prevEnd = -Infinity;
  const nextPhysical = (k) => {
    for (let j = k + 1; j < moves.length; j++) {
      if (!moves[j].rotation && Number.isFinite(moves[j].t)) return moves[j];
    }
    return null;
  };
  for (let k = 0; k < moves.length; k++) {
    const m = moves[k];
    const d = durationOf(m);
    let end;
    if (m.rotation) {
      const nxt = nextPhysical(k);
      end = nxt ? Math.max(prevEnd, nxt.t - durationOf(nxt)) : prevEnd;
      if (!Number.isFinite(end)) end = nxt ? nxt.t - durationOf(nxt) : 0;
    } else if (Number.isFinite(m.t)) {
      end = Math.max(m.t, prevEnd);
    } else {
      end = (Number.isFinite(prevEnd) ? prevEnd : 0) + d;
    }
    const start = Math.max(Number.isFinite(prevEnd) ? prevEnd : end - d, end - d);
    out.push({ start, end, d: end - start });
    prevEnd = end;
  }
  return out;
}

const fmt = (ms) => (Math.max(0, ms) / 1000).toFixed(2);

const CubePlayer = forwardRef(function CubePlayer(
  { startState = SOLVED, moves = [], onPosition, size = 260 },
  ref
) {
  const cubeRef = useRef(null);
  const schedule = useMemo(() => buildSchedule(moves), [moves]);
  const states = useMemo(() => {
    const out = [startState];
    for (const m of moves) out.push(applyMove(out[out.length - 1], m.text));
    return out;
  }, [startState, moves]);

  const t0 = schedule.length ? schedule[0].start : 0;
  const tEnd = schedule.length ? schedule[schedule.length - 1].end : 0;
  // The clock reads 0 at the first turn, like the solve timer.
  const firstTurn = useMemo(() => {
    const k = moves.findIndex((m) => !m.rotation);
    return k >= 0 ? schedule[k].end : t0;
  }, [moves, schedule, t0]);

  const tRef = useRef(t0);
  const stopAtRef = useRef(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const countRef = useRef(-1);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(t0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const countAt = useCallback(
    (T) => {
      let k = 0;
      while (k < schedule.length && schedule[k].end <= T + 1e-6) k++;
      return k;
    },
    [schedule]
  );

  const render = useCallback(
    (T) => {
      const k = countAt(T);
      let anim = null;
      if (k < moves.length && schedule[k].d > 0 && T > schedule[k].start) {
        anim = { token: moves[k].text, fraction: (T - schedule[k].start) / schedule[k].d };
      }
      cubeRef.current?.draw(states[k], anim);
      if (k !== countRef.current) {
        countRef.current = k;
        onPosition?.(k);
      }
      setTime(T);
    },
    [countAt, moves, schedule, states, onPosition]
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setPlaying(false);
  }, []);

  const frame = useCallback(
    (now) => {
      const dt = lastFrameRef.current ? now - lastFrameRef.current : 0;
      lastFrameRef.current = now;
      let T = tRef.current + dt * speedRef.current;
      const stopAt = stopAtRef.current ?? tEnd;
      if (T >= stopAt) {
        T = stopAt;
        tRef.current = T;
        render(T);
        stopAtRef.current = null;
        stop();
        return;
      }
      tRef.current = T;
      render(T);
      rafRef.current = requestAnimationFrame(frame);
    },
    [render, stop, tEnd]
  );

  const play = useCallback(() => {
    if (!moves.length) return;
    if (tRef.current >= (stopAtRef.current ?? tEnd) - 1) {
      tRef.current = t0;
      stopAtRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    lastFrameRef.current = 0;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(frame);
  }, [frame, moves.length, t0, tEnd]);

  const seek = useCallback(
    (T) => {
      stop();
      stopAtRef.current = null;
      tRef.current = Math.max(t0, Math.min(tEnd, T));
      render(tRef.current);
    },
    [render, stop, t0, tEnd]
  );

  const timeForCount = useCallback(
    (count) => (count <= 0 ? t0 : schedule[Math.min(count, schedule.length) - 1].end),
    [schedule, t0]
  );

  // New solve / start state: back to the start.
  useEffect(() => {
    stop();
    stopAtRef.current = null;
    countRef.current = -1;
    tRef.current = t0;
    render(t0);
  }, [states]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useImperativeHandle(
    ref,
    () => ({
      playRange(from, to) {
        if (!moves.length) return;
        seek(timeForCount(from));
        stopAtRef.current = timeForCount(to);
        cancelAnimationFrame(rafRef.current);
        lastFrameRef.current = 0;
        setPlaying(true);
        rafRef.current = requestAnimationFrame(frame);
      },
      seekToCount(count) {
        seek(timeForCount(count));
      },
      pause: stop,
    }),
    [frame, moves.length, seek, stop, timeForCount]
  );

  const count = countAt(time);

  return (
    <div className="cubePlayer">
      <Cube3D ref={cubeRef} state={startState} size={size} draggable />
      <div className="cubePlayer__bar">
        <button type="button" onClick={() => seek(t0)} title="Start" aria-label="Start">
          ⏮
        </button>
        <button
          type="button"
          onClick={() => seek(timeForCount(count - 1))}
          title="Previous move"
          aria-label="Previous move"
        >
          ‹
        </button>
        <button
          type="button"
          className="cubePlayer__play"
          onClick={() => (playing ? stop() : play())}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => seek(timeForCount(count + 1))}
          title="Next move"
          aria-label="Next move"
        >
          ›
        </button>
        <button type="button" onClick={() => seek(tEnd)} title="End" aria-label="End">
          ⏭
        </button>
        <input
          className="cubePlayer__scrub"
          type="range"
          min={t0}
          max={Math.max(tEnd, t0 + 1)}
          step="1"
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position"
        />
        <span className="cubePlayer__time">
          {fmt(time - firstTurn)} / {fmt(tEnd - firstTurn)}
        </span>
        <select
          className="cubePlayer__speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
      <div className="cubePlayer__hint">
        Move {count}/{moves.length} · drag to look around
      </div>
    </div>
  );
});

export default CubePlayer;
