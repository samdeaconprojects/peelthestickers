import { apiGet } from "./api.js";

// Group posts are stored with CreatedAt only; the feed sorts/deletes by DateTime.
function normalizeGroupPost(item) {
  if (!item || typeof item !== "object") return item;

  const timestamp =
    item.DateTime ||
    item.date ||
    item.CreatedAt ||
    (typeof item.SK === "string" && item.SK.startsWith("POST#") ? item.SK.slice(5) : null) ||
    null;

  return { ...item, DateTime: timestamp, date: timestamp };
}

export const getGroupPosts = async (groupID, userID = "", limit = 50) => {
  const gid = String(groupID || "").trim();
  if (!gid) throw new Error("getGroupPosts: groupID required");

  const viewer = String(userID || "").trim();
  const qs = new URLSearchParams();
  if (viewer) qs.set("userID", viewer);
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    qs.set("limit", String(Math.min(Number(limit), 200)));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiGet(`/api/groupPosts/${encodeURIComponent(gid)}${suffix}`);
  return (Array.isArray(data?.items) ? data.items : []).map(normalizeGroupPost);
};
