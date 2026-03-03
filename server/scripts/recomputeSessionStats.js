// server/scripts/recomputeSessionStats.js
require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const { QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

async function getAllSolves(userID, event, sessionID) {
  const gsi1pk = `SESSION#${userID}#${event}#${sessionID}`;
  let cursor;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": gsi1pk },
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all.reverse();
}

function getEffectiveTimeMs(solve) {
  const base = Number(solve?.Time ?? solve?.TimeMs);
  const penalty = solve?.Penalty;

  if (!Number.isFinite(base)) return Infinity;
  if (penalty === "DNF") return Infinity;
  if (penalty === "+2") return base + 2000;
  return base;
}

async function recompute(userID, event, sessionID) {
  const solves = await getAllSolves(userID, event, sessionID);

  const solveCount = solves.length;

  let bestSingle = null;
  let total = 0;

  for (const s of solves) {
    const t = getEffectiveTimeMs(s);
    if (Number.isFinite(t)) {
      if (bestSingle === null || t < bestSingle) bestSingle = t;
      total += t;
    }
  }

  const overallAvg = solveCount ? Math.round(total / solveCount) : null;

  const item = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${event}#${sessionID}`,
    Event: event,
    SessionID: sessionID,
    solveCount,
    overallAvgMs: overallAvg,
    bestSingleMs: bestSingle,
    stale: false,
    lastRecomputedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  console.log("✅ Recomputed:", item);
}

const [,, userID, event, sessionID] = process.argv;

if (!userID || !event || !sessionID) {
  console.error("Usage: node scripts/recomputeSessionStats.js <userID> <event> <sessionID>");
  process.exit(1);
}

recompute(userID, event.toUpperCase(), sessionID).catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});