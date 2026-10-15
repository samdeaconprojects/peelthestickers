// src/services/offlineQueue.js
//
// Local-only queue for solves timed while offline. These never touch the
// real server-side session until the user explicitly syncs them from the
// offline solves popup - they live entirely in localStorage under a per-user key, kept
// separate from the normal `sessions` state so a run of offline solves can't
// quietly skew averages/stats for a session that hasn't actually received
// them yet.

const STORAGE_PREFIX = "pts.offlineQueue.";
const listeners = new Set();

function storageKey(userID) {
  return `${STORAGE_PREFIX}${String(userID || "").trim()}`;
}

function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function readAll(userID) {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userID));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("offlineQueue: failed to read queue:", err);
    return [];
  }
}

function writeAll(userID, items) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(storageKey(userID), JSON.stringify(items));
  } catch (err) {
    console.error("offlineQueue: failed to persist queue:", err);
  }
}

function notify(userID) {
  for (const cb of listeners) {
    try {
      cb(userID);
    } catch (err) {
      console.error("offlineQueue listener error:", err);
    }
  }
}

export function subscribeOfflineQueue(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * solve: { event, sessionID, sessionName, rawTimeMs, penalty, scramble, note, createdAt, tags }
 * Returns the stored entry (with a generated localId).
 */
export function addOfflineSolve(userID, solve) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("addOfflineSolve: userID required");

  const entry = {
    localId: `OFFLINE#${solve?.createdAt || new Date().toISOString()}#${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    event: String(solve?.event || "").toUpperCase(),
    sessionID: String(solve?.sessionID || "main"),
    sessionName: solve?.sessionName || null,
    rawTimeMs: Number(solve?.rawTimeMs),
    penalty: solve?.penalty ?? null,
    scramble: solve?.scramble || "",
    note: solve?.note || "",
    createdAt: solve?.createdAt || new Date().toISOString(),
    tags: solve?.tags || {},
    queuedAt: new Date().toISOString(),
  };

  const items = readAll(id);
  items.push(entry);
  writeAll(id, items);
  notify(id);
  return entry;
}

export function getOfflineSolves(userID) {
  return readAll(userID);
}

export function getOfflineSolvesForEvent(userID, event) {
  const ev = String(event || "").toUpperCase();
  return readAll(userID).filter((s) => s.event === ev);
}

export function countOfflineSolves(userID) {
  return readAll(userID).length;
}

export function removeOfflineSolve(userID, localId) {
  const id = String(userID || "").trim();
  const items = readAll(id).filter((s) => s.localId !== localId);
  writeAll(id, items);
  notify(id);
}

/** Re-targets a queued solve at a different event/session before it's synced. */
export function updateOfflineSolve(userID, localId, patch = {}) {
  const id = String(userID || "").trim();
  const items = readAll(id).map((s) => {
    if (s.localId !== localId) return s;
    const next = { ...s };
    if (patch.event != null) next.event = String(patch.event).toUpperCase();
    if (patch.sessionID != null) next.sessionID = String(patch.sessionID || "main");
    if ("sessionName" in patch) next.sessionName = patch.sessionName || null;
    return next;
  });
  writeAll(id, items);
  notify(id);
}

export function clearOfflineSolves(userID) {
  const id = String(userID || "").trim();
  writeAll(id, []);
  notify(id);
}

/** Groups queued solves by event, then by sessionID, for display. */
export function groupOfflineSolves(userID) {
  const items = readAll(userID);
  const byEvent = new Map();

  for (const solve of items) {
    if (!byEvent.has(solve.event)) byEvent.set(solve.event, new Map());
    const bySession = byEvent.get(solve.event);
    const key = solve.sessionID || "main";
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(solve);
  }

  return Array.from(byEvent.entries()).map(([event, bySession]) => ({
    event,
    sessions: Array.from(bySession.entries()).map(([sessionID, solves]) => ({
      sessionID,
      sessionName: solves[0]?.sessionName || null,
      solves: solves.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    })),
  }));
}
