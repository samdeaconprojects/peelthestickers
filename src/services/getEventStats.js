// src/services/getEventStats.js
import { apiGet } from "./api.js";

export const getEventStats = async (userID, event) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  if (!id) throw new Error("getEventStats: userID required");
  if (!ev) throw new Error("getEventStats: event required");

  const data = await apiGet(
    `/api/eventStats/${encodeURIComponent(id)}?event=${encodeURIComponent(ev)}`
  );

  return data?.item ?? null;
};