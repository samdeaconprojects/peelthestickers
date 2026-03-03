// src/services/createCustomEvent.js
import { apiPost } from "./api.js";

export const createCustomEvent = async (userID, eventName) => {
  const data = await apiPost("/api/customEvent", { userID, eventName });
  return data?.item;
};