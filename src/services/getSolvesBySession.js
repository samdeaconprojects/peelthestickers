// src/services/getSolvesBySession.js
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const lastNSessionLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return (data?.items || []).reverse();
}, { cacheMs: 1500 });

const lastNEventLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return (data?.items || []).reverse();
}, { cacheMs: 1500 });

const solvesPageLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return {
    items: data?.items || [],
    lastKey: data?.lastKey || null,
  };
}, { cacheMs: 1500 });

const solvesFullLoader = createCachedRequestLoader(async ({ userID, event, sessionID, opts }) => {
  const all = [];
  await forEachSolvesPage(
    userID,
    event,
    sessionID,
    (items) => {
      if (items.length) all.push(...items);
    },
    opts
  );
  return all.reverse();
}, { cacheMs: 1500 });

// Calls onPage(items) for every page of the session, newest first. Throws rather
// than stops early: callers treat the result as the whole session.
export const forEachSolvesPage = async (userID, event, sessionID, onPage, opts = {}) => {
  let cursor = null;
  const seenCursors = new Set();

  do {
    const { items, lastKey } = await getSolvesBySessionPage(
      userID,
      event,
      sessionID,
      1000,
      cursor,
      opts
    );
    await onPage(items || []);

    const nextCursorKey = lastKey ? JSON.stringify(lastKey) : "";
    if (nextCursorKey && seenCursors.has(nextCursorKey)) {
      throw new Error("getSolvesBySession: repeated cursor");
    }
    if (nextCursorKey) seenCursors.add(nextCursorKey);
    cursor = lastKey || null;
  } while (cursor);
};

export const getSolvesBySessionPage = async (
  userID,
  event,
  sessionID,
  limit = 200,
  cursor = null,
  opts = {}
) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("getSolvesBySessionPage: userID required");
  if (!ev) throw new Error("getSolvesBySessionPage: event required");

  const qs = new URLSearchParams({
    event: ev,
    sessionID: sid,
    limit: String(limit),
  });

  if (cursor) qs.set("cursor", JSON.stringify(cursor));
  if (opts?.startDay) qs.set("startDay", String(opts.startDay).trim());
  if (opts?.endDay) qs.set("endDay", String(opts.endDay).trim());
  if (opts?.timeZone) qs.set("timeZone", String(opts.timeZone).trim());

  const path = `/api/solves/${encodeURIComponent(id)}?${qs.toString()}`;
  return solvesPageLoader.run(
    `solvesPage::${id}::${ev}::${sid}::${Number(limit) || 200}::${cursor ? JSON.stringify(cursor) : ""}::${String(opts?.startDay || "").trim()}::${String(opts?.endDay || "").trim()}::${String(opts?.timeZone || "").trim()}`,
    {
      loadArg: path,
      force: opts?.force === true,
    }
  );
};

export const getSolvesBySession = async (userID, event, sessionID, opts = {}) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("getSolvesBySession: userID required");
  if (!ev) throw new Error("getSolvesBySession: event required");

  return solvesFullLoader.run(
    `solvesFull::${id}::${ev}::${sid}::${String(opts?.startDay || "").trim()}::${String(opts?.endDay || "").trim()}::${String(opts?.timeZone || "").trim()}`,
    {
      loadArg: {
        userID: id,
        event: ev,
        sessionID: sid,
        opts,
      },
      force: opts?.force === true,
    }
  );
};

export const getLastNSolvesBySession = async (userID, event, sessionID, n = 100) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  const qs = new URLSearchParams({
    event: ev,
    sessionID: sid,
    n: String(n),
  });

  return lastNSessionLoader.run(`solvesLastN::session::${id}::${ev}::${sid}::${Number(n) || 100}`, {
    loadArg: `/api/solvesLastN/${encodeURIComponent(id)}?${qs.toString()}`,
  });
};

export const getLastNSolvesByEvent = async (userID, event, n = 100) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  const qs = new URLSearchParams({
    event: ev,
    n: String(n),
  });

  return lastNEventLoader.run(`solvesLastN::event::${id}::${ev}::${Number(n) || 100}`, {
    loadArg: `/api/solvesLastN/${encodeURIComponent(id)}?${qs.toString()}`,
  });
};

export function invalidateLastNSolvesCache(userID = "", event = "") {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim().toUpperCase();

  if (!id) {
    lastNSessionLoader.invalidate();
    lastNEventLoader.invalidate();
    return;
  }

  if (!ev) {
    lastNSessionLoader.invalidate(`solvesLastN::session::${id}`);
    lastNEventLoader.invalidate(`solvesLastN::event::${id}`);
    return;
  }

  lastNSessionLoader.invalidate(`solvesLastN::session::${id}::${ev}`);
  lastNEventLoader.invalidate(`solvesLastN::event::${id}::${ev}`);
}

export function invalidateSolvesSessionCache(userID = "", event = "", sessionID = "") {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim().toUpperCase();
  const sid = String(sessionID || "").trim();

  if (!id) {
    solvesPageLoader.invalidate();
    solvesFullLoader.invalidate();
    return;
  }

  if (!ev) {
    solvesPageLoader.invalidate(`solvesPage::${id}`);
    solvesFullLoader.invalidate(`solvesFull::${id}`);
    return;
  }

  if (!sid) {
    solvesPageLoader.invalidate(`solvesPage::${id}::${ev}`);
    solvesFullLoader.invalidate(`solvesFull::${id}::${ev}`);
    return;
  }

  solvesPageLoader.invalidate(`solvesPage::${id}::${ev}::${sid}`);
  solvesFullLoader.invalidate(`solvesFull::${id}::${ev}::${sid}`);
}
