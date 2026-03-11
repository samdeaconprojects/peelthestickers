// src/services/deleteSolve.js
import { apiDelete } from "./api.js";

export const deleteSolve = async (userID, solveRef) => {
  const id = String(userID || "").trim();
  const ref = String(solveRef || "").trim();

  if (!id) throw new Error("deleteSolve: userID required");
  if (!ref) throw new Error("deleteSolve: solveRef required");

  return apiDelete(`/api/solve/${encodeURIComponent(id)}/${encodeURIComponent(ref)}`);
};