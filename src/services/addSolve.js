import dynamoDB from "../components/SignIn/awsConfig";

/**
 * Adds a solve for the given user, event, and session.
 *
 * @param {string} userID - The user's ID.
 * @param {string} sessionID - The session ID (e.g., "main" or custom).
 * @param {string} event - The WCA/custom event code (e.g., "333").
 * @param {number} time - Solve time in milliseconds.
 * @param {string} scramble - The scramble string used.
 * @param {string|null} penalty - Optional penalty ("+2", "DNF", or null).
 * @param {string} note - Optional note attached to the solve.
 * @param {object} tags - Optional tags for categorization.
 */
export const addSolve = async (
  userID,
  sessionID,
  event,
  time,
  scramble,
  penalty = null,
  note = "",
  tags = {}
) => {
  const normalizedEvent = event.toUpperCase();
  const normalizedSession = sessionID || "main"; // ✅ fallback safety
  const timestamp = new Date().toISOString();

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`,
      Event: normalizedEvent,
      SessionID: normalizedSession,
      Time: time,
      Scramble: scramble,
      Penalty: penalty,
      Note: note,
      Tags: tags,
      DateTime: timestamp,

      // ✅ Use composite key to scope solves per session & event
      GSI1PK: `SESSION#${userID}#${normalizedEvent}#${normalizedSession}`,
      GSI1SK: timestamp
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`✅ Solve added for ${normalizedEvent} / ${normalizedSession}`);
  } catch (err) {
    console.error("❌ Error adding solve:", err);
    throw err;
  }
};
