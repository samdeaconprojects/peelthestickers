// src/services/updateSolvePenalty.js
import { apiPut } from "./api.js";
import { buildSolveMutationScopes, invalidateSolveMutationCaches } from "./solveMutationCache.js";

export const updateSolvePenalty = async (userID, solveRef, rawTimeMs, penalty) => {
  const id = String(userID || "").trim();
  const ref = String(solveRef || "").trim();

  if (!id) throw new Error("updateSolvePenalty: userID required");
  if (!ref) throw new Error("updateSolvePenalty: solveRef required");

  const result = await apiPut(`/api/solvePenalty/${encodeURIComponent(id)}/${encodeURIComponent(ref)}`, {
    rawTimeMs,
    penalty,
  });
  if (result?.skipped === true) return result;
  invalidateSolveMutationCaches(id, buildSolveMutationScopes(result?.item));
  return result;
};
