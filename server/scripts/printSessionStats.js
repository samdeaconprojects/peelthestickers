// server/scripts/printSessionStats.js
require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const { GetCommand } = require("@aws-sdk/lib-dynamodb");

async function printSessionStats(userID, event, sessionID) {
  const normalizedEvent = String(event).toUpperCase();

  const Key = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${normalizedEvent}#${sessionID}`,
  };

  const out = await ddb.send(
    new GetCommand({ TableName: TABLE, Key })
  );

  if (out.Item) {
    console.log("📄 SessionStats item:");
    console.dir(out.Item, { depth: null });
  } else {
    console.log("⚠️ No SessionStats item found.");
  }
}

const [,, userID, event, sessionID] = process.argv;

if (!userID || !event || !sessionID) {
  console.error("Usage: node scripts/printSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}

printSessionStats(userID, event, sessionID).catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});