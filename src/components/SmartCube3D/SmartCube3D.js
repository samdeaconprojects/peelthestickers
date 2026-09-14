// src/components/SmartCube3D/SmartCube3D.js
//
// Live 3D view of a connected smart cube, using cubing.js <TwistyPlayer>.
//
//  - Moves: parent calls addMove(token) -> player.experimentalAddMove (animates
//    the real 3D scene).
//  - Gyro: the cube's orientation quaternion is decomposed into yaw + pitch
//    (fed to the TwistyPlayer orbit camera, so the cube stays solid 3D) and
//    roll (applied as a 2D CSS rotate, which is safe — an in-plane spin).
//    We deliberately do NOT 3D-rotate the WebGL canvas via CSS: a flat canvas
//    turned edge-on just collapses to a line.
//
// Imperative API (ref): addMove, resetToSolved, setHome, setQuaternion.

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { TwistyPlayer } from "cubing/twisty";
import "./SmartCube3D.css";

// Orientation tuning — flip a sign or swap axes here if the virtual cube turns
// the wrong way relative to the physical one.
const YAW_SIGN = 1;
const PITCH_SIGN = 1;
const ROLL_SIGN = 1;
const BASE_LATITUDE = 25; // camera resting tilt
const BASE_LONGITUDE = 35; // camera resting azimuth (shows 3 faces)

function rad2deg(r) {
  return (r * 180) / Math.PI;
}

function normQuat(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

// Quaternion -> intrinsic yaw (Y), pitch (X), roll (Z) in radians.
function quatToYawPitchRoll(q) {
  const { x, y, z, w } = q;

  // pitch (x-axis rotation)
  const sinp = 2 * (w * x - y * z);
  const pitch =
    Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  // yaw (y-axis rotation)
  const yaw = Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y));

  // roll (z-axis rotation)
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));

  return { yaw, pitch, roll };
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

const SmartCube3D = forwardRef(function SmartCube3D(
  { className = "", showHomeButton = true },
  ref
) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const stageRef = useRef(null);

  const lastRef = useRef(null); // { yaw, pitch, roll } degrees, latest
  const homeRef = useRef(null); // captured home { yaw, pitch, roll }
  const rafRef = useRef(0);

  useEffect(() => {
    let player;
    try {
      player = new TwistyPlayer({
        puzzle: "3x3x3",
        visualization: "3D",
        background: "none",
        controlPanel: "none",
        hintFacelets: "none",
        experimentalDragInput: "none",
        tempoScale: 5,
        cameraLatitude: BASE_LATITUDE,
        cameraLongitude: BASE_LONGITUDE,
      });
      player.classList.add("smart-cube-3d__player");
      playerRef.current = player;
      if (containerRef.current) containerRef.current.appendChild(player);
    } catch (e) {
      console.error("[PTS][SmartCube3D] failed to create TwistyPlayer", e);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        player?.remove();
      } catch (_) {}
      playerRef.current = null;
    };
  }, []);

  const applyOrientation = () => {
    rafRef.current = 0;
    const player = playerRef.current;
    const cur = lastRef.current;
    if (!player || !cur) return;

    const home = homeRef.current || { yaw: 0, pitch: 0, roll: 0 };
    const yaw = angleDelta(cur.yaw, home.yaw);
    const pitch = angleDelta(cur.pitch, home.pitch);
    const roll = angleDelta(cur.roll, home.roll);

    if (![yaw, pitch, roll].every(Number.isFinite)) return;

    try {
      player.cameraLongitude = BASE_LONGITUDE + YAW_SIGN * yaw;
      player.cameraLatitude = Math.max(
        -89,
        Math.min(89, BASE_LATITUDE + PITCH_SIGN * pitch)
      );
    } catch (_) {}

    if (stageRef.current) {
      stageRef.current.style.transform = `rotate(${ROLL_SIGN * roll}deg)`;
    }
  };

  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(applyOrientation);
  };

  useImperativeHandle(ref, () => ({
    addMove(token) {
      const t = String(token || "").trim();
      if (!t) return;
      try {
        playerRef.current?.experimentalAddMove(t);
      } catch (_) {}
    },
    resetToSolved() {
      try {
        const player = playerRef.current;
        if (!player) return;
        player.experimentalSetupAlg = "";
        player.alg = "";
      } catch (_) {}
    },
    setHome() {
      if (lastRef.current) {
        homeRef.current = { ...lastRef.current };
        schedule();
      }
    },
    setQuaternion(q) {
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.w)) return;
      const ypr = quatToYawPitchRoll(normQuat(q));
      const deg = {
        yaw: rad2deg(ypr.yaw),
        pitch: rad2deg(ypr.pitch),
        roll: rad2deg(ypr.roll),
      };
      if (!Object.values(deg).every(Number.isFinite)) return;
      lastRef.current = deg;
      if (!homeRef.current) homeRef.current = { ...deg };
      schedule();
    },
  }));

  return (
    <div className={`smart-cube-3d ${className}`}>
      <div className="smart-cube-3d__stage" ref={stageRef}>
        <div className="smart-cube-3d__mount" ref={containerRef} />
      </div>
      {showHomeButton && (
        <button
          type="button"
          className="smart-cube-3d__home"
          onClick={() => {
            if (lastRef.current) {
              homeRef.current = { ...lastRef.current };
              schedule();
            }
          }}
        >
          Set orientation
        </button>
      )}
    </div>
  );
});

export default SmartCube3D;
