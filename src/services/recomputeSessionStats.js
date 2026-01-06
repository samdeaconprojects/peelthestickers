// src/services/recomputeSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import { getSolvesBySession } from "./getSolvesBySession.js";
import { buildSessionStatsFromSolves } from "./sessionStatsUtils.js";

/**
 * Recompute Stats for ONE session from ALL its solves.
 * - userID: e.g. "tucktest1"
 * - event: e.g. "333"
 * - sessionID: e.g. "main"
 */
export const recomputeSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = (event || "").toUpperCase();

  // 1. Load all solves, oldest -> newest (your helper already does this)
  const solves = await getSolvesBySession(userID, normalizedEvent, sessionID);

  // 2. Build Stats from scratch
  const stats = buildSessionStatsFromSolves(solves);

  // 3. Update the SESSION item with the Stats attribute
  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SESSION#${normalizedEvent}#${sessionID}`,
    },
    UpdateExpression: "SET #Stats = :stats",
    ExpressionAttributeNames: {
      "#Stats": "Stats",
    },
    ExpressionAttributeValues: {
      ":stats": stats,
    },
    ReturnValues: "ALL_NEW",
  };

  const result = await dynamoDB.update(params).promise();
  console.log("✅ Recomputed Stats for session", {
    userID,
    event: normalizedEvent,
    sessionID,
    stats,
  });

  return result.Attributes;
};
