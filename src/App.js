// src/App.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import AveragesDisplay from "./components/AveragesDisplay/AveragesDisplay";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import Navigation from "./components/Navigation/Navigation";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import EventSelector from "./components/EventSelector";
import Scramble from "./components/Scramble/Scramble";
import PuzzleSVG from "./components/PuzzleSVGs/PuzzleSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import NameTag from "./components/Profile/NameTag";
import Detail from "./components/Detail/Detail";
import { useSettings } from "./contexts/SettingsContext";
import { generateScramble } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { getUser } from "./services/getUser";
import { getSessions } from "./services/getSessions";
import { getLastNSolvesBySession } from "./services/getSolvesBySession";
import { getCustomEvents } from "./services/getCustomEvents";
import { addSolve as addSolveToDB } from "./services/addSolve";
import { deleteSolve } from "./services/deleteSolve";
import { getPosts } from "./services/getPosts";
import { createPost } from "./services/createPost";
import { deletePost as deletePostFromDB } from "./services/deletePost";
import { updatePostComments } from "./services/updatePostComments";
import { createSession } from "./services/createSession";
import { createUser } from "./services/createUser";
import { updateSolve } from "./services/updateSolve";
import { updateUser } from "./services/updateUser";
import { sendMessage } from "./services/sendMessage";
import { setGanCurrentScramble } from "./smart/ganScrambleProgress";

import tagIcon from "./assets/ptstag.svg";

import { DEFAULT_EVENTS } from "./defaultEvents";
import {
  calculateBestAverageOfFive,
  calculateAverage,
} from "./components/TimeList/TimeUtils";

/* -------------------------------------------------------------------------- */
/*                         SMART-CUBE SCRAMBLE HELPERS                         */
/* -------------------------------------------------------------------------- */
/**
 * Turn a scramble string into a list of expected "steps".
 * Key behavior:
 * - "L2" becomes ["L","L"] (2 physical turns)
 * - We ALSO allow "L'","L'" as an alternative when matching, handled elsewhere.
 */
