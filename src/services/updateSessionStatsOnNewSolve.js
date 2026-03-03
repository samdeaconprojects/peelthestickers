// src/services/updateSessionStatsOnNewSolve.js
import { apiPost } from "./api";

/**
 * Before Cognito: don’t do incremental stat writes from the client.
 * Mark SESSIONSTATS stale; you can recompute via existing endpoint.
 */
export const updateSessionStatsOnNewSolve = async (userID, event, sessionID, _newSolve) => {
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");
  await apiPost("/api/markSessionStatsStale", {
    userID,
    event: ev,
    sessionID: sid,
    reason: "new_solve",
  });
  return { ok: true };
};