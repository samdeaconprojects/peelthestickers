// src/services/getMessages.js
import { apiGet } from "./api.js";

export const getMessages = async (conversationID, userID = "") => {
  const id = String(conversationID || "").trim();
  if (!id) throw new Error("getMessages: conversationID required");

  const viewer = String(userID || "").trim();
  const qs = new URLSearchParams();
  if (viewer) qs.set("userID", viewer);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiGet(`/api/messages/${encodeURIComponent(id)}${suffix}`);
  return data?.items || [];
};
