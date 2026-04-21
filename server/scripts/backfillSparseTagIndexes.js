require("dotenv").config();

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const { normalizeEvent, buildSolveItem, replaceSolveAndTagItems, getAllSolvesByEvent } = require("../lib/ptsCore");

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

function needsSparseBackfill(solve) {
  if (!String(solve?.SolveTagSK || "").trim()) return true;

  const tags = solve?.Tags && typeof solve.Tags === "object" ? solve.Tags : {};
  if (String(tags?.CubeModel || "").trim() && !String(solve?.CubeModelIdx || "").trim()) return true;
  if (String(tags?.CrossColor || "").trim() && !String(solve?.StartColorIdx || "").trim()) return true;
  if (String(tags?.Method || "").trim() && !String(solve?.MethodIdx || "").trim()) return true;

  return false;
}

async function backfillEvent(userID, event) {
  const ev = normalizeEvent(event);
  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);

  let scanned = 0;
  let updated = 0;

  for (const solve of solves) {
    scanned += 1;
    if (!needsSparseBackfill(solve)) continue;

    const rebuilt = buildSolveItem({
      userID,
      event: solve?.Event,
      sessionID: solve?.SessionID,
      rawTimeMs: solve?.RawTimeMs,
      penalty: solve?.Penalty,
      scramble: solve?.Scramble || "",
      note: solve?.Note || "",
      tags: solve?.Tags || {},
      createdAt: solve?.CreatedAt,
      solveID: solve?.SolveID,
      existing: solve,
    });

    await replaceSolveAndTagItems(ddb, TABLE, solve, rebuilt);
    updated += 1;
  }

  console.log(
    JSON.stringify({
      event: ev,
      scanned,
      updated,
    })
  );
}

async function main() {
  const [, , userIDRaw, eventRaw] = process.argv;
  const userID = String(userIDRaw || "").trim();
  const singleEvent = normalizeEvent(eventRaw || "");

  if (!userID) {
    console.error("Usage: node scripts/backfillSparseTagIndexes.js <userID> [event]");
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
  console.error("backfillSparseTagIndexes failed:", err);
  process.exit(1);
});
