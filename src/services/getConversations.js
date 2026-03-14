import { apiGet } from "./api.js";

export const getConversations = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getConversations: userID required");

  const data = await apiGet(`/api/conversations/${encodeURIComponent(id)}`);
  return Array.isArray(data?.items) ? data.items : [];
};
