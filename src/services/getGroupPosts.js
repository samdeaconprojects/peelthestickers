import { apiGet } from "./api.js";

export const getGroupPosts = async (groupID, userID = "") => {
  const gid = String(groupID || "").trim();
  if (!gid) throw new Error("getGroupPosts: groupID required");

  const viewer = String(userID || "").trim();
  const qs = new URLSearchParams();
  if (viewer) qs.set("userID", viewer);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiGet(`/api/groupPosts/${encodeURIComponent(gid)}${suffix}`);
  return Array.isArray(data?.items) ? data.items : [];
};
