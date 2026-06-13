// src/services/sendMessage.js
import { apiPost } from "./api.js";

export const sendMessage = async (conversationID, senderID, text, extra = {}) => {
  const data = await apiPost("/api/message", { conversationID, senderID, text, ...extra });
  return data?.item;
};
