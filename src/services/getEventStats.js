// src/services/getEventStats.js
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const eventStatsLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return data?.item ?? null;
}, { cacheMs: 1500 });

export const getEventStats = async (userID, event, opts = {}) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  if (!id) throw new Error("getEventStats: userID required");
  if (!ev) throw new Error("getEventStats: event required");

  const path = `/api/eventStats/${encodeURIComponent(id)}?event=${encodeURIComponent(ev)}`;
  return eventStatsLoader.run(`eventStats::${id}::${ev}`, {
    loadArg: path,
    force: opts?.force === true,
  });
};

export function invalidateEventStatsCache(userID = "", event = "") {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim().toUpperCase();

  if (!id) {
    eventStatsLoader.invalidate();
    return;
  }

  if (!ev) {
    eventStatsLoader.invalidate(`eventStats::${id}`);
    return;
  }

  eventStatsLoader.invalidate(`eventStats::${id}::${ev}`);
}
