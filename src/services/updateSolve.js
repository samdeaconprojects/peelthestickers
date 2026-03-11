import { apiPut } from "./api.js";

export const updateSolve = async (userID, solveRef, updates) => {
  const id = String(userID || "").trim();
  const ref = String(solveRef || "").trim();

  if (!id) throw new Error("updateSolve: userID required");
  if (!ref) throw new Error("updateSolve: solveRef required");
  if (!updates || typeof updates !== "object") {
    throw new Error("updateSolve: updates required");
  }

  const data = await apiPut(
    `/api/solve/${encodeURIComponent(id)}/${encodeURIComponent(ref)}`,
    { updates }
  );

  return data?.item ?? data;
};