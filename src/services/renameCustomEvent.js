import { apiPut } from "./api.js";
import { invalidateCustomEventsCache } from "./getCustomEvents.js";

export const renameCustomEvent = async (userID, eventID, eventName) => {
  const data = await apiPut(
    `/api/customEvent/${encodeURIComponent(userID)}/${encodeURIComponent(eventID)}`,
    { eventName }
  );
  invalidateCustomEventsCache(userID);
  return data?.item;
};
