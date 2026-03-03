// src/services/recomputeSessionStats.js

/**
 * Recompute Stats for ONE session from ALL its solves.
 * This now calls your local API (CRA proxy -> http://localhost:5000).
 *
 * Server should:
 *  - load all solves for the session
 *  - build stats
 *  - write SESSIONSTATS item
 *  - return the written item
 */
export const recomputeSessionStats = async (userID, event, sessionID) => {
  const id = String(userID || "").trim();
  const normalizedEvent = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("recomputeSessionStats: userID is required");
  if (!normalizedEvent) throw new Error("recomputeSessionStats: event is required");

  const res = await fetch("/api/recomputeSessionStats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      userID: id,
      event: normalizedEvent,
      sessionID: sid,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `recomputeSessionStats failed (${res.status})`);
  }

  const data = await res.json();
  if (!data?.item) {
    throw new Error("recomputeSessionStats: server returned no item");
  }

  console.log("✅ Recomputed SESSIONSTATS (server)", {
    userID: id,
    event: normalizedEvent,
    sessionID: sid,
  });

  return data.item;
};