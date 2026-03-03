// src/services/deleteSolve.js
import { apiDelete } from "./api.js";

export const deleteSolve = async (userID, timestamp) => {
  const id = String(userID || "").trim();
  const ts = String(timestamp || "").trim();
  if (!id) throw new Error("deleteSolve: userID required");
  if (!ts) throw new Error("deleteSolve: timestamp required");

  return apiDelete(`/api/solve/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`);
};