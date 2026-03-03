// src/services/backfillSessionStats.js
// IMPORTANT: Backfilling stats is a SERVER job (needs AWS creds, can be heavy).
// This client service simply triggers the server to run it.

export const backfillSessionStatsForUser = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("backfillSessionStatsForUser: userID is required");

  const res = await fetch(`/api/admin/backfill-session-stats/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Backfill request failed (${res.status})`);
  }

  // Server can return summary like: { ok:true, processedSessions: N }
  return res.json().catch(() => ({ ok: true }));
};