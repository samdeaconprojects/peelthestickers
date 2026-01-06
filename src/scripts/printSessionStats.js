// scripts/printSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.scripts' });


export const printSessionStats = async (userID, event, sessionID) => {
  const normalizedEvent = event.toUpperCase();
  const key = {
    PK: `USER#${userID}`,
SK: `SESSION#${event.toUpperCase()}#${sessionID}`

  };

  const { Item } = await dynamoDB.get({ TableName: "PTS", Key: key }).promise();

  if (Item) {
    console.log("📄 SessionStats item found:");
    console.dir(Item, { depth: null });
  } else {
    console.log("⚠️ No SessionStats item found.");
  }
};

// Run with CLI-style args
const [userID, event, sessionID] = process.argv.slice(2);
if (!userID || !event || !sessionID) {
  console.error("Usage: node printSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}
printSessionStats(userID, event, sessionID);
