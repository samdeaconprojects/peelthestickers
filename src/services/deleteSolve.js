// src/services/deleteSolve.js
import { apiDelete } from "./api.js";
import { invalidateSolveMutationCaches } from "./solveMutationCache.js";

export const deleteSolve = async (userID, solveRef, options = {}) => {
  const id = String(userID || "").trim();
  const ref = String(solveRef || "").trim();

  if (!id) throw new Error("deleteSolve: userID required");
  if (!ref) throw new Error("deleteSolve: solveRef required");

  const result = await apiDelete(`/api/solve/${encodeURIComponent(id)}/${encodeURIComponent(ref)}`);
  invalidateSolveMutationCaches(id, [
    {
      event: options?.event,
      sessionID: options?.sessionID,
    },
  ]);
  return result;
};
