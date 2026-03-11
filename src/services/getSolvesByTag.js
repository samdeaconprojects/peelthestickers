// src/services/getSolvesByTag.js
import { apiGet } from "./api.js";

export async function getSolvesByTag(
  userID,
  { tagKey, tagValue, event = "", sessionID = "", limit = 100, hydrate = true, cursor = null } = {}
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

  const out = await apiGet(
    `/api/solvesByTag/${encodeURIComponent(id)}?${params.toString()}`
  );

  return {
    items: out?.items || [],
    lastKey: out?.lastKey || null,
  };
}