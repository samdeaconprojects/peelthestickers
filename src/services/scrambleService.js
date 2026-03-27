import { randomScrambleForEvent } from "cubing/scramble";
import { generateScramble as legacyGenerateScramble } from "../components/scrambleUtils";
import { getCubingEventId, normalizePTSEventKey } from "./scrambleEventMap";

const DEFAULT_TARGET_SIZE = 10;
const DEFAULT_LOW_WATER = 5;

const scrambleHistories = new Map();
const queueWarmPromises = new Map();

let globalScrambleMode = "random-state";

function normalizeScrambleMode(mode) {
  const raw = String(mode || "").trim().toLowerCase();

  if (raw === "legacy") return "legacy";
  return "random-state";
}

export function setGlobalScrambleMode(mode) {
  globalScrambleMode = normalizeScrambleMode(mode);
}

export function getGlobalScrambleMode() {
  return globalScrambleMode;
}

function resolveMode(modeOverride = null) {
  return normalizeScrambleMode(modeOverride || globalScrambleMode);
}

function getQueueKey(event, modeOverride = null) {
  const eventKey = normalizePTSEventKey(event);
  const mode = resolveMode(modeOverride);
  return `${eventKey}::${mode}`;
}

function createEmptyHistoryState() {
  return {
    entries: [],
    index: 0,
  };
}

function sanitizeHistoryState(state) {
  const entries = Array.isArray(state?.entries)
    ? state.entries.filter((item) => typeof item === "string" && item.trim())
    : [];

  let index = Number.isInteger(state?.index) ? state.index : 0;
  if (entries.length === 0) {
    index = 0;
  } else {
    index = Math.min(Math.max(0, index), entries.length - 1);
  }

  return {
    entries,
    index,
  };
}

function getExistingHistoryByKey(key) {
  return sanitizeHistoryState(scrambleHistories.get(key) || createEmptyHistoryState());
}

function setExistingHistoryByKey(key, state) {
  scrambleHistories.set(key, sanitizeHistoryState(state));
}

function getVisibleQueueFromState(state) {
  const safe = sanitizeHistoryState(state);
  return safe.entries.slice(safe.index);
}

export function getScrambleQueueSnapshot(event, modeOverride = null) {
  const key = getQueueKey(event, modeOverride);
  return [...getVisibleQueueFromState(getExistingHistoryByKey(key))];
}

export function clearScrambleQueue(event = null, modeOverride = null) {
  if (event == null) {
    scrambleHistories.clear();
    queueWarmPromises.clear();
    return;
  }

  const targetEvent = normalizePTSEventKey(event);

  if (modeOverride == null) {
    for (const key of Array.from(scrambleHistories.keys())) {
      if (key.startsWith(`${targetEvent}::`)) {
        scrambleHistories.delete(key);
      }
    }
    for (const key of Array.from(queueWarmPromises.keys())) {
      if (key.startsWith(`${targetEvent}::`)) {
        queueWarmPromises.delete(key);
      }
    }
    return;
  }

  const key = getQueueKey(targetEvent, modeOverride);
  scrambleHistories.delete(key);
  queueWarmPromises.delete(key);
}

async function generateCubingScramble(event) {
  const cubingEventId = getCubingEventId(event);

  if (!cubingEventId) {
    return String(legacyGenerateScramble(event) || "").trim();
  }

  const scramble = await randomScrambleForEvent(cubingEventId);
  return String(scramble || "").trim();
}

export async function generateScrambleForEvent(event, modeOverride = null) {
  const mode = resolveMode(modeOverride);

  if (mode === "legacy") {
    return String(legacyGenerateScramble(event) || "").trim();
  }

  try {
    return await generateCubingScramble(event);
  } catch (err) {
    console.warn(
      `cubing.js scramble generation failed for ${event}; falling back to legacy generator.`,
      err
    );
    return String(legacyGenerateScramble(event) || "").trim();
  }
}

export async function generateRelayScrambles(events = [], modeOverride = null) {
  const safeEvents = Array.isArray(events) ? events : [];
  return Promise.all(
    safeEvents.map((event) => generateScrambleForEvent(event, modeOverride))
  );
}

