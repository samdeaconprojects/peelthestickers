require("dotenv").config();

const { QueryCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  parseSolveSK,
  getFinalTimeMs,
  getAllSolvesByEvent,
  deleteSolveAndTagItems,
  recomputeSessionStats,
  recomputeEventStats,
  recomputeTagStats,
} = require("../lib/ptsCore");

const WCA_SUPPORTED_IMPORT_EVENTS = [
  "222",
  "333",
  "444",
  "555",
  "666",
  "777",
  "333OH",
  "333BLD",
  "444BLD",
  "555BLD",
  "CLOCK",
  "MEGAMINX",
  "PYRAMINX",
  "SKEWB",
  "SQ1",
];

async function batchWriteRequestsWithRetry(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return 0;

  const chunks = [];
  for (let i = 0; i < requests.length; i += 25) {
    chunks.push(requests.slice(i, i + 25));
  }

  let wrote = 0;
  for (const chunk of chunks) {
    let pending = chunk;
    let attempt = 0;

    while (pending.length > 0) {
      const out = await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE]: pending,
          },
        })
      );

      const next = out?.UnprocessedItems?.[TABLE] || [];
      wrote += pending.length - next.length;
      pending = next;

      if (!pending.length) break;
      attempt += 1;
      if (attempt > 8) {
        throw new Error(`batch write exceeded retries; unprocessed=${pending.length}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.round(80 * Math.pow(2, attempt))));
    }
  }

  return wrote;
}

function getSolveIdentityParts(solve) {
  const parsed = parseSolveSK(solve?.SK || "");
  return {
    createdAt: String(solve?.CreatedAt || parsed.createdAt || ""),
    solveID: String(solve?.SolveID || parsed.solveID || ""),
  };
}

function padRankTimeMs(ms) {
  const n = Number.isFinite(Number(ms)) ? Math.max(0, Math.floor(Number(ms))) : 0;
  return String(n).padStart(12, "0");
}

function buildRankItemsForSolve(userID, solve) {
  const finalMs = getFinalTimeMs(solve);
  if (!Number.isFinite(finalMs)) return [];

  const ev = normalizeEvent(solve?.Event);
  const sid = normalizeSessionID(solve?.SessionID || "main");
  const solveSK = String(solve?.SK || "").trim();
  if (!ev || !solveSK) return [];

  const { createdAt, solveID } = getSolveIdentityParts(solve);
  const rankTime = padRankTimeMs(finalMs);
  const solveIdPart = solveID || "nosolveid";
  const base = {
    PK: `USER#${userID}`,
    ItemType: "SINGLERANK",
    Event: ev,
    SessionID: sid,
    FinalTimeMs: Number(finalMs),
    SolveSK: solveSK,
    SolveID: solveID || null,
    CreatedAt: createdAt || null,
    UpdatedAt: nowIso(),
  };

  return [
    {
      ...base,
      RankScope: "EVENT",
      SK: `SINGLERANK#EVENT#${ev}#${rankTime}#${createdAt}#${solveIdPart}`,
    },
    {
      ...base,
      RankScope: "SESSION",
      SK: `SINGLERANK#SESSION#${ev}#${sid}#${rankTime}#${createdAt}#${solveIdPart}`,
    },
  ];
}

async function deleteRanksByPrefix(userID, skPrefix) {
  let cursor = undefined;
  const requests = [];

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

    for (const item of out.Items || []) {
      requests.push({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK },
        },
      });
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return batchWriteRequestsWithRetry(requests);
}

async function rebuildSingleRanksForEvent(userID, event) {
  const ev = normalizeEvent(event);
  await deleteRanksByPrefix(userID, `SINGLERANK#EVENT#${ev}#`);
  await deleteRanksByPrefix(userID, `SINGLERANK#SESSION#${ev}#`);

  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);
  const requests = [];
  for (const solve of solves) {
    for (const rankItem of buildRankItemsForSolve(userID, solve)) {
      requests.push({ PutRequest: { Item: rankItem } });
    }
  }
  await batchWriteRequestsWithRetry(requests);
}

function isWcaSolve(solve) {
  return String(solve?.Tags?.SolveSource || "").trim() === "WCA";
}

async function main() {
  const [, , userIDRaw] = process.argv;
  const userID = String(userIDRaw || "").trim();

  if (!userID) {
    console.error("Usage: node scripts/deleteWcaImport.js <userID>");
    process.exit(1);
  }

  const touchedEvents = new Set();
  const touchedSessions = new Map();
  let deletedSolveCount = 0;

  for (const event of WCA_SUPPORTED_IMPORT_EVENTS) {
    const solves = await getAllSolvesByEvent(ddb, TABLE, userID, event);
    const wcaSolves = solves.filter(isWcaSolve);
    if (!wcaSolves.length) continue;

    console.log(`Deleting ${wcaSolves.length} WCA solves from ${event}...`);
    for (const solve of wcaSolves) {
      await deleteSolveAndTagItems(ddb, TABLE, solve);
      deletedSolveCount += 1;
      touchedEvents.add(event);
      const sid = normalizeSessionID(solve?.SessionID || "main");
      touchedSessions.set(`${event}|${sid}`, { event, sessionID: sid });
    }
  }

  for (const event of touchedEvents) {
    console.log(`Rebuilding ranks and event stats for ${event}...`);
    await rebuildSingleRanksForEvent(userID, event);
    await recomputeEventStats(ddb, TABLE, userID, event);
    await recomputeTagStats(ddb, TABLE, userID, event, null, "SolveSource", "WCA");
  }

  for (const scope of touchedSessions.values()) {
    console.log(`Recomputing session stats for ${scope.event}/${scope.sessionID}...`);
    await recomputeSessionStats(ddb, TABLE, userID, scope.event, scope.sessionID);
    await recomputeTagStats(ddb, TABLE, userID, scope.event, scope.sessionID, "SolveSource", "WCA");
  }

  console.log(
    JSON.stringify(
      {
        userID,
        deletedSolveCount,
        touchedEvents: Array.from(touchedEvents.values()).sort((a, b) => a.localeCompare(b)),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("deleteWcaImport failed:", err);
  process.exit(1);
});
