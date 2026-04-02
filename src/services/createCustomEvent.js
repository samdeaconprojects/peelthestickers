// src/services/createCustomEvent.js
import { apiPost } from "./api.js";

export const createCustomEvent = async (userID, eventName, opts = {}) => {
  const data = await apiPost("/api/customEvent", { userID, eventName, opts });
  return data?.item;
};
