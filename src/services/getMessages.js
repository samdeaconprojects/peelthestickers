// src/services/getMessages.js
import { apiGet } from "./api.js";

export const getMessages = async (conversationID, userID = "", limit = 100) => {
  const id = String(conversationID || "").trim();
  if (!id) throw new Error("getMessages: conversationID required");

  const viewer = String(userID || "").trim();
  const qs = new URLSearchParams();
  if (viewer) qs.set("userID", viewer);
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    qs.set("limit", String(Math.min(Number(limit), 500)));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiGet(`/api/messages/${encodeURIComponent(id)}${suffix}`);
  return data?.items || [];
};
