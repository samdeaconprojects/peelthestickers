// src/services/backfillSessionStats.js
// IMPORTANT: Backfilling stats is a SERVER job (needs AWS creds, can be heavy).
// This client service simply triggers the server to run it. The route is
// admin-only (PTS_ADMIN_USER_IDS on the server).
import { apiPost } from "./api.js";

export const backfillSessionStatsForUser = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("backfillSessionStatsForUser: userID is required");

  const data = await apiPost(`/api/admin/backfill-session-stats/${encodeURIComponent(id)}`, {});
  return data || { ok: true };
};
