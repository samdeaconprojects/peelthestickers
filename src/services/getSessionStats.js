// src/services/getSessionStats.js
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const sessionStatsLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return data?.item ?? null;
}, { cacheMs: 1500 });

export const getSessionStats = async (userID, event, sessionID, opts = {}) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("getSessionStats: userID required");
  if (!ev) throw new Error("getSessionStats: event required");

  const path = `/api/sessionStats/${encodeURIComponent(id)}?event=${encodeURIComponent(ev)}&sessionID=${encodeURIComponent(sid)}`;
  return sessionStatsLoader.run(`sessionStats::${id}::${ev}::${sid}`, {
    loadArg: path,
    force: opts?.force === true,
  });
};

export function invalidateSessionStatsCache(userID = "", event = "", sessionID = "") {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim().toUpperCase();
  const sid = String(sessionID || "").trim();

  if (!id) {
    sessionStatsLoader.invalidate();
    return;
  }

  if (!ev) {
    sessionStatsLoader.invalidate(`sessionStats::${id}`);
    return;
  }

  if (!sid) {
    sessionStatsLoader.invalidate(`sessionStats::${id}::${ev}`);
    return;
  }

  sessionStatsLoader.invalidate(`sessionStats::${id}::${ev}::${sid}`);
}