export async function warmScrambleQueue(
  event,
  targetSize = DEFAULT_TARGET_SIZE,
  modeOverride = null
) {
  const key = getQueueKey(event, modeOverride);
  const current = getExistingHistoryByKey(key);
  const visibleQueue = getVisibleQueueFromState(current);

  if (visibleQueue.length >= targetSize) {
    return [...visibleQueue];
  }

  const existingPromise = queueWarmPromises.get(key);
  if (existingPromise) {
    await existingPromise;
    return [...getVisibleQueueFromState(getExistingHistoryByKey(key))];
  }

  const warmPromise = (async () => {
    const existing = getExistingHistoryByKey(key);
    const queue = getVisibleQueueFromState(existing);
    const needed = Math.max(0, targetSize - queue.length);
    const eventKey = normalizePTSEventKey(event);
    const mode = resolveMode(modeOverride);

    if (needed > 0) {
      const generated = await Promise.all(
        Array.from({ length: needed }, () =>
          generateScrambleForEvent(eventKey, mode)
        )
      );
      const nextEntries = [...existing.entries, ...generated.filter(Boolean)];
      setExistingHistoryByKey(key, {
        entries: nextEntries,
        index: existing.index,
      });
    }

    return [...getVisibleQueueFromState(getExistingHistoryByKey(key))];
  })();

  queueWarmPromises.set(key, warmPromise);

  try {
    return await warmPromise;
  } finally {
    if (queueWarmPromises.get(key) === warmPromise) {
      queueWarmPromises.delete(key);
    }
  }
}

export async function consumeScramble(
  event,
  {
    targetSize = DEFAULT_TARGET_SIZE,
    lowWater = DEFAULT_LOW_WATER,
    mode = null,
  } = {}
) {
  const key = getQueueKey(event, mode);
  const eventKey = normalizePTSEventKey(event);

  await warmScrambleQueue(eventKey, 1, mode);

  let state = getExistingHistoryByKey(key);

  if (state.entries.length === 0) {
    const generated = await generateScrambleForEvent(eventKey, mode);
    state = {
      entries: [generated],
      index: 0,
    };
  }

  const scramble = state.entries[state.index];
  const needsNext = state.index >= state.entries.length - 1;

  if (needsNext) {
    const generated = await generateScrambleForEvent(eventKey, mode);
    state = {
      entries: [...state.entries, generated],
      index: state.index,
    };
  }

  const nextState = {
    entries: state.entries,
    index: Math.min(state.index + 1, state.entries.length - 1),
  };

  setExistingHistoryByKey(key, nextState);

  if (getVisibleQueueFromState(nextState).length < lowWater) {
    warmScrambleQueue(eventKey, targetSize, mode).catch((err) => {
      console.error(`Failed to warm scramble queue for ${key}:`, err);
    });
  }

  return {
    scramble,
    queue: [...getVisibleQueueFromState(nextState)],
  };
}

export async function replaceHeadScramble(
  event,
  { targetSize = DEFAULT_TARGET_SIZE, mode = null } = {}
) {
  const key = getQueueKey(event, mode);
  const eventKey = normalizePTSEventKey(event);

  await warmScrambleQueue(eventKey, 1, mode);

  let state = getExistingHistoryByKey(key);

  if (state.entries.length === 0) {
    const generated = await generateScrambleForEvent(eventKey, mode);
    state = {
      entries: [generated],
      index: 0,
    };
  }

  if (state.index >= state.entries.length - 1) {
    const generated = await generateScrambleForEvent(eventKey, mode);
    state = {
      entries: [...state.entries, generated],
      index: state.index,
    };
  }

  const nextState = {
    entries: state.entries,
    index: Math.min(state.index + 1, state.entries.length - 1),
  };

  setExistingHistoryByKey(key, nextState);

  if (getVisibleQueueFromState(nextState).length < targetSize) {
    warmScrambleQueue(eventKey, targetSize, mode).catch((err) => {
      console.error(`Failed to re-warm scramble queue for ${key}:`, err);
    });
  }

  return {
    queue: [...getVisibleQueueFromState(nextState)],
  };
}

export async function prependScramble(
  event,
  { mode = null } = {}
) {
  const key = getQueueKey(event, mode);
  const state = getExistingHistoryByKey(key);

  const nextState =
    state.entries.length > 0
      ? {
          entries: state.entries,
          index: Math.max(0, state.index - 1),
        }
      : state;

  setExistingHistoryByKey(key, nextState);

  return {
    queue: [...getVisibleQueueFromState(nextState)],
  };
}
