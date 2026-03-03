// src/services/getMessages.js
import { apiGet } from "./api.js";

export const getMessages = async (conversationID) => {
  const data = await apiGet(`/api/messages/${encodeURIComponent(conversationID)}`);
  return data?.items || [];
};