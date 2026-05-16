// src/services/getSolvesByTag.js
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const solvesByTagLoader = createCachedRequestLoader(async (path) => {
  const out = await apiGet(path);
  return {
    items: out?.items || [],
    lastKey: out?.lastKey || null,
  };
}, { cacheMs: 1500 });

export async function getSolvesByTag(
  userID,
  {
    tagKey,
    tagValue,
    event = "",
    sessionID = "",
    limit = 100,
    hydrate = true,
    cursor = null,
    force = false,
  } = {}
) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getSolvesByTag: userID required");

  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();
  if (!key) throw new Error("getSolvesByTag: tagKey required");
  if (!value) throw new Error("getSolvesByTag: tagValue required");

  const params = new URLSearchParams();
  params.set("tagKey", key);
  params.set("tagValue", value);
  if (event) params.set("event", String(event).toUpperCase());
  if (sessionID) params.set("sessionID", String(sessionID));
  params.set("limit", String(limit));
  params.set("hydrate", hydrate ? "true" : "false");
  if (cursor) params.set("cursor", encodeURIComponent(JSON.stringify(cursor)));

  const normalizedEvent = event ? String(event).toUpperCase() : "";
  const normalizedSessionID = sessionID ? String(sessionID) : "";
  const cursorKey = cursor ? JSON.stringify(cursor) : "";
  const path = `/api/solvesByTag/${encodeURIComponent(id)}?${params.toString()}`;

  return solvesByTagLoader.run(
    `solvesByTag::${id}::${key}::${value}::${normalizedEvent}::${normalizedSessionID}::${Number(limit) || 100}::${hydrate ? "1" : "0"}::${cursorKey}`,
    {
      loadArg: path,
      force: force === true,
    }
  );
}

export function invalidateSolvesByTagCache(userID = "", tagKey = "", tagValue = "") {
  const id = String(userID || "").trim();
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();

  if (!id) {
    solvesByTagLoader.invalidate();
    return;
  }

  if (!key) {
    solvesByTagLoader.invalidate(`solvesByTag::${id}`);
    return;
  }

  if (!value) {
    solvesByTagLoader.invalidate(`solvesByTag::${id}::${key}`);
    return;
  }

  solvesByTagLoader.invalidate(`solvesByTag::${id}::${key}::${value}`);
}
