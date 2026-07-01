import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import AveragesDisplay from "./components/AveragesDisplay/AveragesDisplay";
import AverageDetailModal from "./components/Detail/AverageDetailModal";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import SharedAverageMessage from "./components/Social/SharedAverageMessage";
import Settings from "./components/Settings/Settings";
import Navigation from "./components/Navigation/Navigation";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import HomeStatsOverlay from "./components/HomeStats/HomeStatsOverlay";
import EventSelector from "./components/EventSelector";
import Scramble from "./components/Scramble/Scramble";
import PuzzleSVG from "./components/PuzzleSVGs/PuzzleSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import {
  ProfileSetupModal,
  TutorialModal,
} from "./components/Onboarding/OnboardingModal";
import NameTag from "./components/Profile/NameTag";
import Detail from "./components/Detail/Detail";
import SharePostModal from "./components/Social/SharePostModal";
import TagBar from "./components/TagBar/TagBar";
import { useSettings } from "./contexts/SettingsContext";
import { DbStatusProvider } from "./contexts/DbStatusContext";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import {
  eventMatchesEventBinding,
  eventMatchesShortcut,
  isEditableTarget,
} from "./utils/keybindings";
import { getUser } from "./services/getUser";
import { updateUser } from "./services/updateUser";
import { getSessions } from "./services/getSessions";
import { getLastNSolvesBySession, getSolvesBySession } from "./services/getSolvesBySession";
import { getSessionStats } from "./services/getSessionStats";
import { recomputeSessionStats as recomputeSessionStatsService } from "./services/recomputeSessionStats";
import { addSolve as addSolveToDB } from "./services/addSolve";
import { deleteSolve } from "./services/deleteSolve";
import { updateSolve } from "./services/updateSolve";
import { getPosts } from "./services/getPosts";
import { createPost } from "./services/createPost";
import { deletePost as deletePostFromDB } from "./services/deletePost";
import { updatePostComments } from "./services/updatePostComments";
import { createSession } from "./services/createSession";
import { createUser } from "./services/createUser";
import { getMessages } from "./services/getMessages";
import { getConversations } from "./services/getConversations";
import { updateSolvePenalty } from "./services/updateSolvePenalty";
import { getSolveWindowFromStart } from "./services/getSolveWindow";
import { sendMessage } from "./services/sendMessage";
import { getTagValues } from "./services/getTagValues";
import { getGroups } from "./services/getGroups";
import { setGanCurrentScramble } from "./smart/ganScrambleProgress";
import {
  clearScrambleQueue,
  consumeScramble,
  generateRelayScrambles,
  generateScrambleForEvent,
  getScrambleQueueSnapshot,
  prependScramble,
  replaceHeadScramble,
  warmScrambleQueue,
  setGlobalScrambleMode,
} from "./services/scrambleService";

import {
  DEFAULT_EVENTS,
  getRelayEventName,
  getRelaySessionOptions,
  isRelayEventId,
} from "./defaultEvents";
import {
  addTagCatalogValue,
  collectTagSelectionOptions,
  DEFAULT_TAG_CONFIG,
  getCubeModelOptionsForEvent as getConfiguredCubeModelOptionsForEvent,
  getTagCatalogOptionsForEvent,
  getTagColorMapForEvent,
  getTagScopeEventKey,
  makeEmptyTagSelection,
  normalizeAlgorithmTagValue,
  normalizeTagConfig,
  normalizeTagCatalog,
  normalizeTagColorCatalog,
  setTagColorCatalogValue,
  SHARED_TAG_FIELDS,
} from "./components/TagBar/tagUtils";
import {
  calculateBestAverageOfFive,
  calculateAverage,
  formatTime,
} from "./components/TimeList/TimeUtils";

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

const DEFAULT_NAV_PREFS = Object.freeze({
  lastEvent: "333",
  lastSessionByEvent: {},
  showPlayerBar: true,
});

function getNavPrefsStorageKey(userID) {
  const id = String(userID || "").trim();
  return id ? `pts.navPrefs.${id}` : "";
}

function buildLegacyDmConversationID(a, b) {
  return [String(a || "").trim(), String(b || "").trim()]
    .filter(Boolean)
    .sort()
    .join("#");
}

function encodeSharedPostPayload(payload = {}) {
  try {
    return `[sharedPost]${encodeURIComponent(JSON.stringify(payload))}`;
  } catch (error) {
    console.warn("Failed to encode shared post payload", error);
    return "[Shared post]";
  }
}

function readNavPrefs(userID, fallbackSettings = {}) {
  const fallback = {
    lastEvent:
      String(fallbackSettings?.lastEvent || "").trim() || DEFAULT_NAV_PREFS.lastEvent,
    lastSessionByEvent:
      fallbackSettings?.lastSessionByEvent &&
      typeof fallbackSettings.lastSessionByEvent === "object"
        ? fallbackSettings.lastSessionByEvent
        : DEFAULT_NAV_PREFS.lastSessionByEvent,
    showPlayerBar:
      typeof fallbackSettings?.showPlayerBar === "boolean"
        ? fallbackSettings.showPlayerBar
        : DEFAULT_NAV_PREFS.showPlayerBar,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const key = getNavPrefsStorageKey(userID);
    if (!key) return fallback;

    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return {
      lastEvent:
        String(parsed?.lastEvent || "").trim() || fallback.lastEvent,
      lastSessionByEvent:
        parsed?.lastSessionByEvent && typeof parsed.lastSessionByEvent === "object"
          ? parsed.lastSessionByEvent
          : fallback.lastSessionByEvent,
      showPlayerBar:
        typeof parsed?.showPlayerBar === "boolean"
          ? parsed.showPlayerBar
          : fallback.showPlayerBar,
    };
  } catch {
    return fallback;
  }
}

function writeNavPrefs(userID, prefs = {}) {
  if (typeof window === "undefined") return;

  try {
    const key = getNavPrefsStorageKey(userID);
    if (!key) return;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        lastEvent:
          String(prefs?.lastEvent || "").trim() || DEFAULT_NAV_PREFS.lastEvent,
        lastSessionByEvent:
          prefs?.lastSessionByEvent && typeof prefs.lastSessionByEvent === "object"
            ? prefs.lastSessionByEvent
            : {},
        showPlayerBar:
          typeof prefs?.showPlayerBar === "boolean"
            ? prefs.showPlayerBar
            : DEFAULT_NAV_PREFS.showPlayerBar,
      })
    );
  } catch {
    // ignore storage failures
  }
}

const POST_SOLVE_TAG_CHORD_TIMEOUT_MS = 1200;
const POST_SOLVE_TAG_SAVE_DEBOUNCE_MS = 450;
const POST_SOLVE_TAG_MODIFIER_CODE = "Comma";
const POST_SOLVE_PLL_DIRECT_BINDINGS = {
  E: "E Perm",
  F: "F Perm",
  H: "H Perm",
  S: "Skip",
  T: "T Perm",
  V: "V Perm",
  Y: "Y Perm",
  Z: "Z Perm",
};
const POST_SOLVE_PLL_CHORD_BINDINGS = {
  A: {
    A: "Aa Perm",
    B: "Ab Perm",
  },
  G: {
    A: "Ga Perm",
    B: "Gb Perm",
    C: "Gc Perm",
    D: "Gd Perm",
  },
  J: {
    A: "Ja Perm",
    B: "Jb Perm",
  },
  N: {
    A: "Na Perm",
    B: "Nb Perm",
  },
  R: {
    A: "Ra Perm",
    B: "Rb Perm",
  },
  U: {
    A: "Ua Perm",
    B: "Ub Perm",
  },
};

function isPostSolveTagModifierEvent(event) {
  return String(event?.code || "").trim() === POST_SOLVE_TAG_MODIFIER_CODE;
}

function consumePostSolveTagEvent(event) {
  if (!event) return;
  event.__ptsTagBindingConsumed = true;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function getPlainLetterKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return "";
  const code = String(event.code || "").trim();
  const match = code.match(/^Key([A-Z])$/);
  if (match) return match[1];

  const key = String(event.key || "").trim().toUpperCase();
  return /^[A-Z]$/.test(key) ? key : "";
}

function getPlainDigitKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return "";

  const code = String(event.code || "").trim();
  const codeMatch = code.match(/^Digit([0-9])$/);
  if (codeMatch) return codeMatch[1];

  const key = String(event.key || "").trim();
  return /^[0-9]$/.test(key) ? key : "";
}

function formatPostSolveTagToastLabel(updates = {}) {
  const pll = String(updates?.Alg_PLL || "").trim();
  if (pll) {
    if (/^skip$/i.test(pll)) return "Tagged: PLL Skip";
    return `Tagged: ${pll.replace(/\s+Perm$/i, "")}`;
  }

  const oll = String(updates?.Alg_OLL || "").trim();
  if (oll) {
    if (/^skip$/i.test(oll)) return "Tagged: OLL Skip";
    const match = oll.match(/^OLL\s+#(\d{1,2})$/i);
    if (match) return `Tagged: OLL ${match[1]}`;
    return `Tagged: ${oll}`;
  }

  return "";
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

function getCubeCollectionOptionsForEvent(cubeCollection, eventCode) {
  const ev = String(eventCode || "").trim().toUpperCase();
  const scopedEvents = new Set([ev, getTagScopeEventKey(ev)].filter(Boolean));
  const globalOptions = new Set();
  const scopedOptions = new Set();

  for (const rawEntry of Array.isArray(cubeCollection) ? cubeCollection : []) {
    const entry = String(rawEntry || "").trim();
    if (!entry) continue;

    const match = entry.match(/^([A-Za-z0-9]+)\s*:\s*(.+)$/);
    if (!match) {
      globalOptions.add(entry);
      continue;
    }

    const [, rawScope, rawValue] = match;
    const scope = String(rawScope || "").trim().toUpperCase();
    const value = String(rawValue || "").trim();
    if (!value) continue;

    if (scopedEvents.has(scope)) scopedOptions.add(value);
  }

  return Array.from(new Set([...scopedOptions, ...globalOptions])).sort((a, b) =>
    a.localeCompare(b)
  );
}

function normalizeSharedEventKey(evt) {
  if (!evt) return "333";
  const e = String(evt).trim().toUpperCase();

  if (e === "3X3" || e === "3X3X3") return "333";
  if (e === "2X2" || e === "2X2X2") return "222";
  if (e === "4X4" || e === "4X4X4") return "444";
  if (e === "5X5" || e === "5X5X5") return "555";
  if (e === "6X6" || e === "6X6X6") return "666";
  if (e === "7X7" || e === "7X7X7") return "777";

  return e;
}

function sharedEventLabel(evt) {
  const key = normalizeSharedEventKey(evt);
  if (isRelayEventId(key)) return getRelayEventName(key) || "Relay";
  const labels = {
    "222": "2x2",
    "333": "3x3",
    "444": "4x4",
    "555": "5x5",
    "666": "6x6",
    "777": "7x7",
    "333OH": "3x3 OH",
    "333BLD": "3x3 BLD",
    "MEGAMINX": "Megaminx",
    "PYRAMINX": "Pyraminx",
    "SKEWB": "Skewb",
    "SQ1": "Square-1",
    "CLOCK": "Clock",
  };
  return labels[key] || key;
}

function getBrowserTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return String(tz || "").trim();
  } catch {
    return "";
  }
}

function parseManualSolveTimeToMs(value) {
  if (value == null) return null;

  const text = String(value).trim();
  if (!text) return null;

  if (text.includes(":")) {
    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return Math.round(minutes * 60000 + seconds * 1000);
    }

    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return Math.round(hours * 3600000 + minutes * 60000 + seconds * 1000);
    }

    return null;
  }

  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

function summarizeSharedPlan(events = [], fallbackEvent = "333") {
  const normalized =
    Array.isArray(events) && events.length
      ? events.map(normalizeSharedEventKey).filter(Boolean)
      : [normalizeSharedEventKey(fallbackEvent)];

  const counts = new Map();

  normalized.forEach((event) => {
    counts.set(event, (counts.get(event) || 0) + 1);
  });

  const entries = Array.from(counts.entries());

  if (entries.length === 1) {
    const [event, count] = entries[0];
    return count > 1
      ? `${sharedEventLabel(event)} ×${count}`
      : sharedEventLabel(event);
  }

  return entries
    .map(([event, count]) =>
      count > 1 ? `${sharedEventLabel(event)} ×${count}` : sharedEventLabel(event)
    )
    .join(" + ");
}

function getSharedOpponentLabel(sharedSession, user) {
  if (!sharedSession) return "Opponent";

  const candidates = [
    sharedSession.opponentName,
    sharedSession.theirLabel,
    sharedSession.theirUsername,
    sharedSession.opponentUsername,
    sharedSession.otherUsername,
    sharedSession.targetUsername,
    sharedSession.opponentID,
    sharedSession.otherUserID,
    sharedSession.targetUserID,
  ].filter(Boolean);

  if (candidates.length) return String(candidates[0]);

  const creatorID = sharedSession.creatorID;
  const opponentID = sharedSession.opponentID;

  if (creatorID && user?.UserID && creatorID !== user.UserID) return creatorID;
  if (opponentID && user?.UserID && opponentID !== user.UserID) return opponentID;

  return "Opponent";
}

function getSharedOpponentColor(sharedSession) {
  return (
    sharedSession?.opponentColor ||
    sharedSession?.theirColor ||
    sharedSession?.color ||
    "#888888"
  );
}

function formatSharedTimeLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return formatTime(n);
}

function getSharedSolveCount(sharedSession) {
  return Math.max(
    Array.isArray(sharedSession?.scrambles) ? sharedSession.scrambles.length : 0,
    Array.isArray(sharedSession?.creatorScrambles) ? sharedSession.creatorScrambles.length : 0,
    Array.isArray(sharedSession?.opponentScrambles) ? sharedSession.opponentScrambles.length : 0
  );
}

function findSharedNextIndex(sharedSession, userID) {
  const total = getSharedSolveCount(sharedSession);
  if (!total) return 0;

  for (let i = 0; i < total; i++) {
    const row = sharedSession?.roundResults?.[i] || {};
    const mine = row?.[userID];
    if (!Number.isFinite(Number(mine?.time))) return i;
  }

  return total - 1;
}

function findHostedSharedIndex(sharedSession) {
  const total = getSharedSolveCount(sharedSession);
  if (!total) return 0;

  const hostID = String(
    sharedSession?.hostID || sharedSession?.creatorID || ""
  ).trim();
  if (!hostID) return 0;

  for (let i = 0; i < total; i++) {
    const row = sharedSession?.roundResults?.[i] || {};
    const hostResult = row?.[hostID];
    if (!Number.isFinite(Number(hostResult?.time))) return i;
  }

  return Math.max(total - 1, 0);
}

function getSharedRoundParticipants(sharedSession, solveIndex, currentUserID) {
  const row = sharedSession?.roundResults?.[solveIndex] || {};
  return Object.entries(row)
    .filter(([participantID, result]) => {
      if (!participantID || participantID === currentUserID) return false;
      return Number.isFinite(Number(result?.time));
    })
    .map(([participantID, result]) => ({
      participantID,
      time: Number(result?.time),
      event: result?.event || null,
      updatedAt: result?.updatedAt || null,
    }))
    .sort((a, b) => {
      const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTs - aTs;
    });
}

function getSharedParticipantLabel(sharedSession, participantID, fallback = "Opponent") {
  if (!participantID) return fallback;

  if (participantID === sharedSession?.creatorID) {
    return (
      sharedSession?.creatorName ||
      sharedSession?.creatorUsername ||
      sharedSession?.creatorLabel ||
      participantID
    );
  }

  if (participantID === sharedSession?.opponentID) {
    return (
      sharedSession?.opponentName ||
      sharedSession?.theirLabel ||
      sharedSession?.theirUsername ||
      participantID
    );
  }

  return participantID;
}

function parseSharedUpdatePayload(text) {
  if (!String(text || "").startsWith("[sharedUpdate]")) return null;

  const raw = String(text).slice("[sharedUpdate]".length);
  const [sharedID, solveIndexRaw, timeRaw, senderID] = raw.split("|");

  const solveIndex = Number(solveIndexRaw);
  const time = Number(timeRaw);

  if (!sharedID || !senderID || !Number.isFinite(solveIndex)) return null;

  return {
    sharedID,
    solveIndex,
    time: Number.isFinite(time) ? time : null,
    senderID,
  };
}

