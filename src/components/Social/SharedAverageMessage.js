import React, { useEffect, useMemo, useState } from "react";

import { useSettings } from "../../contexts/SettingsContext";
import { hexToRgbString } from "../../utils/colorUtils";

import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import Detail from "../Detail/Detail";
import AverageDetailModal from "../Detail/AverageDetailModal";
import "./SharedAverageMessage.css";
import "../Profile/NameTag.css";

// keep importing so nothing else breaks if you rely on it elsewhere
import TimeItem from "../TimeList/TimeItem";
import "../TimeList/TimeItem.css";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hslColor(h, s = 100, l = 55) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Green (fast) -> Red (slow)
function hueGreenToRed(t01) {
  const t = clamp01(t01);
  return 120 * (1 - t);
}

/* -------------------------------------------
   EVENT NORMALIZATION
-------------------------------------------- */
const normalizeEventKey = (evt) => {
  if (!evt) return "333";
  const e = String(evt).trim().toUpperCase();

  // common variations
  if (e === "3X3" || e === "3X3X3") return "333";
  if (e === "2X2" || e === "2X2X2") return "222";
  if (e === "4X4" || e === "4X4X4") return "444";
  if (e === "5X5" || e === "5X5X5") return "555";
  if (e === "6X6" || e === "6X6X6") return "666";
  if (e === "7X7" || e === "7X7X7") return "777";

  return e;
};

const eventDisplayLabel = (evt) => {
  const eventKey = normalizeEventKey(evt);
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
  return labels[eventKey] || eventKey;
};

// PuzzleSVG likely only supports core puzzle keys.
// OH/BLD should still show a 3x3 cube icon.
const puzzleSvgEventKey = (eventKey) => {
  if (eventKey === "333OH") return "333";
  if (eventKey === "333BLD") return "333";
  return eventKey;
};

/* -------------------------------------------
   TWO UI MAPS (LEFT/THEM and RIGHT/YOU)
-------------------------------------------- */
const LEFT_UI = {
  "222": { label: "2x2", labelSize: 26, labelTrack: 0.4, iconScale: 0.52, iconDx: -2, iconDy: 0 },
  "333": { label: "3x3", labelSize: 28, labelTrack: 0.4, iconScale: 0.44, iconDx: -16, iconDy: -4 },
  "444": { label: "4x4", labelSize: 26, labelTrack: 0.4, iconScale: 0.40, iconDx: -16, iconDy: -4 },
  "555": { label: "5x5", labelSize: 24, labelTrack: 0.4, iconScale: 0.42, iconDx: -16, iconDy: -5 },
  "666": { label: "6x6", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -16, iconDy: -5 },
  "777": { label: "7x7", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -18, iconDy: -5 },

  "MEGAMINX": { label: "MEGAMINX", labelSize: 20, labelTrack: 0.8, iconScale: 0.30, iconDx: -10, iconDy: -18 },
  "PYRAMINX": { label: "PYRAMINX", labelSize: 22, labelTrack: 0.8, iconScale: 0.44, iconDx: -18, iconDy: -28 },
  "SKEWB": { label: "SKEWB", labelSize: 24, labelTrack: 0.8, iconScale: 0.60, iconDx: -22, iconDy: -15 },
  "SQ1": { label: "SQ-1", labelSize: 24, labelTrack: 0.8, iconScale: 0.56, iconDx: -28, iconDy: -36 },
  "CLOCK": { label: "CLOCK", labelSize: 24, labelTrack: 0.8, iconScale: 0.46, iconDx: -18, iconDy: -24 },
  "333OH": { label: "3x3 OH", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: -4, iconDy: 0 },
  "333BLD": { label: "3x3 BLD", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: -4, iconDy: 0 },
};

const RIGHT_UI = {
  "222": { label: "2x2", labelSize: 26, labelTrack: 0.4, iconScale: 0.52, iconDx: 2, iconDy: 0 },
  "333": { label: "3x3", labelSize: 28, labelTrack: 0.4, iconScale: 0.44, iconDx: -32, iconDy: -4 },
  "444": { label: "4x4", labelSize: 26, labelTrack: 0.4, iconScale: 0.40, iconDx: -34, iconDy: -4 },
  "555": { label: "5x5", labelSize: 24, labelTrack: 0.4, iconScale: 0.42, iconDx: -36, iconDy: -5 },
  "666": { label: "6x6", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -38, iconDy: -5 },
  "777": { label: "7x7", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -38, iconDy: -5 },

  "MEGAMINX": { label: "MEGAMINX", labelSize: 20, labelTrack: 0.8, iconScale: 0.30, iconDx: -20, iconDy: -18 },
  "PYRAMINX": { label: "PYRAMINX", labelSize: 22, labelTrack: 0.8, iconScale: 0.44, iconDx: -32, iconDy: -28 },
  "SKEWB": { label: "SKEWB", labelSize: 24, labelTrack: 0.8, iconScale: 0.60, iconDx: -38, iconDy: -15 },
  "SQ1": { label: "SQ-1", labelSize: 24, labelTrack: 0.8, iconScale: 0.56, iconDx: -48, iconDy: -36 },
  "CLOCK": { label: "CLOCK", labelSize: 24, labelTrack: 0.8, iconScale: 0.46, iconDx: -36, iconDy: -24 },
  "333OH": { label: "3x3 OH", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: 4, iconDy: 0 },
  "333BLD": { label: "3x3 BLD", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: 4, iconDy: 0 },
};

const getUiForSide = (side, eventKey) => {
  const fallback = {
    label: eventKey,
    labelSize: 28,
    labelTrack: 0.4,
    iconScale: 0.52,
    iconDx: 0,
    iconDy: 0,
  };
  const map = side === "you" ? RIGHT_UI : LEFT_UI;
  return map[eventKey] || fallback;
};

function buildPlanSummary(events = []) {
  const normalized = (events || []).map(normalizeEventKey).filter(Boolean);
  const counts = new Map();

  normalized.forEach((event) => {
    counts.set(event, (counts.get(event) || 0) + 1);
  });

  const entries = Array.from(counts.entries());
  const total = normalized.length;

  return {
    total,
    distinctCount: entries.length,
    entries,
    isSingleEvent: entries.length === 1,
    primaryEvent: entries[0]?.[0] || "333",
    primaryCount: entries[0]?.[1] || 0,
    compactLabel: entries
      .map(([event, count]) =>
        count > 1 ? `${count}× ${eventDisplayLabel(event)}` : eventDisplayLabel(event)
      )
      .join(" + "),
  };
}

function findFirstMissingIndex(timesMap, count) {
  for (let i = 0; i < count; i++) {
    if (typeof timesMap?.[i] !== "number" || !isFinite(timesMap?.[i])) {
      return i;
    }
  }
  return -1;
}

