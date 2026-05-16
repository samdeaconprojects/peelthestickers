// src/services/getCustomEvents.js
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const customEventsLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return data?.items || [];
});

export const getCustomEvents = async (userID, options = {}) => {
  const id = String(userID || "").trim();
  return customEventsLoader.run(`customEvents::${id}`, {
    force: options?.force === true,
    loadArg: `/api/customEvents/${encodeURIComponent(id)}`,
  });
};

export function invalidateCustomEventsCache(userID = "") {
  const id = String(userID || "").trim();
  customEventsLoader.invalidate(id ? `customEvents::${id}` : undefined);
}
