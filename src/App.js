import React, { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import AveragesDisplay from "./components/AveragesDisplay/AveragesDisplay";
import AverageDetailModal from "./components/Detail/AverageDetailModal";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import Navigation from "./components/Navigation/Navigation";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import HomeStatsOverlay from "./components/HomeStats/HomeStatsOverlay";
import EventSelector from "./components/EventSelector";
import Scramble from "./components/Scramble/Scramble";
import PuzzleSVG from "./components/PuzzleSVGs/PuzzleSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import NameTag from "./components/Profile/NameTag";
import Detail from "./components/Detail/Detail";
import SharePostModal from "./components/Social/SharePostModal";
import { useSettings } from "./contexts/SettingsContext";
import { generateScramble } from "./components/scrambleUtils";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { getUser } from "./services/getUser";
import { updateUser } from "./services/updateUser";
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
import { updateSolvePenalty } from "./services/updateSolvePenalty";
import { getSolveWindowFromStart } from "./services/getSolveWindow";
import { sendMessage } from "./services/sendMessage";
import { setGanCurrentScramble } from "./smart/ganScrambleProgress";

import tagIcon from "./assets/ptstag.svg";

import { DEFAULT_EVENTS } from "./defaultEvents";
import {
  calculateBestAverageOfFive,
  calculateAverage,
} from "./components/TimeList/TimeUtils";

/* -------------------------------------------------------------------------- */
/*                               TAG CONFIG HELPERS                           */
/* -------------------------------------------------------------------------- */
const DEFAULT_TAG_CONFIG = {
  Fixed: {
    CubeModel: { label: "Cube Model", options: [] },
    CrossColor: {
      label: "Cross Color",
      options: ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
    },
    TimerInput: {
      label: "Timer Input",
      options: ["Keyboard", "Type", "Stackmat", "GAN Bluetooth", "GAN Cube"],
    },
    SolveSource: {
      label: "Solve Source",
      options: ["Standard", "Practice", "Shared", "Relay", "Import", "SmartCube", "WCA"],
    },
  },
  CustomSlots: [
    { slot: "Custom1", label: "", options: [] },
    { slot: "Custom2", label: "", options: [] },
    { slot: "Custom3", label: "", options: [] },
    { slot: "Custom4", label: "", options: [] },
    { slot: "Custom5", label: "", options: [] },
  ],
};

const INITIAL_SESSIONS = {
  "222": [],
  "333": [],
  "444": [],
  "555": [],
  "666": [],
  "777": [],
  "333OH": [],
  "333BLD": [],
  RELAY: [],
};

function normalizeTagConfig(input) {
  const cfg = input && typeof input === "object" ? input : {};
  const fixed = cfg.Fixed || {};
  const customSlots = Array.isArray(cfg.CustomSlots) ? cfg.CustomSlots : [];

  return {
    Fixed: {
      CubeModel: {
        label: fixed?.CubeModel?.label || "Cube Model",
        options: Array.isArray(fixed?.CubeModel?.options) ? fixed.CubeModel.options : [],
      },
      CrossColor: {
        label: fixed?.CrossColor?.label || "Cross Color",
        options: Array.isArray(fixed?.CrossColor?.options)
          ? fixed.CrossColor.options
          : ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
      },
      TimerInput: {
        label: fixed?.TimerInput?.label || "Timer Input",
        options: Array.isArray(fixed?.TimerInput?.options)
          ? fixed.TimerInput.options
          : ["Keyboard", "Type", "Stackmat", "GAN Bluetooth", "GAN Cube"],
      },
      SolveSource: {
        label: fixed?.SolveSource?.label || "Solve Source",
        options: Array.isArray(fixed?.SolveSource?.options)
          ? fixed.SolveSource.options
          : ["Standard", "Practice", "Shared", "Relay", "Import", "SmartCube", "WCA"],
      },
    },
    CustomSlots: Array.from({ length: 5 }, (_, i) => {
      const existing = customSlots[i] || {};
      return {
        slot: `Custom${i + 1}`,
        label: existing?.label || "",
        options: Array.isArray(existing?.options) ? existing.options : [],
      };
    }),
  };
}

function makeEmptyTagSelection() {
  return {
    CubeModel: "",
    CrossColor: "",
    Custom1: "",
    Custom2: "",
    Custom3: "",
    Custom4: "",
    Custom5: "",
  };
}

/* -------------------------------------------------------------------------- */
/*                         SMART-CUBE SCRAMBLE HELPERS                         */
/* -------------------------------------------------------------------------- */
function expandScrambleToSteps(scramble) {
  const tokens = String(scramble || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const steps = [];

  for (const tok of tokens) {
    const t = String(tok).trim();
    if (!t) continue;

    if (t.endsWith("2")) {
      const base = t.slice(0, -1);
      if (base) {
        steps.push(base);
        steps.push(base);
      } else {
        steps.push(t);
      }
    } else {
      steps.push(t);
    }
  }

  return steps;
}

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
function TagBarInline({ tags, onChange, tagConfig, cubeModelOptions = [] }) {
  const wrapRef = useRef(null);
  const safeTags = tags || makeEmptyTagSelection();
  const cfg = useMemo(() => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG), [tagConfig]);

  const [addingCube, setAddingCube] = useState(false);
  const [addingCross, setAddingCross] = useState(false);
  const [newCube, setNewCube] = useState("");
  const [newCross, setNewCross] = useState("");
  const [localCubeOptions, setLocalCubeOptions] = useState([]);
  const highestFilledCustomIndex = useMemo(() => {
    for (let i = 4; i >= 0; i--) {
      const slot = `Custom${i + 1}`;
      if (String(safeTags?.[slot] || "").trim()) return i;
    }
    return -1;
  }, [safeTags]);
  const [visibleCustomCount, setVisibleCustomCount] = useState(() =>
    Math.max(1, Math.min(5, highestFilledCustomIndex + 2))
  );

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
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const required = Math.max(1, Math.min(5, highestFilledCustomIndex + 2));
    setVisibleCustomCount((prev) => (prev < required ? required : prev));
  }, [highestFilledCustomIndex]);

  const setField = (field, value) => {
    const v = String(value ?? "").trim();
    if (field === "CubeModel" && v) {
      setLocalCubeOptions((prev) => (prev.includes(v) ? prev : [...prev, v]));
    }
    const next = { ...(safeTags || {}) };
    next[field] = v;
    onChange?.(next);
  };

  const cubeOptionsBase = Array.isArray(cfg?.Fixed?.CubeModel?.options)
    ? cfg.Fixed.CubeModel.options
    : [];
  const crossOptionsBase = Array.isArray(cfg?.Fixed?.CrossColor?.options)
    ? cfg.Fixed.CrossColor.options
    : [];

  const cubeOptions = Array.from(
    new Set(
      [
        ...cubeOptionsBase,
        ...(Array.isArray(cubeModelOptions) ? cubeModelOptions : []),
        ...localCubeOptions,
        safeTags?.CubeModel || "",
      ].filter(Boolean)
    )
  );

  const crossOptions = safeTags?.CrossColor
    ? Array.from(new Set([safeTags.CrossColor, ...crossOptionsBase]))
    : crossOptionsBase;

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
    setLocalCubeOptions((prev) => (prev.includes(v) ? prev : [...prev, v]));
    onChange?.({
      ...(safeTags || {}),
      CubeModel: v,
    });
    setNewCube("");
    setAddingCube(false);
  };

  const addCrossOption = () => {
    const v = String(newCross ?? "").trim();
    if (!v) return;
    onChange?.({
      ...(safeTags || {}),
      CrossColor: v,
    });
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
          <option value="">{cfg.Fixed.CubeModel.label || "Cube Model"}</option>
          {cubeOptions.map((opt) => (
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
            <button type="button" style={addBtnStyle} onClick={() => setAddingCube(false)}>
              Cancel
            </button>
          </>
        )}
      </div>

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
          <option value="">{cfg.Fixed.CrossColor.label || "Cross Color"}</option>
          {crossOptions.map((opt) => (
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
            <button type="button" style={addBtnStyle} onClick={() => setAddingCross(false)}>
              Cancel
            </button>
          </>
        )}
      </div>

      {(cfg.CustomSlots || []).slice(0, visibleCustomCount).map((slot) => (
        <input
          key={slot.slot}
          style={inputStyle}
          value={safeTags?.[slot.slot] || ""}
          onChange={(e) => setField(slot.slot, e.target.value)}
          placeholder={slot.label || ""}
          onKeyDownCapture={stopKeys}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ))}

      {visibleCustomCount < 5 && (
        <button
          type="button"
          style={addBtnStyle}
          onClick={() => setVisibleCustomCount((prev) => Math.min(5, prev + 1))}
        >
          + Add Custom
        </button>
      )}
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === "/";
  const { settings, updateSettings, setAllSettings } = useSettings();

  const [sessionsList, setSessionsList] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);
  const [currentSession, setCurrentSession] = useState("main");
  const [currentEvent, setCurrentEvent] = useState("333");
  const [sessionStats, setSessionStats] = useState({});
  const [statsMutationTick, setStatsMutationTick] = useState(0);

  const [scrambles, setScrambles] = useState({});
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [showPlayerBar, setShowPlayerBar] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [statsSettingsContext, setStatsSettingsContext] = useState({
    eventLabel: currentEvent || "333",
    sessionLabel: currentSession || "main",
    isAllEventsMode: false,
    canRecomputeOverall: false,
    canImport: false,
    loadingOverallStats: false,
    recomputeStatusText: "",
    importBusy: false,
    isStatsRouteActive: false,
  });
  const [statsRecomputeRequest, setStatsRecomputeRequest] = useState(0);
  const [statsImportRequest, setStatsImportRequest] = useState(0);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState([]);
  const [selectedAverageSolve, setSelectedAverageSolve] = useState(null);
  const [sharedSession, setSharedSession] = useState(null);
  const [sharedIndex, setSharedIndex] = useState(0);
  const [shareComposer, setShareComposer] = useState({
    isOpen: false,
    post: null,
    caption: "",
    isSubmitting: false,
    error: "",
  });
  const shareComposerResolveRef = useRef(null);

  const [socialRefreshTick, setSocialRefreshTick] = useState(0);

  const [activeSessionObj, setActiveSessionObj] = useState(null);
  const [relayLegIndex, setRelayLegIndex] = useState(0);
  const [relayLegTimes, setRelayLegTimes] = useState([]);
  const [relayScrambles, setRelayScrambles] = useState([]);
  const [relayLegs, setRelayLegs] = useState([]);

  const [tagsByEvent, setTagsByEvent] = useState({});
  const [tagConfig, setTagConfig] = useState(DEFAULT_TAG_CONFIG);

  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceSolves, setPracticeSolves] = useState([]);
  const [showPracticeExit, setShowPracticeExit] = useState(false);
  const [practiceSaveTargetSession, setPracticeSaveTargetSession] = useState("main");

  const [scrambleProgress, setScrambleProgress] = useState(0);
  const [scrambleProgressTotal, setScrambleProgressTotal] = useState(0);

  const [dbStatus, setDbStatus] = useState({
    phase: "idle",
    op: "",
    tick: 0,
  });

  const dbSuccessTimeoutRef = useRef(null);
  const dbErrorTimeoutRef = useRef(null);

  const settingsAutosaveTimeoutRef = useRef(null);
  const lastSavedSettingsJsonRef = useRef("");
  const skipNextSettingsAutosaveRef = useRef(false);

  const setDbPhase = (phase, op = "") => {
    setDbStatus((prev) => ({
      phase,
      op,
      tick: (prev.tick || 0) + 1,
    }));
  };

  const runDb = async (opLabel, fn, options = {}) => {
    const showStatus = options?.showStatus !== false;

    try {
      if (showStatus) {
        if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
        if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);

        setDbPhase("loading", opLabel);
      }

      const res = await fn();

      if (showStatus) {
        setDbPhase("success", opLabel);
        dbSuccessTimeoutRef.current = setTimeout(() => {
          setDbPhase("idle", "");
        }, 900);
      }

      return res;
    } catch (err) {
      console.error(`DB op failed (${opLabel}):`, err);

      if (showStatus) {
        setDbPhase("error", opLabel);
        dbErrorTimeoutRef.current = setTimeout(() => {
          setDbPhase("idle", "");
        }, 1400);
      }

      throw err;
    }
  };

  useEffect(() => {
    return () => {
      if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
      if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);
      if (settingsAutosaveTimeoutRef.current) clearTimeout(settingsAutosaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    if (settings.lastEvent !== currentEvent) {
      updateSettings({ lastEvent: currentEvent });
    }
  }, [currentEvent, settings.lastEvent, updateSettings, isSignedIn, user?.UserID]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    if (settings.showPlayerBar !== showPlayerBar) {
      updateSettings({ showPlayerBar });
    }
  }, [showPlayerBar, settings.showPlayerBar, updateSettings, isSignedIn, user?.UserID]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const existing = settings.lastSessionByEvent || {};
    const currentSaved = existing[currentEvent];

    if ((currentSaved || "main") !== (currentSession || "main")) {
      updateSettings({
        lastSessionByEvent: {
          ...existing,
          [currentEvent]: currentSession || "main",
        },
      });
    }
  }, [
    currentEvent,
    currentSession,
    settings.lastSessionByEvent,
    updateSettings,
    isSignedIn,
    user?.UserID,
  ]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const settingsJson = JSON.stringify(settings || {});

    if (skipNextSettingsAutosaveRef.current) {
      lastSavedSettingsJsonRef.current = settingsJson;
      skipNextSettingsAutosaveRef.current = false;
      return;
    }

    if (settingsJson === lastSavedSettingsJsonRef.current) return;

    if (settingsAutosaveTimeoutRef.current) {
      clearTimeout(settingsAutosaveTimeoutRef.current);
    }

    settingsAutosaveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateUser(user.UserID, {
          Settings: settings,
        });
        lastSavedSettingsJsonRef.current = JSON.stringify(settings || {});
      } catch (err) {
        console.error("Failed to autosave settings:", err);
      }
    }, 500);

    return () => {
      if (settingsAutosaveTimeoutRef.current) {
        clearTimeout(settingsAutosaveTimeoutRef.current);
      }
    };
  }, [settings, isSignedIn, user?.UserID]);

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
  const sharedCurrentEvent = sharedSession
    ? sharedSession.events?.[sharedIndex] || sharedSession.event || currentEvent
    : null;

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
    return sharedSession
      ? sharedCurrentEvent || currentEvent
      : isRelayActive
      ? relayCurrentEvent
      : currentEvent;
  }, [sharedCurrentEvent, sharedSession, isRelayActive, relayCurrentEvent, currentEvent]);

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
  }, [displayedScramble]);

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

  const currentTags = tagsByEvent[eventKey] || makeEmptyTagSelection();

  const buildTagPayload = (baseTags = {}) => {
    const t = currentTags || makeEmptyTagSelection();
    const payload = { ...(baseTags || {}) };

    if (t.CubeModel) payload.CubeModel = t.CubeModel;
    if (t.CrossColor) payload.CrossColor = t.CrossColor;

    payload.TimerInput = settings.timerInput || "Keyboard";

    if (t.Custom1) payload.Custom1 = t.Custom1;
    if (t.Custom2) payload.Custom2 = t.Custom2;
    if (t.Custom3) payload.Custom3 = t.Custom3;
    if (t.Custom4) payload.Custom4 = t.Custom4;
    if (t.Custom5) payload.Custom5 = t.Custom5;

    if (!payload.SolveSource) {
      if (payload.IsShared || payload.Shared) payload.SolveSource = "Shared";
      else if (payload.IsRelay) payload.SolveSource = "Relay";
      else if (payload.SmartCube) payload.SolveSource = "SmartCube";
      else payload.SolveSource = "Standard";
    }

    return payload;
  };

  useEffect(() => {
    if (!scrambles[currentEvent]) {
      preloadScrambles(currentEvent);
    }
  }, [currentEvent]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.altKey) return;

      const key = e.key.toUpperCase();
      const bindings = settings.eventKeyBindings || {};

      for (const [eventCode, combo] of Object.entries(bindings)) {
        const parts = String(combo || "").split("+");
        const modifier = parts[0];
        const boundKey = parts[1] || "";
        if (modifier === "Alt" && boundKey.toUpperCase() === key) {
          const savedSession = settings.lastSessionByEvent?.[eventCode] || "main";
          setCurrentEvent(eventCode);
          setCurrentSession(savedSession);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.eventKeyBindings, settings.lastSessionByEvent]);

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

    setSharedIndex(0);
  }, [sharedSession]);

  useEffect(() => {
    if (!sharedSession) return;

    const { sessionID } = sharedSession;
    const nextSharedEvent =
      sharedSession.events?.[sharedIndex] || sharedSession.event || "333";

    setCurrentEvent(nextSharedEvent);
    setCurrentSession(sessionID);
    setShowPlayerBar(true);

    console.log("Loaded Shared Session:", sessionID);
  }, [sharedIndex, sharedSession]);

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
    const ev = currentEvent;
    const nextScramble = scrambles[ev]?.[0] || generateScramble(ev);

    setScrambles((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      const rest = arr.length ? arr.slice(1) : [];
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

  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeSolve = (item) => {
    const baseTags = item?.Tags || {};

    const relayLegsLocal = item?.RelayLegs || baseTags?.RelayLegs || null;
    const relayScramblesLocal =
      item?.RelayScrambles || baseTags?.RelayScrambles || null;
    const relayLegTimesLocal =
      item?.RelayLegTimes || baseTags?.RelayLegTimes || null;

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

    const isDNF =
      item?.IsDNF === true || item?.isDNF === true || item?.Penalty === "DNF" || item?.penalty === "DNF";
    const rawTimeMs = toFiniteNumber(
      item?.RawTimeMs ??
        item?.rawTimeMs ??
        item?.Time ??
        item?.time ??
        item?.ms ??
        item?.OriginalTime ??
        item?.originalTime
    );
    const explicitFinal = toFiniteNumber(item?.FinalTimeMs ?? item?.finalTimeMs);
    const finalTimeMs = isDNF
      ? null
      : explicitFinal !== null
      ? explicitFinal
      : rawTimeMs;

    return {
      solveRef: item?.SK || null,
      createdAt: item?.CreatedAt || null,

      time: isDNF ? Number.MAX_SAFE_INTEGER : finalTimeMs,
      rawTimeMs,
      finalTimeMs,
      isDNF,

      scramble: item?.Scramble || "",
      event: item?.Event || "",
      penalty: item?.Penalty ?? null,
      note: item?.Note || "",
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
      const savedSolves = await runDb("Saving practice solves", async () => {
        const out = [];

        for (const s of solvesToSave) {
          const res = await addSolveToDB(user.UserID, {
            event: ev,
            sessionID: targetSessionID,
            rawTimeMs: s.rawTimeMs ?? s.time,
            penalty: s.penalty ?? null,
            scramble: s.scramble ?? "",
            note: s.note ?? "",
            createdAt: s.createdAt ?? new Date().toISOString(),
            tags: s.tags ?? {},
          });

          if (res?.item) out.push(normalizeSolve(res.item));
        }

        return out;
      });

      setSessions((prev) => ({
        ...prev,
        [ev]: [...(prev[ev] || []), ...(savedSolves || [])],
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
          settings: {},
          tagConfig: DEFAULT_TAG_CONFIG,
          Friends: [],
        });

        const createSessionPromises = DEFAULT_EVENTS.map((event) =>
          createSession(username, event, "main", "Main Session")
        );
        await Promise.all(createSessionPromises);
      });

      alert("User created successfully!");

      const profile = await getUser(username);
      const userID = profile?.PK?.split("#")[1] || username;

      skipNextSettingsAutosaveRef.current = true;
      setAllSettings(profile?.Settings && typeof profile.Settings === "object" ? profile.Settings : {});
      lastSavedSettingsJsonRef.current = JSON.stringify(
        profile?.Settings && typeof profile.Settings === "object" ? profile.Settings : {}
      );

      setTagConfig(normalizeTagConfig(profile?.TagConfig));

      setUser({
        ...profile,
        UserID: userID,
      });
      setIsSignedIn(true);
      setShowSignInPopup(false);

      setCurrentEvent(profile?.Settings?.lastEvent || "333");
      setCurrentSession(
        profile?.Settings?.lastSessionByEvent?.[profile?.Settings?.lastEvent || "333"] ||
          "main"
      );
      setShowPlayerBar(
        typeof profile?.Settings?.showPlayerBar === "boolean"
          ? profile.Settings.showPlayerBar
          : true
      );
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

      skipNextSettingsAutosaveRef.current = true;
      setAllSettings(profile?.Settings && typeof profile.Settings === "object" ? profile.Settings : {});
      lastSavedSettingsJsonRef.current = JSON.stringify(
        profile?.Settings && typeof profile.Settings === "object" ? profile.Settings : {}
      );

      setTagConfig(normalizeTagConfig(profile?.TagConfig));

      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);

      let sessionItems = await getSessions(userID);
      const eventItems = await getCustomEvents(userID);

      setSessionsList(sessionItems);
      setCustomEvents(eventItems);

      const restoredEvent =
        profile?.Settings?.lastEvent && String(profile.Settings.lastEvent).trim()
          ? profile.Settings.lastEvent
          : "333";

      const restoredSession =
        profile?.Settings?.lastSessionByEvent?.[restoredEvent] || "main";

      setCurrentEvent(restoredEvent);
      setCurrentSession(restoredSession);

      if (typeof profile?.Settings?.showPlayerBar === "boolean") {
        setShowPlayerBar(profile.Settings.showPlayerBar);
      } else {
        setShowPlayerBar(true);
      }

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

  const addSolve = async (newTime, smartMeta = null) => {
    const createPendingSolve = ({
      createdAt,
      time,
      scramble,
      event,
      tags,
      note = "",
      penalty = null,
    }) => ({
      solveRef: `PENDING#${createdAt}#${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
      time,
      rawTimeMs: time,
      finalTimeMs: time,
      isDNF: penalty === "DNF",
      scramble,
      event,
      penalty,
      note,
      tags,
    });

    const appendPendingSolve = (ev, pendingSolve) => {
      setSessions((prev) => ({
        ...prev,
        [ev]: [...(prev[ev] || []), pendingSolve],
      }));
    };

    const replacePendingSolve = (ev, pendingRef, savedSolve) => {
      setSessions((prev) => ({
        ...prev,
        [ev]: (prev[ev] || []).map((s) => (s.solveRef === pendingRef ? savedSolve : s)),
      }));
    };

    const removePendingSolve = (ev, pendingRef) => {
      setSessions((prev) => ({
        ...prev,
        [ev]: (prev[ev] || []).filter((s) => s.solveRef !== pendingRef),
      }));
    };

    if (practiceMode) {
      const scramble = getNextScramble();
      const timestamp = new Date().toISOString();

      const newSolve = {
        solveRef: `LOCAL#${timestamp}`,
        createdAt: timestamp,
        time: newTime,
        rawTimeMs: newTime,
        finalTimeMs: newTime,
        isDNF: false,

        scramble,
        event: currentEvent,
        penalty: null,
        note: "",
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

        if (isSignedIn && user) {
          const pendingSolve = createPendingSolve({
            createdAt: timestamp,
            time: totalMs,
            scramble: "Relay",
            event: "RELAY",
            tags: fullRelayTags,
          });
          appendPendingSolve("RELAY", pendingSolve);

          try {
            const res = await runDb("Saving solve", () =>
              addSolveToDB(user.UserID, {
                event: "RELAY",
                sessionID: currentSession,
                rawTimeMs: totalMs,
                penalty: null,
                scramble: "Relay",
                note: "",
                createdAt: timestamp,
                tags: fullRelayTags,
              })
            );

            const savedSolve = normalizeSolve(res?.item);
            replacePendingSolve("RELAY", pendingSolve.solveRef, savedSolve);
          } catch (err) {
            removePendingSolve("RELAY", pendingSolve.solveRef);
            console.error("Error adding relay solve:", err);
          }
        } else {
          const localSolve = {
            solveRef: `LOCAL#${timestamp}`,
            createdAt: timestamp,
            time: totalMs,
            rawTimeMs: totalMs,
            finalTimeMs: totalMs,
            isDNF: false,

            scramble: "Relay",
            event: "RELAY",
            penalty: null,
            note: "",
            tags: fullRelayTags,
          };

          setSessions((prev) => ({
            ...prev,
            RELAY: [...(prev.RELAY || []), localSolve],
          }));
        }

        resetRelaySet();
        return;
      }

      const totalMs = newTime;

      if (isSignedIn && user) {
        const pendingSolve = createPendingSolve({
          createdAt: timestamp,
          time: totalMs,
          scramble: "Relay",
          event: "RELAY",
          tags: relayTags,
        });
        appendPendingSolve("RELAY", pendingSolve);

        try {
          const res = await runDb("Saving solve", () =>
            addSolveToDB(user.UserID, {
              event: "RELAY",
              sessionID: currentSession,
              rawTimeMs: totalMs,
              penalty: null,
              scramble: "Relay",
              note: "",
              createdAt: timestamp,
              tags: relayTags,
            })
          );

          const savedSolve = normalizeSolve(res?.item);
          replacePendingSolve("RELAY", pendingSolve.solveRef, savedSolve);
        } catch (err) {
          removePendingSolve("RELAY", pendingSolve.solveRef);
          console.error("Error adding relay solve:", err);
        }
      } else {
        const localSolve = {
          solveRef: `LOCAL#${timestamp}`,
          createdAt: timestamp,
          time: totalMs,
          rawTimeMs: totalMs,
          finalTimeMs: totalMs,
          isDNF: false,

          scramble: "Relay",
          event: "RELAY",
          penalty: null,
          note: "",
          tags: relayTags,
        };

        setSessions((prev) => ({
          ...prev,
          RELAY: [...(prev.RELAY || []), localSolve],
        }));
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
            Reason: smartMeta.reason || "",
            StartedAtHostTs: smartMeta.startedAtHostTs ?? null,
            EndedAtHostTs: smartMeta.endedAtHostTs ?? null,
            Moves: smartMeta.moves || [],
            FinalFacelets: smartMeta.finalFacelets || null,
            Splits: smartMeta.splits || null,
          },
        }
      : {};

    const newTags = sharedSession
      ? buildTagPayload({
          Shared: true,
          IsShared: true,
          SharedID: sharedSession.sharedID,
          SharedIndex: sharedIndex,
          ...smartTagPayload,
        })
      : buildTagPayload({
          ...smartTagPayload,
        });

    if (isSignedIn && user) {
      const pendingSolve = createPendingSolve({
        createdAt: timestamp,
        time: newTime,
        scramble,
        event: currentEvent,
        tags: newTags,
      });
      appendPendingSolve(currentEvent, pendingSolve);

      try {
        const res = await runDb("Saving solve", () =>
          addSolveToDB(user.UserID, {
            event: currentEvent,
            sessionID: currentSession,
            rawTimeMs: newTime,
            penalty: null,
            scramble,
            note: "",
            createdAt: timestamp,
            tags: newTags,
          })
        );

        const savedSolve = normalizeSolve(res?.item);
        replacePendingSolve(currentEvent, pendingSolve.solveRef, savedSolve);
        setStatsMutationTick((t) => t + 1);
      } catch (err) {
        removePendingSolve(currentEvent, pendingSolve.solveRef);
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
    } else {
      const localSolve = {
        solveRef: `LOCAL#${timestamp}`,
        createdAt: timestamp,
        time: newTime,
        rawTimeMs: newTime,
        finalTimeMs: newTime,
        isDNF: false,

        scramble,
        event: currentEvent,
        penalty: null,
        note: "",
        tags: newTags,
      };

      setSessions((prev) => ({
        ...prev,
        [currentEvent]: [...(prev[currentEvent] || []), localSolve],
      }));
    }
  };

  const applyPenalty = async (solveRef, penalty, updatedTime) => {
    if (practiceMode) {
      setPracticeSolves((prev) =>
        (prev || []).map((solve) => {
          if (solve.solveRef === solveRef) {
            const raw = solve.rawTimeMs ?? solve.time;
            return {
              ...solve,
              penalty,
              time: penalty === "DNF" ? Number.MAX_SAFE_INTEGER : updatedTime,
              rawTimeMs: raw,
              finalTimeMs: penalty === "DNF" ? null : updatedTime,
              isDNF: penalty === "DNF",
            };
          }
          return solve;
        })
      );
      return;
    }

    const updatedSessions = { ...sessions };
    const eventSolves = updatedSessions[eventKey] || [];

    const targetSolve = eventSolves.find((solve) => solve.solveRef === solveRef);
    if (!targetSolve) return;

    const rawTimeMs =
      Number.isFinite(Number(targetSolve?.rawTimeMs))
        ? Number(targetSolve.rawTimeMs)
        : Number.isFinite(Number(targetSolve?.finalTimeMs))
        ? Number(targetSolve.finalTimeMs)
        : Number.isFinite(Number(targetSolve?.time))
        ? Number(targetSolve.time)
        : null;

    const updatedSolves = eventSolves.map((solve) => {
      if (solve.solveRef === solveRef) {
        return {
          ...solve,
          penalty,
          time: penalty === "DNF" ? Number.MAX_SAFE_INTEGER : updatedTime,
          rawTimeMs,
          finalTimeMs: penalty === "DNF" ? null : updatedTime,
          isDNF: penalty === "DNF",
        };
      }
      return solve;
    });

    updatedSessions[eventKey] = updatedSolves;
    setSessions(updatedSessions);

    if (isSignedIn && user?.UserID) {
      try {
        const res = await runDb(
          "Updating solve",
          () => updateSolvePenalty(user.UserID, solveRef, rawTimeMs, penalty),
          { showStatus: false }
        );

        const savedSolve = normalizeSolve(res?.item);

        setSessions((prev) => ({
          ...prev,
          [eventKey]: (prev[eventKey] || []).map((solve) =>
            solve.solveRef === solveRef ? savedSolve : solve
          ),
        }));
        setStatsMutationTick((t) => t + 1);
      } catch (err) {
        console.error("Failed to update DynamoDB penalty:", err);
      }
    }
  };

  const deleteTime = async (eventKeyParam, solveOrIndex) => {
    const ev = String(eventKeyParam || "").toUpperCase();
    if (!ev) return;

    let solveRefToDelete = null;

    if (typeof solveOrIndex === "string") {
      solveRefToDelete = solveOrIndex;
    } else if (typeof solveOrIndex === "number") {
      const s = sessions?.[ev]?.[solveOrIndex];
      solveRefToDelete = s?.solveRef || null;
    } else if (solveOrIndex && typeof solveOrIndex === "object") {
      solveRefToDelete = solveOrIndex.solveRef || null;
    }

    if (!solveRefToDelete) return;

    setSessions((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      return {
        ...(prev || {}),
        [ev]: arr.filter((s) => s?.solveRef !== solveRefToDelete),
      };
    });

    if (isSignedIn && user) {
      try {
        await runDb("Deleting solve", () => deleteSolve(user.UserID, solveRefToDelete), {
          showStatus: false,
        });
        setStatsMutationTick((t) => t + 1);
      } catch (err) {
        alert("Failed to delete solve");
        console.error(err);
      }
    }
  };

  const publishPost = async ({
    note,
    event,
    solveList = [],
    comments = [],
    postType,
    statShare,
  }) => {
    if (!user) return;

    try {
      await runDb("Creating post", () =>
        createPost(user.UserID, note, event, solveList, comments, {
          postType,
          statShare,
        })
      );
      const posts = await getPosts(user.UserID);
      setUser((prev) => ({
        ...prev,
        Posts: posts,
      }));
      setSocialRefreshTick((t) => t + 1);
    } catch (err) {
      console.error("Error adding post:", err);
      throw err;
    }
  };

  const closeShareComposer = (published = false) => {
    const resolve = shareComposerResolveRef.current;
    shareComposerResolveRef.current = null;
    setShareComposer({
      isOpen: false,
      post: null,
      caption: "",
      isSubmitting: false,
      error: "",
    });
    if (typeof resolve === "function") resolve(published);
  };

  const addPost = async (post) => {
    if (!user || !post) return false;

    return new Promise((resolve) => {
      shareComposerResolveRef.current = resolve;
      setShareComposer({
        isOpen: true,
        post,
        caption: String(post.note || ""),
        isSubmitting: false,
        error: "",
      });
    });
  };

  const handleConfirmShareComposer = async () => {
    if (!shareComposer.post || shareComposer.isSubmitting) return;

    setShareComposer((prev) => ({
      ...prev,
      isSubmitting: true,
      error: "",
    }));

    try {
      await publishPost({
        ...shareComposer.post,
        note: shareComposer.caption.trim(),
      });
      closeShareComposer(true);
    } catch (err) {
      setShareComposer((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err?.message || "Failed to share post.",
      }));
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
    const nextEvent = event.target.value;
    const savedSession =
      isSignedIn && user?.UserID
        ? settings.lastSessionByEvent?.[nextEvent] || "main"
        : "main";

    setCurrentEvent(nextEvent);
    setCurrentSession(savedSession);
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
  const handleSignOut = () => {
    setShowSettingsPopup(false);
    setShowSignInPopup(false);
    navigate("/");
    setIsSignedIn(false);
    setUser(null);
    setSessionsList([]);
    setCustomEvents([]);
    setSessions(INITIAL_SESSIONS);
    setScrambles({});
    setSessionStats({});
    setStatsMutationTick(0);
    setCurrentEvent("333");
    setCurrentSession("main");
    setTagConfig(DEFAULT_TAG_CONFIG);
    setStatsSettingsContext({
      eventLabel: "333",
      sessionLabel: "main",
      isAllEventsMode: false,
      canRecomputeOverall: false,
      canImport: false,
      loadingOverallStats: false,
      recomputeStatusText: "",
      importBusy: false,
      isStatsRouteActive: false,
    });
    setSelectedAverageSolves([]);
    setSelectedAverageSolve(null);
    setSharedSession(null);
    setSharedIndex(0);
    setShowPlayerBar(true);
  };

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
  const currentSessionStatsForEvent =
    sessionStats?.[String(eventKey || "").toUpperCase()]?.[String(currentSession || "main")] ||
    null;
  const currentSessionTotalSolveCount = Number(
    currentSessionStatsForEvent?.SolveCountTotal ??
      currentSessionStatsForEvent?.solveCountTotal ??
      currentSessionStatsForEvent?.SolveCount ??
      currentSessionStatsForEvent?.solveCount ??
      0
  );

  const requestBestAverageWindow = async (count, startSolveRef, targetAvg) => {
    if (
      !practiceMode &&
      isSignedIn &&
      user?.UserID &&
      startSolveRef &&
      Number.isFinite(Number(count)) &&
      count > 0
    ) {
      try {
        const items = await runDb(
          "Loading best average",
          () =>
            getSolveWindowFromStart(
              user.UserID,
              currentEvent,
              currentSession,
              startSolveRef,
              count
            ),
          { showStatus: false }
        );

        const normalized = (items || []).map((it) => normalizeSolve(it)).filter(Boolean);
        if (normalized.length === count) {
          setSelectedAverageSolves(normalized);
          return true;
        }
      } catch (err) {
        console.warn("Failed to load best average window from API:", err);
      }
    }

    if (!Number.isFinite(Number(targetAvg))) return false;

    let selected = [];
    for (let i = 0; i <= currentSolves.length - count; i++) {
      const slice = currentSolves.slice(i, i + count);
      const avg = calculateAverage(
        slice.map((s) => s.time),
        true
      ).average;
      if (typeof avg === "number" && Math.round(avg) === Math.round(Number(targetAvg))) {
        selected = slice;
        break;
      }
    }

    if (selected.length > 0) {
      setSelectedAverageSolves(selected);
      return true;
    }

    return false;
  };
  const cubeModelHistoryOptions = Array.from(
    new Set(
      currentSolves
        .map((s) => String(s?.tags?.CubeModel || "").trim())
        .filter(Boolean)
    )
  );

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
          isSignedIn={isSignedIn}
          handleSettingsClick={() => setShowSettingsPopup(true)}
          user={user}
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
                              zIndex: 4,
                            }}
                          >
                            <TagBarInline
                              key={`tagbar-${eventKey}`}
                              tags={currentTags}
                              onChange={(next) =>
                                setTagsByEvent((prev) => ({
                                  ...(prev || {}),
                                  [eventKey]: next,
                                }))
                              }
                              tagConfig={tagConfig}
                              cubeModelOptions={cubeModelHistoryOptions}
                            />
                            <img src={tagIcon} alt="tagIcon" className="tagIcon" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <HomeStatsOverlay solves={currentSolves} settings={settings} user={user} />

                  <Timer addTime={addSolve} activeScramble={displayedScramble} />

                  <AveragesDisplay
                    currentSolves={currentSolves}
                    overallSessionStats={currentSessionStatsForEvent}
                    setSelectedAverageSolves={setSelectedAverageSolves}
                    onRequestBestAverageWindow={requestBestAverageWindow}
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
                    }}
                    setSessions={setSessions}
                    sessionsList={sessionsList}
                    currentEvent={currentEvent}
                    currentSession={currentSession}
                    eventKey={eventKey}
                    practiceMode={practiceMode}
                    totalSolveCount={
                      Number.isFinite(currentSessionTotalSolveCount) &&
                      currentSessionTotalSolveCount >= 0
                        ? currentSessionTotalSolveCount
                        : undefined
                    }
                  />

                  {selectedAverageSolves.length > 0 && (
                    <AverageDetailModal
                      isOpen={selectedAverageSolves.length > 0}
                      title={`Average Detail (${selectedAverageSolves.length})`}
                      subtitle={`${eventKey === "333" ? "3x3" : eventKey} · ${currentSession}`}
                      solves={selectedAverageSolves}
                      onClose={() => {
                        setSelectedAverageSolves([]);
                      }}
                      onSolveOpen={(solve) => {
                        if (!solve) return;
                        setSelectedAverageSolve({ ...solve, userID: user?.UserID });
                      }}
                    />
                  )}

                  {selectedAverageSolve && (
                    <Detail
                      solve={selectedAverageSolve}
                      onClose={() => setSelectedAverageSolve(null)}
                      deleteTime={() => {
                        const selected = selectedAverageSolve;
                        if (!selected) return;

                        if (practiceMode) {
                          const idx = solvesSourceForDetail.findIndex(
                            (s) => s.solveRef === selected.solveRef
                          );
                          if (idx < 0) return;
                          deletePracticeTime(idx);
                        } else {
                          deleteTime(eventKey, selected.solveRef);
                        }
                      }}
                      addPost={addPost}
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
                  statsMutationTick={statsMutationTick}
                  setSessions={setSessions}
                  setUser={setUser}
                  currentEvent={currentEvent}
                  currentSession={currentSession}
                  user={user}
                  deleteTime={(eventKeyParam, index) =>
                    deleteTime(eventKeyParam, index)
                  }
                  addPost={addPost}
                  onSettingsContextChange={setStatsSettingsContext}
                  recomputeRequest={statsRecomputeRequest}
                  importRequest={statsImportRequest}
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
          sharedIndex={sharedIndex}
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
          onHide={() => setShowPlayerBar(false)}
        />
      )}

      {!isHomePage && !showPlayerBar && (
        <div
          className="toggle-bar"
          style={{ bottom: "12px" }}
        >
          <button
            className="toggle-button"
            onClick={() => setShowPlayerBar(true)}
            aria-label="Show player bar"
            title="Show player bar"
          >
            &#x25B2;
          </button>
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
          onSignOut={handleSignOut}
          statsContext={statsSettingsContext}
          onStatsRecompute={() => {
            setStatsRecomputeRequest((prev) => prev + 1);
          }}
          onStatsImport={() => {
            setShowSettingsPopup(false);
            setStatsImportRequest((prev) => prev + 1);
          }}
          onProfileUpdate={(fresh) => {
            setUser((prev) => ({ ...prev, ...fresh }));
            if (fresh?.Settings && typeof fresh.Settings === "object") {
              skipNextSettingsAutosaveRef.current = true;
              setAllSettings(fresh.Settings);
              lastSavedSettingsJsonRef.current = JSON.stringify(fresh.Settings);
            }
            setTagConfig(normalizeTagConfig(fresh?.TagConfig));
          }}
          onSessionsRefresh={(items) => {
            if (Array.isArray(items)) setSessionsList(items);
          }}
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

      <SharePostModal
        isOpen={shareComposer.isOpen}
        title="Share to Social"
        caption={shareComposer.caption}
        onCaptionChange={(caption) =>
          setShareComposer((prev) => ({
            ...prev,
            caption,
            error: "",
          }))
        }
        onCancel={() => closeShareComposer(false)}
        onConfirm={handleConfirmShareComposer}
        isSubmitting={shareComposer.isSubmitting}
        error={shareComposer.error}
      />
    </div>
  );
}

export default App;
