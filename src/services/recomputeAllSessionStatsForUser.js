// src/services/recomputeAllSessionStatsForUser.js
import { getSessions } from "./getSessions";
import { recomputeSessionStats } from "./recomputeSessionStats";

export const recomputeAllSessionStatsForUser = async (userID) => {
  const sessionItems = await getSessions(userID);

  for (const session of sessionItems) {
    const event = (session.Event || "").toUpperCase();
    const sessionID = session.SessionID;

    if (!event || !sessionID) continue;

    try {
      await recomputeSessionStats(userID, event, sessionID);
    } catch (err) {
      console.error("❌ Failed to recompute stats for", { userID, event, sessionID }, err);
    }
  }

  console.log("✅ Finished recomputing stats for user", userID);
};
