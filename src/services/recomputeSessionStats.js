// src/services/recomputeSessionStats.js
import { apiPost } from "./api.js";

export const recomputeSessionStats = async (userID, event, sessionID) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("recomputeSessionStats: userID is required");
  if (!ev) throw new Error("recomputeSessionStats: event is required");

  const data = await apiPost("/api/recomputeSessionStats", { userID: id, event: ev, sessionID: sid });
  if (!data?.item) {
    throw new Error("recomputeSessionStats: server returned no item");
  }

  return data.item;
};
