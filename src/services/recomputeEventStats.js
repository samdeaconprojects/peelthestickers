// src/services/recomputeEventStats.js
import { apiPost } from "./api.js";

export const recomputeEventStats = async (userID, event) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  if (!id) throw new Error("recomputeEventStats: userID is required");
  if (!ev) throw new Error("recomputeEventStats: event is required");

  const data = await apiPost("/api/recomputeEventStats", { userID: id, event: ev });
  if (!data?.item) {
    throw new Error("recomputeEventStats: server returned no item");
  }

  return data.item;
};