function expandScrambleToSteps(scramble) {
  const tokens = String(scramble || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const steps = [];

  for (const tok of tokens) {
    const t = String(tok).trim();
    if (!t) continue;

    // Examples: "L", "L'", "L2"
    // We treat any "X2" as two same-direction quarter-turn steps: "X","X"
    if (t.endsWith("2")) {
      const base = t.slice(0, -1); // "L" or "Rw" etc.
      if (base) {
        steps.push(base);
        steps.push(base);
      } else {
        // fallback (shouldn't happen)
        steps.push(t);
      }
    } else {
      steps.push(t);
    }
  }

  return steps;
}

/**
 * Convert "token progress" (how many *scramble tokens* completed)
 * into "step progress" (how many *physical quarter-turn steps* completed),
 * where each X2 token counts as 2 steps.
 *
 * If your cube integration emits token-based progress, this makes the UI right.
 * If your cube integration already emits step-based progress, you can set
 * scrambleProgressMode below to "steps" and bypass this conversion.
 */
function tokenProgressToStepProgress(scramble, tokenProgress) {
  const tokens = String(scramble || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const p = Math.max(0, Math.min(tokens.length, Number(tokenProgress || 0)));

  let steps = 0;
  for (let i = 0; i < p; i++) {
    const t = tokens[i];
    steps += String(t).trim().endsWith("2") ? 2 : 1;
  }
  return steps;
}

/* -------------------------------------------------------------------------- */
/*                            INLINE TAG BAR (HOME)                           */
/* -------------------------------------------------------------------------- */
function TagBarInline({ tags, onChange, tagOptions, onTagOptionsChange }) {
  const wrapRef = useRef(null);
  const safeTags = tags || {};
  const custom = safeTags.Custom || {};

  const cubeOptions = Array.isArray(tagOptions?.CubeModels)
    ? tagOptions.CubeModels
    : [];
  const crossOptions = Array.isArray(tagOptions?.CrossColors)
    ? tagOptions.CrossColors
    : [];

  const [addingCube, setAddingCube] = useState(false);
  const [addingCross, setAddingCross] = useState(false);
  const [newCube, setNewCube] = useState("");
  const [newCross, setNewCross] = useState("");

  const [addingCustom, setAddingCustom] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const ADD_CUBE = "__ADD_CUBE__";
  const ADD_CROSS = "__ADD_CROSS__";

  const stopKeys = (e) => {
    e.stopPropagation();
  };

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) {
        setAddingCube(false);
        setAddingCross(false);
        setAddingCustom(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const setField = (field, value) => {
    const v = String(value ?? "").trim();
    const next = { ...(safeTags || {}) };
    if (!v) delete next[field];
    else next[field] = v;
    onChange?.(next);
  };

  const removeCustom = (k) => {
    const next = { ...(safeTags || {}) };
    const c = { ...(next.Custom || {}) };
    delete c[k];
    if (Object.keys(c).length === 0) delete next.Custom;
    else next.Custom = c;
    onChange?.(next);
  };

  const addCustom = () => {
    const k = String(newKey ?? "").trim();
    const v = String(newVal ?? "").trim();
    if (!k) return;

    const next = { ...(safeTags || {}) };
    const c = { ...(next.Custom || {}) };
    c[k] = v || "true";
    next.Custom = c;

    onChange?.(next);
    setNewKey("");
    setNewVal("");
    setAddingCustom(false);
  };

  const pillStyle = (isSet) => ({
    width: "120px",
    height: "30px",
    borderRadius: "8px",
    border: `2px solid ${
      isSet ? "rgba(172, 172, 172, 0.95)" : "rgba(172, 172, 172, 0.75)"
    }`,
    background: "transparent",
    color: "white",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  const selectStyle = {
    width: "120px",
    height: "34px",
    borderRadius: "8px",
    border: "2px solid rgba(172, 172, 172, 0.75)",
    background: "rgba(0,0,0,0.15)",
    color: "white",
    fontSize: "14px",
    padding: "0 10px",
    outline: "none",
    boxSizing: "border-box",
  };

  const inputStyle = {
    width: "120px",
    height: "30px",
    borderRadius: "8px",
    border: "2px solid rgba(172, 172, 172, 0.95)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    fontSize: "14px",
    padding: "0 10px",
    boxSizing: "border-box",
    outline: "none",
  };

  const addBtnStyle = {
    width: "120px",
    height: "30px",
    borderRadius: "8px",
    border: "2px solid rgba(172, 172, 172, 0.6)",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    opacity: 0.9,
  };

  const addCubeOption = () => {
    const v = String(newCube ?? "").trim();
    if (!v) return;

    const next = {
      ...(tagOptions || {}),
      CubeModels: Array.from(new Set([v, ...(cubeOptions || [])])),
    };
    onTagOptionsChange?.(next);
    setField("CubeModel", v);

    setNewCube("");
    setAddingCube(false);
  };

  const addCrossOption = () => {
    const v = String(newCross ?? "").trim();
    if (!v) return;

    const next = {
      ...(tagOptions || {}),
      CrossColors: Array.from(new Set([v, ...(crossOptions || [])])),
    };
    onTagOptionsChange?.(next);
    setField("CrossColor", v);

    setNewCross("");
    setAddingCross(false);
  };

  return (
    <div
      ref={wrapRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        alignItems: "flex-end",
        marginTop: "6px",
        width: "170px",
      }}
      onKeyDownCapture={stopKeys}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Cube Model dropdown */}
      <div
        style={{
          width: "170px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          alignItems: "flex-end",
        }}
      >
        <select
          style={selectStyle}
          value={safeTags?.CubeModel || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === ADD_CUBE) {
              setAddingCube(true);
              return;
            }
            setField("CubeModel", v);
          }}
          onKeyDownCapture={stopKeys}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <option value="">Cube Model</option>
          {(cubeOptions || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option disabled value="__DIVIDER_CUBE__">
            ──────────
          </option>
          <option value={ADD_CUBE}>+ Add Cube Model…</option>
        </select>

        {addingCube && (
          <>
            <input
              style={inputStyle}
              value={newCube}
              onChange={(e) => setNewCube(e.target.value)}
              placeholder="Add Cube Model"
              autoFocus
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") addCubeOption();
                if (e.key === "Escape") setAddingCube(false);
              }}
              onKeyDownCapture={stopKeys}
            />
            <button type="button" style={addBtnStyle} onClick={addCubeOption}>
              Add
            </button>
            <button
              type="button"
              style={addBtnStyle}
              onClick={() => setAddingCube(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Cross Color dropdown */}
      <div
        style={{
          width: "170px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          alignItems: "flex-end",
        }}
      >
        <select
          style={selectStyle}
          value={safeTags?.CrossColor || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === ADD_CROSS) {
              setAddingCross(true);
              return;
            }
            setField("CrossColor", v);
          }}
          onKeyDownCapture={stopKeys}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <option value="">Cross Color</option>
          {(crossOptions || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option disabled value="__DIVIDER_CROSS__">
            ──────────
          </option>
          <option value={ADD_CROSS}>+ Add Cross Color…</option>
        </select>

        {addingCross && (
          <>
            <input
              style={inputStyle}
              value={newCross}
              onChange={(e) => setNewCross(e.target.value)}
              placeholder="Add Cross Color"
              autoFocus
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") addCrossOption();
                if (e.key === "Escape") setAddingCross(false);
              }}
              onKeyDownCapture={stopKeys}
            />
            <button type="button" style={addBtnStyle} onClick={addCrossOption}>
              Add
            </button>
            <button
              type="button"
              style={addBtnStyle}
              onClick={() => setAddingCross(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* custom tags list */}
      {Object.entries(custom).map(([k, v]) => (
        <div
          key={`custom-${k}`}
          style={{
            width: "170px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              ...pillStyle(true),
              justifyContent: "space-between",
              gap: "8px",
            }}
            title={`${k}=${v}`}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {k}
              {v && v !== "true" ? `: ${v}` : ""}
            </span>
            <button
              type="button"
              onClick={() => removeCustom(k)}
              title="Remove"
              style={{
                border: "none",
                background: "transparent",
                color: "white",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                opacity: 0.9,
                height: "auto",
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {/* add custom */}
      {addingCustom ? (
        <div
          style={{
            width: "220px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            alignItems: "stretch",
          }}
        >
          <input
            style={inputStyle}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="tag name (spaces ok)"
            autoFocus
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") addCustom();
              if (e.key === "Escape") setAddingCustom(false);
            }}
            onKeyDownCapture={stopKeys}
          />
          <input
            style={inputStyle}
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") addCustom();
              if (e.key === "Escape") setAddingCustom(false);
            }}
            onKeyDownCapture={stopKeys}
          />
          <button type="button" onClick={addCustom} style={addBtnStyle}>
            Add
          </button>
          <button
            type="button"
            onClick={() => setAddingCustom(false)}
            style={addBtnStyle}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCustom(true)}
          style={addBtnStyle}
        >
          + Tag
        </button>
      )}
    </div>
  );
}

function App() {
  const [sessionsList, setSessionsList] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);
  const [currentSession, setCurrentSession] = useState("main");
  const [currentEvent, setCurrentEvent] = useState("333");
  const [sessionStats, setSessionStats] = useState({});

  const [scrambles, setScrambles] = useState({});
  const [sessions, setSessions] = useState({
    "222": [],
    "333": [],
    "444": [],
    "555": [],
    "666": [],
    "777": [],
    "333OH": [],
    "333BLD": [],
    RELAY: [],
  });
  const [showPlayerBar, setShowPlayerBar] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState([]);
  const [selectedAverageIndex, setSelectedAverageIndex] = useState(0);
  const [sharedSession, setSharedSession] = useState(null);
  const [sharedIndex, setSharedIndex] = useState(0);

  const [socialRefreshTick, setSocialRefreshTick] = useState(0);

  const [activeSessionObj, setActiveSessionObj] = useState(null);
  const [relayLegIndex, setRelayLegIndex] = useState(0);
  const [relayLegTimes, setRelayLegTimes] = useState([]);
  const [relayScrambles, setRelayScrambles] = useState([]);
  const [relayLegs, setRelayLegs] = useState([]);

  const [tagsByEvent, setTagsByEvent] = useState({});

  const [tagOptions, setTagOptions] = useState({
    CubeModels: [],
    CrossColors: ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
  });

  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceSolves, setPracticeSolves] = useState([]);
  const [showPracticeExit, setShowPracticeExit] = useState(false);
  const [practiceSaveTargetSession, setPracticeSaveTargetSession] = useState("main");

  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const { settings } = useSettings();

  const [scrambleProgress, setScrambleProgress] = useState(0);
  const [scrambleProgressTotal, setScrambleProgressTotal] = useState(0);

  const [dbStatus, setDbStatus] = useState({
    phase: "idle",
    op: "",
    tick: 0,
  });

  const dbSuccessTimeoutRef = useRef(null);
  const dbErrorTimeoutRef = useRef(null);

  const setDbPhase = (phase, op = "") => {
    setDbStatus((prev) => ({
      phase,
      op,
      tick: (prev.tick || 0) + 1,
    }));
  };

  const runDb = async (opLabel, fn) => {
    try {
      if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
      if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);

      setDbPhase("loading", opLabel);

      const res = await fn();

      setDbPhase("success", opLabel);
      dbSuccessTimeoutRef.current = setTimeout(() => {
        setDbPhase("idle", "");
      }, 900);

      return res;
    } catch (err) {
      console.error(`DB op failed (${opLabel}):`, err);

      setDbPhase("error", opLabel);
      dbErrorTimeoutRef.current = setTimeout(() => {
        setDbPhase("idle", "");
      }, 1400);

      throw err;
    }
  };

  useEffect(() => {
    return () => {
      if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
      if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);
    };
  }, []);

  const eventKey =
    String(currentEvent || "").toUpperCase() === "RELAY" ? "RELAY" : currentEvent;

  const isRelayActive =
    String(currentEvent || "").toUpperCase() === "RELAY" &&
    activeSessionObj?.SessionType === "RELAY" &&
    relayLegs.length > 0;

  const relayCurrentEvent = isRelayActive ? relayLegs[relayLegIndex] : null;
  const relayCurrentScramble = isRelayActive
    ? relayScrambles[relayLegIndex] || ""
    : "";

  const displayedScramble = useMemo(() => {
    return sharedSession
      ? sharedSession.scrambles[sharedIndex] || ""
      : isRelayActive
      ? relayCurrentScramble
      : scrambles[currentEvent]?.[0] || "";
  }, [
    sharedSession,
    sharedIndex,
    isRelayActive,
    relayCurrentScramble,
    scrambles,
    currentEvent,
  ]);

  const displayedSvgEvent = useMemo(() => {
    return isRelayActive ? relayCurrentEvent : currentEvent;
  }, [isRelayActive, relayCurrentEvent, currentEvent]);

  // ✅ if your cube integration emits TOKEN progress (per scramble token), keep "tokens".
  // ✅ if it emits STEP progress (each quarter turn), change to "steps".
  const scrambleProgressMode = "steps";

  useEffect(() => {
    const norm = (x) =>
      String(x || "")
        .trim()
        .replace(/\s+/g, " ");

    const onProg = (e) => {
      const d = e?.detail || {};
      const s = norm(d.scramble);
      const shown = norm(displayedScramble);

      // If emitter includes scramble string, require match.
      // If not, accept it as "current".
      if (s && shown && s !== shown) return;

      const rawProgress = Number(d.progress || 0);

      const stepP =
        scrambleProgressMode === "steps"
          ? Math.max(0, rawProgress)
          : tokenProgressToStepProgress(displayedScramble, rawProgress);

      const totalSteps = expandScrambleToSteps(displayedScramble).length;

      setScrambleProgress(Number.isFinite(stepP) ? stepP : 0);
      setScrambleProgressTotal(Number.isFinite(totalSteps) ? totalSteps : 0);
    };

    window.addEventListener("pts:cubeScrambleProgress", onProg);
    return () => window.removeEventListener("pts:cubeScrambleProgress", onProg);
  }, [displayedScramble]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setScrambleProgress(0);
    setScrambleProgressTotal(expandScrambleToSteps(displayedScramble).length);
  }, [displayedScramble]);

  useEffect(() => {
    setGanCurrentScramble(displayedScramble);
  }, [displayedScramble]);

  useEffect(() => {
  const onCubeSolve = (e) => {
    console.log("SMART SOLVE", e.detail);
  };

  window.addEventListener("pts:cubeSolve", onCubeSolve);
  return () => window.removeEventListener("pts:cubeSolve", onCubeSolve);
}, []);

  const currentTags =
    tagsByEvent[eventKey] || {
      CubeModel: "",
      CrossColor: "",
      Custom: {},
    };

  const buildTagPayload = (baseTags = {}) => {
    const t = currentTags || {};
    const payload = { ...(baseTags || {}) };

    if (t.CubeModel) payload.CubeModel = t.CubeModel;
    if (t.CrossColor) payload.CrossColor = t.CrossColor;

    if (t.Custom && Object.keys(t.Custom).length) {
      payload.Custom = { ...(t.Custom || {}) };
    }

    return payload;
  };

  useEffect(() => {
    if (!scrambles[currentEvent]) {
      preloadScrambles(currentEvent);
    }
  }, [currentEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.altKey) return;

      const key = e.key.toUpperCase();
      const bindings = settings.eventKeyBindings;

      for (const [eventCode, combo] of Object.entries(bindings)) {
        const [modifier, boundKey] = combo.split("+");
        if (modifier === "Alt" && boundKey.toUpperCase() === key) {
          setCurrentEvent(eventCode);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.eventKeyBindings]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const loadSolvesForCurrent = async () => {
      try {
        const normalizedEvent = eventKey.toUpperCase();
        const sessionId = currentSession || "main";

        const solves = await getLastNSolvesBySession(
          user.UserID,
          normalizedEvent,
          sessionId,
          200
        );
        const normalizedSolves = solves.map(normalizeSolve);

        setSessions((prev) => ({
          ...prev,
          [eventKey]: normalizedSolves,
        }));
      } catch (err) {
        console.error("Error loading solves for current event/session:", err);
      }
    };

    loadSolvesForCurrent();
  }, [isSignedIn, user?.UserID, eventKey, currentSession]);

  useEffect(() => {
    if (!sharedSession) return;

    const { event, sessionID } = sharedSession;

    setCurrentEvent(event);
    setCurrentSession(sessionID);
    setSharedIndex(0);

    console.log("Loaded Shared Session:", sessionID);
  }, [sharedSession]);

  useEffect(() => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (!isRelay) return;

    const legs = Array.isArray(activeSessionObj?.RelayLegs)
      ? activeSessionObj.RelayLegs
      : [];

    setRelayLegs(legs);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles(legs.map((ev) => generateScramble(ev)));
  }, [currentEvent, currentSession, activeSessionObj]);

  const preloadScrambles = (event) => {
    const newScrambles = Array.from({ length: 10 }, () => generateScramble(event));
    setScrambles((prevScrambles) => ({
      ...prevScrambles,
      [event]: newScrambles,
    }));
  };

  const getNextScramble = () => {
    const ev = currentEvent; // capture
    const nextScramble = (scrambles[ev]?.[0]) || generateScramble(ev);

    setScrambles((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];

      // consume the first scramble
      const rest = arr.length ? arr.slice(1) : [];

      // keep a buffer
      const need = rest.length < 5 ? 10 : 0;
      const refill = need ? Array.from({ length: need }, () => generateScramble(ev)) : [];

      return {
        ...(prev || {}),
        [ev]: [...rest, ...refill],
      };
    });

    return nextScramble;
  };

  const skipToNextScramble = () => {
    const eventScrambles = scrambles[currentEvent] || [];
    setScrambles((prevScrambles) => {
      const updatedScrambles = { ...prevScrambles };
      updatedScrambles[currentEvent] = [
        ...eventScrambles.slice(1),
        generateScramble(currentEvent),
      ];
      return updatedScrambles;
    });
  };

  const resetRelaySet = () => {
    const legs = Array.isArray(relayLegs) ? relayLegs : [];
    if (!legs.length) return;

    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles(legs.map((ev) => generateScramble(ev)));
  };

  const goForwardScramble = () => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.min(i + 1, sharedSession.scrambles.length - 1));
    } else {
      skipToNextScramble();
    }
  };

  const goBackwardScramble = () => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.max(i - 1, 0));
    } else {
      setScrambles((prev) => {
        const arr = prev[currentEvent] || [];
        return {
          ...prev,
          [currentEvent]: [generateScramble(currentEvent), ...arr],
        };
      });
    }
  };

  const normalizeSolve = (item) => {
    const baseTags = item.Tags || {};

    const relayLegsLocal = item.RelayLegs || baseTags.RelayLegs || null;
    const relayScramblesLocal =
      item.RelayScrambles || baseTags.RelayScrambles || null;
    const relayLegTimesLocal = item.RelayLegTimes || baseTags.RelayLegTimes || null;

    const mergedTags =
      relayLegsLocal || relayScramblesLocal || relayLegTimesLocal
        ? {
            ...baseTags,
            IsRelay: baseTags.IsRelay ?? true,
            RelayLegs: relayLegsLocal ?? baseTags.RelayLegs,
            RelayScrambles: relayScramblesLocal ?? baseTags.RelayScrambles,
            RelayLegTimes: relayLegTimesLocal ?? baseTags.RelayLegTimes,
          }
        : baseTags;

    return {
      time: item.Time,
      scramble: item.Scramble,
      event: item.Event,
      penalty: item.Penalty,
      note: item.Note || "",
      datetime: item.DateTime,
      tags: mergedTags,

      relayLegs: relayLegsLocal,
      relayScrambles: relayScramblesLocal,
      relayLegTimes: relayLegTimesLocal,
    };
  };

  const mergeSharedSession = (session) => {
    console.log("Merging shared session:", session);
  };

  const clearPractice = () => {
    setPracticeSolves([]);
  };

  const deletePracticeTime = (index) => {
    setPracticeSolves((prev) => prev.filter((_, i) => i !== index));
  };

  const startPractice = () => {
    setSharedSession(null);
    setSharedIndex(0);

    setActiveSessionObj(null);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles([]);
    setRelayLegs([]);

    setPracticeSaveTargetSession(currentSession || "main");
    setPracticeMode(true);
    clearPractice();
  };

  const requestEndPractice = () => {
    if ((practiceSolves || []).length > 0) {
      setShowPracticeExit(true);
    } else {
      setPracticeMode(false);
      clearPractice();
    }
  };

  const discardPractice = () => {
    setShowPracticeExit(false);
    setPracticeMode(false);
    clearPractice();
  };

  const savePracticeToSession = async () => {
    if (!isSignedIn || !user?.UserID) {
      discardPractice();
      return;
    }

    const targetSessionID = practiceSaveTargetSession || currentSession || "main";
    const ev = String(currentEvent || "").toUpperCase();

    const solvesToSave = [...(practiceSolves || [])];

    try {
      await runDb("Saving practice solves", async () => {
        for (const s of solvesToSave) {
          await addSolveToDB(
            user.UserID,
            targetSessionID,
            ev,
            s.time,
            s.scramble,
            s.penalty ?? null,
            s.note ?? "",
            s.tags ?? {}
          );
        }
      });

      setSessions((prev) => ({
        ...prev,
        [ev]: [...(prev[ev] || []), ...solvesToSave],
      }));

      setShowPracticeExit(false);
      setPracticeMode(false);
      clearPractice();
    } catch (err) {
      console.error("Failed saving practice solves:", err);
    }
  };

  const handleSignUp = async (username, password) => {
    try {
      await runDb("Creating account", async () => {
        await createUser({
          userID: username,
          name: username,
          username: username,
          color: "#0E171D",
          profileEvent: "333",
          profileScramble: generateScramble("333"),
          chosenStats: [],
          headerStats: [],
          wcaid: null,
          cubeCollection: [],
          settings: {
            primaryColor: "#0E171D",
            secondaryColor: "#ffffff",
            timerInput: "Keyboard",
          },
          Friends: [],
        });

        const createSessionPromises = DEFAULT_EVENTS.map((event) =>
          createSession(username, event, "main", "Main Session")
        );
        await Promise.all(createSessionPromises);
      });

      alert("User created successfully!");

      const profile = await getUser(username);
      setUser(profile);
      setIsSignedIn(true);
      setShowSignInPopup(false);
    } catch (error) {
      console.error("Error signing up:", error);
      alert("An error occurred during sign-up.");
    }
  };

  const handleSignIn = async (username, password) => {
    try {
      const profile = await getUser(username);
      if (!profile) return alert("Invalid credentials!");

      const userID = profile.PK?.split("#")[1] || username;

      const posts = await getPosts(userID);
      const userWithData = {
        ...profile,
        UserID: userID,
        Posts: posts,
        Friends: profile.Friends || [],
      };

      const dbTagOptions =
        profile.TagOptions ||
        profile.tagOptions ||
        profile.Settings?.TagOptions ||
        profile.Settings?.tagoptions ||
        null;

      if (dbTagOptions) {
        setTagOptions((prev) => ({
          ...(prev || {}),
          ...(dbTagOptions || {}),
          CubeModels: Array.isArray(dbTagOptions?.CubeModels)
            ? dbTagOptions.CubeModels
            : prev.CubeModels,
          CrossColors: Array.isArray(dbTagOptions?.CrossColors)
            ? dbTagOptions.CrossColors
            : prev.CrossColors,
        }));
      }

      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);

      let sessionItems = await getSessions(userID);
      const eventItems = await getCustomEvents(userID);

      setSessionsList(sessionItems);
      setCustomEvents(eventItems);

      const missingEvents = DEFAULT_EVENTS.filter(
        (event) =>
          !sessionItems.find((s) => s.Event === event && s.SessionID === "main")
      );

      if (missingEvents.length > 0) {
        await runDb("Creating sessions", async () => {
          const createMissing = missingEvents.map((event) =>
            createSession(userID, event, "main", "Main Session")
          );
          await Promise.all(createMissing);
        });

        sessionItems = await getSessions(userID);
        setSessionsList(sessionItems);
      }

      const statsByEvent = {};
      for (const event of DEFAULT_EVENTS) {
        statsByEvent[event] = {};
      }

      for (const session of sessionItems) {
        const ev = (session.Event || "").toUpperCase();
        const sid = session.SessionID || "main";

        if (!statsByEvent[ev]) statsByEvent[ev] = {};
        statsByEvent[ev][sid] = session.Stats || null;
      }

      setSessionStats(statsByEvent);
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };

  const persistTagOptions = async (nextOptions) => {
    if (!isSignedIn || !user?.UserID) return;
    try {
      await runDb("Saving tag options", () =>
        updateUser(user.UserID, { TagOptions: nextOptions })
      );
      setUser((prev) => (prev ? { ...prev, TagOptions: nextOptions } : prev));
    } catch (err) {
      console.error("Failed to persist TagOptions:", err);
    }
  };

  const addSolve = async (newTime, smartMeta = null) => {
    if (practiceMode) {
      const scramble = getNextScramble();
      const timestamp = new Date().toISOString();

      const newSolve = {
        time: newTime,
        scramble,
        event: currentEvent,
        penalty: null,
        note: "",
        datetime: timestamp,
        tags: buildTagPayload({ Practice: true }),
      };

      setPracticeSolves((prev) => [...(prev || []), newSolve]);
      return;
    }

    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY" &&
      Array.isArray(relayLegs) &&
      relayLegs.length > 0;

    if (isRelay) {
      const timestamp = new Date().toISOString();

      const relayTags = buildTagPayload({
        IsRelay: true,
        RelayLegs: relayLegs,
        RelayScrambles: relayScrambles,
      });

      if ((settings?.relayMode || "total") === "legs") {
        const legIdx = relayLegIndex;

        const nextLegTimes = [...relayLegTimes, newTime];
        setRelayLegTimes(nextLegTimes);

        const isLastLeg = legIdx >= relayLegs.length - 1;

        if (!isLastLeg) {
          setRelayLegIndex(legIdx + 1);
          return;
        }

        const totalMs = nextLegTimes.reduce((a, b) => a + b, 0);

        const fullRelayTags = buildTagPayload({
          ...relayTags,
          RelayLegTimes: nextLegTimes,
        });

        const newSolve = {
          time: totalMs,
          scramble: "Relay",
          event: "RELAY",
          penalty: null,
          note: "",
          datetime: timestamp,
          tags: fullRelayTags,
        };

        setSessions((prev) => ({
          ...prev,
          RELAY: [...(prev.RELAY || []), newSolve],
        }));

        if (isSignedIn && user) {
          try {
            await runDb("Saving solve", () =>
              addSolveToDB(
                user.UserID,
                currentSession,
                "RELAY",
                totalMs,
                "Relay",
                null,
                "",
                fullRelayTags
              )
            );
          } catch (err) {
            console.error("Error adding relay solve:", err);
          }
        }

        resetRelaySet();
        return;
      }

      const totalMs = newTime;

      const newSolve = {
        time: totalMs,
        scramble: "Relay",
        event: "RELAY",
        penalty: null,
        note: "",
        datetime: timestamp,
        tags: relayTags,
      };

      setSessions((prev) => ({
        ...prev,
        RELAY: [...(prev.RELAY || []), newSolve],
      }));

      if (isSignedIn && user) {
        try {
          await runDb("Saving solve", () =>
            addSolveToDB(
              user.UserID,
              currentSession,
              "RELAY",
              totalMs,
              "Relay",
              null,
              "",
              relayTags
            )
          );
        } catch (err) {
          console.error("Error adding relay solve:", err);
        }
      }

      resetRelaySet();
      return;
    }

    let scramble;

    let activeSharedID = null;
    let solveIndexForBroadcast = null;

    if (sharedSession) {
      scramble = sharedSession.scrambles[sharedIndex];

      solveIndexForBroadcast = sharedIndex;
      activeSharedID = sharedSession.sharedID;

      const nextIndex = sharedIndex + 1;
      setSharedIndex(nextIndex);

      if (nextIndex >= sharedSession.scrambles.length) {
        console.log("Shared session completed");
        setSharedSession(null);
      }

      setScrambles((prev) => ({
        ...prev,
        [currentEvent]: [...(prev[currentEvent] || [])],
      }));
    } else {
      const consumed = getNextScramble();
      scramble = smartMeta?.scramble ? String(smartMeta.scramble).trim() : consumed;
    }

    const timestamp =
      smartMeta?.endedAtISO ||
      smartMeta?.startedAtISO ||
      new Date().toISOString();

    const smartTagPayload = smartMeta
      ? {
          SmartCube: {
            Source: smartMeta.source || "GAN_CUBE",
            Reason: smartMeta.reason || "",
            StartedAtHostTs: smartMeta.startedAtHostTs ?? null,
            EndedAtHostTs: smartMeta.endedAtHostTs ?? null,
            Moves: smartMeta.moves || [],
            FinalFacelets: smartMeta.finalFacelets || null,
            Splits: smartMeta.splits || null,
          },
        }
      : {};

    const newSolve = {
      time: newTime,
      scramble,
      event: currentEvent,
      penalty: null,
      note: "",
      datetime: timestamp,
      tags: sharedSession
        ? buildTagPayload({
            Shared: true,
            IsShared: true,
            SharedID: sharedSession.sharedID,
            SharedIndex: sharedIndex,
            ...smartTagPayload,
          })
        : buildTagPayload({
            ...smartTagPayload,
          }),
    };

    setSessions((prev) => ({
      ...prev,
      [currentEvent]: [...(prev[currentEvent] || []), newSolve],
    }));

    if (isSignedIn && user) {
      try {
        await runDb("Saving solve", () =>
          addSolveToDB(
            user.UserID,
            currentSession,
            currentEvent,
            newTime,
            scramble,
            null,
            "",
            newSolve.tags
          )
        );
      } catch (err) {
        console.error("Error adding solve (DB write failed):", err);
        return;
      }

      if (activeSharedID) {
        try {
          const messageText = `[sharedUpdate]${activeSharedID}|${solveIndexForBroadcast}|${newTime}|${user.UserID}`;

          const conversationID = activeSharedID
            .replace("SHARED#", "")
            .split("#")
            .slice(0, 2)
            .sort()
            .join("#");
          await sendMessage(conversationID, user.UserID, messageText);

          setSocialRefreshTick((t) => t + 1);
        } catch (err) {
          console.warn("Shared broadcast failed (solve still saved):", err);
        }
      }
    }
  };

  const applyPenalty = async (timestamp, penalty, updatedTime) => {
    if (practiceMode) {
      setPracticeSolves((prev) =>
        (prev || []).map((solve) => {
          if (solve.datetime === timestamp) {
            return {
              ...solve,
              penalty,
              time: updatedTime,
              originalTime: solve.originalTime ?? solve.time,
            };
          }
          return solve;
        })
      );
      return;
    }

    const updatedSessions = { ...sessions };
    const eventSolves = updatedSessions[eventKey] || [];

    const updatedSolves = eventSolves.map((solve) => {
      if (solve.datetime === timestamp) {
        return {
          ...solve,
          penalty,
          time: updatedTime,
          originalTime: solve.originalTime ?? solve.time,
        };
      }
      return solve;
    });

    updatedSessions[eventKey] = updatedSolves;
    setSessions(updatedSessions);

    if (isSignedIn && user?.UserID) {
      try {
        await runDb("Updating solve", () =>
          updateSolve(user.UserID, timestamp, {
            Penalty: penalty,
            Time: updatedTime,
            OriginalTime: updatedSolves.find((s) => s.datetime === timestamp)
              ?.originalTime,
          })
        );
      } catch (err) {
        console.error("Failed to update DynamoDB penalty:", err);
      }
    }
  };

  const deleteTime = async (eventKeyParam, solveOrIndex) => {
    const ev = eventKeyParam;

    let datetimeToDelete = null;

    if (typeof solveOrIndex === "string") {
      datetimeToDelete = solveOrIndex;
    } else if (typeof solveOrIndex === "number") {
      const s = sessions?.[ev]?.[solveOrIndex];
      datetimeToDelete = s?.datetime;
    } else if (solveOrIndex && typeof solveOrIndex === "object") {
      datetimeToDelete = solveOrIndex.datetime;
    }

    if (!datetimeToDelete) return;

    setSessions((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      return {
        ...(prev || {}),
        [ev]: arr.filter((s) => s?.datetime !== datetimeToDelete),
      };
    });

    if (isSignedIn && user) {
      try {
        await runDb("Deleting solve", () => deleteSolve(user.UserID, datetimeToDelete));
      } catch (err) {
        alert("Failed to delete solve");
        console.error(err);
      }
    }
  };

  const addPost = async ({ note, event, solveList = [], comments = [] }) => {
    if (!user) return;

    try {
      await runDb("Creating post", () =>
        createPost(user.UserID, note, event, solveList, comments)
      );
      const posts = await getPosts(user.UserID);
      setUser((prev) => ({
        ...prev,
        Posts: posts,
      }));
    } catch (err) {
      console.error("Error adding post:", err);
    }
  };

  const deletePost = async (timestamp) => {
    if (!user) return;

    try {
      await runDb("Deleting post", () => deletePostFromDB(user.UserID, timestamp));
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  const handleUpdateComments = async (timestamp, comments) => {
    if (!user) return;
    try {
      await runDb("Updating comments", () =>
        updatePostComments(user.UserID, timestamp, comments)
      );
      const fresh = await getPosts(user.UserID);
      setUser((prev) => ({ ...prev, Posts: fresh }));
    } catch (err) {
      console.error("Error updating comments:", err);
    }
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    setCurrentSession("main");
    setSharedSession(null);
    setSharedIndex(0);

    setActiveSessionObj(null);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles([]);
    setRelayLegs([]);
  };

  const onScrambleClick = () => {
    const scrambleText = scrambles[currentEvent]?.[0] || "";
    if (scrambleText) {
      navigator.clipboard
        .writeText(scrambleText)
        .then(() => {
          alert("Scramble copied to clipboard!");
        })
        .catch((error) => {
          console.error("Failed to copy scramble: ", error);
          alert("Failed to copy scramble.");
        });
    } else {
      alert("No scramble available to copy.");
    }
  };

  const handleShowSignInPopup = () => setShowSignInPopup(true);
  const handleCloseSignInPopup = () => setShowSignInPopup(false);

  const openEventSelector = () => {
    const el = document.querySelector(".event-selector-trigger");
    if (el) {
      try {
        el.click();
      } catch (_) {}
    }
  };

  const currentSolves = practiceMode ? practiceSolves || [] : sessions[eventKey] || [];
  const solvesSourceForDetail = practiceMode
    ? practiceSolves || []
    : sessions[eventKey] || [];

  // (you compute averages but don’t use them directly here — leaving as-is)
  const avgOfFive = calculateAverage(
    currentSolves.slice(-5).map((s) => s.time),
    true
  ).average;
  const avgOfTwelve =
    calculateAverage(
      currentSolves.slice(-12).map((s) => s.time),
      true
    ).average || "N/A";
  const bestAvgOfFive = calculateBestAverageOfFive(
    currentSolves.map((s) => s.time)
  );
  const bestAvgOfTwelve =
    currentSolves.length >= 12
      ? Math.min(
          ...currentSolves.map((_, i) =>
            i + 12 <= currentSolves.length
              ? calculateAverage(
                  currentSolves.slice(i, i + 12).map((s) => s.time),
                  true
                ).average
              : Infinity
          )
        )
      : "N/A";

  return (
    <div className={`App ${!isHomePage ? "music-player-mode" : ""}`}>
      <div
        className={`navAndPage ${
          isHomePage || !showPlayerBar ? "fullHeight" : "reducedHeight"
        }`}
      >
        <Navigation
          handleSignIn={handleShowSignInPopup}
          isSignedIn={isSignedIn}
          handleSettingsClick={() => setShowSettingsPopup(true)}
          name={user?.Name || ""}
          dbStatus={dbStatus}
        />

        <div className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="scramble-select-container">
                    <div className="left-slot-auth">
                      <NameTag
                        isSignedIn={isSignedIn}
                        user={user}
                        handleSignIn={handleShowSignInPopup}
                      />
                    </div>

                    <div className="scrambleRelayContainer">
                      <Scramble
                        scramble={displayedScramble}
                        currentEvent={displayedSvgEvent}
                        onScrambleClick={onScrambleClick}
                        onForwardScramble={goForwardScramble}
                        onBackwardScramble={goBackwardScramble}
                        scrambleProgress={scrambleProgress}
                        scrambleProgressTotal={scrambleProgressTotal}
                      />

                      {isRelayActive && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          {relayLegs.map((ev, idx) => {
                            const done = idx < relayLegTimes.length;
                            const active = idx === relayLegIndex;
                            return (
                              <button
                                key={`${ev}-${idx}`}
                                type="button"
                                onClick={() => setRelayLegIndex(idx)}
                                style={{
                                  background: active ? "#2EC4B6" : "#3D3D3D",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "6px 10px",
                                  cursor: "pointer",
                                  opacity: done ? 1 : 0.85,
                                  fontWeight: done ? 700 : 500,
                                }}
                              >
                                {ev}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="cube-and-event">
                      <div
                        className="puzzle-hud"
                        onClick={openEventSelector}
                        style={{ cursor: "pointer" }}
                      >
                        <PuzzleSVG
                          event={displayedSvgEvent}
                          scramble={displayedScramble}
                          isMusicPlayer={!isHomePage}
                          isTimerCube={true}
                        />
                      </div>

                      <div className="event-hud">
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            width: "100%",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              justifyContent: "center",
                              width: "100%",
                            }}
                          >
                            <EventSelector
                              currentEvent={currentEvent}
                              handleEventChange={handleEventChange}
                              currentSession={currentSession}
                              setCurrentSession={setCurrentSession}
                              sessions={sessionsList}
                              customEvents={customEvents}
                              userID={user?.UserID}
                              onSessionChange={() => {
                                setSharedSession(null);
                                setSharedIndex(0);

                                setRelayLegIndex(0);
                                setRelayLegTimes([]);
                                setRelayScrambles([]);
                                setRelayLegs([]);
                              }}
                              onSelectSessionObj={(sessionObj) => {
                                setActiveSessionObj(sessionObj);
                              }}
                            />

                            <div
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "8px",
                                userSelect: "none",
                              }}
                            >
                              <span style={{ fontSize: "12px", opacity: 0.85 }}>
                                Practice
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  if (!practiceMode) startPractice();
                                  else requestEndPractice();
                                }}
                                style={{
                                  width: "44px",
                                  height: "24px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(255,255,255,0.25)",
                                  background: practiceMode
                                    ? "#2EC4B6"
                                    : "rgba(255,255,255,0.12)",
                                  position: "relative",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                                aria-pressed={practiceMode}
                                title={practiceMode ? "End Practice" : "Start Practice"}
                              >
                                <div
                                  style={{
                                    width: "20px",
                                    height: "20px",
                                    borderRadius: "999px",
                                    background: "white",
                                    position: "absolute",
                                    top: "1px",
                                    left: practiceMode ? "22px" : "2px",
                                    transition: "left 140ms ease",
                                  }}
                                />
                              </button>
                            </div>
                          </div>

                          <div
                            style={{
                              position: "absolute",
                              top: "52px",
                              right: "0px",
                              left: "10px",
                              display: "flex",
                              pointerEvents: "auto",
                            }}
                          >
                            <TagBarInline
                              tags={currentTags}
                              onChange={(next) =>
                                setTagsByEvent((prev) => ({
                                  ...(prev || {}),
                                  [eventKey]: next,
                                }))
                              }
                              tagOptions={tagOptions}
                              onTagOptionsChange={(nextOptions) => {
                                setTagOptions(nextOptions);
                                persistTagOptions(nextOptions);
                              }}
                            />
                            <img src={tagIcon} alt="tagIcon" className="tagIcon" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Timer addTime={addSolve} activeScramble={displayedScramble} />

                  <AveragesDisplay
                    currentSolves={currentSolves}
                    setSelectedAverageSolves={setSelectedAverageSolves}
                  />

                  <TimeList
                    user={user}
                    applyPenalty={applyPenalty}
                    solves={currentSolves}
                    deleteTime={(index) =>
                      practiceMode
                        ? deletePracticeTime(index)
                        : deleteTime(eventKey, index)
                    }
                    addPost={addPost}
                    rowsToShow={3}
                    onAverageClick={(solveArray) => {
                      setSelectedAverageSolves(solveArray);
                      setSelectedAverageIndex(0);
                    }}
                    setSessions={setSessions}
                    sessionsList={sessionsList}
                    currentEvent={currentEvent}
                    currentSession={currentSession}
                    eventKey={eventKey}
                    practiceMode={practiceMode}

                    
                  />

                  {selectedAverageSolves.length > 0 && (
                    <Detail
                      solve={selectedAverageSolves[selectedAverageIndex]}
                      onClose={() => {
                        setSelectedAverageSolves([]);
                        setSelectedAverageIndex(0);
                      }}
                      deleteTime={() => {
                        const idx = solvesSourceForDetail.indexOf(
                          selectedAverageSolves[selectedAverageIndex]
                        );
                        if (idx < 0) return;

                        if (practiceMode) {
                          deletePracticeTime(idx);
                        } else {
                          deleteTime(eventKey, idx);
                        }
                      }}
                      addPost={addPost}
                      showNavButtons={true}
                      onPrev={() => setSelectedAverageIndex((i) => Math.max(0, i - 1))}
                      onNext={() =>
                        setSelectedAverageIndex((i) =>
                          Math.min(selectedAverageSolves.length - 1, i + 1)
                        )
                      }
                      applyPenalty={applyPenalty}
                      userID={user?.UserID}
                      setSessions={setSessions}
                    />
                  )}
                </>
              }
            />

            <Route
              path="/profile"
              element={
                <Profile
                  user={user}
                  setUser={setUser}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  sessions={sessions}
                />
              }
            />

            <Route
              path="/profile/:userID"
              element={
                <Profile
                  user={user}
                  setUser={setUser}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  sessions={sessions}
                />
              }
            />

            <Route
              path="/stats"
              element={
                <Stats
                  sessions={sessions}
                  sessionStats={sessionStats}
                  sessionsList={sessionsList}
                  setSessions={setSessions}
                  currentEvent={currentEvent}
                  currentSession={currentSession}
                  user={user}
                  deleteTime={(eventKeyParam, index) =>
                    deleteTime(eventKeyParam, index)
                  }
                  addPost={addPost}
                />
              }
            />

            <Route
              path="/social"
              element={
                <Social
                  user={user}
                  addPost={addPost}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  setSharedSession={setSharedSession}
                  mergeSharedSession={mergeSharedSession}
                  refreshTick={socialRefreshTick}
                />
              }
            />
          </Routes>
        </div>
      </div>

      {!isHomePage && showPlayerBar && (
        <PlayerBar
          sessions={sessions}
          currentEvent={currentEvent}
          currentSession={currentSession}
          setCurrentSession={setCurrentSession}
          sharedSession={sharedSession}
          clearSharedSession={() => setSharedSession(null)}
          sessionsList={sessionsList}
          customEvents={customEvents}
          handleEventChange={handleEventChange}
          deleteTime={deleteTime}
          addTime={addSolve}
          scramble={displayedScramble}
          onScrambleClick={onScrambleClick}
          goForwardScramble={goForwardScramble}
          goBackwardScramble={goBackwardScramble}
          addPost={addPost}
          user={user}
          applyPenalty={applyPenalty}
        />
      )}

      {!isHomePage && (
        <div className="toggle-bar">
          {showPlayerBar ? (
            <button className="toggle-button" onClick={() => setShowPlayerBar(false)}>
              &#x25BC;
            </button>
          ) : (
            <button className="toggle-button" onClick={() => setShowPlayerBar(true)}>
              &#x25B2;
            </button>
          )}
        </div>
      )}

      {showSignInPopup && (
        <SignInPopup
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onClose={handleCloseSignInPopup}
        />
      )}

      {showSettingsPopup && (
        <Settings
          userID={user?.UserID}
          onClose={() => setShowSettingsPopup(false)}
          onProfileUpdate={(fresh) => setUser((prev) => ({ ...prev, ...fresh }))}
        />
      )}

      {showPracticeExit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onMouseDown={() => setShowPracticeExit(false)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "420px",
              maxWidth: "92vw",
              background: "#181F23",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "14px",
              padding: "16px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px" }}>
              Save practice solves?
            </div>

            <div style={{ fontSize: "13px", opacity: 0.85, marginBottom: "12px" }}>
              You have <b>{practiceSolves.length}</b> practice solves. Save them to a
              session, or discard them.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <div style={{ fontSize: "12px", opacity: 0.8, width: "70px" }}>
                Save to
              </div>

              <select
                value={practiceSaveTargetSession}
                onChange={(e) => setPracticeSaveTargetSession(e.target.value)}
                style={{
                  flex: 1,
                  height: "34px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(0,0,0,0.2)",
                  color: "white",
                  padding: "0 10px",
                  outline: "none",
                }}
              >
                {(sessionsList || [])
                  .filter(
                    (s) =>
                      String(s.Event || "").toUpperCase() ===
                      String(currentEvent || "").toUpperCase()
                  )
                  .map((s) => (
                    <option
                      key={`${s.SessionID}-${s.SessionName || ""}`}
                      value={s.SessionID}
                    >
                      {s.SessionName || s.SessionID}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={discardPractice}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "white",
                  cursor: "pointer",
                  opacity: 0.9,
                }}
              >
                Don’t Save
              </button>

              <button
                type="button"
                onClick={savePracticeToSession}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2EC4B6",
                  color: "#0E171D",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;