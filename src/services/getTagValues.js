import { apiGet } from "./api.js";

export async function getTagValues(userID, { event, sessionID = "" } = {}) {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim().toUpperCase();
  const sid = String(sessionID || "").trim();

  if (!id) throw new Error("getTagValues: userID required");
  if (!ev) throw new Error("getTagValues: event required");

  const params = new URLSearchParams({ event: ev });
  if (sid) params.set("sessionID", sid);

  const out = await apiGet(`/api/tagValues/${encodeURIComponent(id)}?${params.toString()}`);
  return out?.valuesByField || {};
}
