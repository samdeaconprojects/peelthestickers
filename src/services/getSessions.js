import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const sessionsLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return Array.isArray(data?.items) ? data.items.map(normalizeSession) : [];
});

function normalizeSession(item) {
  if (!item || typeof item !== "object") return item;

  const rawSessionID = String(item.SessionID || item.sessionID || "").trim();
  const sessionID = rawSessionID && rawSessionID.toLowerCase() === "main" ? "main" : rawSessionID;
  const sessionName = String(
    item.SessionName || item.sessionName || item.Name || item.name || ""
  ).trim();

  if (sessionID !== "main") return item;

  if (!sessionName || sessionName === "Main Session") {
    return {
      ...item,
      SessionID: "main",
      SessionName: "Main",
    };
  }

  return {
    ...item,
    SessionID: "main",
  };
}

export const getSessions = async (userID, options = {}) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getSessions: userID required");

  return sessionsLoader.run(`sessions::${id}`, {
    force: options?.force === true,
    loadArg: `/api/sessions/${encodeURIComponent(id)}`,
  });
};

export function invalidateSessionsCache(userID = "") {
  const id = String(userID || "").trim();
  sessionsLoader.invalidate(id ? `sessions::${id}` : undefined);
}
