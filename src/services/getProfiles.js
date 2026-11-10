// src/services/getProfiles.js
// Profile cards for many users in one request. Cards are what GET /api/user
// returns minus the follow lists, so use getUser for a profile page.
import { apiGet, apiPost } from "./api.js";
import { normalizeUserRecord } from "./getUser.js";
import { normalizePost } from "./getPosts.js";

const BATCH = 500;

export const getProfiles = async (ids = []) => {
  const unique = Array.from(
    new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))
  );
  const out = {};
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const data = await apiPost("/api/profiles", { ids: chunk });
    const users = data?.users || {};
    chunk.forEach((id) => {
      out[id] = users[id] ? normalizeUserRecord(users[id]) : null;
    });
  }
  return out;
};

// Newest posts from the signed-in user and everyone they follow, merged on
// the server. Returns { items, authors } with authors keyed by userID.
export const getFeed = async (limit = 25) => {
  const data = await apiGet(`/api/feed?limit=${encodeURIComponent(String(limit))}`);
  const authors = {};
  Object.entries(data?.authors || {}).forEach(([id, card]) => {
    authors[id] = card ? normalizeUserRecord(card) : null;
  });
  return { items: (data?.items || []).map(normalizePost), authors };
};
