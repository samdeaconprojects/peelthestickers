import { moveSolvesToSession } from "./moveSolvesToSession";
import { normalizeEventCode } from "../components/SolveBulk/solveBulkUtils";

const getRef = (s) => String(s?.solveRef || s?.SK || "").trim();
const getEvent = (s) => normalizeEventCode(s?.event || s?.Event || "");
const getSessionID = (s) =>
  String(s?.sessionID || s?.SessionID || s?.SessionId || s?.sessionId || "main").trim() || "main";

const getCreatedAtMs = (s) =>
  new Date(s?.createdAt || s?.CreatedAt || s?.datetime || s?.DateTime || 0).getTime() || 0;

const sortByCreatedAt = (items) => [...items].sort((a, b) => getCreatedAtMs(a) - getCreatedAtMs(b));

export function isMovableSolve(s) {
  return !s?.__readOnly && getRef(s).startsWith("SOLVE#");
}

// Only the signed-in user's own solves can be moved. Solves carry their owner in
// different shapes depending on where they were loaded from.
export function isOwnSolve(s, userID) {
  if (!userID) return false;
  const pk = String(s?.PK || "");
  if (pk && pk !== `USER#${userID}`) return false;
  const owner = s?.userID ?? s?.UserID;
  return !owner || String(owner) === String(userID);
}

// Same reshuffle the bulk Move does: take the solves out of their event lists and put them,
// re-labelled, into the target event's list. `sessions` is keyed by event code.
function relocate(prev, solves, toEvent, toSessionID, toSessionName) {
  const next = { ...(prev || {}) };
  const refSet = new Set(solves.map(getRef));
  const sourceEvents = new Set(solves.map(getEvent));
  const moved = [];

  sourceEvents.forEach((ev) => {
    const arr = Array.isArray(next[ev]) ? next[ev] : [];
    const staying = [];
    for (const s of arr) {
      if (refSet.has(getRef(s))) moved.push(s);
      else staying.push(s);
    }
    next[ev] = staying;
  });

  // Solves not in the local lists (e.g. opened from an older page) still land in the target.
  const movedRefs = new Set(moved.map(getRef));
  solves.forEach((s) => {
    if (!movedRefs.has(getRef(s))) moved.push(s);
  });

  const relabelled = moved.map((s) => relabel(s, toEvent, toSessionID, toSessionName));
  const target = (Array.isArray(next[toEvent]) ? next[toEvent] : []).filter(
    (s) => !refSet.has(getRef(s))
  );
  next[toEvent] = sortByCreatedAt([...target, ...relabelled]);
  return next;
}

export function relabel(s, toEvent, toSessionID, toSessionName = "") {
  const { fullIndex, sessionName, SessionName, ...rest } = s || {};
  return {
    ...rest,
    event: toEvent,
    Event: toEvent,
    sessionID: toSessionID,
    SessionID: toSessionID,
    ...(toSessionName ? { sessionName: toSessionName } : {}),
  };
}

function restore(prev, originals, toEvent) {
  const next = { ...(prev || {}) };
  const refSet = new Set(originals.map(getRef));
  next[toEvent] = (Array.isArray(next[toEvent]) ? next[toEvent] : []).filter(
    (s) => !refSet.has(getRef(s))
  );
  const byEvent = new Map();
  originals.forEach((s) => {
    const ev = getEvent(s);
    if (!byEvent.has(ev)) byEvent.set(ev, []);
    byEvent.get(ev).push(s);
  });
  byEvent.forEach((items, ev) => {
    const arr = (Array.isArray(next[ev]) ? next[ev] : []).filter((s) => !refSet.has(getRef(s)));
    next[ev] = sortByCreatedAt([...arr, ...items]);
  });
  return next;
}

/**
 * Move solves to another event/session: updates local state straight away, calls the server,
 * and puts everything back if the server refuses. Resolves to an `undo` function.
 */
export async function moveSolvesWithLocalState({
  userID,
  solves = [],
  toEvent,
  toSessionID = "main",
  toSessionName = "",
  setSessions,
}) {
  const targetEvent = normalizeEventCode(toEvent);
  const targetSession = String(toSessionID || "main").trim() || "main";
  const originals = (Array.isArray(solves) ? solves : []).filter(isMovableSolve);
  if (!userID) throw new Error("Sign in to move solves.");
  if (!targetEvent) throw new Error("Pick an event to move to.");
  if (!originals.length) return { moved: 0, undo: async () => {} };

  // Copies, so callers can relabel their own objects afterwards without breaking undo/rollback.
  const pending = originals
    .filter((s) => getEvent(s) !== targetEvent || getSessionID(s) !== targetSession)
    .map((s) => ({ ...s }));
  if (!pending.length) return { moved: 0, undo: async () => {} };

  const apply = (fn) => {
    if (typeof setSessions === "function") setSessions(fn);
  };

  apply((prev) => relocate(prev, pending, targetEvent, targetSession, toSessionName));
  try {
    // The server reads each solve's current event/session, so one call covers mixed sources.
    await moveSolvesToSession(userID, pending, {
      event: getEvent(pending[0]),
      fromSessionID: getSessionID(pending[0]),
      toEvent: targetEvent,
      toSessionID: targetSession,
    });
  } catch (err) {
    apply((prev) => restore(prev, pending, targetEvent));
    throw err;
  }

  const undo = async () => {
    const groups = new Map();
    pending.forEach((s) => {
      const key = `${getEvent(s)}|${getSessionID(s)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });
    for (const items of groups.values()) {
      await moveSolvesToSession(userID, items, {
        event: targetEvent,
        fromSessionID: targetSession,
        toEvent: getEvent(items[0]),
        toSessionID: getSessionID(items[0]),
      });
    }
    apply((prev) => restore(prev, pending, targetEvent));
  };

  return { moved: pending.length, undo };
}
