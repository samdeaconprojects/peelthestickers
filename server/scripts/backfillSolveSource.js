require("dotenv").config();

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  normalizeEvent,
  buildSolveItem,
  replaceSolveAndTagItems,
  getAllSolvesByEvent,
  recomputeSessionStats,
  recomputeEventStats,
  recomputeTagStats,
} = require("../lib/ptsCore");

function isWcaImportedSolve(solve) {
  const note = String(solve?.Note || "").trim();
  return note.startsWith("WCA import");
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

    for (const item of out.Items || []) {
      const ev = normalizeEvent(item?.Event);
      if (ev) events.add(ev);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return Array.from(events).sort((a, b) => a.localeCompare(b));
}

async function backfillEvent(userID, event) {
  const ev = normalizeEvent(event);
  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);

  let scanned = 0;
  let updated = 0;
  const touchedSessions = new Set();
  const touchedSourceValues = new Set();

  for (const solve of solves) {
    scanned += 1;
    if (!isWcaImportedSolve(solve)) continue;

    const currentSource = String(solve?.Tags?.SolveSource || "").trim();
    if (currentSource === "WCA") continue;

    const rebuilt = buildSolveItem({
      userID,
      event: solve?.Event,
      sessionID: solve?.SessionID,
      rawTimeMs: solve?.RawTimeMs,
      penalty: solve?.Penalty,
      scramble: solve?.Scramble || "",
      note: solve?.Note || "",
      tags: {
        ...(solve?.Tags || {}),
        SolveSource: "WCA",
      },
      createdAt: solve?.CreatedAt,
      solveID: solve?.SolveID,
      existing: solve,
    });

    await replaceSolveAndTagItems(ddb, TABLE, solve, rebuilt);
    updated += 1;
    touchedSessions.add(String(solve?.SessionID || "main"));
    if (currentSource) touchedSourceValues.add(currentSource);
  }

  if (updated > 0) {
    await recomputeEventStats(ddb, TABLE, userID, ev);

    for (const sessionID of touchedSessions) {
      await recomputeSessionStats(ddb, TABLE, userID, ev, sessionID);
      await recomputeTagStats(ddb, TABLE, userID, ev, sessionID, "SolveSource", "WCA");
      for (const oldSource of touchedSourceValues) {
        await recomputeTagStats(ddb, TABLE, userID, ev, sessionID, "SolveSource", oldSource);
      }
    }

    await recomputeTagStats(ddb, TABLE, userID, ev, null, "SolveSource", "WCA");
    for (const oldSource of touchedSourceValues) {
      await recomputeTagStats(ddb, TABLE, userID, ev, null, "SolveSource", oldSource);
    }
  }

  console.log(
    JSON.stringify({
      event: ev,
      scanned,
      updated,
      touchedSessions: Array.from(touchedSessions.values()),
    })
  );
}

async function main() {
  const [, , userIDRaw, eventRaw] = process.argv;
  const userID = String(userIDRaw || "").trim();
  const singleEvent = normalizeEvent(eventRaw || "");

  if (!userID) {
    console.error("Usage: node scripts/backfillSolveSource.js <userID> [event]");
    process.exit(1);
  }

  const events = singleEvent ? [singleEvent] : await getUserEvents(userID);
  if (!events.length) {
    console.log("No events found for user.");
    return;
  }

  for (const event of events) {
    await backfillEvent(userID, event);
  }
}

main().catch((err) => {
  console.error("backfillSolveSource failed:", err);
  process.exit(1);
});
