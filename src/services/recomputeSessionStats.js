// src/services/recomputeSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import { getSolvesBySession } from "./getSolvesBySession.js";
import { buildSessionStatsFromSolves } from "./sessionStatsUtils.js";

/**
 * Recompute Stats for ONE session from ALL its solves.
 * Writes to SESSIONSTATS item (PK=USER#id, SK=SESSIONSTATS#EVENT#sessionID)
 */
export const recomputeSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = (event || "").toUpperCase();
  const sid = sessionID || "main";

  // 1) Load all solves
  const solves = await getSolvesBySession(userID, normalizedEvent, sid);

  // 2) Build stats from scratch
  const stats = buildSessionStatsFromSolves(solves);

  // 3) Write SESSIONSTATS item (this is what Stats page should read)
  const now = new Date().toISOString();

  const item = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${normalizedEvent}#${sid}`,

    Event: normalizedEvent,
    SessionID: sid,
    DateTime: now,       // you already use DateTime on these items in your snapshot
    stale: false,

    // spread your computed fields (solveCount, sumMs, bestAo5, bestSingleMs, buffers, etc.)
    ...stats,
  };

  await dynamoDB
    .put({
      TableName: "PTS",
      Item: item,
    })
    .promise();

  console.log("✅ Recomputed SESSIONSTATS", { userID, event: normalizedEvent, sessionID: sid });
  return item;
};
