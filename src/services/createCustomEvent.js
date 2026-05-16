// src/services/createCustomEvent.js
import { apiPost } from "./api.js";
import { invalidateCustomEventsCache } from "./getCustomEvents.js";

export const createCustomEvent = async (userID, eventName, opts = {}) => {
  const data = await apiPost("/api/customEvent", { userID, eventName, opts });
  invalidateCustomEventsCache(userID);
  return data?.item;
};
