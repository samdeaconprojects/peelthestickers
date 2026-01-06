import { recomputeSessionStats } from "../services/recomputeSessionStats.js";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.scripts' });

const [,, userID, event, sessionID] = process.argv;

if (!userID || !event || !sessionID) {
  console.error("❌ Usage: node src/scripts/recomputeSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}

recomputeSessionStats(userID, event, sessionID)
  .then((result) => {
    console.log("✅ Done! Updated session:", result);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
  });