function getStatusLabel(currentIndex, count, sideName) {
  if (count <= 0) return "No solves";
  if (currentIndex === -1) return "Complete";
  if (currentIndex === 0) return `Ready for solve 1`;
  return `Waiting on ${sideName} solve ${currentIndex + 1}`;
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

function chunkArray(items, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

function computeHeadlineAverage(times = []) {
  const vals = (Array.isArray(times) ? times : []).filter(
    (value) => typeof value === "number" && isFinite(value)
  );

  if (vals.length >= 12) {
    return {
      label: "AO12",
      value: calculateAverage(vals.slice(-12), true)?.average ?? null,
    };
  }

  if (vals.length >= 5) {
    return {
      label: "AO5",
      value: calculateAverage(vals.slice(-5), true)?.average ?? null,
    };
  }

  if (vals.length >= 3) {
    return {
      label: "MO3",
      value: calculateAverage(vals.slice(-3), false)?.average ?? null,
    };
  }

  return {
    label: "AVG",
    value: vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : null,
  };
}

function buildGroupBorderGradient(members = []) {
  const safeMembers = (Array.isArray(members) ? members : []).filter(Boolean);
  if (!safeMembers.length) return null;

  const minWeight = 0.08;
  const alpha = 0.75;
  const blendPct = 4;
  const weights = safeMembers.map((member) => {
    const wins = Number(member?.wins || 0);
    return Math.max(minWeight, wins + 1);
  });
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;

  let cursor = 0;
  const segments = safeMembers.map((member, index) => {
    const start = cursor;
    cursor += (weights[index] / total) * 100;
    return {
      color: member.color || "#888888",
      rgb: hexToRgbString(member.color || "#888888"),
      start,
      end: cursor,
    };
  });

  const stops = [];
  segments.forEach((segment, index) => {
    const prev = segments[index - 1] || null;
    const next = segments[index + 1] || null;
    const width = Math.max(0, segment.end - segment.start);
    const localBlend = Math.min(blendPct, width / 2);
    const start = prev ? segment.start + localBlend : segment.start;
    const end = next ? segment.end - localBlend : segment.end;
    const color = `rgba(${segment.rgb}, ${alpha})`;

    if (!prev) {
      stops.push(`${color} ${segment.start.toFixed(2)}%`);
    } else {
      stops.push(`${color} ${start.toFixed(2)}%`);
    }

    if (!next) {
      stops.push(`${color} ${segment.end.toFixed(2)}%`);
    } else {
      stops.push(`${color} ${end.toFixed(2)}%`);
    }
  });

  return `linear-gradient(90deg, ${stops.join(", ")}) border-box`;
}

function SharedAverageMessage({
  msg,
  user,
  messages = [],
  onLoadSession,
  onLeaveSharedSession,
  onDismiss,

  yourColor,
  theirColor,

  yourUsername,
  theirUsername,

  onOpenSideDetail,

  onRequestRefresh,
  compactHome = false,
  showStartAction = true,
  showRefreshAction = true,
  activeSharedID = null,
  sessionData = null,
  conversationType = "DM",
  memberProfiles = [],
}) {
  const [expanded, setExpanded] = useState(false);
  const [lastRefreshTick, setLastRefreshTick] = useState(0);
  const [viewMode, setViewMode] = useState("summary");
  const [selectedSharedSolve, setSelectedSharedSolve] = useState(null);
  const [selectedSharedAverage, setSelectedSharedAverage] = useState(null);

  const safeYourColor = yourColor || user?.Color || user?.color || "#2EC4B6";
  const safeTheirColor = theirColor || "#888888";

  const { settings } = useSettings();
  const primaryRgb = hexToRgbString(settings?.primaryColor || "#0E171D");

  // match TimeList modes:
  // "binary" | "continuous" | "bucket" | "index"
  // also accept old "spectrum" as "bucket"
  const timeColorModeRaw = settings?.sharedTimeColorMode || "profile";
  const timeColorMode =
    timeColorModeRaw === "spectrum" ? "bucket" : timeColorModeRaw;

  const nameYou =
    yourUsername || user?.Username || user?.Name || user?.UserID || "You";
  const nameThem = theirUsername || msg?.sender || "Them";
  const isGroupConversation = String(conversationType || "").toUpperCase() === "GROUP";

  const parsed = useMemo(() => {
    try {
      if (!msg?.text || !msg.text.includes("]")) return null;
      const splitIndex = msg.text.indexOf("]");
      if (splitIndex < 0) return null;
      const payload = msg.text.slice(splitIndex + 1);

      if (payload?.trim()?.startsWith("{")) {
        const parsedPayload = JSON.parse(payload);
        const creatorEvent = normalizeEventKey(parsedPayload?.creatorEvent || parsedPayload?.event);
        const opponentEvent = normalizeEventKey(parsedPayload?.opponentEvent || parsedPayload?.event);
        const creatorScrambles = Array.isArray(parsedPayload?.creatorScrambles)
          ? parsedPayload.creatorScrambles.filter(Boolean)
          : [];
        const opponentScrambles = Array.isArray(parsedPayload?.opponentScrambles)
          ? parsedPayload.opponentScrambles.filter(Boolean)
          : [];
        const creatorEvents = Array.isArray(parsedPayload?.creatorEvents)
          ? parsedPayload.creatorEvents.map(normalizeEventKey)
          : creatorScrambles.map(() => creatorEvent);
        const opponentEvents = Array.isArray(parsedPayload?.opponentEvents)
          ? parsedPayload.opponentEvents.map(normalizeEventKey)
          : opponentScrambles.map(() => opponentEvent);
        const count = Math.max(
          parseInt(parsedPayload?.count, 10) || 0,
          creatorScrambles.length,
          opponentScrambles.length
        );

        let parsedBase = {
          sharedID: parsedPayload?.sharedID,
          mode: String(parsedPayload?.mode || parsedPayload?.type || "average"),
          targetWins: Number(parsedPayload?.targetWins || 0) || null,
          batchSize: Number(parsedPayload?.batchSize || 0) || null,
          count: Number.isFinite(count) ? count : 0,
          creatorID: parsedPayload?.creatorID || msg?.sender || null,
          creatorEvent,
          opponentEvent,
          creatorEvents,
          opponentEvents,
          creatorScrambles,
          opponentScrambles,
          event: creatorEvent,
          scrambles: creatorScrambles,
        };

        const extensions = (messages || [])
          .filter((m) => m?.text?.startsWith("[sharedExtend]"))
          .map((m) => parseSharedExtendPayload(m.text))
          .filter((payload) => payload?.sharedID === parsedBase.sharedID);

        extensions.forEach((payload) => {
          parsedBase = {
            ...parsedBase,
            creatorEvents: [...(parsedBase.creatorEvents || []), ...(payload.creatorEvents || [])],
            opponentEvents: [...(parsedBase.opponentEvents || []), ...(payload.opponentEvents || [])],
            creatorScrambles: [...(parsedBase.creatorScrambles || []), ...(payload.creatorScrambles || [])],
            opponentScrambles: [...(parsedBase.opponentScrambles || []), ...(payload.opponentScrambles || [])],
            scrambles: [...(parsedBase.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])],
            count: Math.max(
              Number(parsedBase.count || 0),
              Number(payload.count || 0),
              [...(parsedBase.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])].length
            ),
          };
        });

        return parsedBase;
      }

      const first = payload.indexOf("|");
      const second = payload.indexOf("|", first + 1);
      const third = payload.indexOf("|", second + 1);
      if (first < 0 || second < 0 || third < 0) return null;

      const sharedID = payload.slice(0, first);
      const event = payload.slice(first + 1, second);
      const count = parseInt(payload.slice(second + 1, third), 10);

      const scramblesString = payload.slice(third + 1);
      const scrambles = scramblesString
        .split("||")
        .map((s) => s.trim())
        .filter(Boolean);

      return {
        sharedID,
        event,
        count: Number.isFinite(count) ? count : 0,
        scrambles,
        creatorID: msg?.sender || null,
        creatorEvent: normalizeEventKey(event),
        opponentEvent: normalizeEventKey(event),
        creatorEvents: scrambles.map(() => normalizeEventKey(event)),
        opponentEvents: scrambles.map(() => normalizeEventKey(event)),
        creatorScrambles: scrambles,
        opponentScrambles: scrambles,
      };
    } catch (err) {
      console.error("Failed to parse shared message:", msg?.text, err);
      return null;
    }
  }, [msg?.sender, msg?.text, messages]);

  const updates = useMemo(() => {
    if (!parsed) return [];
    return (messages || [])
      .filter((m) => m?.text?.startsWith("[sharedUpdate]"))
      .map((m) => {
        try {
          const [, payload] = m.text.split("]");
          const [sid, indexStr, timeStr, uid] = payload.split("|");
          if (sid !== parsed.sharedID) return null;

          const index = parseInt(indexStr, 10);
          const time = parseInt(timeStr, 10);

          if (!Number.isFinite(index) || !Number.isFinite(time) || !uid) {
            return null;
          }

          return {
            index,
            time,
            userID: uid,
            messageID: m?.id || m?.messageID || `${sid}-${index}-${uid}-${time}`,
            createdAt: m?.createdAt || m?.datetime || m?.DateTime || null,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }, [messages, parsed]);

  const sharedMemberProfiles = useMemo(() => {
    const byID = new Map();

    (Array.isArray(memberProfiles) ? memberProfiles : []).forEach((member) => {
      const id = String(member?.id || member?.userID || "").trim();
      if (!id) return;
      byID.set(id, {
        id,
        name: member?.name || member?.username || id,
        username: member?.username || member?.name || id,
        profileEvent: member?.profileEvent || "333",
        profileScramble: member?.profileScramble || "",
        color:
          member?.color ||
          (id === user?.UserID ? safeYourColor : safeTheirColor),
        isYou: !!member?.isYou || id === user?.UserID,
      });
    });

    (updates || []).forEach((entry) => {
      const id = String(entry?.userID || "").trim();
      if (!id || byID.has(id)) return;
      byID.set(id, {
        id,
        name: id === user?.UserID ? nameYou : id,
        username: id === user?.UserID ? nameYou : id,
        profileEvent: "333",
        profileScramble: "",
        color: id === user?.UserID ? safeYourColor : safeTheirColor,
        isYou: id === user?.UserID,
      });
    });

    if (user?.UserID && !byID.has(user.UserID)) {
      byID.set(user.UserID, {
        id: user.UserID,
        name: nameYou,
        username: nameYou,
        profileEvent: user?.ProfileEvent || user?.profileEvent || "333",
        profileScramble: user?.ProfileScramble || user?.profileScramble || "",
        color: safeYourColor,
        isYou: true,
      });
    }

    return Array.from(byID.values()).sort((a, b) => {
      if (a.isYou && !b.isYou) return -1;
      if (!a.isYou && b.isYou) return 1;
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
  }, [
    memberProfiles,
    updates,
    user?.UserID,
    user?.ProfileEvent,
    user?.profileEvent,
    user?.ProfileScramble,
    user?.profileScramble,
    nameYou,
    safeYourColor,
    safeTheirColor,
  ]);

  const computed = useMemo(() => {
    const yt = {};
    const tt = {};

    const opponentUserID =
      parsed?.creatorID === user?.UserID ? nameThem : parsed?.creatorID || nameThem;

    (updates || []).forEach((u) => {
      if (u.userID === user?.UserID) {
        yt[u.index] = u.time;
      } else if (!opponentUserID || u.userID === opponentUserID || u.userID !== user?.UserID) {
        tt[u.index] = u.time;
      }
    });

    const count = parsed?.count || 0;

    let yourWins = 0;
    let theirWins = 0;

    const yourVals = [];
    const theirVals = [];

    for (let i = 0; i < count; i++) {
      const a = yt[i];
      const b = tt[i];

      if (typeof a === "number" && isFinite(a)) yourVals.push(a);
      if (typeof b === "number" && isFinite(b)) theirVals.push(b);

      if (typeof a !== "number" || typeof b !== "number") continue;
      if (!isFinite(a) || !isFinite(b)) continue;

      if (a < b) yourWins++;
      else if (b < a) theirWins++;
    }

    const mean = (arr) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    const yourAo = mean(yourVals);
    const theirAo = mean(theirVals);
    const yourMean = mean(yourVals);
    const theirMean = mean(theirVals);

    const total = yourWins + theirWins;
    let p = 50;
    if (total > 0) {
      p = (yourWins / total) * 100;
      p = Math.max(20, Math.min(80, p));
    }

    const yourCurrentIndex = findFirstMissingIndex(yt, count);
    const theirCurrentIndex = findFirstMissingIndex(tt, count);

    let activeIndex = -1;
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const hasYou = typeof yt[i] === "number" && isFinite(yt[i]);
        const hasThem = typeof tt[i] === "number" && isFinite(tt[i]);
        if (!hasYou || !hasThem) {
          activeIndex = i;
          break;
        }
      }
    }

    const yourDoneCount = Object.keys(yt).filter(
      (k) => typeof yt[k] === "number" && isFinite(yt[k])
    ).length;
    const theirDoneCount = Object.keys(tt).filter(
      (k) => typeof tt[k] === "number" && isFinite(tt[k])
    ).length;

    return {
      yourTimes: yt,
      theirTimes: tt,
      yourWins,
      theirWins,
      yourAo,
      theirAo,
      yourMean,
      theirMean,
      splitPercent: p,
      yourVals,
      theirVals,
      yourCurrentIndex,
      theirCurrentIndex,
      activeIndex,
      yourDoneCount,
      theirDoneCount,
      isComplete: count > 0 && activeIndex === -1,
    };
  }, [updates, user?.UserID, parsed, nameThem]);

  const groupComputed = useMemo(() => {
    if (!parsed || !isGroupConversation) return null;

    const count = Number(parsed?.count || 0);
    const memberOrder = sharedMemberProfiles.length
      ? sharedMemberProfiles
      : [{ id: user?.UserID || "you", name: nameYou, color: safeYourColor, isYou: true }];

    const timesByUser = {};
    memberOrder.forEach((member) => {
      timesByUser[member.id] = {};
    });

    (updates || []).forEach((entry) => {
      const id = String(entry?.userID || "").trim();
      if (!id) return;
      if (!timesByUser[id]) timesByUser[id] = {};
      timesByUser[id][entry.index] = entry.time;
    });

    let activeIndex = -1;
    for (let i = 0; i < count; i += 1) {
      const everyoneDone = memberOrder.every((member) => {
        const value = timesByUser?.[member.id]?.[i];
        return typeof value === "number" && isFinite(value);
      });
      if (!everyoneDone) {
        activeIndex = i;
        break;
      }
    }

    const rowWinners = {};
    const memberStats = memberOrder.map((member) => {
      const times = timesByUser[member.id] || {};
      const vals = [];
      for (let i = 0; i < count; i += 1) {
        const value = times[i];
        if (typeof value === "number" && isFinite(value)) vals.push(value);
      }
      const mean = vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : null;
      const currentIndex = findFirstMissingIndex(times, count);
      const doneCount = Object.keys(times).filter(
        (key) => typeof times[key] === "number" && isFinite(times[key])
      ).length;
      return {
        ...member,
        times,
        vals,
        mean,
        ao: mean,
        wins: 0,
        currentIndex,
        doneCount,
      };
    });

    for (let i = 0; i < count; i += 1) {
      const entrants = memberStats
        .map((member) => ({
          id: member.id,
          time: member.times?.[i],
        }))
        .filter((entry) => typeof entry.time === "number" && isFinite(entry.time));

      if (entrants.length < 2) continue;
      const bestTime = Math.min(...entrants.map((entry) => entry.time));
      const winners = entrants.filter((entry) => entry.time === bestTime);
      if (winners.length === 1) {
        rowWinners[i] = winners[0].id;
        const target = memberStats.find((member) => member.id === winners[0].id);
        if (target) target.wins += 1;
      } else {
        rowWinners[i] = "tie";
      }
    }

    const members = memberStats.map((member) => {
      const vals = member.vals || [];
      const sortedVals = vals.slice().sort((a, b) => a - b);
      const rankMap = new Map();
      sortedVals.forEach((value, index) => {
        if (!rankMap.has(value)) rankMap.set(value, index);
      });
      return {
        ...member,
        min: vals.length ? Math.min(...vals) : null,
        max: vals.length ? Math.max(...vals) : null,
        best: vals.length ? Math.min(...vals) : null,
        headline: computeHeadlineAverage(vals),
        rankPack: {
          map: rankMap,
          size: sortedVals.length,
        },
      };
    });

    return {
      count,
      activeIndex,
      isComplete: count > 0 && activeIndex === -1,
      rowWinners,
      members,
      byId: Object.fromEntries(members.map((member) => [member.id, member])),
    };
  }, [
    parsed,
    isGroupConversation,
    sharedMemberProfiles,
    updates,
    user?.UserID,
    nameYou,
    safeYourColor,
  ]);

  useEffect(() => {
    setExpanded(false);
    setViewMode("summary");
    setSelectedSharedSolve(null);
    setSelectedSharedAverage(null);
  }, [parsed?.sharedID]);

  const youRgb = hexToRgbString(safeYourColor);
  const theirRgb = hexToRgbString(safeTheirColor);

  const yourMin = computed?.yourVals?.length
    ? Math.min(...computed.yourVals)
    : null;
  const yourMax = computed?.yourVals?.length
    ? Math.max(...computed.yourVals)
    : null;
  const theirMin = computed?.theirVals?.length
    ? Math.min(...computed.theirVals)
    : null;
  const theirMax = computed?.theirVals?.length
    ? Math.max(...computed.theirVals)
    : null;

  const buildRankPack = (arr) => {
    const vals = (arr || [])
      .filter((v) => typeof v === "number" && isFinite(v))
      .slice();
    vals.sort((a, b) => a - b);
    const m = new Map();
    vals.forEach((v, idx) => {
      if (!m.has(v)) m.set(v, idx);
    });
    return { map: m, size: vals.length };
  };
  const yourRankPack = buildRankPack(computed?.yourVals);
  const theirRankPack = buildRankPack(computed?.theirVals);

  if (!parsed) return null;

  const isCreator = (parsed.creatorID || msg?.sender) === user?.UserID;
  const yourEvent = isCreator ? parsed.creatorEvent : parsed.opponentEvent;
  const theirEvent = isCreator ? parsed.opponentEvent : parsed.creatorEvent;
  const yourEvents =
    (isCreator ? parsed.creatorEvents : parsed.opponentEvents)?.length
      ? (isCreator ? parsed.creatorEvents : parsed.opponentEvents)
      : (isCreator ? parsed.creatorScrambles : parsed.opponentScrambles)?.map(() =>
          normalizeEventKey(yourEvent)
        ) || [];
  const theirEvents =
    (isCreator ? parsed.opponentEvents : parsed.creatorEvents)?.length
      ? (isCreator ? parsed.opponentEvents : parsed.creatorEvents)
      : (isCreator ? parsed.opponentScrambles : parsed.creatorScrambles)?.map(() =>
          normalizeEventKey(theirEvent)
        ) || [];
  const yourScrambles =
    (isCreator ? parsed.creatorScrambles : parsed.opponentScrambles)?.length
      ? (isCreator ? parsed.creatorScrambles : parsed.opponentScrambles)
      : parsed.scrambles;
  const theirScrambles =
    (isCreator ? parsed.opponentScrambles : parsed.creatorScrambles)?.length
      ? (isCreator ? parsed.opponentScrambles : parsed.creatorScrambles)
      : parsed.scrambles;

  const yourPlan = buildPlanSummary(yourEvents);
  const theirPlan = buildPlanSummary(theirEvents);
  const mode = String(parsed.mode || "average").toLowerCase();
  const targetWins = Number(parsed.targetWins || 0) || 3;

  const uiThem = getUiForSide("them", normalizeEventKey(theirPlan.primaryEvent || theirEvent));
  const uiYou = getUiForSide("you", normalizeEventKey(yourPlan.primaryEvent || yourEvent));

  const formatSolveMs = (ms) =>
    typeof ms === "number" && isFinite(ms) ? formatTime(ms, false) : "–";
  const formatAverageMs = (ms) =>
    typeof ms === "number" && isFinite(ms) ? formatTime(ms, true) : "–";

  const getPerfClassAndStyle = (value, min, max, rank01, side) => {
    if (timeColorMode === "profile") {
      return {
        perfClass: "",
        perfStyle: {
          border: `2px solid ${side === "you" ? safeYourColor : safeTheirColor}`,
        },
      };
    }

    if (timeColorMode === "binary") return { perfClass: "", perfStyle: null };

    if (timeColorMode === "index") {
      const h = hueGreenToRed(rank01);
      const c = hslColor(h, 100, 55);
      return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
    }

    if (typeof value !== "number" || !isFinite(value))
      return { perfClass: "", perfStyle: null };
    if (typeof min !== "number" || !isFinite(min))
      return { perfClass: "", perfStyle: null };
    if (typeof max !== "number" || !isFinite(max))
      return { perfClass: "", perfStyle: null };
    if (max <= min) return { perfClass: "", perfStyle: null };

    const t = clamp01((value - min) / (max - min));

    if (timeColorMode === "bucket") {
      if (t <= 0.20) return { perfClass: "overall-border-min", perfStyle: null };
      if (t <= 0.40) return { perfClass: "faster", perfStyle: null };
      if (t <= 0.60) return { perfClass: "middle-fast", perfStyle: null };
      if (t <= 0.80) return { perfClass: "slower", perfStyle: null };
      return { perfClass: "overall-border-max", perfStyle: null };
    }

    const h = hueGreenToRed(t);
    const c = hslColor(h, 100, 55);
    return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
  };

  const getBinaryExtremesClass = (value, min, max, dashed = true) => {
    if (timeColorMode !== "binary" && timeColorMode !== "profile") return "";
    if (typeof value !== "number" || !isFinite(value)) return "";
    if (typeof min !== "number" || !isFinite(min)) return "";
    if (typeof max !== "number" || !isFinite(max)) return "";
    if (max <= min) return "";
    if (value === min) return dashed ? "dashed-border-min" : "overall-border-min";
    if (value === max) return dashed ? "dashed-border-max" : "overall-border-max";
    return "";
  };

  const winnerForIndex = (i) => {
    const a = computed.yourTimes[i];
    const b = computed.theirTimes[i];
    if (typeof a !== "number" || typeof b !== "number") return "none";
    if (!isFinite(a) || !isFinite(b)) return "none";
    if (a < b) return "you";
    if (b < a) return "them";
    return "tie";
  };

  const rowWinClass = (w) => {
    if (w === "you") return "sharedRowWinYou";
    if (w === "them") return "sharedRowWinThem";
    if (w === "tie") return "sharedRowTie";
    return "";
  };

  const renderTimeCell = (side, ms, isCurrentRow = false, winner = "none") => {
    const value = typeof ms === "number" && isFinite(ms) ? ms : null;

    const min = side === "you" ? yourMin : theirMin;
    const max = side === "you" ? yourMax : theirMax;

    let rank01 = 0;
    if (timeColorMode === "index" && value != null) {
      const pack = side === "you" ? yourRankPack : theirRankPack;
      const idx = pack.map.get(value);
      const denom = Math.max(1, pack.size - 1);
      rank01 = typeof idx === "number" ? idx / denom : 0;
    }

    const { perfClass, perfStyle } =
      timeColorMode === "binary"
        ? { perfClass: "", perfStyle: null }
        : getPerfClassAndStyle(value, min, max, rank01, side);

    const binaryClass = getBinaryExtremesClass(value, min, max, true);
    const isWinner = winner === side;
    const winnerRgb = side === "you" ? youRgb : theirRgb;
    const mergedStyle = {
      ...(perfStyle || {}),
      ...(isWinner && value != null
        ? {
            background: `rgba(${winnerRgb}, 0.46)`,
            boxShadow: `inset 0 0 0 1px rgba(${winnerRgb}, 0.34)`,
          }
        : {}),
    };

    return (
      <div
        className={[
          "TimeItem",
          "sharedAverageTimeItem",
          perfClass,
          binaryClass,
          isWinner ? "sharedAverageTimeItemWinner" : "",
          isCurrentRow ? "sharedAverageTimeItemCurrent" : "",
          value == null ? "sharedAverageTimeItemPending" : "",
        ].join(" ")}
        style={Object.keys(mergedStyle).length ? mergedStyle : undefined}
      >
        <TimeItem time={formatSolveMs(value)} />
      </div>
    );
  };

  const MAX_VISIBLE = 12;
  const visibleCount = expanded || parsed.count <= MAX_VISIBLE ? parsed.count : MAX_VISIBLE;
  const rowsToShow = Array.from({ length: visibleCount }, (_, i) => ({
    index: i,
    yourEvent: yourEvents?.[i] || normalizeEventKey(yourEvent),
    theirEvent: theirEvents?.[i] || normalizeEventKey(theirEvent),
    yourScramble: yourScrambles?.[i] || "",
    theirScramble: theirScrambles?.[i] || "",
  }));

  const yourSolveCount = yourScrambles?.length || 0;
  const theirSolveCount = theirScrambles?.length || 0;

  const samePlan =
    yourSolveCount === theirSolveCount &&
    rowsToShow.every(
      (row) =>
        normalizeEventKey(row.yourEvent) === normalizeEventKey(row.theirEvent)
    ) &&
    yourEvents.length === theirEvents.length &&
    yourEvents.every(
      (event, index) => normalizeEventKey(event) === normalizeEventKey(theirEvents?.[index])
    );

  const useMixedLayout = !samePlan;

  const renderSideHeaderLabel = (side, plan, otherPlan, ui) => {
    const showCountBadge =
      plan.isSingleEvent &&
      otherPlan?.isSingleEvent &&
      normalizeEventKey(plan.primaryEvent) === normalizeEventKey(otherPlan.primaryEvent) &&
      Number(plan.primaryCount) > Number(otherPlan.primaryCount);
    const mainLabel = plan.isSingleEvent ? eventDisplayLabel(plan.primaryEvent) : "Mixed";

    return (
      <>
        <div
          className="sharedAverageEventLabelRow"
          style={{
            justifyContent: side === "you" ? "flex-end" : "flex-start",
          }}
        >
          <div
            className="sharedAverageEventLabel"
            style={{
              fontSize: ui.labelSize,
              letterSpacing: `${ui.labelTrack ?? 0.4}px`,
            }}
          >
            {mainLabel}
          </div>

          {showCountBadge && (
            <span className="sharedAverageEventCountBadge">
              ×{plan.primaryCount}
            </span>
          )}
        </div>

        {!plan.isSingleEvent && (
          <div
            className={`sharedAveragePlanSummary sharedAveragePlanSummary${
              side === "you" ? "Right" : "Left"
            }`}
          >
            {plan.compactLabel}
          </div>
        )}
      </>
    );
  };

  const renderSideIcon = (eventKey, scramble, ui) => {
    return (
      <div
        className="sharedAverageSideIcon"
        style={{
          transform: `translate(${ui.iconDx}px, ${ui.iconDy}px) scale(${ui.iconScale})`,
          marginRight: 0,
          marginLeft: 0,
        }}
      >
        <div className="sharedAverageSideIconCube">
          <PuzzleSVG
            event={puzzleSvgEventKey(normalizeEventKey(eventKey))}
            scramble={scramble}
          />
        </div>
      </div>
    );
  };

  const activeIndex = computed.activeIndex;

  const youStatus = getStatusLabel(computed.yourCurrentIndex, parsed.count, "you");
  const themStatus = getStatusLabel(computed.theirCurrentIndex, parsed.count, nameThem);
  const centerTitle =
    mode === "head_to_head"
      ? samePlan
        ? `${eventDisplayLabel(yourEvent)} head to head`
        : "Mixed head to head"
      : mode === "casual"
      ? samePlan
        ? `${eventDisplayLabel(yourEvent)} casual session`
        : "Mixed casual session"
      : samePlan
      ? `${eventDisplayLabel(yourEvent)} average`
      : "Mixed average";
  const scoreLabel = mode === "head_to_head" ? "MATCH" : "WINS";
  const meanLabel = mode === "head_to_head" ? "MEAN" : mode === "casual" ? "AVG" : "MEAN";
  const currentSolveBadge =
    mode === "head_to_head"
      ? computed.activeIndex === -1
        ? "Match complete"
        : `First to ${targetWins}`
      : mode === "casual"
      ? computed.activeIndex === -1
        ? "Keep going"
        : `Current solve: ${activeIndex + 1}`
      : activeIndex === -1
      ? "Average complete"
      : `Current solve: ${activeIndex + 1}`;
  const itemChunkSize = compactHome ? 5 : 8;
  const visibleRows = rowsToShow.map((row) => row.index);

  const buildItemRows = (side) =>
    chunkArray(
      visibleRows.map((index) => ({
        index,
        time: side === "you" ? computed.yourTimes[index] : computed.theirTimes[index],
        event: side === "you" ? yourEvents?.[index] : theirEvents?.[index],
        scramble: side === "you" ? yourScrambles?.[index] : theirScrambles?.[index],
        isCurrent: index === activeIndex,
      })),
      itemChunkSize
    );

  const itemSections = [
    {
      key: "them",
      side: "them",
      name: nameThem,
      label: theirPlan.isSingleEvent ? eventDisplayLabel(theirPlan.primaryEvent) : "Mixed",
      overall: computed.theirAo,
      countLabel: `Ao${theirSolveCount || parsed.count}`,
      rows: buildItemRows("them"),
    },
    {
      key: "you",
      side: "you",
      name: nameYou,
      label: yourPlan.isSingleEvent ? eventDisplayLabel(yourPlan.primaryEvent) : "Mixed",
      overall: computed.yourAo,
      countLabel: `Ao${yourSolveCount || parsed.count}`,
      rows: buildItemRows("you"),
    },
  ];
  const isActiveSession = String(activeSharedID || "") === String(parsed.sharedID || "");
  const nextSolveIndex = activeIndex === -1 ? Math.max(parsed.count - 1, 0) : activeIndex;
  const openSharedSession = (options = {}) =>
    onLoadSession?.(
      sessionData && String(sessionData?.sharedID || "") === String(parsed.sharedID || "")
        ? sessionData
        : {
            sharedID: parsed.sharedID,
            mode: parsed.mode,
            targetWins: parsed.targetWins,
            batchSize: parsed.batchSize,
            event: yourEvent,
            events: yourEvents,
            scrambles: yourScrambles,
            creatorID: parsed.creatorID || msg?.sender || null,
            creatorEvent: parsed.creatorEvent,
            opponentEvent: parsed.opponentEvent,
            creatorEvents: parsed.creatorEvents,
            opponentEvents: parsed.opponentEvents,
            creatorScrambles: parsed.creatorScrambles,
            opponentScrambles: parsed.opponentScrambles,
            sourceMessage: msg,
          },
      options
    );
  const jumpToSolve = (index) => {
    if (!Number.isFinite(Number(index))) return;
    openSharedSession({ targetIndex: Number(index) });
  };

  const buildSharedSolve = (side, index) => {
    if (!Number.isFinite(Number(index))) return null;
    const solveIndex = Number(index);
    const isYouSide = side === "you";
    const time = isYouSide ? computed.yourTimes[solveIndex] : computed.theirTimes[solveIndex];
    if (!(typeof time === "number" && isFinite(time))) return null;

    const matchingUpdate = (updates || []).find((entry) => {
      if (entry.index !== solveIndex) return false;
      if (entry.time !== time) return false;
      return isYouSide ? entry.userID === user?.UserID : entry.userID !== user?.UserID;
    });

    return {
      __readOnly: true,
      __profileColor: isYouSide ? safeYourColor : safeTheirColor,
      time,
      event: isYouSide ? yourEvents?.[solveIndex] || yourEvent : theirEvents?.[solveIndex] || theirEvent,
      scramble: isYouSide
        ? yourScrambles?.[solveIndex] || ""
        : theirScrambles?.[solveIndex] || "",
      datetime: matchingUpdate?.createdAt || null,
      createdAt: matchingUpdate?.createdAt || null,
      note: "",
      penalty: null,
      tags: {
        SolveSource: "Shared",
      },
    };
  };

  const openSharedSolveDetail = (side, index) => {
    const solve = buildSharedSolve(side, index);
    if (!solve) return;
    setSelectedSharedSolve(solve);
  };

  const buildAverageSolvesForSide = (side) => {
    const isYouSide = side === "you";
    const count = parsed?.count || 0;
    const rows = [];

    for (let i = 0; i < count; i += 1) {
      const solve = buildSharedSolve(isYouSide ? "you" : "them", i);
      if (solve) rows.push(solve);
    }

    return rows;
  };

  const openSharedAverageDetail = (side) => {
    const solves = buildAverageSolvesForSide(side);
    if (!solves.length) return;

    setSelectedSharedAverage({
      side,
      title: `${side === "you" ? nameYou : nameThem} Average Detail (${solves.length})`,
      solves,
    });
  };

  const buildSharedSolveForParticipant = (participantID, index) => {
    if (!Number.isFinite(Number(index))) return null;
    const solveIndex = Number(index);

    if (isGroupConversation && groupComputed?.byId?.[participantID]) {
      const member = groupComputed.byId[participantID];
      const time = member?.times?.[solveIndex];
      if (!(typeof time === "number" && isFinite(time))) return null;
      const matchingUpdate = (updates || []).find(
        (entry) => entry.index === solveIndex && entry.time === time && entry.userID === participantID
      );
      const eventForSolve =
        participantID === parsed?.creatorID
          ? parsed?.creatorEvents?.[solveIndex] || parsed?.creatorEvent || yourEvent
          : parsed?.opponentEvents?.[solveIndex] || parsed?.opponentEvent || theirEvent;
      const scrambleForSolve =
        participantID === parsed?.creatorID
          ? parsed?.creatorScrambles?.[solveIndex] || ""
          : parsed?.opponentScrambles?.[solveIndex] || "";

      return {
        __readOnly: true,
        __profileColor: member.color || safeTheirColor,
        time,
        event: eventForSolve,
        scramble: scrambleForSolve,
        datetime: matchingUpdate?.createdAt || null,
        createdAt: matchingUpdate?.createdAt || null,
        note: "",
        penalty: null,
        tags: {
          SolveSource: "Shared",
        },
      };
    }

    return buildSharedSolve(
      String(participantID || "") === String(user?.UserID || "") ? "you" : "them",
      solveIndex
    );
  };

  const openGroupAverageDetail = (participantID) => {
    const member = groupComputed?.byId?.[participantID];
    if (!member) return;
    const solves = [];
    for (let i = 0; i < (groupComputed?.count || 0); i += 1) {
      const solve = buildSharedSolveForParticipant(participantID, i);
      if (solve) solves.push(solve);
    }
    if (!solves.length) return;
    setSelectedSharedAverage({
      side: participantID,
      title: `${member.name} Average Detail (${solves.length})`,
      solves,
    });
  };

  const openGroupSolveDetail = (participantID, index) => {
    const solve = buildSharedSolveForParticipant(participantID, index);
    if (!solve) return;
    setSelectedSharedSolve(solve);
  };

  const renderGroupTimeCell = (member, ms, isCurrentRow = false, isWinner = false) => {
    const value = typeof ms === "number" && isFinite(ms) ? ms : null;
    const memberRgb = hexToRgbString(member?.color || safeTheirColor);

    let perfClass = "";
    let perfStyle = null;
    if (timeColorMode === "profile") {
      perfStyle = {
        border: `2px solid ${member?.color || safeTheirColor}`,
      };
    } else if (timeColorMode !== "binary") {
      let rank01 = 0;
      if (timeColorMode === "index" && value != null) {
        const idx = member?.rankPack?.map?.get(value);
        const denom = Math.max(1, Number(member?.rankPack?.size || 1) - 1);
        rank01 = typeof idx === "number" ? idx / denom : 0;
      }
      const next = getPerfClassAndStyle(value, member?.min, member?.max, rank01, "them");
      perfClass = next.perfClass;
      perfStyle = next.perfStyle;
    }

    const binaryClass = getBinaryExtremesClass(value, member?.min, member?.max, true);
    const mergedStyle = {
      ...(perfStyle || {}),
      ...(isWinner && value != null
        ? {
            background: `rgba(${memberRgb}, 0.42)`,
            boxShadow: `inset 0 0 0 1px rgba(${memberRgb}, 0.34)`,
          }
        : {}),
    };

    return (
      <div
        className={[
          "TimeItem",
          "sharedAverageTimeItem",
          "sharedAverageTimeItem--group",
          perfClass,
          binaryClass,
          isWinner ? "sharedAverageTimeItemWinner" : "",
          isCurrentRow ? "sharedAverageTimeItemCurrent" : "",
          value == null ? "sharedAverageTimeItemPending" : "",
        ].join(" ")}
        style={Object.keys(mergedStyle).length ? mergedStyle : undefined}
      >
        <TimeItem time={formatSolveMs(value)} />
      </div>
    );
  };

  const groupCurrentSolveBadge = groupComputed
    ? mode === "head_to_head"
      ? groupComputed.isComplete
        ? "Match complete"
        : `First to ${targetWins}`
      : groupComputed.activeIndex === -1
      ? "Average complete"
      : `Current solve: ${groupComputed.activeIndex + 1}`
    : "";

  const groupItemSections = (groupComputed?.members || []).map((member) => ({
    key: member.id,
    side: member.id,
    name: member.name,
    overall: member.ao,
    countLabel: `Avg ${member.doneCount || 0}/${groupComputed?.count || 0}`,
    rows: chunkArray(
      visibleRows.map((index) => ({
        index,
        time: member.times?.[index],
        isCurrent: index === groupComputed?.activeIndex,
        isWinner: groupComputed?.rowWinners?.[index] === member.id,
      })),
      itemChunkSize
    ),
  }));

  const cardStyle = {
    "--primaryRgb": primaryRgb,
    "--youColor": safeYourColor,
    "--theirColor": safeTheirColor,
    "--youRgb": youRgb,
    "--theirRgb": theirRgb,
    "--split": `${computed.splitPercent}%`,
    "--borderAlpha": 0.75,
  };

  const groupBorderGradient = buildGroupBorderGradient(groupComputed?.members || []);
  const groupMemberCount = groupComputed?.members?.length || 0;
  const groupDensityClass =
    groupMemberCount >= 14
      ? "sharedAverageTable--groupDense"
      : groupMemberCount >= 9
      ? "sharedAverageTable--groupCompact"
      : "";

  const renderGroupNameTag = (member) => {
    const eventKey = String(member?.profileEvent || "333");
    const eventClass = eventKey.toLowerCase();
    return (
      <span className="sharedAverageGroupNameTag" style={{ borderColor: member.color || "#ffffff" }}>
        <span className={`nametagCube nametagCube--${eventClass}`}>
          <PuzzleSVG
            event={eventKey}
            scramble={member?.profileScramble || ""}
            isTimerCube={false}
            isNameTagCube={true}
          />
        </span>
        <span className="nametagText">
          <span className="name-tag-text">@{member.name}</span>
        </span>
      </span>
    );
  };
  if (isGroupConversation && groupBorderGradient) {
    cardStyle.background = `
      linear-gradient(rgba(${primaryRgb}, 0.97), rgba(${primaryRgb}, 0.97)) padding-box,
      ${groupBorderGradient}
    `;
  }

  return (
    <div
      className={`sharedAverageCard ${compactHome ? "sharedAverageCard--homeCompact" : ""}`}
      style={cardStyle}
    >
      {isGroupConversation ? (
        <div className="sharedAverageTop sharedAverageTop--group">
          <div className="sharedAverageGroupHeader sharedAverageGroupHeader--row">
            <div className="sharedAverageGroupTitleRow">
              <div className="sharedAverageViewToggle sharedAverageViewToggle--groupTitle" role="tablist" aria-label="Shared average view">
                <button
                  type="button"
                  className={viewMode === "summary" ? "isActive" : ""}
                  onClick={() => setViewMode("summary")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={viewMode === "items" ? "isActive" : ""}
                  onClick={() => setViewMode("items")}
                >
                  Time Items
                </button>
              </div>
              <div className="sharedAverageCenterTitle sharedAverageCenterTitle--group">
                {centerTitle}
              </div>
            </div>
            <div className="sharedAverageGroupToolbar">
              <div className="sharedAverageCurrentSolveBadge">{groupCurrentSolveBadge}</div>

              {(showStartAction ||
                (showRefreshAction && typeof onRequestRefresh === "function") ||
                (isActiveSession && typeof onLeaveSharedSession === "function") ||
                isActiveSession ||
                onDismiss) && (
                <div className="sharedAverageActions sharedAverageActions--group">
                  {showStartAction && typeof onLoadSession === "function" && (
                    <button
                      className="sharedAverageBtn sharedAverageBtnPrimary"
                      onClick={() =>
                        openSharedSession({ mode: isActiveSession ? "resume" : "next" })
                      }
                    >
                      {isActiveSession ? "Resume" : "Start Session"}
                    </button>
                  )}

                  {isActiveSession && typeof onLoadSession === "function" && (
                    <button
                      className="sharedAverageBtn sharedAverageBtnGhost"
                      onClick={() => openSharedSession({ targetIndex: nextSolveIndex })}
                    >
                      Go To Next
                    </button>
                  )}

                  {isActiveSession && typeof onLeaveSharedSession === "function" && (
                    <button
                      className="sharedAverageBtn sharedAverageBtnGhost"
                      onClick={() => onLeaveSharedSession()}
                    >
                      Exit
                    </button>
                  )}

                  {showRefreshAction && typeof onRequestRefresh === "function" && (
                    <button
                      className="sharedAverageBtn sharedAverageBtnGhost"
                      onClick={() => {
                        onRequestRefresh();
                        setLastRefreshTick(Date.now());
                      }}
                    >
                      Refresh
                    </button>
                  )}

                  {onDismiss && (
                    <button className="sharedAverageBtn sharedAverageBtnGhost" onClick={onDismiss}>
                      Dismiss
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="sharedAverageTop">
          <button
            className="sharedAverageSide sharedAverageSideThem"
            type="button"
            onClick={() =>
              onOpenSideDetail?.({
                side: "them",
                sharedID: parsed.sharedID,
                event: theirEvent,
                scrambles: theirScrambles,
                yourTimes: computed.yourTimes,
                theirTimes: computed.theirTimes,
                sourceMessage: msg,
              })
            }
          >
            {renderSideIcon(
              theirPlan.primaryEvent || theirEvent,
              theirScrambles?.[Math.max(0, activeIndex)] || theirScrambles?.[0] || "",
              uiThem
            )}

            <div className="sharedAverageSideMeta sharedAverageSideMetaThem">
              {renderSideHeaderLabel("them", theirPlan, yourPlan, uiThem)}
              <div className="sharedAverageName">{nameThem}</div>
              <div className="sharedAverageSideStatus">{themStatus}</div>
            </div>

            <div className="sharedAverageSideBig sharedAverageSideBigCenter">
              <div
                className="sharedAverageBig sharedAverageBig--interactive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openSharedAverageDetail("them");
                }}
              >
                {computed.theirAo != null ? formatAverageMs(computed.theirAo) : "–"}
              </div>
              <div className="sharedAverageSmallLabel">Ao{theirSolveCount || parsed.count}</div>
            </div>
          </button>

          <div className="sharedAverageCenter">
            <div className="sharedAverageCenterTitle">{centerTitle}</div>

            <div className="sharedAverageScoreRow">
              <span className="sharedAverageScore">{computed.theirWins}</span>
              <span className="sharedAverageScoreLabel">{scoreLabel}</span>
              <span className="sharedAverageScore">{computed.yourWins}</span>
            </div>

            <div className="sharedAverageMeanRow">
              <span className="sharedAverageMeanLabel">{meanLabel}</span>
              <span className="sharedAverageMean">
                {computed.theirMean != null ? formatAverageMs(computed.theirMean) : "–"}
              </span>
              <span className="sharedAverageMeanMid">vs</span>
              <span className="sharedAverageMean">
                {computed.yourMean != null ? formatAverageMs(computed.yourMean) : "–"}
              </span>
            </div>

            <div className="sharedAverageCurrentSolveBadge">{currentSolveBadge}</div>
          </div>

          <button
            className="sharedAverageSide sharedAverageSideYou"
            type="button"
            onClick={() =>
              onOpenSideDetail?.({
                side: "you",
                sharedID: parsed.sharedID,
                event: yourEvent,
                scrambles: yourScrambles,
                yourTimes: computed.yourTimes,
                theirTimes: computed.theirTimes,
                sourceMessage: msg,
              })
            }
          >
            <div className="sharedAverageSideBig sharedAverageSideBigCenter">
              <div
                className="sharedAverageBig sharedAverageBig--interactive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openSharedAverageDetail("you");
                }}
              >
                {computed.yourAo != null ? formatAverageMs(computed.yourAo) : "–"}
              </div>
              <div className="sharedAverageSmallLabel">Ao{yourSolveCount || parsed.count}</div>
            </div>

            <div className="sharedAverageSideMeta sharedAverageSideMetaRight">
              {renderSideHeaderLabel("you", yourPlan, theirPlan, uiYou)}
              <div className="sharedAverageName">{nameYou}</div>
              <div className="sharedAverageSideStatus">{youStatus}</div>
            </div>

            {renderSideIcon(
              yourPlan.primaryEvent || yourEvent,
              yourScrambles?.[Math.max(0, activeIndex)] || yourScrambles?.[0] || "",
              uiYou
            )}
          </button>
        </div>
      )}

      <div className="sharedAverageBody">
        <div className={`sharedAverageControls ${isGroupConversation ? "sharedAverageControls--group" : ""}`}>
          <div className="sharedAverageViewToggle" role="tablist" aria-label="Shared average view">
            <button
              type="button"
              className={viewMode === "summary" ? "isActive" : ""}
              onClick={() => setViewMode("summary")}
            >
              Table
            </button>
            <button
              type="button"
              className={viewMode === "items" ? "isActive" : ""}
              onClick={() => setViewMode("items")}
            >
              Time Items
            </button>
          </div>

          {!isGroupConversation &&
            (showStartAction ||
            (showRefreshAction && typeof onRequestRefresh === "function") ||
            (isActiveSession && typeof onLeaveSharedSession === "function") ||
            isActiveSession ||
            onDismiss) && (
            <div className="sharedAverageActions">
              {showStartAction && typeof onLoadSession === "function" && (
                <button
                  className="sharedAverageBtn sharedAverageBtnPrimary"
                  onClick={() =>
                    openSharedSession({ mode: isActiveSession ? "resume" : "next" })
                  }
                >
                  {isActiveSession ? "Resume" : "Start Session"}
                </button>
              )}

              {isActiveSession && typeof onLoadSession === "function" && (
                <button
                  className="sharedAverageBtn sharedAverageBtnGhost"
                  onClick={() => openSharedSession({ targetIndex: nextSolveIndex })}
                >
                  Go To Next
                </button>
              )}

              {isActiveSession && typeof onLeaveSharedSession === "function" && (
                <button
                  className="sharedAverageBtn sharedAverageBtnGhost"
                  onClick={() => onLeaveSharedSession()}
                >
                  Exit
                </button>
              )}

              {showRefreshAction && typeof onRequestRefresh === "function" && (
                <button
                  className="sharedAverageBtn sharedAverageBtnGhost"
                  onClick={() => {
                    onRequestRefresh();
                    setLastRefreshTick(Date.now());
                  }}
                >
                  Refresh
                </button>
              )}

              {onDismiss && (
                <button className="sharedAverageBtn sharedAverageBtnGhost" onClick={onDismiss}>
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        <div className="sharedAverageScrollable">
          {viewMode === "summary" ? (
            <div className="sharedAverageTableWrap">
              {isGroupConversation ? (
                <table
                  className={[
                    "sharedAverageTable",
                    "sharedAverageTable--group",
                    groupDensityClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <thead>
                    <tr>
                      <th className="sharedAverageIdx sharedAverageGroupTableIndex">#</th>
                      {(groupComputed?.members || []).map((member) => (
                        <th key={member.id} className="sharedAverageGroupHeaderCell">
                          <button
                            type="button"
                            className="sharedAverageGroupHeaderBtn"
                            style={{ "--member-accent": member.color || "#ffffff" }}
                            onClick={() => openGroupAverageDetail(member.id)}
                          >
                            <span className="sharedAverageGroupHeaderTopRow">
                              {renderGroupNameTag(member)}
                              <span className="sharedAverageGroupHeaderMetric">
                                <span className="sharedAverageGroupHeaderMetricLabel">
                                  {member.headline?.label || "AVG"}
                                </span>
                                <span className="sharedAverageGroupHeaderAvg">
                                  {member.headline?.value != null
                                    ? formatAverageMs(member.headline.value)
                                    : "–"}
                                </span>
                              </span>
                            </span>
                            <span className="sharedAverageGroupHeaderMetaRow">
                              <span className="sharedAverageGroupHeaderMeta sharedAverageGroupHeaderMeta--best">
                                {groupMemberCount >= 14 ? "B" : "Best"}{" "}
                                {member.best != null ? formatSolveMs(member.best) : "–"}
                              </span>
                              <span className="sharedAverageGroupHeaderMeta sharedAverageGroupHeaderMeta--worst">
                                {groupMemberCount >= 14 ? "W" : "Worst"}{" "}
                                {member.max != null ? formatSolveMs(member.max) : "–"}
                              </span>
                              <span className="sharedAverageGroupHeaderMeta">
                                {member.wins} {scoreLabel.toLowerCase()}
                              </span>
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.map((row) => {
                      const i = row.index;
                      const isActiveRow = i === groupComputed?.activeIndex;
                      return (
                        <tr
                          key={i}
                          className={[
                            "sharedAverageInteractiveRow",
                            isActiveRow ? "sharedAverageCurrentRow" : "",
                          ].join(" ")}
                          onClick={() => jumpToSolve(i)}
                        >
                          <td className="sharedAverageIdx sharedAverageGroupTableIndex">
                            <div className="sharedAverageIdxWrap">
                              <span>{i + 1}</span>
                              {isActiveRow && <span className="sharedAverageIdxBadge">NOW</span>}
                            </div>
                          </td>
                          {(groupComputed?.members || []).map((member) => {
                            const time = member.times?.[i];
                            const isWinner = groupComputed?.rowWinners?.[i] === member.id;
                            return (
                              <td key={`${member.id}-${i}`} className="sharedAverageGroupTimeCell">
                                <div
                                  className="sharedAveragePillWrap"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openGroupSolveDetail(member.id, i);
                                  }}
                                >
                                  {renderGroupTimeCell(member, time, isActiveRow, isWinner)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="sharedAverageTable">
                  <tbody>
                    {rowsToShow.map((row) => {
                    const i = row.index;
                    const w = winnerForIndex(i);
                    const yourTime = computed.yourTimes[i];
                    const theirTime = computed.theirTimes[i];

                    const isActiveRow = i === activeIndex;
                    const isYouPending =
                      isActiveRow && !(typeof yourTime === "number" && isFinite(yourTime));
                    const isThemPending =
                      isActiveRow && !(typeof theirTime === "number" && isFinite(theirTime));
                    const isRowDone =
                      typeof yourTime === "number" &&
                      isFinite(yourTime) &&
                      typeof theirTime === "number" &&
                      isFinite(theirTime);

                      return (
                        <tr
                          key={i}
                          className={[
                            "sharedAverageInteractiveRow",
                            rowWinClass(w),
                            isActiveRow ? "sharedAverageCurrentRow" : "",
                            isRowDone ? "sharedAverageDoneRow" : "",
                          ].join(" ")}
                          onClick={() => jumpToSolve(i)}
                        >
                        <td className="sharedAverageIdx sharedAverageIdxLeft">
                          <div className="sharedAverageIdxWrap">
                            <span>{i + 1}</span>
                            {isActiveRow && <span className="sharedAverageIdxBadge">NOW</span>}
                          </div>
                        </td>

                        <td className="sharedAverageTimeCell sharedAverageTimeCellLeft">
                          <div
                            className={[
                              "sharedAveragePillWrap",
                              w === "them" ? "isWin" : "",
                              w === "you" ? "isLose" : "",
                              w === "tie" ? "isTie" : "",
                              isThemPending ? "isPending" : "",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              openSharedSolveDetail("them", i);
                            }}
                          >
                            {renderTimeCell("them", theirTime, isActiveRow, w)}
                          </div>
                        </td>

                        <td className="sharedAverageScramble">
                          {useMixedLayout ? (
                            <div className="sharedAverageScrambleSplit">
                              <span className="sharedAverageScrambleText sharedAverageScrambleTextThem">
                                {eventDisplayLabel(row.theirEvent)}: {row.theirScramble || "—"}
                              </span>
                              <span className="sharedAverageScrambleText sharedAverageScrambleTextYou">
                                {eventDisplayLabel(row.yourEvent)}: {row.yourScramble || "—"}
                              </span>
                            </div>
                          ) : (
                            <span className="sharedAverageScrambleText">
                              {row.yourScramble || row.theirScramble}
                            </span>
                          )}

                          {isActiveRow && (
                            <div className="sharedAverageCurrentRowNote">
                              {isYouPending && isThemPending
                                ? "Both pending"
                                : isYouPending
                                ? `${nameYou} pending`
                                : isThemPending
                                ? `${nameThem} pending`
                                : "Completed"}
                            </div>
                          )}
                        </td>

                        <td className="sharedAverageTimeCell sharedAverageTimeCellRight">
                          <div
                            className={[
                              "sharedAveragePillWrap",
                              w === "you" ? "isWin" : "",
                              w === "them" ? "isLose" : "",
                              w === "tie" ? "isTie" : "",
                              isYouPending ? "isPending" : "",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              openSharedSolveDetail("you", i);
                            }}
                          >
                            {renderTimeCell("you", yourTime, isActiveRow, w)}
                          </div>
                        </td>

                        <td className="sharedAverageIdx sharedAverageIdxRight">{i + 1}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="sharedAverageItemsView">
              {(isGroupConversation ? groupItemSections : itemSections).map((section) => (
                <div key={section.key} className="sharedAverageItemsSection">
                  <div className="sharedAverageItemsSectionHeader">
                    <div className="sharedAverageItemsIdentity">
                      <span className="sharedAverageItemsName">{section.name}</span>
                    </div>
                    <div className="sharedAverageItemsOverall">
                      <span
                        className="sharedAverageItemsOverallValue sharedAverageItemsOverallValue--interactive"
                        onClick={() =>
                          isGroupConversation
                            ? openGroupAverageDetail(section.side)
                            : openSharedAverageDetail(section.side)
                        }
                      >
                        {section.overall != null ? formatAverageMs(section.overall) : "–"}
                      </span>
                      <span className="sharedAverageItemsOverallLabel">{section.countLabel}</span>
                    </div>
                  </div>

                  <div className="sharedAverageItemsRows">
                    {section.rows.map((itemRow, rowIndex) => (
                      <div
                        key={`${section.key}-${rowIndex}`}
                        className="sharedAverageItemsRow"
                        style={{ "--shared-average-cols": itemChunkSize }}
                      >
                        {itemRow.map((item) => (
                          <div key={`${section.key}-${item.index}`} className="sharedAverageItemsCellWrap">
                            <div
                              className="sharedAverageItemsCell sharedAverageItemsCell--interactive"
                              onClick={() =>
                                isGroupConversation
                                  ? openGroupSolveDetail(section.side, item.index)
                                  : openSharedSolveDetail(section.side, item.index)
                              }
                            >
                              {isGroupConversation
                                ? renderGroupTimeCell(
                                    groupComputed?.byId?.[section.side],
                                    item.time,
                                    item.isCurrent,
                                    !!item.isWinner
                                  )
                                : renderTimeCell(
                                    section.side,
                                    item.time,
                                    item.isCurrent,
                                    winnerForIndex(item.index)
                                  )}
                            </div>
                            <div
                              className="sharedAverageItemsIndex"
                              title={
                                isGroupConversation
                                  ? `Solve ${item.index + 1}`
                                  : `${eventDisplayLabel(item.event)}${
                                      item.scramble ? ` • ${item.scramble}` : ""
                                    }`
                              }
                            >
                              <span>#{item.index + 1}</span>
                              {item.isCurrent && (
                                <span className="sharedAverageItemsNowBadge">NOW</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {parsed.count > MAX_VISIBLE && !expanded && (
            <button className="sharedAverageExpandBtn" onClick={() => setExpanded(true)}>
              Show all {parsed.count}
            </button>
          )}
        </div>

        {!!lastRefreshTick && (
          <div className="sharedAverageFooterNote">
            Live sync active
          </div>
        )}
      </div>

      {selectedSharedAverage?.solves?.length ? (
        <AverageDetailModal
          isOpen={true}
          title={selectedSharedAverage.title}
          solves={selectedSharedAverage.solves}
          profileColor={safeYourColor}
          onClose={() => setSelectedSharedAverage(null)}
          onSolveOpen={(solve) => {
            setSelectedSharedAverage(null);
            setSelectedSharedSolve(solve);
          }}
        />
      ) : null}

      {selectedSharedSolve ? (
        <Detail
          solve={selectedSharedSolve}
          userID={user?.UserID}
          profileColor={selectedSharedSolve?.__profileColor || safeYourColor}
          onClose={() => setSelectedSharedSolve(null)}
        />
      ) : null}
    </div>
  );
}

export default SharedAverageMessage;
