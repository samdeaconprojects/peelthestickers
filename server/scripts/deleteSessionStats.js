// server/scripts/deleteSessionStats.js
require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const { GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

async function deleteSessionStats(userID, event, sessionID) {
  const normalizedEvent = String(event).toUpperCase();

  const Key = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${normalizedEvent}#${sessionID}`,
  };

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE, Key })
  );

  if (!existing.Item) {
    console.log("⚠️ No SessionStats item found.");
    return;
  }

  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key })
  );

  console.log("✅ Deleted:", Key);
}

const [,, userID, event, sessionID] = process.argv;

if (!userID || !event || !sessionID) {
  console.error("Usage: node scripts/deleteSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}

deleteSessionStats(userID, event, sessionID).catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});