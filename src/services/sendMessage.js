// src/services/sendMessage.js
import { apiPost } from "./api.js";

export const sendMessage = async (conversationID, senderID, text) => {
  const data = await apiPost("/api/message", { conversationID, senderID, text });
  return data?.item;
};