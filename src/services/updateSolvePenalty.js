// src/services/updateSolvePenalty.js
import { apiPut } from "./api.js";

export const updateSolvePenalty = async (userID, solveTimestamp, originalTime, penalty) => {
  const id = String(userID || "").trim();
  const ts = String(solveTimestamp || "").trim();
  if (!id) throw new Error("updateSolvePenalty: userID required");
  if (!ts) throw new Error("updateSolvePenalty: solveTimestamp required");

  return apiPut(`/api/solvePenalty/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`, {
    originalTime,
    penalty,
  });
};