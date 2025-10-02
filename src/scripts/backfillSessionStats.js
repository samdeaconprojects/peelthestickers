// scripts/backfillSessionStats.js
import { backfillSessionStatsForUser } from "../services/backfillSessionStats.js";

const userID = process.argv[2];

if (!userID) {
  console.error("Usage: node backfillSessionStats.js <userID>");
  process.exit(1);
}

(async () => {
  try {
    await backfillSessionStatsForUser(userID);
    console.log("✅ Backfill finished for", userID);
  } catch (e) {
    console.error("❌ Error:", e);
  }
})();
