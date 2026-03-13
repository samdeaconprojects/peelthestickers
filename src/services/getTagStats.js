import { apiGet } from "./api.js";

export const getTagStats = async (
  userID,
  { event, sessionID = "", tagKey, tagValue } = {}
) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();
  const sid = String(sessionID || "").trim();

  if (!id) throw new Error("getTagStats: userID required");
  if (!ev) throw new Error("getTagStats: event required");
  if (!key) throw new Error("getTagStats: tagKey required");
  if (!value) throw new Error("getTagStats: tagValue required");

  const params = new URLSearchParams({
    event: ev,
    tagKey: key,
    tagValue: value,
  });
  if (sid) params.set("sessionID", sid);

  const data = await apiGet(`/api/tagStats/${encodeURIComponent(id)}?${params.toString()}`);
  return data?.item ?? null;
};