function parseSharedExtendPayload(text) {
  if (!String(text || "").startsWith("[sharedExtend]")) return null;
  try {
    const parsed = JSON.parse(String(text).slice("[sharedExtend]".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSharedAoNPayload(text) {
  if (!String(text || "").startsWith("[sharedAoN]")) return null;
  try {
    const parsed = JSON.parse(String(text).slice("[sharedAoN]".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSharedRoomClosedPayload(text) {
  if (!String(text || "").startsWith("[sharedRoomClosed]")) return null;
  try {
    const parsed = JSON.parse(String(text).slice("[sharedRoomClosed]".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getLatestHostedSharedMessage(messages = []) {
  return [...(Array.isArray(messages) ? messages : [])]
    .map((msg) => ({
      msg,
      payload: parseSharedAoNPayload(msg?.text),
    }))
    .filter(
      (entry) =>
        entry?.payload?.sharedID &&
        (entry?.payload?.isHosted === true ||
          String(entry?.payload?.mode || entry?.payload?.type || "").toLowerCase() ===
            "hosted")
    )
    .sort((a, b) =>
      String(a?.msg?.timestamp || a?.msg?.createdAt || "").localeCompare(
        String(b?.msg?.timestamp || b?.msg?.createdAt || "")
      )
    )
    .at(-1) || null;
}

function getLatestHostedRoomClosedMessage(messages = []) {
  return [...(Array.isArray(messages) ? messages : [])]
    .map((msg) => ({
      msg,
      payload: parseSharedRoomClosedPayload(msg?.text),
    }))
    .filter((entry) => entry?.payload?.conversationID || entry?.payload?.roomCode)
    .sort((a, b) =>
      String(a?.msg?.timestamp || a?.msg?.createdAt || "").localeCompare(
        String(b?.msg?.timestamp || b?.msg?.createdAt || "")
      )
    )
    .at(-1) || null;
}

function buildRoundResultsFromMessages(messages, sharedID) {
  const nextRoundResults = {};

  (Array.isArray(messages) ? messages : []).forEach((msg) => {
    const payload = parseSharedUpdatePayload(msg?.text);
    if (!payload || payload.sharedID !== sharedID) return;

    nextRoundResults[payload.solveIndex] = {
      ...(nextRoundResults[payload.solveIndex] || {}),
      [payload.senderID]: {
        ...(nextRoundResults[payload.solveIndex]?.[payload.senderID] || {}),
        time: payload.time,
        updatedAt:
          msg?.timestamp || msg?.createdAt || msg?.datetime || new Date().toISOString(),
      },
    };
  });

  return nextRoundResults;
}

function mergeRoundResults(baseRoundResults, incomingRoundResults) {
  const merged = { ...(baseRoundResults || {}) };

  Object.entries(incomingRoundResults || {}).forEach(([solveIndex, incomingRow]) => {
    const baseRow = merged[solveIndex] || {};
    const nextRow = { ...baseRow };

    Object.entries(incomingRow || {}).forEach(([participantID, incomingResult]) => {
      const baseResult = baseRow?.[participantID] || null;
      const incomingTs = incomingResult?.updatedAt
        ? new Date(incomingResult.updatedAt).getTime()
        : 0;
      const baseTs = baseResult?.updatedAt ? new Date(baseResult.updatedAt).getTime() : 0;

      nextRow[participantID] =
        incomingTs >= baseTs && incomingResult?.time != null
          ? incomingResult
          : baseResult || incomingResult;
    });

    merged[solveIndex] = nextRow;
  });

  return merged;
}

function applySharedExtensionsToSession(session, messages = []) {
  if (!session?.sharedID) return session;

  const extensions = (Array.isArray(messages) ? messages : [])
    .map((msg) => ({
      payload: parseSharedExtendPayload(msg?.text),
      timestamp: msg?.timestamp || msg?.createdAt || msg?.datetime || "",
    }))
    .filter((entry) => entry.payload?.sharedID === session.sharedID)
    .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));

  if (!extensions.length) return session;

  let next = { ...session };
  extensions.forEach(({ payload }) => {
    next = {
      ...next,
      creatorEvents: [...(next.creatorEvents || []), ...(payload.creatorEvents || [])],
      opponentEvents: [...(next.opponentEvents || []), ...(payload.opponentEvents || [])],
      creatorScrambles: [...(next.creatorScrambles || []), ...(payload.creatorScrambles || [])],
      opponentScrambles: [...(next.opponentScrambles || []), ...(payload.opponentScrambles || [])],
      events: [...(next.events || []), ...(payload.creatorEvents || payload.events || [])],
      scrambles: [...(next.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])],
      count: Math.max(
        Number(next.count || 0),
        Number(payload.count || 0),
        [...(next.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])].length
      ),
    };
  });

  return next;
}

function getSharedMode(session) {
  return String(session?.mode || session?.type || "average").trim().toLowerCase();
}

function isHostedSharedSession(session) {
  return getSharedMode(session) === "hosted" || session?.isHosted === true;
}

function getSharedSaveSessionID(session) {
  return String(
    session?.saveSessionID || session?.targetSessionID || (isHostedSharedSession(session) ? "main" : session?.sessionID) || "main"
  ).trim() || "main";
}

function getSharedSolveSourceLabel(session) {
  if (!session?.sharedID) return "Standard";
  if (!isHostedSharedSession(session)) return "Shared";

  const hostLabel = String(
    session?.hostName ||
      session?.creatorName ||
      session?.creatorUsername ||
      session?.creatorID ||
      ""
  ).trim();

  return hostLabel ? `Room - ${hostLabel}` : "Room";
}

function getSharedTargetWins(session) {
  const n = Number(session?.targetWins || 0);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function getSharedPerspective(session, userID, fallbackEvent = "333") {
  const creatorID = session?.creatorID || null;
  const isCreator = creatorID && userID ? creatorID === userID : true;

  const yourEvents = isCreator
    ? session?.creatorEvents || session?.events || []
    : session?.opponentEvents || session?.events || [];
  const theirEvents = isCreator
    ? session?.opponentEvents || session?.events || []
    : session?.creatorEvents || session?.events || [];

  const yourScrambles = isCreator
    ? session?.creatorScrambles || session?.scrambles || []
    : session?.opponentScrambles || session?.scrambles || [];
  const theirScrambles = isCreator
    ? session?.opponentScrambles || session?.scrambles || []
    : session?.creatorScrambles || session?.scrambles || [];

  return {
    isCreator,
    yourEvents,
    theirEvents,
    yourScrambles,
    theirScrambles,
    yourFallbackEvent: isCreator
      ? session?.creatorEvent || session?.event || fallbackEvent
      : session?.opponentEvent || session?.event || fallbackEvent,
    theirFallbackEvent: isCreator
      ? session?.opponentEvent || session?.event || fallbackEvent
      : session?.creatorEvent || session?.event || fallbackEvent,
  };
}

function buildHostedSharedSession(payload, currentSession, messages = []) {
  const creatorEvents =
    Array.isArray(payload?.creatorEvents) && payload.creatorEvents.length
      ? payload.creatorEvents
      : Array.isArray(payload?.events) && payload.events.length
      ? payload.events
      : Array.from({ length: Number(payload?.count) || 0 }, () =>
          payload?.creatorEvent || payload?.event || currentSession?.event || "333"
        );
  const opponentEvents =
    Array.isArray(payload?.opponentEvents) && payload.opponentEvents.length
      ? payload.opponentEvents
      : creatorEvents;
  const creatorScrambles =
    Array.isArray(payload?.creatorScrambles) && payload.creatorScrambles.length
      ? payload.creatorScrambles
      : Array.isArray(payload?.scrambles)
      ? payload.scrambles
      : [];
  const opponentScrambles =
    Array.isArray(payload?.opponentScrambles) && payload.opponentScrambles.length
      ? payload.opponentScrambles
      : creatorScrambles;
  const roundResults = buildRoundResultsFromMessages(messages, payload?.sharedID);

  return applySharedExtensionsToSession(
    {
      ...(currentSession || {}),
      sessionID:
        String(payload?.sharedID || "")
          .split("#")
          .slice(0, 3)
          .join("#") || currentSession?.sessionID || "main",
      sharedID: payload?.sharedID || currentSession?.sharedID || "",
      mode: payload?.mode || payload?.type || "hosted",
      type: payload?.type || payload?.mode || "hosted",
      targetWins: payload?.targetWins || null,
      batchSize: payload?.batchSize || currentSession?.batchSize || null,
      saveSessionID:
        payload?.saveSessionID || currentSession?.saveSessionID || currentSession?.sessionID || "main",
      hostID:
        payload?.hostID || payload?.creatorID || currentSession?.hostID || currentSession?.creatorID || null,
      hostName:
        payload?.hostName || currentSession?.hostName || currentSession?.creatorName || null,
      roomCode: payload?.roomCode || currentSession?.roomCode || null,
      isHosted: true,
      event: creatorEvents[0] || payload?.creatorEvent || payload?.event || currentSession?.event || "333",
      events: creatorEvents,
      scrambles: creatorScrambles,
      creatorID: payload?.creatorID || currentSession?.creatorID || null,
      creatorEvent:
        payload?.creatorEvent || creatorEvents[0] || currentSession?.creatorEvent || currentSession?.event || "333",
      opponentEvent:
        payload?.opponentEvent ||
        opponentEvents[0] ||
        currentSession?.opponentEvent ||
        currentSession?.event ||
        "333",
      creatorEvents,
      opponentEvents,
      creatorScrambles,
      opponentScrambles,
      conversationID: currentSession?.conversationID || "",
      opponentID: currentSession?.opponentID || null,
      opponentName: currentSession?.opponentName || "Room",
      theirLabel: currentSession?.theirLabel || currentSession?.opponentName || "Room",
      theirUsername: currentSession?.theirUsername || currentSession?.theirLabel || "Room",
      opponentColor: currentSession?.opponentColor || "#888888",
      theirColor: currentSession?.theirColor || currentSession?.opponentColor || "#888888",
      color: currentSession?.color || currentSession?.opponentColor || "#888888",
      roundResults,
    },
    messages
  );
}

function computeSharedScore(session, currentUserID) {
  const roundResults = session?.roundResults || {};
  const opponentID = session?.opponentID || null;
  let yourWins = 0;
  let theirWins = 0;

  Object.entries(roundResults).forEach(([solveIndex, row]) => {
    const myTime = Number(row?.[currentUserID]?.time);
    const peers = getSharedRoundParticipants(session, solveIndex, currentUserID);
    const other =
      peers.find((entry) => entry.participantID === opponentID) ||
      peers[0] ||
      null;
    const theirTime = Number(other?.time);

    if (!Number.isFinite(myTime) || !Number.isFinite(theirTime)) return;
    if (myTime < theirTime) yourWins += 1;
    else if (theirTime < myTime) theirWins += 1;
  });

  return { yourWins, theirWins };
}

function shouldCompleteSharedSessionNow(session, nextIndex, currentUserID) {
  const mode = getSharedMode(session);
  if (mode === "casual" || mode === "hosted") return false;

  if (mode === "head_to_head") {
    const { yourWins, theirWins } = computeSharedScore(session, currentUserID);
    return yourWins >= getSharedTargetWins(session) || theirWins >= getSharedTargetWins(session);
  }

  const total = getSharedSolveCount(session);
  return nextIndex >= total;
}

function assignExplicitSolveIndices(solves, totalCount) {
  const items = Array.isArray(solves) ? solves : [];
  if (!items.length) return [];

  const count = Number(totalCount);
  if (!Number.isFinite(count) || count < items.length) return items;

  const startIndex = Math.max(count - items.length, 0);
  return items.map((solve, index) => ({
    ...solve,
    fullIndex: startIndex + index,
  }));
}

function removeSolveAndShiftIndices(solves, solveRefToDelete, deletedSolve = null) {
  const items = Array.isArray(solves) ? solves : [];
  const deletedFullIndex = Number(deletedSolve?.fullIndex);
  const hasExplicitIndices = items.every((solve) => Number.isFinite(Number(solve?.fullIndex)));

  const filtered = items.filter((solve) => solve?.solveRef !== solveRefToDelete);
  if (!hasExplicitIndices || !Number.isFinite(deletedFullIndex)) return filtered;

  return filtered.map((solve) => {
    const fullIndex = Number(solve?.fullIndex);
    if (!Number.isFinite(fullIndex) || fullIndex < deletedFullIndex) return solve;
    return {
      ...solve,
      fullIndex: fullIndex - 1,
    };
  });
}

function insertSolveAndShiftIndices(solves, insertIndex, solveToInsert) {
  const items = Array.isArray(solves) ? solves : [];
  const next = [...items];
  const boundedInsertIndex = Math.min(Math.max(Number(insertIndex) || 0, 0), next.length);
  const hasExplicitIndices = next.every((solve) => Number.isFinite(Number(solve?.fullIndex)));

  if (!hasExplicitIndices) {
    next.splice(boundedInsertIndex, 0, solveToInsert);
    return next;
  }

  let insertFullIndex = Number(solveToInsert?.fullIndex);
  if (!Number.isFinite(insertFullIndex)) {
    const nextSolve = next[boundedInsertIndex] || null;
    const prevSolve = next[boundedInsertIndex - 1] || null;
    const nextFullIndex = Number(nextSolve?.fullIndex);
    const prevFullIndex = Number(prevSolve?.fullIndex);

    if (Number.isFinite(nextFullIndex)) {
      insertFullIndex = nextFullIndex;
    } else if (Number.isFinite(prevFullIndex)) {
      insertFullIndex = prevFullIndex + 1;
    } else {
      insertFullIndex = boundedInsertIndex;
    }
  }

  const shifted = next.map((solve) => {
    const fullIndex = Number(solve?.fullIndex);
    if (!Number.isFinite(fullIndex) || fullIndex < insertFullIndex) return solve;
    return {
      ...solve,
      fullIndex: fullIndex + 1,
    };
  });

  shifted.splice(boundedInsertIndex, 0, {
    ...solveToInsert,
    fullIndex: insertFullIndex,
  });
  return shifted;
}

function getSolveMergeKey(solve) {
  if (!solve || typeof solve !== "object") return "";

  const event = String(solve?.event || solve?.Event || "").trim().toUpperCase();
  const sessionID = String(solve?.sessionID || solve?.SessionID || "main").trim() || "main";
  const createdAt = String(
    solve?.createdAt || solve?.CreatedAt || solve?.datetime || solve?.DateTime || ""
  ).trim();
  const rawTimeMs = Number(
    solve?.rawTimeMs ??
      solve?.RawTimeMs ??
      solve?.finalTimeMs ??
      solve?.FinalTimeMs ??
      solve?.time ??
      solve?.Time
  );
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").trim().toUpperCase();

  if (event && sessionID && createdAt && Number.isFinite(rawTimeMs)) {
    return `solve:${event}|${sessionID}|${createdAt}|${Math.round(rawTimeMs)}|${penalty}`;
  }

  const solveRef = String(solve?.solveRef || solve?.SK || "").trim();
  return solveRef ? `ref:${solveRef}` : "";
}

function mergeSolveIntoListByIdentity(items, incomingSolve, preferIncoming = true) {
  const list = Array.isArray(items) ? items : [];
  const nextSolve = incomingSolve && typeof incomingSolve === "object" ? incomingSolve : null;
  if (!nextSolve) return list;

  const incomingKey = getSolveMergeKey(nextSolve);
  const incomingRef = String(nextSolve?.solveRef || "").trim();
  let didMerge = false;

  const merged = list.map((solve) => {
    const sameRef = incomingRef && String(solve?.solveRef || "").trim() === incomingRef;
    const sameIdentity = incomingKey && getSolveMergeKey(solve) === incomingKey;
    if (!sameRef && !sameIdentity) return solve;

    didMerge = true;
    const preservedFullIndex = Number.isFinite(Number(solve?.fullIndex))
      ? { fullIndex: Number(solve.fullIndex) }
      : {};

    return preferIncoming
      ? { ...solve, ...nextSolve, ...preservedFullIndex }
      : { ...nextSolve, ...solve, ...preservedFullIndex };
  });

  return didMerge ? merged : [...merged, nextSolve];
}

function hasPersistedSolveRef(solve) {
  const solveRef = String(solve?.solveRef || solve?.SK || "").trim();
  return solveRef.startsWith("SOLVE#");
}

function findSingleByTime(solves, targetTimeMs) {
  const target = Number(targetTimeMs);
  if (!Number.isFinite(target)) return null;

  const matches = (Array.isArray(solves) ? solves : []).filter((solve) => {
    const time = Number(solve?.time ?? solve?.finalTimeMs);
    return Number.isFinite(time) && Math.round(time) === Math.round(target);
  });

  if (!matches.length) return null;

  return matches.sort((a, b) => {
    const aTime = Number(a?.time ?? a?.finalTimeMs) || Number.MAX_SAFE_INTEGER;
    const bTime = Number(b?.time ?? b?.finalTimeMs) || Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.createdAt || a?.datetime || "").localeCompare(
      String(b?.createdAt || b?.datetime || "")
    );
  })[0];
}

function findAverageWindowByValue(solves, count, targetAvg) {
  const items = Array.isArray(solves) ? solves : [];
  const size = Number(count);
  const target = Number(targetAvg);
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(target) || items.length < size) {
    return [];
  }

  for (let i = 0; i <= items.length - size; i += 1) {
    const slice = items.slice(i, i + size);
    const avg = computeWindowMetricValue(slice, size);
    if (typeof avg === "number" && Math.round(avg) === Math.round(target)) {
      return slice;
    }
  }

  return [];
}

function findBestSingleSolve(solves) {
  const items = (Array.isArray(solves) ? solves : []).filter((solve) =>
    Number.isFinite(Number(solve?.time ?? solve?.finalTimeMs))
  );
  if (!items.length) return null;

  return items.reduce((best, solve) => {
    if (!best) return solve;
    const bestTime = Number(best?.time ?? best?.finalTimeMs);
    const solveTime = Number(solve?.time ?? solve?.finalTimeMs);
    if (solveTime < bestTime) return solve;
    if (solveTime > bestTime) return best;
    return String(solve?.createdAt || solve?.datetime || "").localeCompare(
      String(best?.createdAt || best?.datetime || "")
    ) < 0
      ? solve
      : best;
  }, null);
}

function findWorstSingleSolve(solves) {
  const items = (Array.isArray(solves) ? solves : []).filter((solve) =>
    Number.isFinite(Number(solve?.time ?? solve?.finalTimeMs))
  );
  if (!items.length) return null;

  return items.reduce((worst, solve) => {
    if (!worst) return solve;
    const worstTime = Number(worst?.time ?? worst?.finalTimeMs);
    const solveTime = Number(solve?.time ?? solve?.finalTimeMs);
    if (solveTime > worstTime) return solve;
    if (solveTime < worstTime) return worst;
    return String(solve?.createdAt || solve?.datetime || "").localeCompare(
      String(worst?.createdAt || worst?.datetime || "")
    ) < 0
      ? solve
      : worst;
  }, null);
}

function findBestAverageWindow(solves, count) {
  const items = Array.isArray(solves) ? solves : [];
  const size = Number(count);
  if (!Number.isFinite(size) || size <= 0 || items.length < size) return [];

  let bestWindow = [];
  let bestValue = Infinity;

  for (let i = 0; i <= items.length - size; i += 1) {
    const slice = items.slice(i, i + size);
    const avg = computeWindowMetricValue(slice, size);
    if (typeof avg === "number" && Number.isFinite(avg) && avg < bestValue) {
      bestValue = avg;
      bestWindow = slice;
    }
  }

  return bestWindow;
}

function findWorstAverageWindow(solves, count) {
  const items = Array.isArray(solves) ? solves : [];
  const size = Number(count);
  if (!Number.isFinite(size) || size <= 0 || items.length < size) return [];

  let worstWindow = [];
  let worstValue = -Infinity;

  for (let i = 0; i <= items.length - size; i += 1) {
    const slice = items.slice(i, i + size);
    const avg = computeWindowMetricValue(slice, size);
    if (typeof avg === "number" && Number.isFinite(avg) && avg > worstValue) {
      worstValue = avg;
      worstWindow = slice;
    }
  }

  return worstWindow;
}

function computeWindowMetricValue(solves, count) {
  const items = Array.isArray(solves) ? solves : [];
  const size = Number(count);
  if (!Number.isFinite(size) || size <= 0 || items.length < size) return null;

  const times = items
    .map((solve) => Number(solve?.time ?? solve?.finalTimeMs))
    .filter((time) => Number.isFinite(time));

  if (times.length !== size) return null;

  if (size === 3) {
    return times.reduce((sum, time) => sum + time, 0) / size;
  }

  return calculateAverage(times, true)?.average ?? null;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSolve(item) {
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
    item?.IsDNF === true ||
    item?.isDNF === true ||
    item?.Penalty === "DNF" ||
    item?.penalty === "DNF";

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
    datetime: item?.CreatedAt || item?.createdAt || null,
    sessionID: item?.SessionID || item?.sessionID || "main",

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
  const [sharedStatsUser, setSharedStatsUser] = useState(null);
  const [sharedStatsSessions, setSharedStatsSessions] = useState({});
  const [sharedStatsSessionsList, setSharedStatsSessionsList] = useState([]);
  const [sharedStatsSessionStats, setSharedStatsSessionStats] = useState({});
  const [sharedStatsLoading, setSharedStatsLoading] = useState(false);
  const [sharedStatsDeniedReason, setSharedStatsDeniedReason] = useState("");

  const [scrambles, setScrambles] = useState({});
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const currentSessionLoadTokenRef = useRef(0);
  const deletedSolveRefsRef = useRef(new Set());
  const currentSessionSolveCountTotalRef = useRef(null);
  const [showPlayerBar, setShowPlayerBar] = useState(true);
  const [navPrefs, setNavPrefs] = useState(DEFAULT_NAV_PREFS);
  const [showDetail, setShowDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showPostSignUpProfileSetup, setShowPostSignUpProfileSetup] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [showManualSolveModal, setShowManualSolveModal] = useState(false);
  const [manualSolveTime, setManualSolveTime] = useState("");
  const [manualSolveScramble, setManualSolveScramble] = useState("");
  const [manualSolveError, setManualSolveError] = useState("");
  const [manualSolveSaving, setManualSolveSaving] = useState(false);
  const [deleteUndoState, setDeleteUndoState] = useState(null);
  const [showDeleteUndoToast, setShowDeleteUndoToast] = useState(false);
  const [postSolveTagToast, setPostSolveTagToast] = useState("");
  const [statsSettingsContext, setStatsSettingsContext] = useState({
    eventLabel: currentEvent || "333",
    sessionLabel: currentSession || "main",
    isAllEventsMode: false,
    canRecomputeOverall: false,
    canImport: false,
    canExport: false,
    loadingOverallStats: false,
    recomputeStatusText: "",
    importBusy: false,
    exportBusy: false,
    isStatsRouteActive: false,
  });
  const [statsRecomputeRequest, setStatsRecomputeRequest] = useState(0);
  const [statsImportRequest, setStatsImportRequest] = useState(0);
  const [statsExportRequest, setStatsExportRequest] = useState(0);
  const [showStatsImportModal, setShowStatsImportModal] = useState(false);
  const [showStatsExportModal, setShowStatsExportModal] = useState(false);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState([]);
  const [selectedAverageSolve, setSelectedAverageSolve] = useState(null);
  const [sharedSession, setSharedSession] = useState(null);
  const [sharedIndex, setSharedIndex] = useState(0);
  const [shareComposer, setShareComposer] = useState({
    isOpen: false,
    post: null,
    caption: "",
    targetType: "feed",
    availableConversations: [],
    selectedConversationID: "",
    isSubmitting: false,
    isLoadingDestinations: false,
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
  const [homeDiscoveredTagOptions, setHomeDiscoveredTagOptions] = useState({});

  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceSolves, setPracticeSolves] = useState([]);
  const [showPracticeExit, setShowPracticeExit] = useState(false);
  const [practiceSaveTargetSession, setPracticeSaveTargetSession] = useState("main");

  const [scrambleProgress, setScrambleProgress] = useState(0);
  const [scrambleProgressTotal, setScrambleProgressTotal] = useState(0);
  const [scrambleCopyFeedback, setScrambleCopyFeedback] = useState("idle");

  const [dbStatus, setDbStatus] = useState({
    phase: "idle",
    op: "",
    tick: 0,
  });

  const statsSharedUserID = useMemo(() => {
    if (location.pathname !== "/stats") return "";
    const raw = new URLSearchParams(location.search).get("user");
    return String(raw || "").trim();
  }, [location.pathname, location.search]);

  const isViewingSharedStats = !!statsSharedUserID && statsSharedUserID !== String(user?.UserID || "").trim();

  const sharedReturnTargetRef = useRef(null);
  const sharedSessionRef = useRef(sharedSession);
  const hostedRoomPromptDismissRef = useRef("");
  const currentEventRef = useRef(currentEvent);
  const displayedScrambleRef = useRef("");
  const scrambleModeRef = useRef(settings?.scrambleMode || "random-state");
  const scrambleCopyTimeoutRef = useRef(null);

  const dbSuccessTimeoutRef = useRef(null);
  const dbErrorTimeoutRef = useRef(null);
  const DB_STATUS_MIN_LOADING_MS = 900;

  const settingsAutosaveTimeoutRef = useRef(null);
  const tagCatalogAutosaveTimeoutRef = useRef(null);
  const tagColorCatalogAutosaveTimeoutRef = useRef(null);
  const deleteUndoToastTimeoutRef = useRef(null);
  const postSolveTagToastTimeoutRef = useRef(null);
  const postSolveTagChordTimeoutRef = useRef(null);
  const postSolveTagSaveTimeoutRef = useRef(null);
  const postSolveTagModifierHeldRef = useRef(false);
  const pendingPostSolveTagChordRef = useRef("");
  const pendingPostSolveOllDigitsRef = useRef("");
  const pendingPostSolveTagSavesRef = useRef(new Map());
  const currentSolvesRef = useRef([]);
  const latestCreatedSolveRef = useRef({ event: "", solveRef: "" });
  const lastSavedSettingsJsonRef = useRef("");
  const skipNextSettingsAutosaveRef = useRef(false);

  useEffect(() => {
    sharedSessionRef.current = sharedSession;
  }, [sharedSession]);

  const setDbPhase = useCallback((phase, op = "") => {
    setDbStatus((prev) => ({
      phase,
      op,
      tick: (prev.tick || 0) + 1,
    }));
  }, []);

  const runDb = useCallback(async (opLabel, fn, options = {}) => {
    const showStatus = options?.showStatus !== false;
    const minLoadingMs = options?.minLoadingMs ?? DB_STATUS_MIN_LOADING_MS;
    const loadingStartedAt = showStatus ? Date.now() : 0;

    try {
      if (showStatus) {
        if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
        if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);

        setDbPhase("loading", opLabel);
      }

      const res = await fn();

      if (showStatus) {
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, minLoadingMs - elapsed);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }

        setDbPhase("success", opLabel);
        dbSuccessTimeoutRef.current = setTimeout(() => {
          setDbPhase("idle", "");
        }, 1250);
      }

      return res;
    } catch (err) {
      console.error(`DB op failed (${opLabel}):`, err);

      if (showStatus) {
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, minLoadingMs - elapsed);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }

        setDbPhase("error", opLabel);
        dbErrorTimeoutRef.current = setTimeout(() => {
          setDbPhase("idle", "");
        }, 1550);
      }

      throw err;
    }
  }, [setDbPhase]);

  useEffect(() => {
    return () => {
      if (dbSuccessTimeoutRef.current) clearTimeout(dbSuccessTimeoutRef.current);
      if (dbErrorTimeoutRef.current) clearTimeout(dbErrorTimeoutRef.current);
      if (settingsAutosaveTimeoutRef.current) clearTimeout(settingsAutosaveTimeoutRef.current);
      if (tagCatalogAutosaveTimeoutRef.current) clearTimeout(tagCatalogAutosaveTimeoutRef.current);
      if (tagColorCatalogAutosaveTimeoutRef.current) clearTimeout(tagColorCatalogAutosaveTimeoutRef.current);
      if (deleteUndoToastTimeoutRef.current) clearTimeout(deleteUndoToastTimeoutRef.current);
      if (postSolveTagSaveTimeoutRef.current) clearTimeout(postSolveTagSaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    setNavPrefs((prev) => {
      const next = {
        lastEvent: String(currentEvent || "").trim() || DEFAULT_NAV_PREFS.lastEvent,
        lastSessionByEvent: {
          ...(prev?.lastSessionByEvent && typeof prev.lastSessionByEvent === "object"
            ? prev.lastSessionByEvent
            : {}),
          [String(currentEvent || "").trim() || DEFAULT_NAV_PREFS.lastEvent]:
            String(currentSession || "main").trim() || "main",
        },
        showPlayerBar,
      };

      const sameLastEvent = String(prev?.lastEvent || "") === next.lastEvent;
      const sameShowPlayerBar = Boolean(prev?.showPlayerBar) === Boolean(next.showPlayerBar);
      const prevSession =
        prev?.lastSessionByEvent?.[next.lastEvent] || "main";
      const nextSession =
        next.lastSessionByEvent?.[next.lastEvent] || "main";

      if (sameLastEvent && sameShowPlayerBar && String(prevSession) === String(nextSession)) {
        return prev;
      }

      return next;
    });
  }, [currentEvent, currentSession, isSignedIn, showPlayerBar, user?.UserID]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;
    writeNavPrefs(user.UserID, navPrefs);
  }, [isSignedIn, navPrefs, user?.UserID]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const browserTimeZone = getBrowserTimeZone();
    if (!browserTimeZone) return;

    const savedTimeZone = String(
      settings?.timeZone ||
        settings?.TimeZone ||
        settings?.timezone ||
        settings?.Timezone ||
        ""
    ).trim();

    if (savedTimeZone === browserTimeZone) return;

    updateSettings({ timeZone: browserTimeZone });
  }, [isSignedIn, user?.UserID, settings?.timeZone, settings?.TimeZone, settings?.timezone, settings?.Timezone, updateSettings]);

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

  const eventKey = currentEvent;
  const tagScopeEventKey = useMemo(() => getTagScopeEventKey(eventKey), [eventKey]);

  const isRelayActive =
    activeSessionObj?.SessionType === "RELAY" &&
    relayLegs.length > 0;

  const relayCurrentEvent = isRelayActive ? relayLegs[relayLegIndex] : null;
  const relayCurrentScramble = isRelayActive
    ? relayScrambles[relayLegIndex] || ""
    : "";
  const sharedPerspective = useMemo(
    () => getSharedPerspective(sharedSession, user?.UserID, currentEvent),
    [sharedSession, user?.UserID, currentEvent]
  );
  const sharedCurrentEvent = sharedSession
    ? sharedPerspective.yourEvents?.[sharedIndex] ||
      sharedPerspective.yourFallbackEvent ||
      currentEvent
    : null;

  const displayedScramble = useMemo(() => {
    return sharedSession
      ? sharedPerspective.yourScrambles?.[sharedIndex] || sharedSession.scrambles?.[sharedIndex] || ""
      : isRelayActive
      ? relayCurrentScramble
      : scrambles[currentEvent]?.[0] || "";
  }, [
    sharedSession,
    sharedPerspective,
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

  const syncScrambleQueue = useCallback(async (event, minCount = 10) => {
    const ev = String(event || "").trim();
    if (!ev) return [];

    const cached = getScrambleQueueSnapshot(ev);
    if (cached.length > 0) {
      setScrambles((prev) => ({
        ...(prev || {}),
        [ev]: cached,
      }));

      if (cached.length >= minCount) {
        return cached;
      }

      warmScrambleQueue(ev, minCount)
        .then((refilled) => {
          setScrambles((prev) => ({
            ...(prev || {}),
            [ev]: refilled,
          }));
        })
        .catch((err) => {
          console.error(`Failed to refill scramble queue for ${ev}:`, err);
        });

      return cached;
    }

    // Only block on the next visible scramble so slower generators like 4x4
    // can populate the UI quickly while the rest of the queue warms in back.
    const immediateQueue = await warmScrambleQueue(ev, 1);
    setScrambles((prev) => ({
      ...(prev || {}),
      [ev]: immediateQueue,
    }));

    if (minCount > 1) {
      warmScrambleQueue(ev, minCount)
        .then((refilled) => {
          setScrambles((prev) => ({
            ...(prev || {}),
            [ev]: refilled,
          }));
        })
        .catch((err) => {
          console.error(`Failed to refill scramble queue for ${ev}:`, err);
        });
    }

    return immediateQueue;
  }, []);

  useEffect(() => {
    const mode = settings?.scrambleMode || "random-state";
    const previousMode = scrambleModeRef.current;

    setGlobalScrambleMode(mode);

    if (previousMode !== mode) {
      clearScrambleQueue();
    }

    scrambleModeRef.current = mode;

    syncScrambleQueue(currentEvent, 10).catch((err) => {
      console.error(`Failed to sync scramble queue for ${currentEvent}:`, err);
    });
  }, [settings?.scrambleMode, currentEvent, syncScrambleQueue]);

  useEffect(() => {
    currentEventRef.current = currentEvent;
  }, [currentEvent]);

  useEffect(() => {
    displayedScrambleRef.current = displayedScramble;
  }, [displayedScramble]);

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
    if (!showManualSolveModal) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !manualSolveSaving) {
        setShowManualSolveModal(false);
        setManualSolveError("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showManualSolveModal, manualSolveSaving]);

  useEffect(() => {
    const onCubeSolve = (e) => {
      console.log("SMART SOLVE", e.detail);
    };

    window.addEventListener("pts:cubeSolve", onCubeSolve);
    return () => window.removeEventListener("pts:cubeSolve", onCubeSolve);
  }, []);

  const tagCatalog = useMemo(() => normalizeTagCatalog(user?.TagCatalog), [user?.TagCatalog]);
  const tagColorCatalog = useMemo(
    () => normalizeTagColorCatalog(user?.TagColorCatalog),
    [user?.TagColorCatalog]
  );

  const queueTagCatalogSave = useCallback(
    (nextCatalog) => {
      if (!user?.UserID) return;

      if (tagCatalogAutosaveTimeoutRef.current) {
        clearTimeout(tagCatalogAutosaveTimeoutRef.current);
      }

      tagCatalogAutosaveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateUser(user.UserID, {
            TagCatalog: normalizeTagCatalog(nextCatalog),
          });
        } catch (err) {
          console.error("Failed to autosave tag catalog:", err);
        }
      }, 500);
    },
    [user?.UserID]
  );

  const queueTagColorCatalogSave = useCallback(
    (nextCatalog) => {
      if (!user?.UserID) return;

      if (tagColorCatalogAutosaveTimeoutRef.current) {
        clearTimeout(tagColorCatalogAutosaveTimeoutRef.current);
      }

      tagColorCatalogAutosaveTimeoutRef.current = setTimeout(async () => {
        try {
          await updateUser(user.UserID, {
            TagColorCatalog: normalizeTagColorCatalog(nextCatalog),
          });
        } catch (err) {
          console.error("Failed to autosave tag color catalog:", err);
        }
      }, 500);
    },
    [user?.UserID]
  );

  const rememberTagSelectionValues = useCallback(
    (selection) => {
      if (!tagScopeEventKey || !user?.UserID) return;

      let nextCatalog = tagCatalog;
      let changed = false;

      for (const field of SHARED_TAG_FIELDS) {
        const value = String(selection?.[field] || "").trim();
        if (!value) continue;
        const updated = addTagCatalogValue(nextCatalog, tagScopeEventKey, field, value);
        if (JSON.stringify(updated) !== JSON.stringify(nextCatalog)) {
          nextCatalog = updated;
          changed = true;
        }
      }

      if (!changed) return;

      setUser((prev) => ({
        ...(prev || {}),
        TagCatalog: nextCatalog,
      }));
      queueTagCatalogSave(nextCatalog);
    },
    [tagScopeEventKey, user?.UserID, tagCatalog, queueTagCatalogSave]
  );

  const currentTags = useMemo(() => {
    const base = {
      ...makeEmptyTagSelection(),
      ...(tagsByEvent[tagScopeEventKey] || {}),
    };

    base.TimerInput = String(settings?.timerInput || "Keyboard").trim() || "Keyboard";

    if (practiceMode) base.SolveSource = "Practice";
    else if (sharedSession?.sharedID) base.SolveSource = getSharedSolveSourceLabel(sharedSession);
    else if (activeSessionObj?.SessionType === "RELAY") {
      base.SolveSource = "Relay";
    } else if (String(settings?.timerInput || "").trim() === "GAN Cube") {
      base.SolveSource = "SmartCube";
    } else {
      base.SolveSource = "Standard";
    }

    return base;
  }, [
    tagsByEvent,
    tagScopeEventKey,
    settings?.timerInput,
    practiceMode,
    sharedSession?.sharedID,
    activeSessionObj?.SessionType,
  ]);

  const currentTagColors = useMemo(
    () => getTagColorMapForEvent(tagColorCatalog, eventKey),
    [tagColorCatalog, eventKey]
  );

  const scopedCubeModelConfigOptions = useMemo(
    () => getConfiguredCubeModelOptionsForEvent(tagConfig, eventKey),
    [tagConfig, eventKey]
  );
  const currentSessionSolveCountTotal = useMemo(() => {
    const normalizedEvent = String(eventKey || "").toUpperCase();
    const sessionId = String(currentSession || "main");
    const stats = sessionStats?.[normalizedEvent]?.[sessionId];

    return (
      stats?.SolveCountTotal ??
      stats?.solveCountTotal ??
      stats?.SolveCount ??
      stats?.solveCount ??
      null
    );
  }, [currentSession, eventKey, sessionStats]);

  useEffect(() => {
    currentSessionSolveCountTotalRef.current = currentSessionSolveCountTotal;
  }, [currentSessionSolveCountTotal]);

  const homeTagConfig = useMemo(
    () => ({
      ...tagConfig,
      Fixed: {
        ...(tagConfig?.Fixed || {}),
        CubeModel: {
          ...(tagConfig?.Fixed?.CubeModel || {}),
          options: scopedCubeModelConfigOptions,
        },
      },
    }),
    [scopedCubeModelConfigOptions, tagConfig]
  );

  useEffect(() => {
    rememberTagSelectionValues(currentTags);
  }, [currentTags, rememberTagSelectionValues]);

  const buildTagPayload = (baseTags = {}) => {
    const t = currentTags || makeEmptyTagSelection();
    const payload = { ...(baseTags || {}) };

    for (const field of SHARED_TAG_FIELDS) {
      if (field === "TimerInput" || field === "SolveSource") continue;
      if (t[field]) payload[field] = t[field];
    }

    payload.TimerInput =
      payload.TimerInput || t.TimerInput || settings.timerInput || "Keyboard";

    if (!payload.SolveSource) {
      if (payload.IsShared || payload.Shared) {
        payload.SolveSource = getSharedSolveSourceLabel(sharedSession);
      }
      else if (payload.IsRelay) payload.SolveSource = "Relay";
      else if (payload.SmartCube) payload.SolveSource = "SmartCube";
      else payload.SolveSource = "Standard";
    }

    return payload;
  };

  const clearPendingPostSolveTagChord = useCallback(() => {
    pendingPostSolveTagChordRef.current = "";
    pendingPostSolveOllDigitsRef.current = "";
    if (postSolveTagChordTimeoutRef.current) {
      clearTimeout(postSolveTagChordTimeoutRef.current);
      postSolveTagChordTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const loadToken = ++currentSessionLoadTokenRef.current;
    let cancelled = false;

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
        if (cancelled || currentSessionLoadTokenRef.current !== loadToken) return;

        const normalizedSolves = solves
          .map(normalizeSolve)
          .filter((solve) => {
            const solveRef = String(solve?.solveRef || solve?.SK || "").trim();
            return !solveRef || !deletedSolveRefsRef.current.has(solveRef);
          });
        const existingTotalCount = currentSessionSolveCountTotalRef.current;

        setSessions((prev) => {
          const existingForEvent = Array.isArray(prev?.[eventKey]) ? prev[eventKey] : [];
          const currentSessionSolves = existingForEvent.filter((solve) => {
            if (String(solve?.sessionID || solve?.SessionID || "main") !== String(sessionId)) {
              return false;
            }
            const solveRef = String(solve?.solveRef || solve?.SK || "").trim();
            return !solveRef || !deletedSolveRefsRef.current.has(solveRef);
          });
          const otherSessions = existingForEvent.filter(
            (solve) =>
              String(solve?.sessionID || solve?.SessionID || "main") !== String(sessionId)
          );
          let mergedSolves = [...currentSessionSolves];

          normalizedSolves.forEach((solve) => {
            mergedSolves = mergeSolveIntoListByIdentity(mergedSolves, solve, true);
          });

          const normalizedCurrentSessionSolves = assignExplicitSolveIndices(
            mergedSolves.sort((a, b) => {
              const ta = new Date(a?.datetime || "").getTime();
              const tb = new Date(b?.datetime || "").getTime();
              return ta - tb;
            }),
            existingTotalCount
          );

          const nextEventSolves = [...otherSessions, ...normalizedCurrentSessionSolves].sort((a, b) => {
            const ta = new Date(a?.datetime || "").getTime();
            const tb = new Date(b?.datetime || "").getTime();
            return ta - tb;
          });

          return {
            ...prev,
            [eventKey]: nextEventSolves,
          };
        });
      } catch (err) {
        if (cancelled || currentSessionLoadTokenRef.current !== loadToken) return;
        console.error("Error loading solves for current event/session:", err);
      }
    };

    loadSolvesForCurrent();

    return () => {
      cancelled = true;
    };
  }, [currentSession, eventKey, isSignedIn, normalizeSolve, user?.UserID]);

  useEffect(() => {
    if (!isSignedIn || !user?.UserID || practiceMode) return;

    let cancelled = false;

    (async () => {
      try {
        const normalizedEvent = String(eventKey || "").toUpperCase();
        const sessionId = String(currentSession || "main");
        const stats = await getSessionStats(user.UserID, normalizedEvent, sessionId);

        if (cancelled) return;

        setSessionStats((prev) => ({
          ...(prev || {}),
          [normalizedEvent]: {
            ...(prev?.[normalizedEvent] || {}),
            [sessionId]: stats || null,
          },
        }));

        setSessionsList((prev) =>
          Array.isArray(prev)
            ? prev.map((session) =>
                String(session?.Event || "").toUpperCase() === normalizedEvent &&
                String(session?.SessionID || "main") === sessionId
                  ? {
                      ...session,
                      Stats: stats || null,
                    }
                  : session
              )
            : prev
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to refresh session stats for home summary:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isSignedIn,
    user?.UserID,
    eventKey,
    currentSession,
    practiceMode,
    statsMutationTick,
    location.pathname,
  ]);

  useEffect(() => {
    if (!sharedSession?.sharedID) return;
    setSharedIndex(0);
  }, [sharedSession?.sharedID]);

  const adjustSessionSolveCount = useCallback((eventCode, sessionID, delta, fallbackBase = 0) => {
    const ev = String(eventCode || "").toUpperCase();
    const sid = String(sessionID || "main");
    const change = Number(delta);

    if (!ev || !Number.isFinite(change) || change === 0) return;

    setSessionStats((prev) => {
      const prevEventStats = prev?.[ev] || {};
      const prevSessionStats = prevEventStats?.[sid] || null;
      const baseCount = Number(
        prevSessionStats?.SolveCountTotal ??
          prevSessionStats?.solveCountTotal ??
          prevSessionStats?.SolveCount ??
          prevSessionStats?.solveCount ??
          fallbackBase ??
          0
      );
      const nextCount = Math.max(0, baseCount + change);

      return {
        ...(prev || {}),
        [ev]: {
          ...prevEventStats,
          [sid]: {
            ...(prevSessionStats || {}),
            SolveCountTotal: nextCount,
          },
        },
      };
    });
  }, []);

  const mergeCanonicalSessionStats = useCallback(
    (eventCode, sessionID, stats) => {
      const ev = String(eventCode || "").toUpperCase();
      const sid = String(sessionID || "main");
      if (!ev || !sid) return;

      setSessionStats((prev) => ({
        ...(prev || {}),
        [ev]: {
          ...(prev?.[ev] || {}),
          [sid]: stats || null,
        },
      }));

      setSessionsList((prev) =>
        Array.isArray(prev)
          ? prev.map((session) =>
              String(session?.Event || "").toUpperCase() === ev &&
              String(session?.SessionID || "main") === sid
                ? {
                    ...session,
                    Stats: stats || null,
                  }
                : session
            )
          : prev
      );
    },
    []
  );

  useEffect(() => {
    if (!isSignedIn || !user?.UserID || !eventKey) {
      setHomeDiscoveredTagOptions({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const valuesByField = await getTagValues(user.UserID, {
          event: eventKey,
        });

        if (!cancelled) {
          setHomeDiscoveredTagOptions(valuesByField || {});
        }
      } catch (err) {
        console.error("Failed loading tag values for home selector:", err);
        if (!cancelled) setHomeDiscoveredTagOptions({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.UserID, eventKey, currentSession]);

  useEffect(() => {
    if (!sharedSession) return;

    const { sessionID } = sharedSession;
    const perspective = getSharedPerspective(sharedSession, user?.UserID, currentEvent);
    const nextSharedEvent =
      perspective.yourEvents?.[sharedIndex] || perspective.yourFallbackEvent || "333";
    const nextSessionID = isHostedSharedSession(sharedSession)
      ? getSharedSaveSessionID(sharedSession)
      : sessionID || "main";

    setCurrentEvent(nextSharedEvent);
    setCurrentSession(nextSessionID);
    setShowPlayerBar(true);

    console.log("Loaded Shared Session:", sessionID, "saveTarget:", nextSessionID);
  }, [sharedIndex, sharedSession, user?.UserID, currentEvent]);

  useEffect(() => {
    const isRelay = activeSessionObj?.SessionType === "RELAY";

    if (!isRelay) return;

    const legs = Array.isArray(activeSessionObj?.RelayLegs)
      ? activeSessionObj.RelayLegs
      : [];

    setRelayLegs(legs);
    setRelayLegIndex(0);
    setRelayLegTimes([]);

    let cancelled = false;

    (async () => {
      try {
        const generated = await generateRelayScrambles(legs);
        if (cancelled) return;
        setRelayScrambles(generated);
      } catch (err) {
        console.error("Failed to generate relay scrambles:", err);
        if (!cancelled) setRelayScrambles([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentEvent, currentSession, activeSessionObj]);

  const preloadScrambles = useCallback(
    async (event) => {
      await syncScrambleQueue(event, 10);
    },
    [syncScrambleQueue]
  );

  const getNextScramble = useCallback(
    async (eventOverride = null) => {
      const ev = eventOverride || currentEventRef.current;
      const { scramble, queue } = await consumeScramble(ev);

      setScrambles((prev) => ({
        ...(prev || {}),
        [ev]: queue,
      }));

      warmScrambleQueue(ev, 10)
        .then((refilled) => {
          setScrambles((prev) => ({
            ...(prev || {}),
            [ev]: refilled,
          }));
        })
        .catch((err) => {
          console.error(`Failed to refill scramble queue for ${ev}:`, err);
        });

      return scramble;
    },
    []
  );

  const skipToNextScramble = useCallback(
    async (eventOverride = null) => {
      const ev = eventOverride || currentEventRef.current;
      const { queue } = await replaceHeadScramble(ev);

      setScrambles((prev) => ({
        ...(prev || {}),
        [ev]: queue,
      }));

      warmScrambleQueue(ev, 10)
        .then((refilled) => {
          setScrambles((prev) => ({
            ...(prev || {}),
            [ev]: refilled,
          }));
        })
        .catch((err) => {
          console.error(`Failed to refill scramble queue for ${ev}:`, err);
        });
    },
    []
  );

  const resetRelaySet = useCallback(async () => {
    const legs = Array.isArray(relayLegs) ? relayLegs : [];
    if (!legs.length) return;

    setRelayLegIndex(0);
    setRelayLegTimes([]);

    try {
      const generated = await generateRelayScrambles(legs);
      setRelayScrambles(generated);
    } catch (err) {
      console.error("Failed to reset relay scrambles:", err);
      setRelayScrambles([]);
    }
  }, [relayLegs]);

  const extendCasualSharedSession = useCallback(
    async (session, batchSize = null) => {
      if (!session?.sharedID) return session;

      const size = Math.max(5, Number(batchSize || session?.batchSize || 25) || 25);
      const perspective = getSharedPerspective(session, user?.UserID, currentEvent);
      const baseEvent = normalizeSharedEventKey(
        perspective.yourFallbackEvent || session?.event || currentEvent || "333"
      );
      const creatorEvents = [];
      const opponentEvents = [];
      const creatorScrambles = [];
      const opponentScrambles = [];

      for (let i = 0; i < size; i += 1) {
        const scramble = await generateScrambleForEvent(baseEvent);
        creatorEvents.push(baseEvent);
        opponentEvents.push(baseEvent);
        creatorScrambles.push(scramble);
        opponentScrambles.push(scramble);
      }

      const payload = {
        sharedID: session.sharedID,
        count: getSharedSolveCount(session) + creatorScrambles.length,
        creatorEvents,
        opponentEvents,
        creatorScrambles,
        opponentScrambles,
      };

      const nextSession = applySharedExtensionsToSession(
        {
          ...session,
          batchSize: size,
        },
        [{ text: `[sharedExtend]${JSON.stringify(payload)}`, timestamp: new Date().toISOString() }]
      );

      setSharedSession((prev) =>
        prev?.sharedID === session.sharedID ? nextSession : prev
      );

      if (isSignedIn && user?.UserID && session?.conversationID) {
        try {
          await sendMessage(
            session.conversationID,
            user.UserID,
            `[sharedExtend]${JSON.stringify(payload)}`
          );
        } catch (err) {
          console.warn("Failed to broadcast shared extension:", err);
        }
      }

      return nextSession;
    },
    [user?.UserID, currentEvent, isSignedIn]
  );

  const restorePreviousSessionAfterShared = useCallback(() => {
    const target = sharedReturnTargetRef.current;

    setSharedSession(null);
    setSharedIndex(0);

    if (target) {
      setCurrentEvent(target.event || "333");
      setCurrentSession(target.session || "main");
      setActiveSessionObj(target.activeSessionObj || null);
    }

    sharedReturnTargetRef.current = null;
  }, []);

  const beginSharedSession = useCallback(
    (session, options = {}) => {
      if (!session) return;
      const requestedIndex = Number(options?.targetIndex);
      const resumeCurrent =
        options?.mode === "resume" &&
        sharedSession?.sharedID &&
        sharedSession.sharedID === session.sharedID;
      const nextIndex =
        Number.isFinite(requestedIndex) && requestedIndex >= 0
          ? requestedIndex
          : resumeCurrent
          ? sharedIndex
          : isHostedSharedSession(session)
          ? findHostedSharedIndex(session)
          : session?.sharedID && user?.UserID
          ? findSharedNextIndex(session, user.UserID)
          : 0;

      if (!sharedSession) {
        sharedReturnTargetRef.current = {
          event: currentEvent,
          session: currentSession,
          activeSessionObj,
        };
      }

      setSharedSession(session);
      setSharedIndex(nextIndex);
      setShowPlayerBar(true);
    },
    [sharedSession, sharedIndex, currentEvent, currentSession, activeSessionObj, user?.UserID]
  );

  const startHostedRoomSessionForEvent = useCallback(
    async (nextEvent) => {
      if (!sharedSession?.conversationID || !user?.UserID) return false;

      const normalizedEvent = normalizeSharedEventKey(nextEvent || currentEvent);
      if (!normalizedEvent) return false;

      const batchSize = Math.max(5, Number(sharedSession?.batchSize || 25) || 25);
      const creatorEvents = [];
      const opponentEvents = [];
      const creatorScrambles = [];
      const opponentScrambles = [];

      for (let i = 0; i < batchSize; i += 1) {
        const scramble = await generateScrambleForEvent(normalizedEvent);
        creatorEvents.push(normalizedEvent);
        opponentEvents.push(normalizedEvent);
        creatorScrambles.push(scramble);
        opponentScrambles.push(scramble);
      }

      const payload = {
        v: 2,
        mode: "hosted",
        type: "hosted",
        sharedID: `SHARED#${sharedSession.conversationID}#${normalizedEvent}#${Date.now()}`,
        count: creatorScrambles.length,
        batchSize,
        isHosted: true,
        saveSessionID: getSharedSaveSessionID(sharedSession),
        hostID: user.UserID,
        hostName: user?.Username || user?.Name || user.UserID,
        roomCode: sharedSession.roomCode || null,
        creatorID: user.UserID,
        creatorEvent: normalizedEvent,
        opponentEvent: normalizedEvent,
        creatorEvents,
        opponentEvents,
        creatorScrambles,
        opponentScrambles,
      };

      const text = `[sharedAoN]${JSON.stringify(payload)}`;
      const timestamp = new Date().toISOString();

      try {
        await sendMessage(sharedSession.conversationID, user.UserID, text);
      } catch (err) {
        console.warn("Failed to broadcast hosted room event switch:", err);
        return false;
      }

      const nextSession = buildHostedSharedSession(
        payload,
        {
          ...sharedSession,
          conversationID: sharedSession.conversationID,
        },
        [{ text, timestamp }]
      );

      hostedRoomPromptDismissRef.current = "";
      setSharedSession(nextSession);
      setSharedIndex(findHostedSharedIndex(nextSession));
      setShowPlayerBar(true);
      return true;
    },
    [sharedSession, user?.UserID, user?.Username, user?.Name, currentEvent]
  );

  const closeHostedRoom = useCallback(async () => {
    if (!sharedSession?.conversationID || !isHostedSharedSession(sharedSession) || !user?.UserID) {
      return false;
    }

    const payload = {
      conversationID: sharedSession.conversationID,
      roomCode: sharedSession.roomCode || null,
      closedBy: user.UserID,
      closedByName: user?.Username || user?.Name || user.UserID,
      closedAt: new Date().toISOString(),
    };

    try {
      await sendMessage(
        sharedSession.conversationID,
        user.UserID,
        `[sharedRoomClosed]${JSON.stringify(payload)}`
      );
    } catch (err) {
      console.warn("Failed to close hosted room:", err);
      return false;
    }

    hostedRoomPromptDismissRef.current = "";
    restorePreviousSessionAfterShared();
    return true;
  }, [sharedSession, user?.UserID, user?.Username, user?.Name, restorePreviousSessionAfterShared]);

  const goForwardScramble = useCallback(async () => {
    const isRelay = activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      await resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.min(i + 1, sharedSession.scrambles.length - 1));
    } else {
      await skipToNextScramble();
    }
  }, [
    activeSessionObj,
    resetRelaySet,
    sharedSession,
    skipToNextScramble,
  ]);

  const goBackwardScramble = useCallback(async () => {
    const isRelay = activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      await resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.max(i - 1, 0));
    } else {
      const { queue } = await prependScramble(currentEvent);

      setScrambles((prev) => ({
        ...(prev || {}),
        [currentEvent]: queue,
      }));
    }
  }, [currentEvent, activeSessionObj, resetRelaySet, sharedSession]);

  const mergeSharedSession = (session) => {
    console.log("Merging shared session:", session);
  };

  const refreshActiveSharedSession = useCallback(async () => {
    const activeSharedSession = sharedSessionRef.current;
    if (!activeSharedSession?.conversationID || !activeSharedSession?.sharedID || !user?.UserID) {
      return;
    }

    try {
      const messages = await getMessages(activeSharedSession.conversationID, user.UserID, 100);
      const latestHostedEntry = getLatestHostedSharedMessage(messages);
      const latestClosedEntry = getLatestHostedRoomClosedMessage(messages);

      if (isHostedSharedSession(activeSharedSession) && latestClosedEntry?.payload) {
        const closedConversationID = String(
          latestClosedEntry.payload?.conversationID || ""
        ).trim();
        const currentConversationID = String(activeSharedSession.conversationID || "").trim();
        const closedTs = new Date(
          latestClosedEntry?.msg?.timestamp || latestClosedEntry?.msg?.createdAt || 0
        ).getTime();
        const hostedTs = new Date(
          latestHostedEntry?.msg?.timestamp || latestHostedEntry?.msg?.createdAt || 0
        ).getTime();

        if (
          closedConversationID &&
          currentConversationID &&
          closedConversationID === currentConversationID &&
          closedTs >= hostedTs
        ) {
          const closedBy = String(
            latestClosedEntry.payload?.closedByName ||
              latestClosedEntry.payload?.closedBy ||
              "The host"
          ).trim();
          const isHost =
            String(activeSharedSession.hostID || activeSharedSession.creatorID || "").trim() ===
            String(user.UserID || "").trim();

          if (!isHost) {
            window.alert(`${closedBy} closed this room.`);
          }

          hostedRoomPromptDismissRef.current = "";
          restorePreviousSessionAfterShared();
          return;
        }
      }

      if (isHostedSharedSession(activeSharedSession) && latestHostedEntry?.payload?.sharedID) {
        const nextHostedID = String(latestHostedEntry.payload.sharedID || "").trim();
        const currentHostedID = String(activeSharedSession.sharedID || "").trim();
        const isHost =
          String(activeSharedSession.hostID || activeSharedSession.creatorID || "").trim() ===
          String(user.UserID || "").trim();

        if (nextHostedID && nextHostedID !== currentHostedID) {
          if (!isHost) {
            if (hostedRoomPromptDismissRef.current !== nextHostedID) {
              const nextHostedEvent =
                latestHostedEntry.payload?.creatorEvent ||
                latestHostedEntry.payload?.event ||
                activeSharedSession?.event ||
                "333";
              const shouldFollow = window.confirm(
                `The host switched this room to ${sharedEventLabel(
                  nextHostedEvent
                )}. Follow the new scramble feed?`
              );

              if (!shouldFollow) {
                hostedRoomPromptDismissRef.current = nextHostedID;
              } else {
                const nextHostedSession = buildHostedSharedSession(
                  latestHostedEntry.payload,
                  activeSharedSession,
                  messages
                );
                hostedRoomPromptDismissRef.current = "";
                setSharedSession(nextHostedSession);
                setSharedIndex(findHostedSharedIndex(nextHostedSession));
                setShowPlayerBar(true);
              }
            }
          } else {
            const nextHostedSession = buildHostedSharedSession(
              latestHostedEntry.payload,
              activeSharedSession,
              messages
            );
            setSharedSession(nextHostedSession);
            setSharedIndex(findHostedSharedIndex(nextHostedSession));
          }
        }
      }

      const incomingRoundResults = buildRoundResultsFromMessages(
        messages,
        activeSharedSession.sharedID
      );

      setSharedSession((prev) => {
        if (!prev || prev.sharedID !== activeSharedSession.sharedID) return prev;
        const extended = applySharedExtensionsToSession(
          {
            ...prev,
            roundResults: mergeRoundResults(prev.roundResults, incomingRoundResults),
          },
          messages
        );
        return {
          ...prev,
          ...extended,
          roundResults: mergeRoundResults(prev.roundResults, incomingRoundResults),
        };
      });
    } catch (err) {
      console.warn("Failed to refresh active shared session:", err);
    }
  }, [user?.UserID, restorePreviousSessionAfterShared]);

  useEffect(() => {
    if (!sharedSession?.conversationID || !sharedSession?.sharedID) return;
    if (!user?.UserID) return;

    refreshActiveSharedSession();

    const id = setInterval(() => {
      refreshActiveSharedSession();
    }, 10000);

    return () => clearInterval(id);
  }, [
    sharedSession?.conversationID,
    sharedSession?.sharedID,
    user?.UserID,
    refreshActiveSharedSession,
  ]);

  const clearPractice = () => {
    setPracticeSolves([]);
  };

  const queueDeleteUndoToast = useCallback(() => {
    setShowDeleteUndoToast(true);

    if (deleteUndoToastTimeoutRef.current) {
      clearTimeout(deleteUndoToastTimeoutRef.current);
    }

    deleteUndoToastTimeoutRef.current = setTimeout(() => {
      setShowDeleteUndoToast(false);
    }, 8000);
  }, []);

  const queuePostSolveTagToast = useCallback((label) => {
    const message = String(label || "").trim();
    if (!message) return;

    setPostSolveTagToast(message);

    if (postSolveTagToastTimeoutRef.current) {
      clearTimeout(postSolveTagToastTimeoutRef.current);
    }

    postSolveTagToastTimeoutRef.current = setTimeout(() => {
      setPostSolveTagToast("");
    }, 2200);
  }, []);

  const deletePracticeTime = (index, options = {}) => {
    const requireConfirm = options?.requireConfirm === true;

    setPracticeSolves((prev) => {
      const targetSolve = prev?.[index];
      if (!targetSolve) return prev;

      if (
        requireConfirm &&
        !window.confirm("Delete this solve? You can undo it right after.")
      ) {
        return prev;
      }

      setDeleteUndoState({
        source: "practice",
        index,
        solve: targetSolve,
      });
      queueDeleteUndoToast();

      return prev.filter((_, i) => i !== index);
    });
  };

  const startPractice = () => {
    restorePreviousSessionAfterShared();

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
      adjustSessionSolveCount(ev, targetSessionID, savedSolves.length, sessions[ev]?.length || 0);
      setStatsMutationTick((t) => t + 1);

      setShowPracticeExit(false);
      setPracticeMode(false);
      clearPractice();
    } catch (err) {
      console.error("Failed saving practice solves:", err);
    }
  };

  const handleSignUp = async (username, password) => {
    try {
      const defaultProfileScramble = await generateScrambleForEvent("333");

      await runDb("Creating account", async () => {
        await createUser({
          userID: username,
          name: username,
          username: username,
          color: "#0E171D",
          profileEvent: "333",
          profileScramble: defaultProfileScramble,
          chosenStats: [],
          headerStats: [],
          wcaid: null,
          cubeCollection: [],
          settings: {
            timeZone: getBrowserTimeZone(),
          },
          tagConfig: DEFAULT_TAG_CONFIG,
          tagCatalog: { Global: {}, ByEvent: {} },
          Friends: [],
        });

        const createSessionPromises = DEFAULT_EVENTS.map((event) =>
          createSession(
            username,
            event,
            "main",
            "Main",
            getRelaySessionOptions(event)
          )
        );
        await Promise.all(createSessionPromises);
      });

      alert("User created successfully!");

      const profile = await getUser(username);
      const userID = profile?.PK?.split("#")[1] || username;

      skipNextSettingsAutosaveRef.current = true;
      setAllSettings(
        profile?.Settings && typeof profile.Settings === "object"
          ? profile.Settings
          : {}
      );
      lastSavedSettingsJsonRef.current = JSON.stringify(
        profile?.Settings && typeof profile.Settings === "object"
          ? profile.Settings
          : {}
      );

      setTagConfig(normalizeTagConfig(profile?.TagConfig));

      setUser({
        ...profile,
        UserID: userID,
      });
      setIsSignedIn(true);
      setShowSignInPopup(false);
      setShowPostSignUpProfileSetup(true);
      setShowTutorialModal(false);

      const restoredNavPrefs = readNavPrefs(userID, profile?.Settings || {});
      setNavPrefs(restoredNavPrefs);
      setCurrentEvent(restoredNavPrefs.lastEvent || "333");
      setCurrentSession(
        restoredNavPrefs.lastSessionByEvent?.[restoredNavPrefs.lastEvent || "333"] || "main"
      );
      setShowPlayerBar(
        typeof restoredNavPrefs.showPlayerBar === "boolean"
          ? restoredNavPrefs.showPlayerBar
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

      const userWithData = {
        ...profile,
        UserID: userID,
        Posts: Array.isArray(profile?.Posts) ? profile.Posts : [],
        Friends: profile.Friends || [],
      };

      skipNextSettingsAutosaveRef.current = true;
      setAllSettings(
        profile?.Settings && typeof profile.Settings === "object"
          ? profile.Settings
          : {}
      );
      lastSavedSettingsJsonRef.current = JSON.stringify(
        profile?.Settings && typeof profile.Settings === "object"
          ? profile.Settings
          : {}
      );

      setTagConfig(normalizeTagConfig(profile?.TagConfig));

      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);

      let sessionItems = await getSessions(userID);

      setSessionsList(sessionItems);
      setCustomEvents([]);

      const restoredNavPrefs = readNavPrefs(userID, profile?.Settings || {});
      setNavPrefs(restoredNavPrefs);
      const restoredEvent = restoredNavPrefs.lastEvent || "333";
      const restoredSession =
        restoredNavPrefs.lastSessionByEvent?.[restoredEvent] || "main";

      setCurrentEvent(restoredEvent);
      setCurrentSession(restoredSession);
      setShowPlayerBar(
        typeof restoredNavPrefs.showPlayerBar === "boolean"
          ? restoredNavPrefs.showPlayerBar
          : true
      );

      const missingEvents = DEFAULT_EVENTS.filter(
        (event) =>
          !sessionItems.find((s) => s.Event === event && s.SessionID === "main")
      );

      const relayEventsNeedingRepair = DEFAULT_EVENTS.filter((event) => {
        const relayOpts = getRelaySessionOptions(event);
        if (relayOpts.sessionType !== "RELAY") return false;

        const session = sessionItems.find((s) => s.Event === event && s.SessionID === "main");
        if (!session) return true;

        const currentLegs = Array.isArray(session.RelayLegs) ? session.RelayLegs : [];
        return session.SessionType !== "RELAY" || currentLegs.join("|") !== relayOpts.relayLegs.join("|");
      });

      if (missingEvents.length > 0 || relayEventsNeedingRepair.length > 0) {
        await runDb("Creating sessions", async () => {
          const targetEvents = Array.from(new Set([...missingEvents, ...relayEventsNeedingRepair]));
          const createMissing = targetEvents.map((event) =>
            createSession(
              userID,
              event,
              "main",
              "Main",
              getRelaySessionOptions(event)
            )
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

      syncScrambleQueue(restoredEvent, 10).catch((err) => {
        console.error(
          `Failed to warm scramble queue for restored event ${restoredEvent}:`,
          err
        );
      });
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };

  const handleCompletePostSignUpProfileSetup = async (draft) => {
    if (!user?.UserID) return;

    const updates = {
      Color: String(draft?.color || "#0E171D").trim() || "#0E171D",
      ProfileEvent: String(draft?.profileEvent || "333").trim().toUpperCase() || "333",
      ProfileScramble: String(draft?.profileScramble || "").trim(),
    };

    const fresh = await runDb("Saving profile setup", () => updateUser(user.UserID, updates));
    setUser((prev) => ({ ...(prev || {}), ...fresh }));
    setShowPostSignUpProfileSetup(false);
    setShowTutorialModal(true);
  };

  const handleClosePostSignUpProfileSetup = () => {
    setShowPostSignUpProfileSetup(false);
    setShowTutorialModal(true);
  };

  const openTutorialFromSettings = () => {
    setShowSettingsPopup(false);
    setShowTutorialModal(true);
  };

  const addSolve = async (newTime, smartMeta = null, options = {}) => {
    if (Number(newTime) > 0 && Number(newTime) < 300 && options?.skipTinySolveConfirm !== true) {
      const keepTinySolve = window.confirm(
        "That solve is under 0.30 seconds. Keep it?"
      );
      if (!keepTinySolve) return false;
    }

    const hasManualScramble = Object.prototype.hasOwnProperty.call(
      options || {},
      "scrambleOverride"
    );
    const manualTimerInput = String(options?.timerInputOverride || "").trim();
    const manualScramble = hasManualScramble
      ? String(options?.scrambleOverride || "").trim()
      : null;

    const createPendingSolve = ({
      createdAt,
      time,
      scramble,
      event,
      sessionID = currentSession || "main",
      tags,
      note = "",
      penalty = null,
    }) => ({
      solveRef: `PENDING#${createdAt}#${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
      datetime: createdAt,
      sessionID,
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
      setSessions((prev) => {
        const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
        const hasExplicitIndices = arr.every((solve) =>
          Number.isFinite(Number(solve?.fullIndex))
        );
        const nextSolve =
          hasExplicitIndices && arr.length
            ? { ...pendingSolve, fullIndex: Number(arr[arr.length - 1]?.fullIndex) + 1 }
            : pendingSolve;

        return {
          ...prev,
          [ev]: [...arr, nextSolve],
        };
      });
      adjustSessionSolveCount(ev, currentSession, 1, sessions[ev]?.length || 0);
    };

    const replacePendingSolve = (ev, pendingSolve, savedSolve) => {
      setSessions((prev) => ({
        ...prev,
        [ev]: mergeSolveIntoListByIdentity(
          (prev?.[ev] || []).map((solve) =>
            solve?.solveRef === pendingSolve?.solveRef ? { ...solve, ...pendingSolve } : solve
          ),
          savedSolve,
          true
        ),
      }));
    };

    const removePendingSolve = (ev, pendingRef) => {
      setSessions((prev) => ({
        ...prev,
        [ev]: (prev[ev] || []).filter((s) => s.solveRef !== pendingRef),
      }));
      adjustSessionSolveCount(ev, currentSession, -1, sessions[ev]?.length || 0);
    };

    if (practiceMode) {
      const practiceEvent = currentEventRef.current;
      const shownScramble = String(displayedScrambleRef.current || "").trim();
      const scramble = hasManualScramble
        ? manualScramble
        : shownScramble || (await getNextScramble(practiceEvent));
      const timestamp = new Date().toISOString();

      if (!hasManualScramble && shownScramble) {
        getNextScramble(practiceEvent).catch((err) => {
          console.error(`Failed to advance scramble queue for ${practiceEvent}:`, err);
        });
      }

      const newSolve = {
        solveRef: `LOCAL#${timestamp}`,
        createdAt: timestamp,
        datetime: timestamp,
        sessionID: currentSession,
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

      rememberLatestCreatedSolve(currentEvent, newSolve.solveRef);
      setPracticeSolves((prev) => [...(prev || []), newSolve]);
      return true;
    }

    const isRelay =
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
          return true;
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
            event: currentEvent,
            tags: fullRelayTags,
          });
          rememberLatestCreatedSolve(currentEvent, pendingSolve.solveRef);
          appendPendingSolve(currentEvent, pendingSolve);

          try {
            const res = await runDb("Saving solve", () =>
              addSolveToDB(user.UserID, {
                event: currentEvent,
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
            rememberLatestCreatedSolve(currentEvent, savedSolve?.solveRef || pendingSolve.solveRef);
            replacePendingSolve(currentEvent, pendingSolve, savedSolve);
            if (res?.sessionStats) {
              mergeCanonicalSessionStats(currentEvent, currentSession, res.sessionStats);
            }
          } catch (err) {
            removePendingSolve(currentEvent, pendingSolve.solveRef);
            console.error("Error adding relay solve:", err);
            return false;
          }
        } else {
          const localSolve = {
            solveRef: `LOCAL#${timestamp}`,
            createdAt: timestamp,
            datetime: timestamp,
            sessionID: currentSession,
            time: totalMs,
            rawTimeMs: totalMs,
            finalTimeMs: totalMs,
            isDNF: false,
            scramble: "Relay",
            event: currentEvent,
            penalty: null,
            note: "",
            tags: fullRelayTags,
          };

          rememberLatestCreatedSolve(currentEvent, localSolve.solveRef);
          setSessions((prev) => ({
            ...prev,
            [currentEvent]: [...(prev[currentEvent] || []), localSolve],
          }));
        }

        await resetRelaySet();
        return true;
      }

      const totalMs = newTime;

      if (isSignedIn && user) {
        const pendingSolve = createPendingSolve({
          createdAt: timestamp,
          time: totalMs,
          scramble: "Relay",
          event: currentEvent,
          tags: relayTags,
        });
        rememberLatestCreatedSolve(currentEvent, pendingSolve.solveRef);
        appendPendingSolve(currentEvent, pendingSolve);

        try {
          const res = await runDb("Saving solve", () =>
            addSolveToDB(user.UserID, {
              event: currentEvent,
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
          rememberLatestCreatedSolve(currentEvent, savedSolve?.solveRef || pendingSolve.solveRef);
          replacePendingSolve(currentEvent, pendingSolve, savedSolve);
          if (res?.sessionStats) {
            mergeCanonicalSessionStats(currentEvent, currentSession, res.sessionStats);
          }
        } catch (err) {
          removePendingSolve(currentEvent, pendingSolve.solveRef);
          console.error("Error adding relay solve:", err);
          return false;
        }
      } else {
        const localSolve = {
          solveRef: `LOCAL#${timestamp}`,
          createdAt: timestamp,
          datetime: timestamp,
          sessionID: currentSession,
          time: totalMs,
          rawTimeMs: totalMs,
          finalTimeMs: totalMs,
          isDNF: false,
          scramble: "Relay",
          event: currentEvent,
          penalty: null,
          note: "",
          tags: relayTags,
        };

        rememberLatestCreatedSolve(currentEvent, localSolve.solveRef);
        setSessions((prev) => ({
          ...prev,
          [currentEvent]: [...(prev[currentEvent] || []), localSolve],
        }));
      }

      await resetRelaySet();
      return true;
    }

    let scramble;
    let activeSharedID = null;
    let solveIndexForBroadcast = null;
    let shouldCompleteSharedSession = false;
    let sharedConversationID = null;
    let nextSharedIndex = null;
    let nextSharedSessionState = sharedSession;
    let sharedMode = sharedSession ? getSharedMode(sharedSession) : null;
    const sharedSaveSessionID = sharedSession ? getSharedSaveSessionID(sharedSession) : currentSession;
    const isSharedHost = !!(sharedSession && user?.UserID && sharedSession.creatorID === user.UserID);

    const activeSolveEvent = sharedSession
      ? normalizeSharedEventKey(
          getSharedPerspective(sharedSession, user?.UserID, currentEvent).yourEvents?.[sharedIndex] ||
            getSharedPerspective(sharedSession, user?.UserID, currentEvent).yourFallbackEvent ||
            currentEvent
        )
      : currentEvent;

    if (sharedSession) {
      const perspective = getSharedPerspective(sharedSession, user?.UserID, currentEvent);
      scramble = hasManualScramble
        ? manualScramble
        : perspective.yourScrambles?.[sharedIndex] ||
          sharedSession.scrambles?.[sharedIndex] ||
          "";
      solveIndexForBroadcast = sharedIndex;
      activeSharedID = sharedSession.sharedID;
      sharedConversationID = sharedSession.conversationID || "";

      nextSharedIndex = sharedIndex + 1;

      setScrambles((prev) => ({
        ...prev,
        [activeSolveEvent]: [...(prev[activeSolveEvent] || [])],
      }));
    } else {
      const solveEvent = currentEventRef.current;
      const shownScramble = String(displayedScrambleRef.current || "").trim();

      if (hasManualScramble) {
        scramble = manualScramble;
      } else if (shownScramble) {
        scramble = smartMeta?.scramble ? String(smartMeta.scramble).trim() : shownScramble;

        getNextScramble(solveEvent).catch((err) => {
          console.error(`Failed to advance scramble queue for ${solveEvent}:`, err);
        });
      } else {
        const consumed = await getNextScramble(solveEvent);
        scramble = smartMeta?.scramble ? String(smartMeta.scramble).trim() : consumed;
      }
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
          SharedEvent: activeSolveEvent,
          SharedMode: getSharedMode(sharedSession),
          SharedHostID:
            sharedSession.hostID || sharedSession.creatorID || null,
          SharedHostName:
            sharedSession.hostName ||
            sharedSession.creatorName ||
            sharedSession.creatorUsername ||
            sharedSession.creatorID ||
            null,
          SharedRoomCode: sharedSession.roomCode || null,
          SharedSaveSessionID: sharedSaveSessionID || "main",
          ...(manualTimerInput ? { TimerInput: manualTimerInput } : {}),
          ...smartTagPayload,
        })
      : buildTagPayload({
          ...(manualTimerInput ? { TimerInput: manualTimerInput } : {}),
          ...smartTagPayload,
        });

    if (isSignedIn && user) {
      if (activeSharedID && solveIndexForBroadcast !== null) {
        setSharedSession((prev) => {
          if (!prev || prev.sharedID !== activeSharedID) return prev;

          const nextRoundResults = {
            ...(prev.roundResults || {}),
            [solveIndexForBroadcast]: {
              ...((prev.roundResults || {})[solveIndexForBroadcast] || {}),
              [user.UserID]: {
                time: newTime,
                event: activeSolveEvent,
                updatedAt: timestamp,
              },
            },
          };

          nextSharedSessionState = {
            ...prev,
            roundResults: nextRoundResults,
          };
          shouldCompleteSharedSession = shouldCompleteSharedSessionNow(
            nextSharedSessionState,
            nextSharedIndex,
            user.UserID
          );

          return {
            ...prev,
            roundResults: nextRoundResults,
          };
        });
      }

      const pendingSolve = createPendingSolve({
        createdAt: timestamp,
        time: newTime,
        scramble,
        event: activeSolveEvent,
        sessionID: sharedSaveSessionID,
        tags: newTags,
      });
      rememberLatestCreatedSolve(activeSolveEvent, pendingSolve.solveRef);
      appendPendingSolve(activeSolveEvent, pendingSolve);

      try {
        const res = await runDb("Saving solve", () =>
          addSolveToDB(user.UserID, {
            event: activeSolveEvent,
            sessionID: sharedSaveSessionID,
            rawTimeMs: newTime,
            penalty: null,
            scramble,
            note: "",
            createdAt: timestamp,
            tags: newTags,
          })
        );

        const savedSolve = normalizeSolve(res?.item);
        rememberLatestCreatedSolve(
          activeSolveEvent,
          savedSolve?.solveRef || pendingSolve.solveRef
        );
        replacePendingSolve(activeSolveEvent, pendingSolve, savedSolve);
        if (res?.sessionStats) {
          mergeCanonicalSessionStats(activeSolveEvent, sharedSaveSessionID, res.sessionStats);
        }
      } catch (err) {
        removePendingSolve(activeSolveEvent, pendingSolve.solveRef);
        console.error("Error adding solve (DB write failed):", err);
        return false;
      }

      if (activeSharedID) {
        try {
          const messageText = `[sharedUpdate]${activeSharedID}|${solveIndexForBroadcast}|${newTime}|${user.UserID}`;

          const conversationID =
            sharedConversationID ||
            activeSharedID
              .replace("SHARED#", "")
              .split("#")
              .slice(0, 2)
              .sort()
              .join("#");

          await sendMessage(conversationID, user.UserID, messageText);
        } catch (err) {
          console.warn("Shared broadcast failed (solve still saved):", err);
        }
      }

      if (
        activeSharedID &&
        (sharedMode === "casual" || (sharedMode === "hosted" && isSharedHost)) &&
        nextSharedSessionState &&
        nextSharedIndex >= getSharedSolveCount(nextSharedSessionState)
      ) {
        nextSharedSessionState = await extendCasualSharedSession(nextSharedSessionState);
      }

      if (shouldCompleteSharedSession) {
        console.log("Shared session completed");
        restorePreviousSessionAfterShared();
      } else if (activeSharedID && Number.isFinite(nextSharedIndex)) {
        const nextTotal = getSharedSolveCount(nextSharedSessionState || sharedSession);
        setSharedIndex(
          nextTotal > 0 ? Math.min(nextSharedIndex, nextTotal - 1) : Math.max(nextSharedIndex, 0)
        );
      }
    } else {
      const localSolve = {
        solveRef: `LOCAL#${timestamp}`,
        createdAt: timestamp,
        datetime: timestamp,
        sessionID: currentSession,
        time: newTime,
        rawTimeMs: newTime,
        finalTimeMs: newTime,
        isDNF: false,
        scramble,
        event: activeSolveEvent,
        penalty: null,
        note: "",
        tags: newTags,
      };

      rememberLatestCreatedSolve(activeSolveEvent, localSolve.solveRef);
      setSessions((prev) => ({
        ...prev,
        [activeSolveEvent]: [...(prev[activeSolveEvent] || []), localSolve],
      }));

      if (shouldCompleteSharedSession) {
        console.log("Shared session completed");
        restorePreviousSessionAfterShared();
      } else if (activeSharedID && Number.isFinite(nextSharedIndex)) {
        setSharedIndex(nextSharedIndex);
      }
    }

    return true;
  };

  const openManualSolveModal = () => {
    setManualSolveTime("");
    setManualSolveScramble(displayedScrambleRef.current || "");
    setManualSolveError("");
    setShowManualSolveModal(true);
  };

  const closeManualSolveModal = () => {
    if (manualSolveSaving) return;
    setShowManualSolveModal(false);
    setManualSolveError("");
  };

  const submitManualSolve = async () => {
    const parsedTime = parseManualSolveTimeToMs(manualSolveTime);
    if (!Number.isFinite(parsedTime) || parsedTime < 0) {
      setManualSolveError("Enter a valid time like 12.34 or 1:02.45.");
      return;
    }

    setManualSolveSaving(true);
    setManualSolveError("");

    try {
      await addSolve(parsedTime, null, {
        scrambleOverride: manualSolveScramble,
        timerInputOverride: "Manual",
      });
      setShowManualSolveModal(false);
      setManualSolveTime("");
      setManualSolveScramble("");
    } catch (err) {
      console.error("Failed to add manual solve:", err);
      setManualSolveError("Could not save that solve. Please try again.");
    } finally {
      setManualSolveSaving(false);
    }
  };

  const applyPenalty = useCallback(
    async (solveRef, penalty, updatedTime) => {
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

      const currentPenalty = String(
        targetSolve?.penalty ?? targetSolve?.Penalty ?? ""
      ).trim().toUpperCase() || null;
      const rawTimeMs =
        Number.isFinite(Number(targetSolve?.rawTimeMs))
          ? Number(targetSolve.rawTimeMs)
          : Number.isFinite(Number(targetSolve?.finalTimeMs))
          ? Number(targetSolve.finalTimeMs)
          : Number.isFinite(Number(targetSolve?.time))
          ? Number(targetSolve.time)
          : null;
      const currentEffectiveTime =
        currentPenalty === "DNF"
          ? Number.MAX_SAFE_INTEGER
          : Number.isFinite(Number(targetSolve?.finalTimeMs))
          ? Number(targetSolve.finalTimeMs)
          : Number.isFinite(Number(targetSolve?.time))
          ? Number(targetSolve.time)
          : rawTimeMs;

      if (
        currentPenalty === (penalty || null) &&
        Number.isFinite(currentEffectiveTime) &&
        currentEffectiveTime === updatedTime
      ) {
        return;
      }

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
    },
    [practiceMode, sessions, eventKey, isSignedIn, user?.UserID, runDb]
  );

  const switchToEvent = useCallback(
    async (nextEvent) => {
      const normalizedEvent = String(nextEvent || "").trim().toUpperCase();
      if (!normalizedEvent) return;

      const activeHostedRoom = isHostedSharedSession(sharedSession);
      const isHostedRoomHost =
        activeHostedRoom &&
        String(sharedSession?.hostID || sharedSession?.creatorID || "").trim() ===
          String(user?.UserID || "").trim();
      const hostedRoomEvent = normalizeSharedEventKey(
        sharedSession?.creatorEvent || sharedSession?.event || currentEvent
      );

      if (
        activeHostedRoom &&
        isHostedRoomHost &&
        hostedRoomEvent &&
        hostedRoomEvent !== normalizedEvent
      ) {
        const switched = await startHostedRoomSessionForEvent(normalizedEvent);
        if (switched) {
          setCurrentEvent(normalizedEvent);
          setCurrentSession(getSharedSaveSessionID(sharedSession));
          setActiveSessionObj(null);
          setRelayLegIndex(0);
          setRelayLegTimes([]);
          setRelayScrambles([]);
          setRelayLegs([]);
          return;
        }
      }

      const savedSession =
        isSignedIn && user?.UserID
          ? navPrefs.lastSessionByEvent?.[normalizedEvent] || "main"
          : "main";

      setCurrentEvent(normalizedEvent);
      setCurrentSession(savedSession);
      sharedReturnTargetRef.current = null;
      setSharedSession(null);
      setSharedIndex(0);
      hostedRoomPromptDismissRef.current = "";
      setActiveSessionObj(null);
      setRelayLegIndex(0);
      setRelayLegTimes([]);
      setRelayScrambles([]);
      setRelayLegs([]);
    },
    [
      currentEvent,
      isSignedIn,
      navPrefs.lastSessionByEvent,
      sharedSession,
      startHostedRoomSessionForEvent,
      user?.UserID,
    ]
  );

  const deleteTime = async (eventKeyParam, solveOrIndex, options = {}) => {
    if (practiceMode) {
      let practiceIndex = -1;

      if (typeof solveOrIndex === "number") {
        practiceIndex = solveOrIndex;
      } else if (typeof solveOrIndex === "string") {
        practiceIndex = (practiceSolves || []).findIndex(
          (solve) => solve?.solveRef === solveOrIndex
        );
      } else if (solveOrIndex && typeof solveOrIndex === "object") {
        const solveRef = solveOrIndex.solveRef || null;
        practiceIndex = (practiceSolves || []).findIndex(
          (solve) => solve?.solveRef === solveRef
        );
      }

      if (practiceIndex < 0) return;
      deletePracticeTime(practiceIndex, options);
      return;
    }

    const ev = String(eventKeyParam || "").toUpperCase();
    if (!ev) return;
    const requireConfirm = options?.requireConfirm === true;

    let solveRefToDelete = null;
    let solveIndex = -1;
    let targetSolve = null;
    const eventSolves = Array.isArray(sessions?.[ev]) ? sessions[ev] : [];

    if (typeof solveOrIndex === "string") {
      solveRefToDelete = solveOrIndex;
      solveIndex = eventSolves.findIndex((solve) => solve?.solveRef === solveRefToDelete);
      targetSolve = solveIndex >= 0 ? eventSolves[solveIndex] : null;
    } else if (typeof solveOrIndex === "number") {
      const s = eventSolves[solveOrIndex];
      solveRefToDelete = s?.solveRef || null;
      solveIndex = solveOrIndex;
      targetSolve = s || null;
    } else if (solveOrIndex && typeof solveOrIndex === "object") {
      solveRefToDelete = solveOrIndex.solveRef || null;
      solveIndex = eventSolves.findIndex((solve) => solve?.solveRef === solveRefToDelete);
      targetSolve = solveIndex >= 0 ? eventSolves[solveIndex] : solveOrIndex;
    }

    if (!solveRefToDelete) return;
    if (
      requireConfirm &&
      !window.confirm("Delete this solve? You can undo it right after.")
    ) {
      return;
    }

    deletedSolveRefsRef.current.add(solveRefToDelete);

    if (targetSolve) {
      setDeleteUndoState({
        source: "session",
        eventKey: ev,
        sessionID: String(targetSolve?.sessionID || targetSolve?.SessionID || currentSession || "main"),
        index: solveIndex >= 0 ? solveIndex : eventSolves.length - 1,
        solve: targetSolve,
        persisted:
          isSignedIn &&
          !!user?.UserID &&
          typeof targetSolve?.solveRef === "string" &&
          targetSolve.solveRef.startsWith("SOLVE#"),
      });
      queueDeleteUndoToast();
    }

    setSessions((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      return {
        ...(prev || {}),
        [ev]: removeSolveAndShiftIndices(arr, solveRefToDelete, targetSolve),
      };
    });
    adjustSessionSolveCount(
      ev,
      String(targetSolve?.sessionID || targetSolve?.SessionID || currentSession || "main"),
      -1,
      eventSolves.length || 0
    );

    if (isSignedIn && user) {
      try {
        await runDb("Deleting solve", () =>
          deleteSolve(user.UserID, solveRefToDelete, {
            event: ev,
            sessionID: String(targetSolve?.sessionID || targetSolve?.SessionID || currentSession || "main"),
          })
        );
        setStatsMutationTick((t) => t + 1);
      } catch (err) {
        deletedSolveRefsRef.current.delete(solveRefToDelete);
        if (targetSolve) {
          setSessions((prev) => {
            const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
            const restoreIndex =
              solveIndex >= 0 ? Math.min(Math.max(solveIndex, 0), arr.length) : arr.length;
            return {
              ...(prev || {}),
              [ev]: insertSolveAndShiftIndices(arr, restoreIndex, targetSolve),
            };
          });
          adjustSessionSolveCount(
            ev,
            String(targetSolve?.sessionID || targetSolve?.SessionID || currentSession || "main"),
            1,
            Math.max(0, eventSolves.length - 1)
          );
          setDeleteUndoState(null);
          setShowDeleteUndoToast(false);
        }
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

  const publishConversationPost = async ({
    conversationID,
    note,
    event,
    solveList = [],
    postType,
    statShare,
  }) => {
    if (!user) return;

    try {
      const payloadText = encodeSharedPostPayload({
        note: String(note || "").trim(),
        postType: postType || (statShare ? "stat-share" : "solve"),
        solveList,
        statShare,
      });

      await runDb("Sending shared post", () =>
        sendMessage(
          conversationID,
          user.UserID,
          payloadText,
          {
            note: String(note || "").trim(),
            messageType: "SHARED_POST",
            postType: postType || (statShare ? "stat-share" : "solve"),
            solveList,
            statShare,
          }
        )
      );
      setSocialRefreshTick((t) => t + 1);
    } catch (err) {
      console.error("Error sending shared post to conversation:", err);
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
      targetType: "feed",
      availableConversations: [],
      selectedConversationID: "",
      isSubmitting: false,
      isLoadingDestinations: false,
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
        targetType: "feed",
        availableConversations: [],
        selectedConversationID: "",
        isSubmitting: false,
        isLoadingDestinations: true,
        error: "",
      });

      Promise.all([
        getConversations(user.UserID, 200).catch((err) => {
          console.warn("Failed to load conversations for share composer", err);
          return [];
        }),
        getGroups(user.UserID).catch((err) => {
          console.warn("Failed to load groups for share composer", err);
          return [];
        }),
        Promise.all(
          (Array.isArray(user.Friends) ? user.Friends : []).map(async (friendID) => {
            try {
              const profile = await getUser(friendID);
              return [friendID, profile];
            } catch (err) {
              console.warn("Failed to load friend profile for share composer", friendID, err);
              return [friendID, null];
            }
          })
        ).catch(() => []),
      ])
        .then(([conversations, groups, friendProfiles]) => {
          const groupsByConversationID = Object.fromEntries(
            (Array.isArray(groups) ? groups : [])
              .map((group) => [String(group?.ConversationID || "").trim(), group])
              .filter(([conversationID]) => conversationID)
          );

          const friendProfilesByID = Object.fromEntries(
            (Array.isArray(friendProfiles) ? friendProfiles : []).filter(
              (entry) => Array.isArray(entry) && entry[0]
            )
          );

          const conversationOptions = [];
          const seen = new Set();

          (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
            const conversationID = String(conversation?.ConversationID || "").trim();
            if (!conversationID || seen.has(conversationID)) return;

            const conversationType = String(conversation?.ConversationType || "DM").toUpperCase();
            const otherUserID = String(conversation?.OtherUserID || "").trim();
            const group = groupsByConversationID[conversationID] || null;
            const friendProfile = friendProfilesByID[otherUserID] || null;
            const baseName =
              conversationType === "GROUP"
                ? group?.Name ||
                  conversation?.Name ||
                  conversation?.DisplayName ||
                  conversationID
                : friendProfile?.Name ||
                  friendProfile?.name ||
                  conversation?.DisplayName ||
                  otherUserID ||
                  conversationID;

            conversationOptions.push({
              conversationID,
              label: `${baseName}${conversationType === "GROUP" ? " (Group)" : ""}`,
              type: conversationType,
            });
            seen.add(conversationID);
          });

          (Array.isArray(user.Friends) ? user.Friends : []).forEach((friendID) => {
            const conversationID = buildLegacyDmConversationID(user.UserID, friendID);
            if (!conversationID || seen.has(conversationID)) return;
            const friendProfile = friendProfilesByID[friendID] || null;
            conversationOptions.push({
              conversationID,
              label: friendProfile?.Name || friendProfile?.name || friendID,
              type: "DM",
            });
            seen.add(conversationID);
          });

          conversationOptions.sort((a, b) => a.label.localeCompare(b.label));

          setShareComposer((prev) => {
            if (!prev.isOpen || prev.post !== post) return prev;
            return {
              ...prev,
              availableConversations: conversationOptions,
              isLoadingDestinations: false,
            };
          });
        })
        .catch((err) => {
          console.warn("Failed to load share destinations", err);
          setShareComposer((prev) => {
            if (!prev.isOpen || prev.post !== post) return prev;
            return {
              ...prev,
              availableConversations: [],
              isLoadingDestinations: false,
            };
          });
        });
    });
  };

  const addPostToProfile = async (post) => {
    if (!user || !post) return { status: "error" };

    const serializeProfileSolve = (solve, fallbackIndex = null) => {
      if (!solve || typeof solve !== "object") return null;

      const fullIndex = Number(solve?.fullIndex);
      return {
        solveRef: solve?.solveRef || solve?.SK || solve?.SolveID || null,
        fullIndex: Number.isFinite(fullIndex) ? fullIndex : fallbackIndex,
        time: Number.isFinite(Number(solve?.time)) ? Number(solve.time) : null,
        rawTimeMs: Number.isFinite(Number(solve?.rawTimeMs))
          ? Number(solve.rawTimeMs)
          : Number.isFinite(Number(solve?.RawTimeMs))
            ? Number(solve.RawTimeMs)
            : null,
        finalTimeMs: Number.isFinite(Number(solve?.finalTimeMs))
          ? Number(solve.finalTimeMs)
          : Number.isFinite(Number(solve?.FinalTimeMs))
            ? Number(solve.FinalTimeMs)
            : Number.isFinite(Number(solve?.time))
              ? Number(solve.time)
              : null,
        originalTime: Number.isFinite(Number(solve?.originalTime))
          ? Number(solve.originalTime)
          : Number.isFinite(Number(solve?.rawTimeMs))
            ? Number(solve.rawTimeMs)
            : null,
        scramble: solve?.scramble || solve?.Scramble || "",
        event: solve?.event || solve?.Event || post?.event || "333",
        penalty: solve?.penalty ?? solve?.Penalty ?? null,
        note: solve?.note ?? solve?.Note ?? "",
        datetime: solve?.datetime || solve?.createdAt || solve?.CreatedAt || null,
        createdAt: solve?.createdAt || solve?.CreatedAt || solve?.datetime || null,
        sessionID:
          solve?.sessionID || solve?.SessionID || solve?.SessionId || solve?.sessionId || "main",
        sessionName:
          solve?.sessionName || solve?.SessionName || solve?.session || solve?.Session || "",
        tags: solve?.tags || solve?.Tags || {},
      };
    };

    const buildProfileItemKey = (item) => {
      if (!item || typeof item !== "object") return "";
      if (item.chart === "solveCard") {
        const solve = item.solve || {};
        return `solve::${solve.solveRef || solve.datetime || solve.createdAt || solve.time || ""}`;
      }
      if (item.chart === "averageCard") {
        const solves = Array.isArray(item.solves) ? item.solves : [];
        const solveKey = solves
          .map((solve) => solve?.solveRef || solve?.datetime || solve?.createdAt || solve?.time || "")
          .join("|");
        return `average::${solveKey}::${solves.length}`;
      }
      return JSON.stringify(item);
    };

    const solveList = (Array.isArray(post?.solveList) ? post.solveList : [])
      .map((solve, index) => serializeProfileSolve(solve, index))
      .filter(Boolean);

    if (!solveList.length) return { status: "error" };

    const createdAt = new Date().toISOString();
    const nextItem =
      solveList.length === 1
        ? {
            chart: "solveCard",
            event: post?.event || solveList[0]?.event || "333",
            note: String(post?.note || solveList[0]?.note || "").trim(),
            createdAt,
            solve: solveList[0],
          }
        : {
            chart: "averageCard",
            event: post?.event || solveList[0]?.event || "333",
            note: String(post?.note || "").trim(),
            createdAt,
            solves: solveList,
          };

    const fallbackVisibleStats = [
      { chart: "statsSummary", scope: "all-events", viewMode: "standard" },
      { chart: "lineChart", event: "333", session: "all" },
      { chart: "pieChart" },
    ];
    const current =
      Array.isArray(user?.VisibleStats) && user.VisibleStats.length > 0
        ? user.VisibleStats
        : fallbackVisibleStats;

    const nextKey = buildProfileItemKey(nextItem);
    const exists = current.some((item) => buildProfileItemKey(item) === nextKey);
    if (exists) return { status: "exists" };

    const nextVisibleStats = [...current, nextItem];
    await runDb("Saving profile stats", () =>
      updateUser(user.UserID, { VisibleStats: nextVisibleStats })
    );
    setUser((prev) => ({
      ...(prev || {}),
      VisibleStats: nextVisibleStats,
    }));
    return { status: "added" };
  };

  const handleConfirmShareComposer = async () => {
    if (!shareComposer.post || shareComposer.isSubmitting || shareComposer.isLoadingDestinations) return;

    if (shareComposer.targetType === "message" && !shareComposer.selectedConversationID) {
      setShareComposer((prev) => ({
        ...prev,
        error: "Choose a conversation to share to.",
      }));
      return;
    }

    setShareComposer((prev) => ({
      ...prev,
      isSubmitting: true,
      error: "",
    }));

    try {
      if (shareComposer.targetType === "message") {
        await publishConversationPost({
          ...shareComposer.post,
          conversationID: shareComposer.selectedConversationID,
          note: shareComposer.caption.trim(),
        });
      } else {
        await publishPost({
          ...shareComposer.post,
          note: shareComposer.caption.trim(),
        });
      }
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

  const leaveSharedRun = useCallback(() => {
    hostedRoomPromptDismissRef.current = "";
    restorePreviousSessionAfterShared();
  }, [restorePreviousSessionAfterShared]);

  const handleEventChange = async (event) => {
    await switchToEvent(event.target.value);
  };

  useEffect(() => {
    return () => {
      if (scrambleCopyTimeoutRef.current) {
        clearTimeout(scrambleCopyTimeoutRef.current);
      }
    };
  }, []);

  const showScrambleCopyFeedback = useCallback((status) => {
    if (scrambleCopyTimeoutRef.current) {
      clearTimeout(scrambleCopyTimeoutRef.current);
    }

    setScrambleCopyFeedback(status);
    scrambleCopyTimeoutRef.current = setTimeout(() => {
      setScrambleCopyFeedback("idle");
    }, 1600);
  }, []);

  const copyTextToClipboard = useCallback(async (text) => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const success = document.execCommand("copy");
      if (!success) {
        throw new Error("execCommand copy failed");
      }
    } finally {
      document.body.removeChild(textArea);
    }
  }, []);

  const onScrambleClick = async () => {
    const scrambleText = displayedScramble || "";
    if (!scrambleText) {
      showScrambleCopyFeedback("empty");
      return;
    }

    try {
      await copyTextToClipboard(scrambleText);
      showScrambleCopyFeedback("copied");
    } catch (error) {
      console.error("Failed to copy scramble: ", error);
      showScrambleCopyFeedback("error");
    }
  };

  const handleShowSignInPopup = () => setShowSignInPopup(true);
  const handleCloseSignInPopup = () => setShowSignInPopup(false);
  const homeEventSelectorRef = useRef(null);

  const handleSignOut = () => {
    setShowSettingsPopup(false);
    setShowSignInPopup(false);
    setDeleteUndoState(null);
    setShowDeleteUndoToast(false);
    navigate("/");
    setIsSignedIn(false);
    setUser(null);
    setSessionsList([]);
    setCustomEvents([]);
    setSessions(INITIAL_SESSIONS);
    setSharedStatsUser(null);
    setSharedStatsSessions({});
    setSharedStatsSessionsList([]);
    setSharedStatsSessionStats({});
    setSharedStatsLoading(false);
    setSharedStatsDeniedReason("");
    setScrambles({});
    clearScrambleQueue();
    setSessionStats({});
    setStatsMutationTick(0);
    setCurrentEvent("333");
    setCurrentSession("main");
    setNavPrefs(DEFAULT_NAV_PREFS);
    setTagConfig(DEFAULT_TAG_CONFIG);
    setStatsSettingsContext({
      eventLabel: "333",
      sessionLabel: "main",
      isAllEventsMode: false,
      canRecomputeOverall: false,
      canImport: false,
      canExport: false,
      loadingOverallStats: false,
      recomputeStatusText: "",
      importBusy: false,
      exportBusy: false,
      isStatsRouteActive: false,
    });
    setSelectedAverageSolves([]);
    setSelectedAverageSolve(null);
    setSharedSession(null);
    setSharedIndex(0);
    sharedReturnTargetRef.current = null;
    setShowPlayerBar(true);
    setActiveSessionObj(null);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles([]);
    setRelayLegs([]);
  };

  useEffect(() => {
    let cancelled = false;

    if (!isViewingSharedStats) {
      setSharedStatsUser(null);
      setSharedStatsSessions({});
      setSharedStatsSessionsList([]);
      setSharedStatsSessionStats({});
      setSharedStatsLoading(false);
      setSharedStatsDeniedReason("");
      return () => {
        cancelled = true;
      };
    }

    if (!user?.UserID) {
      setSharedStatsDeniedReason("Sign in to view shared stats.");
      setSharedStatsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSharedStatsLoading(true);
    setSharedStatsDeniedReason("");

    const loadSharedStats = async () => {
      try {
        const profile = await getUser(statsSharedUserID);
        const allowedFriends = Array.isArray(profile?.StatsAllowedFriends)
          ? profile.StatsAllowedFriends
          : [];

        if (!allowedFriends.includes(user.UserID)) {
          if (!cancelled) {
            setSharedStatsUser(profile || null);
            setSharedStatsSessions({});
            setSharedStatsSessionsList([]);
            setSharedStatsSessionStats({});
            setSharedStatsDeniedReason(`@${statsSharedUserID} hasn't shared full stats with you.`);
            setSharedStatsLoading(false);
          }
          return;
        }

        const sessionItems = await getSessions(statsSharedUserID);
        const statsByEvent = {};

        for (const session of sessionItems) {
          const ev = String(session?.Event || "").toUpperCase();
          const sid = String(session?.SessionID || "main");
          if (!ev) continue;
          if (!statsByEvent[ev]) statsByEvent[ev] = {};
          statsByEvent[ev][sid] = session?.Stats || null;
        }

        if (!cancelled) {
          setSharedStatsUser({ ...profile, UserID: statsSharedUserID });
          setSharedStatsSessions({});
          setSharedStatsSessionsList(sessionItems);
          setSharedStatsSessionStats(statsByEvent);
          setSharedStatsDeniedReason("");
          setSharedStatsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load shared stats view:", error);
        if (!cancelled) {
          setSharedStatsUser(null);
          setSharedStatsSessions({});
          setSharedStatsSessionsList([]);
          setSharedStatsSessionStats({});
          setSharedStatsDeniedReason("Could not load shared stats right now.");
          setSharedStatsLoading(false);
        }
      }
    };

    loadSharedStats();

    return () => {
      cancelled = true;
    };
  }, [isViewingSharedStats, statsSharedUserID, user?.UserID]);

  const openEventSelector = () => {
    homeEventSelectorRef.current?.open?.();
  };

  const openSharedMatch = useCallback(() => {
    setShowPlayerBar(true);

    navigate("/social", {
      state: {
        openMessages: true,
        conversationID: sharedSession?.conversationID || "",
        sharedID: sharedSession?.sharedID || "",
        scrollToShared: true,
      },
    });
  }, [navigate, sharedSession]);

  const baseCurrentSolves = useMemo(() => {
    if (practiceMode) return practiceSolves || [];

    const ev = String(eventKey || "").toUpperCase();
    const sid = String(currentSession || "main");
    const eventSolves = Array.isArray(sessions?.[ev]) ? sessions[ev] : [];

    return eventSolves.filter(
      (solve) => String(solve?.sessionID || solve?.SessionID || "main") === sid
    );
  }, [currentSession, eventKey, practiceMode, practiceSolves, sessions]);
  const currentSessionStatsForEvent = useMemo(() => {
    const ev = String(eventKey || "").toUpperCase();
    const sid = String(currentSession || "main");
    const cached = sessionStats?.[ev]?.[sid] || null;

    if (practiceMode) return cached;

    const cachedSolveCountTotal = Number(
      cached?.SolveCountTotal ??
        cached?.solveCountTotal ??
        cached?.SolveCount ??
        cached?.solveCount
    );
    const hasFullCurrentSessionCoverage =
      Number.isFinite(cachedSolveCountTotal) &&
      cachedSolveCountTotal >= 0 &&
      baseCurrentSolves.length >= cachedSolveCountTotal;

    if (cached && !hasFullCurrentSessionCoverage) {
      return cached;
    }

    const bestSolve = findBestSingleSolve(baseCurrentSolves);
    const worstSolve = findWorstSingleSolve(baseCurrentSolves);
    const cachedBestMs = Number(cached?.BestSingleMs);
    const cachedWorstMs = Number(cached?.WorstSingleMs);
    const bestSolveMs = Number(bestSolve?.time ?? bestSolve?.finalTimeMs);
    const worstSolveMs = Number(worstSolve?.time ?? worstSolve?.finalTimeMs);

    if (
      !bestSolve &&
      !worstSolve
    ) {
      return cached;
    }

    const next = { ...(cached || {}) };

    if (
      Number.isFinite(bestSolveMs) &&
      (!Number.isFinite(cachedBestMs) || bestSolveMs < cachedBestMs)
    ) {
      next.BestSingleMs = bestSolveMs;
      next.BestSingleSolveSK = bestSolve?.solveRef || bestSolve?.SK || null;
      next.BestSingleAt =
        bestSolve?.createdAt || bestSolve?.datetime || bestSolve?.CreatedAt || bestSolve?.DateTime || null;
    }

    if (
      Number.isFinite(worstSolveMs) &&
      (!Number.isFinite(cachedWorstMs) || worstSolveMs > cachedWorstMs)
    ) {
      next.WorstSingleMs = worstSolveMs;
      next.WorstSingleSolveSK = worstSolve?.solveRef || worstSolve?.SK || null;
    }

    return Object.keys(next).length ? next : null;
  }, [baseCurrentSolves, currentSession, eventKey, practiceMode, sessionStats]);
  const currentSessionTotalSolveCount = Number(
    currentSessionStatsForEvent?.SolveCountTotal ??
      currentSessionStatsForEvent?.solveCountTotal ??
      currentSessionStatsForEvent?.SolveCount ??
      currentSessionStatsForEvent?.solveCount ??
      0
  );
  useEffect(() => {
    if (practiceMode) return;
    const ev = String(eventKey || "").toUpperCase();
    const sid = String(currentSession || "main");
    if (!ev) return;

    const eventSolves = Array.isArray(sessions?.[ev]) ? sessions[ev] : [];
    const sessionSolves = eventSolves.filter(
      (solve) => String(solve?.sessionID || solve?.SessionID || "main") === sid
    );
    if (!sessionSolves.length) return;

    const hasExplicitIndices = sessionSolves.every((solve) =>
      Number.isFinite(Number(solve?.fullIndex))
    );
    if (hasExplicitIndices) return;
    if (
      !Number.isFinite(currentSessionTotalSolveCount) ||
      currentSessionTotalSolveCount < sessionSolves.length
    ) {
      return;
    }

    setSessions((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      const targetSessionSolves = arr.filter(
        (solve) => String(solve?.sessionID || solve?.SessionID || "main") === sid
      );
      const otherSessions = arr.filter(
        (solve) => String(solve?.sessionID || solve?.SessionID || "main") !== sid
      );
      const stillMissing = targetSessionSolves.some(
        (solve) => !Number.isFinite(Number(solve?.fullIndex))
      );
      if (!stillMissing) return prev;

      return {
        ...(prev || {}),
        [ev]: [
          ...otherSessions,
          ...assignExplicitSolveIndices(targetSessionSolves, currentSessionTotalSolveCount),
        ].sort((a, b) => {
          const ta = new Date(a?.datetime || "").getTime();
          const tb = new Date(b?.datetime || "").getTime();
          return ta - tb;
        }),
      };
    });
  }, [
    assignExplicitSolveIndices,
    currentSessionTotalSolveCount,
    currentSession,
    eventKey,
    practiceMode,
    sessions,
  ]);

  const currentSolves = useMemo(() => {
    const items = Array.isArray(baseCurrentSolves) ? baseCurrentSolves : [];
    if (!items.length) return [];

    const hasExplicitIndices = items.every((solve) => Number.isFinite(Number(solve?.fullIndex)));
    if (hasExplicitIndices) return items;

    const totalCount =
      Number.isFinite(currentSessionTotalSolveCount) && currentSessionTotalSolveCount > 0
        ? currentSessionTotalSolveCount
        : items.length;
    const startIndex = Math.max(totalCount - items.length, 0);

    return items.map((solve, index) => ({
      ...solve,
      fullIndex: startIndex + index,
    }));
  }, [baseCurrentSolves, currentSessionTotalSolveCount]);

  const latestSolveRestorableTags = useMemo(() => {
    const latestSolve = currentSolves[currentSolves.length - 1];
    const rawTags =
      latestSolve?.tags && typeof latestSolve.tags === "object" ? latestSolve.tags : null;
    if (!rawTags) return null;

    const nextSelection = makeEmptyTagSelection();
    let hasRestorableTag = false;

    for (const field of SHARED_TAG_FIELDS) {
      if (
        field === "TimerInput" ||
        field === "SolveSource" ||
        field === "Alg_OLL" ||
        field === "Alg_PLL" ||
        field === "Alg_CMLL" ||
        field === "Alg_CLL"
      ) {
        continue;
      }
      const rawValue = String(rawTags?.[field] || "").trim();
      if (!rawValue) continue;

      nextSelection[field] = String(normalizeAlgorithmTagValue(field, rawValue) || "").trim();
      if (nextSelection[field]) hasRestorableTag = true;
    }

    return hasRestorableTag ? nextSelection : null;
  }, [currentSolves]);

  const hasManualCurrentTags = useMemo(
    () =>
      SHARED_TAG_FIELDS.some((field) => {
        if (field === "TimerInput" || field === "SolveSource") return false;
        return !!String(currentTags?.[field] || "").trim();
      }),
    [currentTags]
  );

  const showLoadLastSolveTagsButton =
    isHomePage &&
    !(sharedSession && !isHostedSharedSession(sharedSession)) &&
    !isRelayActive &&
    !practiceMode &&
    !hasManualCurrentTags &&
    !!latestSolveRestorableTags;

  const loadTagsFromLastSolve = useCallback(() => {
    if (!latestSolveRestorableTags) return;

    setTagsByEvent((prev) => ({
      ...(prev || {}),
      [tagScopeEventKey]: latestSolveRestorableTags,
    }));
    rememberTagSelectionValues(latestSolveRestorableTags);
  }, [latestSolveRestorableTags, rememberTagSelectionValues, tagScopeEventKey]);

  useEffect(() => {
    currentSolvesRef.current = currentSolves;
  }, [currentSolves]);

  const rememberLatestCreatedSolve = useCallback((eventCode, solveRef) => {
    latestCreatedSolveRef.current = {
      event: String(eventCode || "").trim().toUpperCase(),
      solveRef: String(solveRef || "").trim(),
    };
  }, []);

  const flushPendingPostSolveTagSaves = useCallback(async () => {
    if (postSolveTagSaveTimeoutRef.current) {
      clearTimeout(postSolveTagSaveTimeoutRef.current);
      postSolveTagSaveTimeoutRef.current = null;
    }

    const pendingEntries = Array.from(pendingPostSolveTagSavesRef.current.values());
    pendingPostSolveTagSavesRef.current = new Map();

    if (!pendingEntries.length || !isSignedIn || !user?.UserID) return;

    for (const pendingSave of pendingEntries) {
      try {
        const res = await runDb(
          "Updating solve tags",
          () =>
            updateSolve(
              user.UserID,
              pendingSave.solveRef,
              {
                Tags: pendingSave.tags,
              },
              {
                existingItem:
                  currentSolvesRef.current.find((solve) => solve?.solveRef === pendingSave.solveRef) || null,
              }
            ),
          { showStatus: false }
        );

        const savedSolve = normalizeSolve(res);
        if (savedSolve?.solveRef) {
          rememberLatestCreatedSolve(
            pendingSave.event,
            savedSolve.solveRef || pendingSave.solveRef
          );
          setSessions((prev) => ({
            ...(prev || {}),
            [pendingSave.event]: (prev?.[pendingSave.event] || []).map((solve) =>
              solve?.solveRef === pendingSave.solveRef ? savedSolve : solve
            ),
          }));
        }
      } catch (err) {
        console.error("Failed to update solve tags:", err);
      }
    }
  }, [isSignedIn, rememberLatestCreatedSolve, runDb, user?.UserID]);

  const schedulePostSolveTagSave = useCallback(
    (eventCode, solveRef, tags) => {
      const normalizedSolveRef = String(solveRef || "").trim();
      const normalizedEvent = String(eventCode || "").trim().toUpperCase();

      if (!normalizedSolveRef || !normalizedEvent) return;

      pendingPostSolveTagSavesRef.current.set(normalizedSolveRef, {
        event: normalizedEvent,
        solveRef: normalizedSolveRef,
        tags: { ...(tags || {}) },
      });

      if (postSolveTagSaveTimeoutRef.current) {
        clearTimeout(postSolveTagSaveTimeoutRef.current);
      }

      postSolveTagSaveTimeoutRef.current = setTimeout(() => {
        flushPendingPostSolveTagSaves();
      }, POST_SOLVE_TAG_SAVE_DEBOUNCE_MS);
    },
    [flushPendingPostSolveTagSaves]
  );

  const applyPostSolveTagBinding = useCallback(
    async (updates = {}) => {
      if (
        !isHomePage ||
        (sharedSession && !isHostedSharedSession(sharedSession)) ||
        isRelayActive ||
        tagScopeEventKey !== "333"
      ) {
        return false;
      }

      const latestSolveMarker = latestCreatedSolveRef.current;
      const visibleSolves = Array.isArray(currentSolvesRef.current) ? currentSolvesRef.current : [];
      const latestSolve =
        (latestSolveMarker?.solveRef
          ? visibleSolves.find((solve) => solve?.solveRef === latestSolveMarker.solveRef)
          : null) || visibleSolves[visibleSolves.length - 1];
      if (!latestSolve?.solveRef) return false;

      const normalizedUpdates = {
        ...(updates?.Method ? { Method: String(updates.Method || "").trim() } : {}),
        ...(updates?.Alg_PLL
          ? { Alg_PLL: normalizeAlgorithmTagValue("Alg_PLL", updates.Alg_PLL) }
          : {}),
        ...(updates?.Alg_OLL
          ? { Alg_OLL: normalizeAlgorithmTagValue("Alg_OLL", updates.Alg_OLL) }
          : {}),
        ...(updates?.Alg_CMLL
          ? { Alg_CMLL: normalizeAlgorithmTagValue("Alg_CMLL", updates.Alg_CMLL) }
          : {}),
        ...(updates?.Alg_CLL
          ? { Alg_CLL: normalizeAlgorithmTagValue("Alg_CLL", updates.Alg_CLL) }
          : {}),
      };

      if (!Object.keys(normalizedUpdates).length) return false;

      const toastLabel = formatPostSolveTagToastLabel(normalizedUpdates);

      const nextSolveTags = {
        ...((latestSolve?.tags && typeof latestSolve.tags === "object") ? latestSolve.tags : {}),
        ...normalizedUpdates,
      };

      if (!nextSolveTags.TimerInput) {
        nextSolveTags.TimerInput =
          latestSolve?.tags?.TimerInput ||
          currentTags.TimerInput ||
          settings?.timerInput ||
          "Keyboard";
      }
      if (!nextSolveTags.SolveSource) {
        nextSolveTags.SolveSource =
          latestSolve?.tags?.SolveSource || currentTags.SolveSource || "Standard";
      }

      if (practiceMode) {
        setPracticeSolves((prev) =>
          (prev || []).map((solve) =>
            solve?.solveRef === latestSolve.solveRef
              ? {
                  ...solve,
                  tags: nextSolveTags,
                }
              : solve
          )
        );
        queuePostSolveTagToast(toastLabel);
        return true;
      }

      const normalizedEvent = String(
        latestSolve?.event || latestSolveMarker?.event || eventKey || ""
      ).toUpperCase();

      setSessions((prev) => ({
        ...(prev || {}),
        [normalizedEvent]: (prev?.[normalizedEvent] || []).map((solve) =>
          solve?.solveRef === latestSolve.solveRef
            ? {
                ...solve,
                tags: nextSolveTags,
              }
            : solve
        ),
      }));
      setStatsMutationTick((tick) => tick + 1);

      schedulePostSolveTagSave(normalizedEvent, latestSolve.solveRef, nextSolveTags);

      queuePostSolveTagToast(toastLabel);
      return true;
    },
    [
      currentTags,
      eventKey,
      isHomePage,
      isRelayActive,
      practiceMode,
      queuePostSolveTagToast,
      schedulePostSolveTagSave,
      settings?.timerInput,
      sharedSession,
      tagScopeEventKey,
    ]
  );

  const armPendingPostSolveTagChord = useCallback(
    (prefix = "", ollDigits = "") => {
      pendingPostSolveTagChordRef.current = prefix;
      pendingPostSolveOllDigitsRef.current = ollDigits;
      if (postSolveTagChordTimeoutRef.current) {
        clearTimeout(postSolveTagChordTimeoutRef.current);
      }
      postSolveTagChordTimeoutRef.current = setTimeout(() => {
        const pendingPrefix = pendingPostSolveTagChordRef.current;
        const pendingOllDigits = String(pendingPostSolveOllDigitsRef.current || "");
        pendingPostSolveTagChordRef.current = "";
        pendingPostSolveOllDigitsRef.current = "";
        postSolveTagChordTimeoutRef.current = null;

        if (!pendingPrefix && pendingOllDigits) {
          const pendingNumber = Number(pendingOllDigits);
          if (Number.isInteger(pendingNumber) && pendingNumber >= 1 && pendingNumber <= 57) {
            applyPostSolveTagBinding({
              Method: "CFOP",
              Alg_OLL: `OLL #${pendingNumber}`,
            });
          }
        }
      }, POST_SOLVE_TAG_CHORD_TIMEOUT_MS);
    },
    [applyPostSolveTagBinding]
  );
  const solvesSourceForDetail = currentSolves;
  const undoDeletedSolve = useCallback(async () => {
    const pending = deleteUndoState;
    if (!pending) return;

    setDeleteUndoState(null);
    setShowDeleteUndoToast(false);

    if (deleteUndoToastTimeoutRef.current) {
      clearTimeout(deleteUndoToastTimeoutRef.current);
      deleteUndoToastTimeoutRef.current = null;
    }

    if (pending.source === "practice") {
      setPracticeSolves((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        const insertIndex = Math.min(Math.max(Number(pending.index) || 0, 0), next.length);
        next.splice(insertIndex, 0, pending.solve);
        return next;
      });
      return;
    }

    const ev = String(pending.eventKey || "").toUpperCase();
    const sessionID = String(pending.sessionID || "main");
    const deletedSolve = pending.solve;
    const insertIndex = Math.min(
      Math.max(Number(pending.index) || 0, 0),
      Array.isArray(sessions?.[ev]) ? sessions[ev].length : 0
    );

    if (!ev || !deletedSolve) return;

    if (typeof deletedSolve?.solveRef === "string" && deletedSolve.solveRef.trim()) {
      deletedSolveRefsRef.current.delete(deletedSolve.solveRef.trim());
    }

    if (pending.persisted) {
      if (!user?.UserID) {
        alert("Sign back in to undo that deleted solve.");
        return;
      }

      try {
        const restored = await runDb(
          "Restoring solve",
          () =>
            addSolveToDB(user.UserID, {
              event: ev,
              sessionID,
              rawTimeMs: Number(
                deletedSolve?.rawTimeMs ??
                  deletedSolve?.finalTimeMs ??
                  deletedSolve?.time ??
                  0
              ),
              penalty: deletedSolve?.penalty ?? null,
              scramble: deletedSolve?.scramble || "",
              note: deletedSolve?.note || "",
              createdAt:
                deletedSolve?.createdAt ||
                deletedSolve?.datetime ||
                new Date().toISOString(),
              tags: deletedSolve?.tags || {},
            }),
          { showStatus: false }
        );

        const restoredSolve = normalizeSolve(restored?.item);
        setSessions((prev) => {
          const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
          return {
            ...(prev || {}),
            [ev]: insertSolveAndShiftIndices(arr, insertIndex, {
              ...restoredSolve,
              ...(Number.isFinite(Number(deletedSolve?.fullIndex))
                ? { fullIndex: Number(deletedSolve.fullIndex) }
                : {}),
            }),
          };
        });
        adjustSessionSolveCount(
          ev,
          sessionID,
          1,
          Array.isArray(sessions?.[ev]) ? sessions[ev].length : 0
        );
        setStatsMutationTick((t) => t + 1);
      } catch (err) {
        alert("Could not restore that solve.");
        console.error("Failed to undo deleted solve:", err);
      }
      return;
    }

    setSessions((prev) => {
      const arr = Array.isArray(prev?.[ev]) ? prev[ev] : [];
      return {
        ...(prev || {}),
        [ev]: insertSolveAndShiftIndices(arr, insertIndex, deletedSolve),
      };
    });
    adjustSessionSolveCount(
      ev,
      sessionID,
      1,
      Array.isArray(sessions?.[ev]) ? sessions[ev].length : 0
    );
  }, [deleteUndoState, sessions, user?.UserID, runDb, adjustSessionSolveCount]);

  const deleteLatestSolve = useCallback(() => {
    if (!isHomePage || (sharedSession && !isHostedSharedSession(sharedSession)) || isRelayActive) return false;

    const latestSolve = currentSolves[currentSolves.length - 1];
    if (!latestSolve?.solveRef) return false;

    deleteTime(eventKey, latestSolve.solveRef, { requireConfirm: true });
    return true;
  }, [isHomePage, sharedSession, isRelayActive, currentSolves, deleteTime, eventKey]);

  const applyPenaltyToLatestSolve = useCallback(
    (penalty) => {
      if (!isHomePage || (sharedSession && !isHostedSharedSession(sharedSession)) || isRelayActive) return false;

      const latestSolve = currentSolves[currentSolves.length - 1];
      const solveRef = latestSolve?.solveRef;

      if (!solveRef) return false;

      const rawTimeMs = Number(
        latestSolve?.rawTimeMs ?? latestSolve?.finalTimeMs ?? latestSolve?.time
      );
      if (!Number.isFinite(rawTimeMs)) return false;

      const currentPenalty = String(
        latestSolve?.penalty ?? latestSolve?.Penalty ?? ""
      ).trim().toUpperCase();
      const normalizedPenalty =
        penalty === "clear" || currentPenalty === penalty ? null : penalty;
      const nextTime = normalizedPenalty === "+2" ? rawTimeMs + 2000 : rawTimeMs;

      applyPenalty(solveRef, normalizedPenalty, nextTime);
      return true;
    },
    [isHomePage, sharedSession, isRelayActive, currentSolves, applyPenalty]
  );

  useEffect(() => {
    const pageAllowsPlayerBarToggle =
      location.pathname === "/stats" ||
      location.pathname === "/social" ||
      location.pathname === "/profile" ||
      location.pathname.startsWith("/profile/");

    const hasBlockingOverlay =
      showSettingsPopup ||
      showSignInPopup ||
      showManualSolveModal ||
      !!selectedAverageSolve ||
      selectedAverageSolves.length > 0 ||
      !!shareComposer.isOpen;

    const handleShortcutKeyDown = (event) => {
      if (event.repeat) return;
      if (hasBlockingOverlay || isEditableTarget(event.target)) return;

      if (isPostSolveTagModifierEvent(event)) {
        postSolveTagModifierHeldRef.current = true;
        clearPendingPostSolveTagChord();
        consumePostSolveTagEvent(event);
        return;
      }

      const plainLetterKey = getPlainLetterKey(event);
      const plainDigitKey = getPlainDigitKey(event);
      if (plainLetterKey && postSolveTagModifierHeldRef.current) {
        const pendingPrefix = pendingPostSolveTagChordRef.current;
        if (pendingPrefix) {
          const chordValue = POST_SOLVE_PLL_CHORD_BINDINGS?.[pendingPrefix]?.[plainLetterKey];
          clearPendingPostSolveTagChord();

          if (chordValue) {
            consumePostSolveTagEvent(event);
            applyPostSolveTagBinding({
              Method: "CFOP",
              Alg_PLL: chordValue,
            });
            return;
          }
        }

        const directValue = POST_SOLVE_PLL_DIRECT_BINDINGS[plainLetterKey];
        if (directValue) {
          clearPendingPostSolveTagChord();
          consumePostSolveTagEvent(event);
          applyPostSolveTagBinding({
            Method: "CFOP",
            Alg_PLL: directValue,
          });
          return;
        }

        if (POST_SOLVE_PLL_CHORD_BINDINGS[plainLetterKey]) {
          armPendingPostSolveTagChord(plainLetterKey);
          consumePostSolveTagEvent(event);
          return;
        }
      } else if (
        plainDigitKey &&
        postSolveTagModifierHeldRef.current &&
        !pendingPostSolveTagChordRef.current
      ) {
        const existingDigits = String(pendingPostSolveOllDigitsRef.current || "");
        const nextDigits = `${existingDigits}${plainDigitKey}`;

        if (nextDigits === "0") {
          clearPendingPostSolveTagChord();
          consumePostSolveTagEvent(event);
          applyPostSolveTagBinding({
            Method: "CFOP",
            Alg_OLL: "Skip",
          });
          return;
        }

        const nextNumber = Number(nextDigits);
        if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 57) {
          clearPendingPostSolveTagChord();
          consumePostSolveTagEvent(event);
          return;
        }

        if (nextDigits.length >= 2 || nextNumber >= 6) {
          clearPendingPostSolveTagChord();
          consumePostSolveTagEvent(event);
          applyPostSolveTagBinding({
            Method: "CFOP",
            Alg_OLL: `OLL #${nextNumber}`,
          });
          return;
        }

        armPendingPostSolveTagChord("", nextDigits);
        consumePostSolveTagEvent(event);
        return;
      } else if (pendingPostSolveTagChordRef.current && postSolveTagModifierHeldRef.current) {
        clearPendingPostSolveTagChord();
      }

      const eventBindings = settings.eventKeyBindings || {};
      for (const [eventCode, combo] of Object.entries(eventBindings)) {
        if (!eventMatchesEventBinding(event, combo)) continue;
        event.preventDefault();
        switchToEvent(eventCode);
        return;
      }

      const pageBindings = settings.pageKeyBindings || {};
      if (eventMatchesShortcut(event, pageBindings.home)) {
        event.preventDefault();
        navigate("/");
        return;
      }

      if (eventMatchesShortcut(event, pageBindings.profile)) {
        event.preventDefault();
        navigate("/profile");
        return;
      }

      if (eventMatchesShortcut(event, pageBindings.stats)) {
        event.preventDefault();
        navigate("/stats");
        return;
      }

      if (eventMatchesShortcut(event, pageBindings.social)) {
        event.preventDefault();
        navigate("/social");
        return;
      }

      if (
        pageAllowsPlayerBarToggle &&
        eventMatchesShortcut(event, settings.uiKeyBindings?.playerBar)
      ) {
        event.preventDefault();
        setShowPlayerBar((prev) => !prev);
        return;
      }

      if (eventMatchesShortcut(event, settings.uiKeyBindings?.previousScramble)) {
        event.preventDefault();
        goBackwardScramble();
        return;
      }

      if (eventMatchesShortcut(event, settings.uiKeyBindings?.nextScramble)) {
        event.preventDefault();
        goForwardScramble();
        return;
      }

      if (eventMatchesShortcut(event, settings.solveKeyBindings?.clearPenalty)) {
        event.preventDefault();
        applyPenaltyToLatestSolve("clear");
        return;
      }

      if (eventMatchesShortcut(event, settings.solveKeyBindings?.plus2)) {
        event.preventDefault();
        applyPenaltyToLatestSolve("+2");
        return;
      }

      if (eventMatchesShortcut(event, settings.solveKeyBindings?.dnf)) {
        event.preventDefault();
        applyPenaltyToLatestSolve("DNF");
        return;
      }

      if (eventMatchesShortcut(event, settings.solveKeyBindings?.deleteSolve)) {
        event.preventDefault();
        deleteLatestSolve();
        return;
      }

      if (
        eventMatchesShortcut(event, "Ctrl+Shift+Delete") ||
        eventMatchesShortcut(event, "Ctrl+Shift+Backspace")
      ) {
        event.preventDefault();
        deleteLatestSolve();
        return;
      }

      if (eventMatchesShortcut(event, settings.solveKeyBindings?.undoDelete)) {
        event.preventDefault();
        undoDeletedSolve();
      }
    };

    const handleShortcutKeyUp = (event) => {
      if (!isPostSolveTagModifierEvent(event)) return;
      postSolveTagModifierHeldRef.current = false;
      clearPendingPostSolveTagChord();
      consumePostSolveTagEvent(event);
    };

    window.addEventListener("keydown", handleShortcutKeyDown, true);
    window.addEventListener("keyup", handleShortcutKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown, true);
      window.removeEventListener("keyup", handleShortcutKeyUp, true);
    };
  }, [
    applyPostSolveTagBinding,
    applyPenaltyToLatestSolve,
    clearPendingPostSolveTagChord,
    deleteLatestSolve,
    goBackwardScramble,
    goForwardScramble,
    undoDeletedSolve,
    location.pathname,
    navigate,
    selectedAverageSolve,
    selectedAverageSolves.length,
    settings.eventKeyBindings,
    settings.pageKeyBindings,
    settings.solveKeyBindings,
    settings.uiKeyBindings,
    shareComposer.isOpen,
    showManualSolveModal,
    showSettingsPopup,
    showSignInPopup,
    switchToEvent,
  ]);

  useEffect(
    () => () => {
      postSolveTagModifierHeldRef.current = false;
      if (postSolveTagToastTimeoutRef.current) {
        clearTimeout(postSolveTagToastTimeoutRef.current);
      }
      clearPendingPostSolveTagChord();
    },
    [clearPendingPostSolveTagChord]
  );
  const relaySelectorMarginTop = useMemo(() => {
    const ev = String(displayedSvgEvent || currentEvent || "").toUpperCase();
    if (["555", "666", "777", "MEGAMINX"].includes(ev)) return "88px";
    if (["333", "333OH", "333BLD"].includes(ev)) return "46px";
    if (["444", "SQ1", "CLOCK"].includes(ev)) return "62px";
    return "32px";
  }, [displayedSvgEvent, currentEvent]);

  const activeSharedMeta = useMemo(() => {
    if (!sharedSession) return null;

    const total = getSharedSolveCount(sharedSession);
    const mode = getSharedMode(sharedSession);
    const targetWins = getSharedTargetWins(sharedSession);

    const safeTotal = Math.max(total, 1);
    const solveNumber = Math.min(sharedIndex + 1, safeTotal);
    const currentUserID = user?.UserID || null;

    const opponentID = sharedSession?.opponentID || null;
    const perspective = getSharedPerspective(sharedSession, currentUserID, currentEvent);
    const yourEvents = perspective.yourEvents;
    const theirEvents = perspective.theirEvents;
    const yourFallbackEvent = perspective.yourFallbackEvent;
    const theirFallbackEvent = perspective.theirFallbackEvent;

    const yourPlanLabel = summarizeSharedPlan(yourEvents, yourFallbackEvent);
    const theirPlanLabel = summarizeSharedPlan(theirEvents, theirFallbackEvent);
    const samePlan = String(yourPlanLabel || "") === String(theirPlanLabel || "");

    const opponentLabel = getSharedOpponentLabel(sharedSession, {
      UserID: currentUserID,
    });

    const yourCurrentEvent =
      yourEvents?.[sharedIndex] || yourFallbackEvent || currentEvent;
    const theirCurrentEvent =
      theirEvents?.[sharedIndex] || theirFallbackEvent || currentEvent;

    const roundResults = sharedSession?.roundResults || {};
    const currentRoundResults = roundResults?.[sharedIndex] || {};
    const rows = Array.from({ length: total }, (_, index) => {
      const rowResults = roundResults?.[index] || {};
      const rowParticipants = getSharedRoundParticipants(sharedSession, index, currentUserID);
      const primaryPeer =
        rowParticipants.find((entry) => entry.participantID === opponentID) ||
        rowParticipants[0] ||
        null;

      return {
        index,
        scramble: sharedSession?.scrambles?.[index] || "",
        event: yourEvents?.[index] || yourFallbackEvent || currentEvent,
        yourTime: Number.isFinite(Number(rowResults?.[currentUserID]?.time))
          ? Number(rowResults[currentUserID].time)
          : null,
        theirTime: Number.isFinite(Number(primaryPeer?.time)) ? Number(primaryPeer.time) : null,
        peers: rowParticipants.map((entry) => ({
          name: getSharedParticipantLabel(sharedSession, entry.participantID, opponentLabel),
          time: entry.time,
          participantID: entry.participantID,
        })),
        complete:
          Number.isFinite(Number(rowResults?.[currentUserID]?.time)) &&
          rowParticipants.length > 0,
      };
    });
    const otherRoundParticipants = getSharedRoundParticipants(
      sharedSession,
      sharedIndex,
      currentUserID
    );
    const primaryOtherParticipant =
      otherRoundParticipants.find((entry) => entry.participantID === opponentID) ||
      otherRoundParticipants[0] ||
      null;
    const otherParticipantsCount = otherRoundParticipants.length;

    const yourCurrentTimeLabel = formatSharedTimeLabel(
      currentRoundResults?.[currentUserID]?.time
    );

    const theirCurrentTimeLabel = formatSharedTimeLabel(
      primaryOtherParticipant?.time
    );

    const resolvedOpponentLabel =
      otherParticipantsCount > 1
        ? `${otherParticipantsCount} others`
        : primaryOtherParticipant?.participantID || opponentLabel;

    const score = computeSharedScore(sharedSession, currentUserID);
    const modeLabel =
      mode === "head_to_head" ? "Head to Head" : mode === "casual" ? "Casual" : "Average";
    const centerLabel =
      mode === "head_to_head"
        ? `${samePlan ? sharedEventLabel(yourFallbackEvent) : "Mixed"} first to ${targetWins}`
        : mode === "casual"
        ? samePlan
          ? `${sharedEventLabel(yourFallbackEvent)} shared session`
          : "Mixed shared session"
        : samePlan
        ? `${yourPlanLabel} average`
        : "Mixed match";
    const subLabel =
      mode === "head_to_head"
        ? `Score ${score.yourWins}-${score.theirWins}`
        : `Round ${solveNumber}/${safeTotal}`;

    return {
      active: true,
      title: "Shared Session",
      modeLabel,
      opponentLabel: resolvedOpponentLabel,
      yourLabel: "You",
      theirLabel: resolvedOpponentLabel,
      yourPlanLabel,
      theirPlanLabel,
      centerLabel,
      subLabel,
      currentRoundLabel: `Round ${solveNumber}/${safeTotal}`,
      solveNumber,
      total: safeTotal,
      samePlan,
      theirCurrentEventLabel: sharedEventLabel(theirCurrentEvent),
      yourCurrentEventLabel: sharedEventLabel(yourCurrentEvent),
      theirCurrentTimeLabel,
      yourCurrentTimeLabel,
      rows,
      currentIndex: sharedIndex,
      count: total,
      targetWins,
      mode,
      yourWins: score.yourWins,
      theirWins: score.theirWins,
    };
  }, [sharedSession, sharedIndex, user?.UserID, currentEvent]);

  const activeSharedMessage = useMemo(() => {
    if (!sharedSession?.sharedID) return null;

    const creatorScrambles =
      Array.isArray(sharedSession.creatorScrambles) && sharedSession.creatorScrambles.length
        ? sharedSession.creatorScrambles
        : Array.isArray(sharedSession.scrambles)
        ? sharedSession.scrambles
        : [];

    const opponentScrambles =
      Array.isArray(sharedSession.opponentScrambles) && sharedSession.opponentScrambles.length
        ? sharedSession.opponentScrambles
        : Array.isArray(sharedSession.scrambles)
        ? sharedSession.scrambles
        : creatorScrambles;

    const creatorEvents =
      Array.isArray(sharedSession.creatorEvents) && sharedSession.creatorEvents.length
        ? sharedSession.creatorEvents
        : Array.isArray(sharedSession.events)
        ? sharedSession.events
        : creatorScrambles.map(() => sharedSession.creatorEvent || sharedSession.event || "333");

    const opponentEvents =
      Array.isArray(sharedSession.opponentEvents) && sharedSession.opponentEvents.length
        ? sharedSession.opponentEvents
        : Array.isArray(sharedSession.events)
        ? sharedSession.events
        : opponentScrambles.map(
            () => sharedSession.opponentEvent || sharedSession.event || "333"
          );

    const count = Math.max(
      Number(sharedSession.count) || 0,
      creatorScrambles.length,
      opponentScrambles.length
    );

    return {
      id: `${sharedSession.sharedID}-active`,
      sender: sharedSession.creatorID || user?.UserID || "",
      text: `[sharedAoN]${JSON.stringify({
        v: 2,
        mode: getSharedMode(sharedSession),
        type: getSharedMode(sharedSession),
        sharedID: sharedSession.sharedID,
        count,
        targetWins: sharedSession.targetWins || null,
        batchSize: sharedSession.batchSize || null,
        isHosted: isHostedSharedSession(sharedSession),
        saveSessionID: getSharedSaveSessionID(sharedSession),
        hostID: sharedSession.hostID || sharedSession.creatorID || user?.UserID || null,
        hostName:
          sharedSession.hostName ||
          sharedSession.creatorName ||
          sharedSession.creatorUsername ||
          null,
        roomCode: sharedSession.roomCode || null,
        creatorID: sharedSession.creatorID || user?.UserID || null,
        creatorEvent: sharedSession.creatorEvent || creatorEvents[0] || sharedSession.event || "333",
        opponentEvent:
          sharedSession.opponentEvent || opponentEvents[0] || sharedSession.event || "333",
        creatorEvents,
        opponentEvents,
        creatorScrambles,
        opponentScrambles,
      })}`,
    };
  }, [sharedSession, user?.UserID]);

  const activeSharedMessages = useMemo(() => {
    if (!sharedSession?.sharedID) return [];

    return Object.entries(sharedSession.roundResults || {})
      .flatMap(([solveIndex, row]) =>
        Object.entries(row || {}).map(([participantID, result]) => ({
          id: `${sharedSession.sharedID}-${solveIndex}-${participantID}`,
          sender: participantID,
          text: `[sharedUpdate]${sharedSession.sharedID}|${solveIndex}|${result?.time}|${participantID}`,
          createdAt: result?.updatedAt || null,
          timestamp: result?.updatedAt || null,
        }))
      )
      .sort((a, b) => {
        const aTs = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTs = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTs - bTs;
      });
  }, [sharedSession]);

  const loadAllCurrentSessionSolves = useCallback(async () => {
    if (practiceMode || !isSignedIn || !user?.UserID) return [];

    try {
      const items = await runDb(
        "Loading full session solves",
        () => getSolvesBySession(user.UserID, currentEvent, currentSession),
        { showStatus: false }
      );

      const normalized = (items || []).map((item) => normalizeSolve(item)).filter(Boolean);
      return assignExplicitSolveIndices(normalized, normalized.length);
    } catch (error) {
      console.warn("Failed to load full session solves:", error);
      return [];
    }
  }, [currentEvent, currentSession, isSignedIn, practiceMode, runDb, user?.UserID]);

  const applyLocalHomeMetricCorrection = useCallback((patch) => {
    const ev = String(currentEvent || "").toUpperCase();
    const sid = String(currentSession || "main");
    if (!ev || !patch || typeof patch !== "object") return;

    setSessionStats((prev) => ({
      ...(prev || {}),
      [ev]: {
        ...(prev?.[ev] || {}),
        [sid]: {
          ...(prev?.[ev]?.[sid] || {}),
          ...patch,
        },
      },
    }));

    setSessionsList((prev) =>
      Array.isArray(prev)
        ? prev.map((session) =>
            String(session?.Event || "").toUpperCase() === ev &&
            String(session?.SessionID || "main") === sid
              ? {
                  ...session,
                  Stats: {
                    ...(session?.Stats || {}),
                    ...patch,
                  },
                }
              : session
          )
        : prev
    );
  }, [currentEvent, currentSession]);

  const refreshCanonicalCurrentSessionStats = useCallback(async () => {
    if (practiceMode || !user?.UserID) return null;

    try {
      const item = await runDb(
        "Refreshing session stats",
        () => recomputeSessionStatsService(user.UserID, currentEvent, currentSession),
        { showStatus: false }
      );

      if (item) {
        applyLocalHomeMetricCorrection(item);
      }

      return item || null;
    } catch (error) {
      console.warn("Failed to refresh canonical current session stats:", error);
      return null;
    }
  }, [
    applyLocalHomeMetricCorrection,
    currentEvent,
    currentSession,
    practiceMode,
    runDb,
    user?.UserID,
  ]);

  const requestAverageWindow = async (count, startSolveRef, targetAvg, variant = "best") => {
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
        const apiWindowValue = computeWindowMetricValue(normalized, count);
        const exactApiMatch =
          normalized.length === count &&
          typeof apiWindowValue === "number" &&
          Math.round(apiWindowValue) === Math.round(Number(targetAvg));

        if (exactApiMatch) {
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
      const avg = computeWindowMetricValue(slice, count);
      if (typeof avg === "number" && Math.round(avg) === Math.round(Number(targetAvg))) {
        selected = slice;
        break;
      }
    }

    if (selected.length > 0) {
      setSelectedAverageSolves(selected);
      return true;
    }

    const fullSessionSolves = await loadAllCurrentSessionSolves();
    const exactWindow = findAverageWindowByValue(fullSessionSolves, count, targetAvg);
    if (exactWindow.length > 0) {
      setSelectedAverageSolves(exactWindow);
      return true;
    }

    const fallbackWindow =
      variant === "worst"
        ? findWorstAverageWindow(fullSessionSolves, count)
        : findBestAverageWindow(fullSessionSolves, count);
    if (fallbackWindow.length > 0) {
      const correctedAverage = computeWindowMetricValue(fallbackWindow, count);

      const patch =
        variant === "best" && count === 3
          ? {
              BestMo3Ms: correctedAverage,
              BestMo3StartSolveSK: fallbackWindow[0]?.solveRef || null,
            }
          : variant === "best" && count === 5
          ? {
              BestAo5Ms: correctedAverage,
              BestAo5StartSolveSK: fallbackWindow[0]?.solveRef || null,
            }
          : variant === "best" && count === 12
          ? {
              BestAo12Ms: correctedAverage,
              BestAo12StartSolveSK: fallbackWindow[0]?.solveRef || null,
            }
          : {};

      if (Object.keys(patch).length) {
        applyLocalHomeMetricCorrection(patch);
      }

      await refreshCanonicalCurrentSessionStats();

      setSelectedAverageSolves(fallbackWindow);
      return true;
    }

    return false;
  };

  const handleHomeSummarySelect = useCallback(
    async (selection) => {
      if (!selection || selection.value == null) return;
      const isWorst = selection.variant === "worst";

      if (selection.kind === "single") {
        const solveRef =
          currentSessionStatsForEvent?.[
            isWorst ? selection.worstSolveField || selection.solveField : selection.solveField
          ] || null;
        const target = Number(selection.value);
        let solve =
          currentSolves.find(
            (item) => String(item?.solveRef ?? item?.SK ?? "") === String(solveRef)
          ) || null;

        if (!solve && !practiceMode && isSignedIn && user?.UserID && solveRef) {
          try {
            const items = await getSolveWindowFromStart(
              user.UserID,
              currentEvent,
              currentSession,
              solveRef,
              1
            );
            solve = normalizeSolve((items || [])[0]);
          } catch (error) {
            console.warn("Failed to load best single for home summary:", error);
          }
        }

        const solveMatchesTarget =
          solve && Number.isFinite(target)
            ? Math.round(Number(solve?.time ?? solve?.finalTimeMs)) === Math.round(target)
            : !!solve;

        if (!solveMatchesTarget) {
          solve = findSingleByTime(currentSolves, target);
        }

        if (!solve) {
          const fullSessionSolves = await loadAllCurrentSessionSolves();
          solve = findSingleByTime(fullSessionSolves, target);

          if (!solve) {
            solve = isWorst
              ? findWorstSingleSolve(fullSessionSolves)
              : findBestSingleSolve(fullSessionSolves);
          }

          if (solve && !isWorst) {
            applyLocalHomeMetricCorrection({
              BestSingleMs: Number(solve?.time ?? solve?.finalTimeMs) || null,
              BestSingleSolveSK: solve?.solveRef || null,
            });
            await refreshCanonicalCurrentSessionStats();
          }
        }

        if (solve) {
          setSelectedAverageSolve({ ...solve, userID: user?.UserID });
        }
        return;
      }

      const handled = await requestAverageWindow(
        selection.size,
        currentSessionStatsForEvent?.[
          isWorst ? selection.worstStartField || selection.startField : selection.startField
        ] || null,
        selection.value,
        selection.variant
      );

      if (!handled) {
        console.warn(`Unable to open ${selection.label} from home summary.`);
      }
    },
    [
      currentEvent,
      currentSession,
      currentSolves,
      isSignedIn,
      applyLocalHomeMetricCorrection,
      loadAllCurrentSessionSolves,
      normalizeSolve,
      currentSessionStatsForEvent,
      practiceMode,
      refreshCanonicalCurrentSessionStats,
      requestAverageWindow,
      user?.UserID,
    ]
  );

  const cubeModelHistoryOptions = useMemo(() => {
    const scopedKeys = Array.from(
      new Set([String(eventKey || "").trim().toUpperCase(), tagScopeEventKey].filter(Boolean))
    );

    return Array.from(
      new Set(
        [
          ...getCubeCollectionOptionsForEvent(user?.CubeCollection, eventKey),
          ...scopedKeys.flatMap((key) =>
            (Array.isArray(sessions?.[key]) ? sessions[key] : [])
              .map((solve) =>
                String(solve?.tags?.CubeModel || solve?.Tags?.CubeModel || "").trim()
              )
              .filter(Boolean)
          ),
          ...scopedKeys
            .map((key) => String(tagsByEvent?.[key]?.CubeModel || "").trim())
            .filter(Boolean),
        ].filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [eventKey, sessions, tagScopeEventKey, tagsByEvent, user?.CubeCollection]);

  const baseHomeTagOptions = useMemo(
    () => collectTagSelectionOptions([], homeTagConfig, cubeModelHistoryOptions),
    [homeTagConfig, cubeModelHistoryOptions]
  );

  const catalogHomeTagOptions = useMemo(
    () => getTagCatalogOptionsForEvent(tagCatalog, eventKey),
    [tagCatalog, eventKey]
  );

  const mergedHomeTagOptions = useMemo(
    () =>
      Object.fromEntries(
        Object.keys({
          ...baseHomeTagOptions,
          ...catalogHomeTagOptions,
          ...homeDiscoveredTagOptions,
        }).map((field) => [
          field,
          Array.from(
            new Set([
              ...(Array.isArray(baseHomeTagOptions?.[field]) ? baseHomeTagOptions[field] : []),
              ...(Array.isArray(catalogHomeTagOptions?.[field])
                ? catalogHomeTagOptions[field]
                : []),
              ...(Array.isArray(homeDiscoveredTagOptions?.[field])
                ? homeDiscoveredTagOptions[field]
                : []),
            ])
          ).sort((a, b) => a.localeCompare(b)),
        ])
      ),
    [baseHomeTagOptions, catalogHomeTagOptions, homeDiscoveredTagOptions]
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
  const isHostedRoomActive = !!(sharedSession && isHostedSharedSession(sharedSession));
  const hostedRoomMeta = useMemo(() => {
    if (!isHostedRoomActive || !sharedSession) return null;
    const roomEvent =
      sharedCurrentEvent ||
      sharedSession?.creatorEvent ||
      sharedSession?.event ||
      currentEvent ||
      "333";
    const hostID = String(sharedSession?.hostID || sharedSession?.creatorID || "").trim();
    const currentUserID = String(user?.UserID || "").trim();
    const isHost = !!hostID && hostID === currentUserID;

    return {
      active: true,
      isHost,
      roomCode: sharedSession?.roomCode || null,
      roomName:
        sharedSession?.hostName ||
        sharedSession?.creatorName ||
        sharedSession?.creatorUsername ||
        "Room",
      eventLabel: sharedEventLabel(roomEvent),
      roundLabel: `Round ${Math.min(sharedIndex + 1, Math.max(getSharedSolveCount(sharedSession), 1))}`,
    };
  }, [currentEvent, isHostedRoomActive, sharedCurrentEvent, sharedIndex, sharedSession, user?.UserID]);
  const isSharedHomeView =
    isHomePage && !!(sharedSession && activeSharedMessage && !isHostedSharedSession(sharedSession));
  const dbStatusValue = useMemo(
    () => ({
      dbStatus,
      runDb,
      setDbPhase,
    }),
    [dbStatus, runDb, setDbPhase]
  );
  const statsRouteUser = isViewingSharedStats ? sharedStatsUser : user;
  const statsRouteSessions = isViewingSharedStats ? sharedStatsSessions : sessions;
  const statsRouteSessionStats = isViewingSharedStats ? sharedStatsSessionStats : sessionStats;
  const statsRouteSessionsList = isViewingSharedStats ? sharedStatsSessionsList : sessionsList;
  const statsRouteSetSessions = isViewingSharedStats ? setSharedStatsSessions : setSessions;
  const renderSignedOutScreen = (title) => (
    <div className="Page auth-required-screen">
      <SignInPopup
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        inline
        title={title}
      />
    </div>
  );

  return (
    <DbStatusProvider value={dbStatusValue}>
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

          <div
            className={`main-content ${isHomePage ? "main-content--home" : ""} ${
              isSharedHomeView ? "main-content--shared-home" : ""
            }`}
          >
            <Routes>
            <Route
              path="/"
              element={
                <div className={`home-screen ${isSharedHomeView ? "home-screen--shared" : ""}`}>
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
                        copyFeedback={scrambleCopyFeedback}
                        onAddSolveClick={
                          settings?.showAddSolveButton === false
                            ? undefined
                            : openManualSolveModal
                        }
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
                            marginTop: relaySelectorMarginTop,
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
                                  background: active ? "#2EC4B6" : "var(--theme-surface-soft)",
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
                              ref={homeEventSelectorRef}
                              currentEvent={currentEvent}
                              handleEventChange={handleEventChange}
                              currentSession={currentSession}
                              setCurrentSession={setCurrentSession}
                              sessions={sessionsList}
                              customEvents={customEvents}
                              userID={user?.UserID}
                              onSessionChange={() => {
                                sharedReturnTargetRef.current = null;
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
                            className={`home-tag-dock ${
                              isSharedHomeView ? "home-tag-dock--shared" : ""
                            }`}
                            style={{
                              position: "absolute",
                              top: "76px",
                              right: "12px",
                              left: "auto",
                              display: "flex",
                              pointerEvents: "auto",
                              zIndex: 200,
                            }}
                          >
                            <TagBar
                              key={`tagbar-${eventKey}`}
                              tags={currentTags}
                              eventKey={eventKey}
                              tagColors={currentTagColors}
                              onChange={(next) => {
                                setTagsByEvent((prev) => ({
                                  ...(prev || {}),
                                  [tagScopeEventKey]: next,
                                }));
                                rememberTagSelectionValues(next);
                              }}
                              onTagColorsChange={(next) => {
                                let nextCatalog = tagColorCatalog;

                                Object.entries(next || {}).forEach(([field, valueMap]) => {
                                  Object.entries(valueMap || {}).forEach(([value, color]) => {
                                    nextCatalog = setTagColorCatalogValue(
                                      nextCatalog,
                                      eventKey,
                                      field,
                                      value,
                                      color
                                    );
                                  });
                                });

                                setUser((prev) => ({
                                  ...(prev || {}),
                                  TagColorCatalog: nextCatalog,
                                }));
                                queueTagColorCatalogSave(nextCatalog);
                              }}
                              tagConfig={homeTagConfig}
                              cubeModelOptions={cubeModelHistoryOptions}
                              discoveredOptions={mergedHomeTagOptions}
                              profileColor={user?.Color || user?.color || "#2EC4B6"}
                              variant="home"
                              collapsible
                              hideAutomaticFields={!!settings.hideAutomaticHomeTags}
                              collapseToggleTop={
                                settings.hideAutomaticHomeTags ? "36px" : "92px"
                              }
                              allowAdditions
                              showFooterAction={showLoadLastSolveTagsButton}
                              footerActionLabel="Load tags from last solve"
                              onFooterAction={loadTagsFromLastSolve}
                            />
                          </div>

                          {hostedRoomMeta?.active ? (
                            <div
                              style={{
                                position: "absolute",
                                top: "18px",
                                left: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "8px 12px",
                                borderRadius: "999px",
                                background: "rgba(80, 182, 255, 0.14)",
                                border: "1px solid rgba(80, 182, 255, 0.45)",
                                color: "white",
                                zIndex: 220,
                              }}
                            >
                              <span style={{ fontSize: "11px", fontWeight: 900 }}>
                                {hostedRoomMeta.isHost ? "Hosting room" : "Following room"}
                              </span>
                              <span style={{ fontSize: "11px", opacity: 0.82 }}>
                                {hostedRoomMeta.eventLabel}
                              </span>
                              {hostedRoomMeta.roomCode ? (
                                <span style={{ fontSize: "11px", opacity: 0.7 }}>
                                  {hostedRoomMeta.roomCode}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={openSharedMatch}
                                style={{
                                  border: "none",
                                  borderRadius: "999px",
                                  padding: "4px 10px",
                                  background: "rgba(255,255,255,0.12)",
                                  color: "white",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Room
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (hostedRoomMeta.isHost) closeHostedRoom();
                                  else leaveSharedRun();
                                }}
                                style={{
                                  border: "none",
                                  borderRadius: "999px",
                                  padding: "4px 10px",
                                  background: hostedRoomMeta.isHost
                                    ? "rgba(246, 66, 88, 0.9)"
                                    : "rgba(255,255,255,0.12)",
                                  color: "white",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {hostedRoomMeta.isHost ? "Stop" : "Leave"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <HomeStatsOverlay
                    solves={currentSolves}
                    settings={settings}
                    user={user}
                    overallStats={currentSessionStatsForEvent}
                    onSummarySelect={handleHomeSummarySelect}
                  />

                  <Timer
                    addTime={addSolve}
                    activeScramble={displayedScramble}
                    compact={isSharedHomeView}
                    latestSolve={currentSolves[currentSolves.length - 1] || null}
                  />

                  {sharedSession && activeSharedMessage && !isHostedSharedSession(sharedSession) ? (
                    <SharedAverageMessage
                      msg={activeSharedMessage}
                      user={user}
                      messages={activeSharedMessages}
                      onLoadSession={(session, options) => beginSharedSession(session, options)}
                      onLeaveSharedSession={leaveSharedRun}
                      onRequestRefresh={refreshActiveSharedSession}
                      yourColor={user?.Color || user?.color || "#2EC4B6"}
                      theirColor={getSharedOpponentColor(sharedSession)}
                      yourUsername={user?.Username}
                      theirUsername={getSharedOpponentLabel(sharedSession, user)}
                      compactHome={isSharedHomeView}
                      activeSharedID={sharedSession?.sharedID || null}
                      sessionData={sharedSession}
                      showStartAction={false}
                      showRefreshAction={false}
                    />
                  ) : (
                    <div className="home-bottom-stack">
                      <AveragesDisplay
                        currentSolves={currentSolves}
                        overallSessionStats={currentSessionStatsForEvent}
                        setSelectedAverageSolves={setSelectedAverageSolves}
                        onRequestBestAverageWindow={requestAverageWindow}
                      />

                      <TimeList
                        user={user}
                        applyPenalty={applyPenalty}
                        solves={currentSolves}
                        sessionBestSingleMs={currentSessionStatsForEvent?.BestSingleMs}
                        horizontalAutoColsBreakpointPx={1200}
                        nonRollingAutoColsBreakpointPx={1050}
                        compactHorizontalLargeMinWidthPx={880}
                        deleteTime={(index) =>
                          practiceMode
                            ? deletePracticeTime(index)
                            : deleteTime(eventKey, index)
                        }
                        addPost={addPost}
                        saveToProfile={addPostToProfile}
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
                        tagConfig={homeTagConfig}
                        cubeModelOptions={cubeModelHistoryOptions}
                        discoveredTagOptions={mergedHomeTagOptions}
                        tagColors={currentTagColors}
                        onTagColorsChange={(next) => {
                          let nextCatalog = tagColorCatalog;

                          Object.entries(next || {}).forEach(([field, valueMap]) => {
                            Object.entries(valueMap || {}).forEach(([value, color]) => {
                              nextCatalog = setTagColorCatalogValue(
                                nextCatalog,
                                eventKey,
                                field,
                                value,
                                color
                              );
                            });
                          });

                          setUser((prev) => ({
                            ...(prev || {}),
                            TagColorCatalog: nextCatalog,
                          }));
                          queueTagColorCatalogSave(nextCatalog);
                        }}
                        totalSolveCount={
                          Number.isFinite(currentSessionTotalSolveCount) &&
                          currentSessionTotalSolveCount >= 0
                            ? currentSessionTotalSolveCount
                            : undefined
                        }
                      />
                    </div>
                  )}

                  {selectedAverageSolves.length > 0 && (
                    <AverageDetailModal
                      isOpen={selectedAverageSolves.length > 0}
                      title={`Average Detail (${selectedAverageSolves.length})`}
                      subtitle={`${eventKey === "333" ? "3x3" : eventKey} · ${currentSession}`}
                      solves={selectedAverageSolves}
                      addPost={addPost}
                      saveToProfile={addPostToProfile}
                      tagConfig={homeTagConfig}
                      tagColors={currentTagColors}
                      profileColor={user?.Color || user?.color || "#2EC4B6"}
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
                      profileColor={user?.Color || user?.color || "#2EC4B6"}
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
                      saveToProfile={addPostToProfile}
                      applyPenalty={applyPenalty}
                      userID={user?.UserID}
                      setSessions={setSessions}
                      sessionsList={sessionsList}
                      tagConfig={homeTagConfig}
                      cubeModelOptions={cubeModelHistoryOptions}
                      discoveredTagOptions={mergedHomeTagOptions}
                      tagColors={currentTagColors}
                      onTagColorsChange={(next) => {
                        let nextCatalog = tagColorCatalog;

                        Object.entries(next || {}).forEach(([field, valueMap]) => {
                          Object.entries(valueMap || {}).forEach(([value, color]) => {
                            nextCatalog = setTagColorCatalogValue(
                              nextCatalog,
                              eventKey,
                              field,
                              value,
                              color
                            );
                          });
                        });

                        setUser((prev) => ({
                          ...(prev || {}),
                          TagColorCatalog: nextCatalog,
                        }));
                        queueTagColorCatalogSave(nextCatalog);
                      }}
                    />
                  )}
                </div>
              }
            />

            <Route
              path="/profile"
              element={
                isSignedIn ? (
                  <Profile
                    user={user}
                    setUser={setUser}
                    deletePost={deletePost}
                    showPlayerBar={showPlayerBar}
                    updateComments={handleUpdateComments}
                    sessions={sessions}
                  />
                ) : (
                  renderSignedOutScreen("Profile")
                )
              }
            />

            <Route
              path="/profile/:userID"
              element={
                isSignedIn ? (
                  <Profile
                    user={user}
                    setUser={setUser}
                    deletePost={deletePost}
                    showPlayerBar={showPlayerBar}
                    updateComments={handleUpdateComments}
                    sessions={sessions}
                  />
                ) : (
                  renderSignedOutScreen("Profile")
                )
              }
            />

            <Route
              path="/stats"
              element={
                isViewingSharedStats && sharedStatsLoading ? (
                  <div className="Page">
                    <div style={{ padding: "24px" }}>Loading shared stats...</div>
                  </div>
                ) : !isSignedIn && isViewingSharedStats ? (
                  renderSignedOutScreen("Shared Stats")
                ) : !isSignedIn ? (
                  renderSignedOutScreen("Stats")
                ) : isViewingSharedStats && sharedStatsDeniedReason ? (
                  <div className="Page">
                    <div style={{ padding: "24px" }}>{sharedStatsDeniedReason}</div>
                  </div>
                ) : (
                  <Stats
                    sessions={statsRouteSessions}
                    settings={settings}
                    sessionStats={statsRouteSessionStats}
                    sessionsList={statsRouteSessionsList}
                    tagConfig={tagConfig}
                    tagCatalog={tagCatalog}
                    tagColorCatalog={tagColorCatalog}
                    cubeModelOptions={cubeModelHistoryOptions}
                    statsMutationTick={statsMutationTick}
                    setSessions={statsRouteSetSessions}
                    setUser={isViewingSharedStats ? () => {} : setUser}
                    currentEvent={currentEvent}
                    currentSession={currentSession}
                    user={statsRouteUser}
                    viewerUser={user}
                    readOnly={isViewingSharedStats}
                    deleteTime={
                      isViewingSharedStats
                        ? async () => {}
                        : (eventKeyParam, index) => deleteTime(eventKeyParam, index)
                    }
                    addPost={isViewingSharedStats ? null : addPost}
                    saveToProfile={isViewingSharedStats ? null : addPostToProfile}
                    onTagColorsChange={
                      isViewingSharedStats
                        ? null
                        : (targetEventKey, next) => {
                            let nextCatalog = tagColorCatalog;

                            Object.entries(next || {}).forEach(([field, valueMap]) => {
                              Object.entries(valueMap || {}).forEach(([value, color]) => {
                                nextCatalog = setTagColorCatalogValue(
                                  nextCatalog,
                                  targetEventKey,
                                  field,
                                  value,
                                  color
                                );
                              });
                            });

                            setUser((prev) => ({
                              ...(prev || {}),
                              TagColorCatalog: nextCatalog,
                            }));
                            queueTagColorCatalogSave(nextCatalog);
                          }
                    }
                    onSettingsContextChange={setStatsSettingsContext}
                    recomputeRequest={isViewingSharedStats ? 0 : statsRecomputeRequest}
                    importRequest={isViewingSharedStats ? 0 : statsImportRequest}
                    exportRequest={isViewingSharedStats ? 0 : statsExportRequest}
                    forceShowImportModal={isViewingSharedStats ? false : showStatsImportModal}
                    forceShowExportModal={isViewingSharedStats ? false : showStatsExportModal}
                    onImportModalOpenHandled={() => setShowStatsImportModal(false)}
                    onExportModalOpenHandled={() => setShowStatsExportModal(false)}
                    onSessionsListRefresh={isViewingSharedStats ? null : setSessionsList}
                    onOverallStatsRecomputed={
                      isViewingSharedStats
                        ? null
                        : ({ scope, event, sessionID, item }) => {
                            const ev = String(event || "").toUpperCase();
                            if (!ev || !item || typeof item !== "object") return;

                            if (scope === "session") {
                              const sid = String(sessionID || "main");
                              setSessionStats((prev) => ({
                                ...(prev || {}),
                                [ev]: {
                                  ...(prev?.[ev] || {}),
                                  [sid]: item,
                                },
                              }));

                              setSessionsList((prev) =>
                                Array.isArray(prev)
                                  ? prev.map((session) =>
                                      String(session?.Event || "").toUpperCase() === ev &&
                                      String(session?.SessionID || "main") === sid
                                        ? {
                                            ...session,
                                            Stats: item,
                                          }
                                        : session
                                    )
                                  : prev
                              );
                            }
                          }
                    }
                  />
                )
              }
            />

            <Route
              path="/social"
              element={
                isSignedIn ? (
                  <Social
                    user={user}
                    addPost={addPost}
                    deletePost={deletePost}
                    updateComments={handleUpdateComments}
                    beginSharedSession={beginSharedSession}
                    updateSharedSession={setSharedSession}
                    mergeSharedSession={mergeSharedSession}
                    refreshTick={socialRefreshTick}
                    sharedSession={sharedSession}
                    leaveSharedRun={leaveSharedRun}
                    currentEvent={currentEvent}
                  />
                ) : (
                  renderSignedOutScreen("Social")
                )
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
          currentTags={currentTags}
          currentTagColors={currentTagColors}
          tagConfig={homeTagConfig}
          onTagsChange={(next) => {
            setTagsByEvent((prev) => ({
              ...(prev || {}),
              [tagScopeEventKey]: next,
            }));
            rememberTagSelectionValues(next);
          }}
          onTagColorsChange={(next) => {
            let nextCatalog = tagColorCatalog;

            Object.entries(next || {}).forEach(([field, valueMap]) => {
              Object.entries(valueMap || {}).forEach(([value, color]) => {
                nextCatalog = setTagColorCatalogValue(
                  nextCatalog,
                  eventKey,
                  field,
                  value,
                  color
                );
              });
            });

            setUser((prev) => ({
              ...(prev || {}),
              TagColorCatalog: nextCatalog,
            }));
            queueTagColorCatalogSave(nextCatalog);
          }}
          cubeModelOptions={cubeModelHistoryOptions}
          visibleTagFields={settings.playerBarTagFields}
          discoveredTagOptions={mergedHomeTagOptions}
          setCurrentSession={setCurrentSession}
          sharedSession={sharedSession}
          sharedAverageMeta={isHostedRoomActive ? null : activeSharedMeta}
          sessionsList={sessionsList}
          customEvents={customEvents}
          handleEventChange={handleEventChange}
          deleteTime={deleteTime}
          addTime={addSolve}
          scramble={displayedScramble}
          onScrambleClick={onScrambleClick}
          goForwardScramble={goForwardScramble}
          goBackwardScramble={goBackwardScramble}
          hostedRoomMeta={hostedRoomMeta}
          addPost={addPost}
          user={user}
          applyPenalty={applyPenalty}
          onRefreshSharedAverage={refreshActiveSharedSession}
          onLeaveSharedSession={leaveSharedRun}
          onCloseHostedRoom={closeHostedRoom}
          onSessionChange={() => {
            sharedReturnTargetRef.current = null;
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
          onHide={() => setShowPlayerBar(false)}
        />
      )}

      {!isHomePage && !showPlayerBar && (
        <div className="toggle-bar" style={{ bottom: "12px" }}>
          <button
            className="toggle-button"
            onClick={() => setShowPlayerBar(true)}
            aria-label="Show player bar"
            title="Show player bar"
          >
            <span className="toggle-button-glyph" aria-hidden="true">&#x25B2;</span>
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

      <ProfileSetupModal
        open={showPostSignUpProfileSetup}
        initialValues={{
          color: user?.Color || user?.color || "#0E171D",
          profileEvent: user?.ProfileEvent || user?.profileEvent || "333",
          profileScramble: user?.ProfileScramble || user?.profileScramble || "",
        }}
        onGenerateScramble={generateScrambleForEvent}
        onSave={handleCompletePostSignUpProfileSetup}
        onClose={handleClosePostSignUpProfileSetup}
      />

      <TutorialModal
        open={showTutorialModal}
        onClose={() => setShowTutorialModal(false)}
      />

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
            if (location.pathname !== "/stats") navigate("/stats");
            setStatsImportRequest((prev) => prev + 1);
            setShowStatsImportModal(true);
          }}
          onStatsExport={() => {
            setShowSettingsPopup(false);
            if (location.pathname !== "/stats") navigate("/stats");
            setStatsExportRequest((prev) => prev + 1);
            setShowStatsExportModal(true);
          }}
          onOpenTutorial={openTutorialFromSettings}
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

      {showManualSolveModal && (
        <div
          className="manualSolvePopup"
          onClick={(event) => {
            if (event.target.className === "manualSolvePopup") {
              closeManualSolveModal();
            }
          }}
        >
          <div className="manualSolvePopupContent">
            <span className="closePopup" onClick={closeManualSolveModal}>
              x
            </span>
            <h2>Add Solve</h2>
            <p className="manualSolvePopupSubtext">
              Save a solve to the current event and session with just a time, or add a scramble too.
            </p>

            <label className="manualSolveFieldLabel" htmlFor="manual-solve-time">
              Time
            </label>
            <input
              id="manual-solve-time"
              className="manualSolveInput"
              type="text"
              placeholder="12.34 or 1:02.45"
              value={manualSolveTime}
              onChange={(event) => setManualSolveTime(event.target.value)}
              disabled={manualSolveSaving}
              autoFocus
            />

            <label className="manualSolveFieldLabel" htmlFor="manual-solve-scramble">
              Scramble
            </label>
            <textarea
              id="manual-solve-scramble"
              className="manualSolveTextarea"
              placeholder="Optional"
              value={manualSolveScramble}
              onChange={(event) => setManualSolveScramble(event.target.value)}
              disabled={manualSolveSaving}
            />

            {manualSolveError ? (
              <div className="manualSolveError">{manualSolveError}</div>
            ) : null}

            <div className="manualSolveActions">
              <button type="button" onClick={closeManualSolveModal} disabled={manualSolveSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="manualSolvePrimary"
                onClick={submitManualSolve}
                disabled={manualSolveSaving}
              >
                {manualSolveSaving ? "Saving..." : "Save Solve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteUndoState && showDeleteUndoToast && (
        <div className="deleteUndoToast" role="status" aria-live="polite">
          <div className="deleteUndoToastText">Solve deleted.</div>
          <button type="button" className="deleteUndoToastAction" onClick={undoDeletedSolve}>
            Undo
          </button>
          <button
            type="button"
            className="deleteUndoToastDismiss"
            onClick={() => setShowDeleteUndoToast(false)}
            aria-label="Dismiss undo message"
          >
            x
          </button>
        </div>
      )}

      {postSolveTagToast && (
        <div className="deleteUndoToast" role="status" aria-live="polite">
          <div className="deleteUndoToastText">{postSolveTagToast}</div>
          <button
            type="button"
            className="deleteUndoToastDismiss"
            onClick={() => setPostSolveTagToast("")}
            aria-label="Dismiss tag message"
          >
            x
          </button>
        </div>
      )}

      <SharePostModal
        isOpen={shareComposer.isOpen}
        title="Share Post"
        caption={shareComposer.caption}
        targetType={shareComposer.targetType}
        onTargetTypeChange={(targetType) =>
          setShareComposer((prev) => ({
            ...prev,
            targetType,
            error: "",
          }))
        }
        availableConversations={shareComposer.availableConversations}
        selectedConversationID={shareComposer.selectedConversationID}
        onSelectedConversationChange={(selectedConversationID) =>
          setShareComposer((prev) => ({
            ...prev,
            selectedConversationID,
            error: "",
          }))
        }
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
        isLoadingDestinations={shareComposer.isLoadingDestinations}
        error={shareComposer.error}
      />
      </div>
    </DbStatusProvider>
  );
}

export default App;
