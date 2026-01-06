// scripts/deleteSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.scripts' });


export const deleteSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = event.toUpperCase();
  const key = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${normalizedEvent}#${sessionID}`,
  };

  const { Item } = await dynamoDB.get({ TableName: "PTS", Key: key }).promise();
  if (!Item) {
    console.log("⚠️ No SessionStats item found.");
    return;
  }

  console.log("Deleting SessionStats item...");
  await dynamoDB.delete({ TableName: "PTS", Key: key }).promise();
  console.log("✅ Deleted.");
};

// Run with CLI-style args
const [userID, event, sessionID] = process.argv.slice(2);
if (!userID || !event || !sessionID) {
  console.error("Usage: node deleteSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}
deleteSessionStats(userID, event, sessionID);
