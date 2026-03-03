// src/services/getCustomEvents.js
import { apiGet } from "./api.js";

export const getCustomEvents = async (userID) => {
  const id = String(userID || "").trim();
  const data = await apiGet(`/api/customEvents/${encodeURIComponent(id)}`);
  return data?.items || [];
};