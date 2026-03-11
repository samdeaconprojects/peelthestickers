// src/services/updateSolvePenalty.js
import { apiPut } from "./api.js";

export const updateSolvePenalty = async (userID, solveRef, rawTimeMs, penalty) => {
  const id = String(userID || "").trim();
  const ref = String(solveRef || "").trim();

  if (!id) throw new Error("updateSolvePenalty: userID required");
  if (!ref) throw new Error("updateSolvePenalty: solveRef required");

  return apiPut(`/api/solvePenalty/${encodeURIComponent(id)}/${encodeURIComponent(ref)}`, {
    rawTimeMs,
    penalty,
  });
};