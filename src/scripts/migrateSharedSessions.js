// src/scripts/migrateSharedSessions.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.scripts" });

/**
 * Migrates old per-average shared sessions into
 * one persistent shared session per pair per event.
 *
 * Usage:
 *   node migrateSharedSessions.js <userID>
 */

const TABLE_NAME = "PTS";

const migrateSharedSessions = async (userID) => {
  console.log("🔁 Migrating shared sessions for", userID);

  // 1️⃣ Get all sessions for user
  const { Items: sessions } = await dynamoDB.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userID}`,
      ":sk": "SESSION#",
    },
  }).promise();

  const sharedSessions = sessions.filter(
    s =>
      s.SessionID?.startsWith("shared_") ||
      s.SessionID?.startsWith("SHARED#")
  );

  console.log(`🔎 Found ${sharedSessions.length} shared sessions`);

  for (const session of sharedSessions) {
    const { Event, SessionID } = session;

    // Old format: shared_userA#userB_timestamp
    // New format: SHARED#userA#userB#EVENT
    const parts = SessionID.replace("shared_", "").split("#");

    if (parts.length < 2) continue;

    const [userA, userB] = parts;
    const pair = [userA, userB].sort();

    const newSessionID = `SHARED#${pair[0]}#${pair[1]}#${Event}`;

    console.log(`➡️ ${SessionID} → ${newSessionID}`);

    // 2️⃣ Fetch solves in old session
    const { Items: solves } = await dynamoDB.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gpk",
      ExpressionAttributeValues: {
        ":gpk": `SESSION#${SessionID}`,
      },
    }).promise();

    for (const solve of solves) {
      // 3️⃣ Re-point solves to new session
      await dynamoDB.update({
        TableName: TABLE_NAME,
        Key: {
          PK: solve.PK,
          SK: solve.SK,
        },
        UpdateExpression: "SET SessionID = :sid, GSI1PK = :gpk",
        ExpressionAttributeValues: {
          ":sid": newSessionID,
          ":gpk": `SESSION#${newSessionID}`,
        },
      }).promise();
    }

    // 4️⃣ Delete old session item
    await dynamoDB.delete({
      TableName: TABLE_NAME,
      Key: {
        PK: session.PK,
        SK: session.SK,
      },
    }).promise();
  }

  console.log(" Shared session migration complete");
};

// CLI
const [userID] = process.argv.slice(2);
if (!userID) {
  console.error("Usage: node migrateSharedSessions.js <userID>");
  process.exit(1);
}

migrateSharedSessions(userID).catch(err => {
  console.error(" Migration failed:", err);
  process.exit(1);
});
