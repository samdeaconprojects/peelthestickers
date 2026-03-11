// server/scripts/backfillSingleRanks.js
require("dotenv").config();

const { QueryCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  normalizeEvent,
  normalizeSessionID,
  getFinalTimeMs,
  parseSolveSK,
} = require("../lib/ptsCore");

function padRankTimeMs(ms) {
  const n = Number.isFinite(Number(ms)) ? Math.max(0, Math.floor(Number(ms))) : 0;
  return String(n).padStart(12, "0");
}

function getSolveIdentityParts(solve) {
  const parsed = parseSolveSK(solve?.SK || "");
  return {
    createdAt: String(solve?.CreatedAt || parsed.createdAt || ""),
    solveID: String(solve?.SolveID || parsed.solveID || ""),
  };
}

function buildRankItemsForSolve(userID, event, solve, sessionFilter = null) {
  const finalMs = getFinalTimeMs(solve);
  if (!Number.isFinite(finalMs)) return [];

  const ev = normalizeEvent(event || solve?.Event);
  const sid = normalizeSessionID(solve?.SessionID || "main");
  if (sessionFilter && sid !== normalizeSessionID(sessionFilter)) return [];

  const solveSK = String(solve?.SK || "").trim();
  if (!solveSK || !ev) return [];

  const { createdAt, solveID } = getSolveIdentityParts(solve);
  const rankTime = padRankTimeMs(finalMs);
  const solveIdPart = solveID || "nosolveid";

  return [
    {
      PK: `USER#${userID}`,
      SK: `SINGLERANK#EVENT#${ev}#${rankTime}#${createdAt}#${solveIdPart}`,
      ItemType: "SINGLERANK",
      RankScope: "EVENT",
      Event: ev,
      SessionID: sid,
      FinalTimeMs: Number(finalMs),
      SolveSK: solveSK,
      SolveID: solveID || null,
      CreatedAt: createdAt || null,
      UpdatedAt: new Date().toISOString(),
    },
    {
      PK: `USER#${userID}`,
      SK: `SINGLERANK#SESSION#${ev}#${sid}#${rankTime}#${createdAt}#${solveIdPart}`,
      ItemType: "SINGLERANK",
      RankScope: "SESSION",
      Event: ev,
      SessionID: sid,
      FinalTimeMs: Number(finalMs),
      SolveSK: solveSK,
      SolveID: solveID || null,
      CreatedAt: createdAt || null,
      UpdatedAt: new Date().toISOString(),
    },
  ];
}

async function batchWriteRequestsWithRetry(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return 0;

  const chunks = [];
  for (let i = 0; i < requests.length; i += 25) {
    chunks.push(requests.slice(i, i + 25));
  }

  let wrote = 0;

  for (const chunk of chunks) {
    let unprocessed = chunk;
    let attempt = 0;

    while (unprocessed.length > 0) {
      const out = await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE]: unprocessed,
          },
        })
      );

      const next = out?.UnprocessedItems?.[TABLE] || [];
      wrote += unprocessed.length - next.length;
      unprocessed = next;

      if (!unprocessed.length) break;

      attempt += 1;
      if (attempt > 8) {
        throw new Error(`batch write exceeded retries; unprocessed=${unprocessed.length}`);
      }

      const delay = Math.round(80 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return wrote;
}

async function deleteRanksByPrefix(userID, skPrefix) {
  let cursor = undefined;
  let deleted = 0;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": skPrefix,
        },
        ExclusiveStartKey: cursor,
        Limit: 1000,
        ProjectionExpression: "PK, SK",
        ConsistentRead: true,
      })
    );

    const keys = (out.Items || []).map((it) => ({
      DeleteRequest: { Key: { PK: it.PK, SK: it.SK } },
    }));
    if (keys.length > 0) {
      deleted += await batchWriteRequestsWithRetry(keys);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return deleted;
}

async function getUserEvents(userID) {
  let cursor = undefined;
  const events = new Set();

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "SESSION#",
        },
        ExclusiveStartKey: cursor,
        Limit: 1000,
        ProjectionExpression: "Event",
      })
    );

    for (const it of out.Items || []) {
      const ev = normalizeEvent(it?.Event);
      if (ev) events.add(ev);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return Array.from(events).sort((a, b) => a.localeCompare(b));
}

async function backfillEvent(userID, event, sessionID = null) {
  const ev = normalizeEvent(event);
  const sidFilter = sessionID ? normalizeSessionID(sessionID) : null;

  const deletedEvent = await deleteRanksByPrefix(userID, `SINGLERANK#EVENT#${ev}#`);
  const deletedSession = await deleteRanksByPrefix(
    userID,
    sidFilter
      ? `SINGLERANK#SESSION#${ev}#${sidFilter}#`
      : `SINGLERANK#SESSION#${ev}#`
  );

  let cursor = undefined;
  let scanned = 0;
  let putReqs = [];
  let wrote = 0;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${userID}#${ev}`,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    const items = out.Items || [];
    scanned += items.length;

    for (const solve of items) {
      const rankItems = buildRankItemsForSolve(userID, ev, solve, sidFilter);
      for (const ri of rankItems) {
        putReqs.push({ PutRequest: { Item: ri } });
      }

      if (putReqs.length >= 500) {
        wrote += await batchWriteRequestsWithRetry(putReqs);
        putReqs = [];
      }
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  if (putReqs.length > 0) {
    wrote += await batchWriteRequestsWithRetry(putReqs);
  }

  console.log(
    `Backfilled single ranks ${userID}/${ev}${sidFilter ? `/${sidFilter}` : ""}: scanned=${scanned}, deleted=${deletedEvent + deletedSession}, wrote=${wrote}`
  );
}

async function main() {
  const [, , userIDArg, eventArg, sessionIDArg] = process.argv;
  const userID = String(userIDArg || "").trim();
  const event = eventArg ? normalizeEvent(eventArg) : "";
  const sessionID = sessionIDArg ? normalizeSessionID(sessionIDArg) : null;

  if (!userID) {
    console.error("Usage: node scripts/backfillSingleRanks.js <userID> [event] [sessionID]");
    process.exit(1);
  }

  if (event) {
    await backfillEvent(userID, event, sessionID);
    return;
  }

  const events = await getUserEvents(userID);
  for (const ev of events) {
    await backfillEvent(userID, ev, null);
  }
}

main().catch((e) => {
  console.error("❌ backfillSingleRanks error:", e);
  process.exit(1);
});
