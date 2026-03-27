import { apiGet } from "./api.js";

export const getConversations = async (userID, limit = 100) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getConversations: userID required");

  const qs = new URLSearchParams();
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    qs.set("limit", String(Math.min(Number(limit), 200)));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiGet(`/api/conversations/${encodeURIComponent(id)}${suffix}`);
  return Array.isArray(data?.items) ? data.items : [];
};
