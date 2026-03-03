// server/scripts/backfillSessionStats.js
require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { execSync } = require("child_process");

async function getAllSessions(userID) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userID}`,
        ":pfx": "SESSION#",
      },
    })
  );

  return out.Items || [];
}

async function backfill(userID) {
  const sessions = await getAllSessions(userID);

  for (const s of sessions) {
    console.log(`🔁 Recomputing ${s.Event} / ${s.SessionID}`);
    execSync(
      `node scripts/recomputeSessionStats.js ${userID} ${s.Event} ${s.SessionID}`,
      { stdio: "inherit" }
    );
  }

  console.log("✅ Backfill complete.");
}

const [,, userID] = process.argv;

if (!userID) {
  console.error("Usage: node scripts/backfillSessionStats.js <userID>");
  process.exit(1);
}

backfill(userID).catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});