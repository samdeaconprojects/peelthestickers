// src/services/updateSolve.js
import { apiPut } from "./api.js";

export const updateSolve = async (userID, timestamp, updates) => {
  const id = String(userID || "").trim();
  const ts = String(timestamp || "").trim();
  if (!id) throw new Error("updateSolve: userID required");
  if (!ts) throw new Error("updateSolve: timestamp required");
  if (!updates || typeof updates !== "object") throw new Error("updateSolve: updates required");

  return apiPut(`/api/solve/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`, { updates });
};