// server/scripts/backfillBestCandidates.js
require("dotenv").config();

const { QueryCommand, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  BEST_WINDOW_CONFIGS,
  buildWindowCandidateStatsFromSolves,
  getAllSolvesBySession,
  getAllSolvesByEvent,
} = require("../lib/ptsCore");

const TOP_K = Math.max(10, Math.min(500, Number(process.env.PTS_BEST_CANDIDATES_K || 100)));

async function listUserSessions(userID) {
  let cursor = undefined;
  const out = [];

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "SESSION#",
        },
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );
    out.push(...(res.Items || []));
    cursor = res.LastEvaluatedKey;
  } while (cursor);

  return out;
}

async function updateStatsCandidates(userID, sk, candidateStats) {
  const getOut = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: sk },
      ConsistentRead: true,
    })
  );

  const item = getOut.Item;
  if (!item) return false;

  const next = {
    ...item,
    ...candidateStats,
    UpdatedAt: nowIso(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
  return true;
}

async function processSession(userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const solves = await getAllSolvesBySession(ddb, TABLE, userID, ev, sid);
  const candidateStats = buildWindowCandidateStatsFromSolves(solves, TOP_K);

  const updated = await updateStatsCandidates(userID, `SESSIONSTATS#${ev}#${sid}`, candidateStats);
  const summary = BEST_WINDOW_CONFIGS.map(
    (config) => `${config.windowSize}:${candidateStats[config.candidatesField]?.length || 0}`
  ).join(", ");
  console.log(
    `Session candidates ${userID}/${ev}/${sid}: solves=${solves.length}, windows=${summary}, updated=${updated}`
  );
}

async function processEvent(userID, event) {
  const ev = normalizeEvent(event);
  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);
  const candidateStats = buildWindowCandidateStatsFromSolves(solves, TOP_K);

  const updated = await updateStatsCandidates(userID, `EVENTSTATS#${ev}`, candidateStats);
  const summary = BEST_WINDOW_CONFIGS.map(
    (config) => `${config.windowSize}:${candidateStats[config.candidatesField]?.length || 0}`
  ).join(", ");
  console.log(
    `Event candidates ${userID}/${ev}: solves=${solves.length}, windows=${summary}, updated=${updated}`
  );
}

async function main() {
  const [, , userIDArg, eventArg, sessionIDArg] = process.argv;
  const userID = String(userIDArg || "").trim();
  const event = eventArg ? normalizeEvent(eventArg) : "";
  const sessionID = sessionIDArg ? normalizeSessionID(sessionIDArg) : null;

  if (!userID) {
    console.error("Usage: node scripts/backfillBestCandidates.js <userID> [event] [sessionID]");
    process.exit(1);
  }

  if (event && sessionID) {
    await processSession(userID, event, sessionID);
    await processEvent(userID, event);
    return;
  }

  const sessions = await listUserSessions(userID);
  const uniqueEvents = new Set();
  for (const s of sessions) {
    const ev = normalizeEvent(s?.Event);
    const sid = normalizeSessionID(s?.SessionID);
    if (!ev || !sid) continue;
    uniqueEvents.add(ev);
    await processSession(userID, ev, sid);
  }

  for (const ev of uniqueEvents) {
    await processEvent(userID, ev);
  }
}

main().catch((e) => {
  console.error("❌ backfillBestCandidates error:", e);
  process.exit(1);
});
