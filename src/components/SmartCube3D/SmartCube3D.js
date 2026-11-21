// src/components/SmartCube3D/SmartCube3D.js
//
// Live 3D view of a connected smart cube, drawn with our own Cube3D (CSS 3D).
//
//  - Moves: parent calls addMove(token); turns are queued and animated, and
//    sped up when the cube reports moves faster than they can be shown.
//  - State: setFacelets(facelets) snaps to the cube's real state (on connect,
//    or whenever the cube reports it), resetToSolved() to solved.
//  - Gyro: setQuaternion(q) turns the whole cube. Orientation is shown relative
//    to "home" (the first reading, or when the user presses Set orientation),
//    measured in the cube's own axes at home, so holding it white-up/green-front
//    when setting home makes the screen match the hand.
//
// Imperative API (ref): addMove, resetToSolved, setFacelets, setHome, setQuaternion.

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Cube3D from "../Cube3D/Cube3D";
import { SOLVED, applyMove, parseToken } from "../../smart/recon/cube3";
import "./SmartCube3D.css";

const QUARTER_MS = 110;
const FAST_MS = 55; // when moves are queueing up
const SNAP_QUEUE = 6; // beyond this, apply moves without animating

// gan-web-bluetooth reports orientation with +X red (R), +Y blue (B), +Z white
// (U). Our cube frame is x = R, y = U, z = F, so (x, y, z) -> (x, z, -y).
function toCubeFrame(q) {
  return { x: q.x, y: q.z, z: -q.y, w: q.w };
}

function normalize(q) {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

const conj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

function mul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

const SmartCube3D = forwardRef(function SmartCube3D(
  { className = "", showHomeButton = true, initialState = null, placement = "timer" },
  ref
) {
  const cubeRef = useRef(null);
  // The view can mount after the cube first reported its state.
  const stateRef = useRef(
    initialState && String(initialState).length === 54 ? String(initialState) : SOLVED
  );
  const queueRef = useRef([]);
  const currentRef = useRef(null); // { token, start, d }
  const rafRef = useRef(0);

  const lastQuatRef = useRef(null);
  const homeRef = useRef(null);
  const gyroRafRef = useRef(0);

  // Only the first state goes through props; after that the view is driven
  // through the ref (a parent re-render mid-turn must not redraw it).
  const [mountState] = useState(stateRef.current);
  const compact = String(className).includes("compact");
  const hud = placement === "hud";
  // Only cubes with a gyro need "Set orientation"; show it once one reports.
  const [hasGyro, setHasGyro] = useState(false);
  const hasGyroRef = useRef(false);

  const settle = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    queueRef.current = [];
    currentRef.current = null;
  };

  const frame = (now) => {
    rafRef.current = 0;
    for (;;) {
      if (!currentRef.current) {
        const token = queueRef.current.shift();
        if (!token) {
          cubeRef.current?.draw(stateRef.current);
          return;
        }
        const backlog = queueRef.current.length;
        if (backlog >= SNAP_QUEUE) {
          stateRef.current = applyMove(stateRef.current, token);
          continue;
        }
        const p = parseToken(token);
        const base = backlog > 1 ? FAST_MS : QUARTER_MS;
        currentRef.current = { token, start: now, d: p && p.amount === 2 ? base * 1.5 : base };
      }
      const cur = currentRef.current;
      const f = (now - cur.start) / cur.d;
      if (f >= 1) {
        stateRef.current = applyMove(stateRef.current, cur.token);
        currentRef.current = null;
        continue;
      }
      cubeRef.current?.draw(stateRef.current, { token: cur.token, fraction: f });
      rafRef.current = requestAnimationFrame(frame);
      return;
    }
  };

  const kick = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
  };

  const applyGyro = () => {
    gyroRafRef.current = 0;
    const q = lastQuatRef.current;
    if (!q) return;
    const home = homeRef.current || q;
    cubeRef.current?.setOrientation(normalize(mul(conj(home), q)));
  };

  const scheduleGyro = () => {
    if (!gyroRafRef.current) gyroRafRef.current = requestAnimationFrame(applyGyro);
  };

  const setHome = () => {
    if (lastQuatRef.current) {
      homeRef.current = { ...lastQuatRef.current };
      scheduleGyro();
    }
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(gyroRafRef.current);
    },
    []
  );

  useImperativeHandle(ref, () => ({
    addMove(token) {
      const t = String(token || "").trim();
      if (!parseToken(t)) return;
      queueRef.current.push(t);
      kick();
    },
    resetToSolved() {
      settle();
      stateRef.current = SOLVED;
      cubeRef.current?.draw(SOLVED);
    },
    setFacelets(facelets) {
      const f = String(facelets || "");
      if (f.length !== 54) return;
      settle();
      stateRef.current = f;
      cubeRef.current?.draw(f);
    },
    setHome,
    setQuaternion(raw) {
      if (!raw || ![raw.x, raw.y, raw.z, raw.w].every(Number.isFinite)) return;
      const q = normalize(toCubeFrame(raw));
      lastQuatRef.current = q;
      if (!homeRef.current) homeRef.current = { ...q };
      if (!hasGyroRef.current) {
        hasGyroRef.current = true;
        setHasGyro(true);
      }
      scheduleGyro();
    },
  }));

  return (
    <div className={`smart-cube-3d ${hud ? "smart-cube-3d--hud" : ""} ${className}`}>
      <div className="smart-cube-3d__stage">
        <Cube3D ref={cubeRef} state={mountState} size={hud ? 124 : compact ? 110 : 160} />
      </div>
      {showHomeButton && hasGyro && (
        <button
          type="button"
          className="smart-cube-3d__home"
          onClick={setHome}
          title="Hold the cube white-up, green-front and press to line the view up"
        >
          Set orientation
        </button>
      )}
    </div>
  );
});

export default SmartCube3D;
