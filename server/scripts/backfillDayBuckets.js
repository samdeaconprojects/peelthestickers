require("dotenv").config();

const { QueryCommand, GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  normalizeEvent,
  normalizeSessionID,
  getDayKey,
  getDayBucketTimeZone,
  buildDayBucketSK,
  buildDayBucketItem,
  getAllSolvesByEvent,
} = require("../lib/ptsCore");

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([key]) => key !== "UpdatedAt")
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isSameBucketPayload(a, b) {
  return stableSerialize(a || null) === stableSerialize(b || null);
}

async function listUserEvents(userID) {
  const [sessionOut, statsOut] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "SESSION#",
        },
      })
    ),
    ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "EVENTSTATS#",
        },
      })
    ),
  ]);

  return Array.from(
    new Set(
      [...(sessionOut.Items || []), ...(statsOut.Items || [])]
        .map((item) => normalizeEvent(item?.Event))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

async function getUserDayBucketTimeZone(userID) {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: "PROFILE" },
      ConsistentRead: true,
    })
  );

  const profile = out.Item || {};
  const settings = profile?.Settings && typeof profile.Settings === "object" ? profile.Settings : {};

  return getDayBucketTimeZone(
    settings?.timeZone ||
      settings?.TimeZone ||
      settings?.timezone ||
      settings?.Timezone ||
      profile?.timeZone ||
      profile?.TimeZone ||
      profile?.timezone ||
      profile?.Timezone
  );
}

async function queryDayBucketItemsByPrefix(userID, prefix) {
  const items = [];
  let cursor = null;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": prefix,
        },
        ExclusiveStartKey: cursor || undefined,
      })
    );
    if (Array.isArray(out.Items) && out.Items.length) items.push(...out.Items);
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  return items;
}

async function putItem(item) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

async function deleteItem(userID, dayKey, event = "", mainOnly = false) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: {
        PK: `USER#${userID}`,
        SK: buildDayBucketSK({ dayKey, event, mainOnly }),
      },
    })
  );
}

async function syncBucketItem({
  existingByDay,
  nextItem,
  counters,
  dryRun = false,
}) {
  const dayKey = String(nextItem?.BucketDay || "");
  if (!dayKey) return;

  const existing = existingByDay.get(dayKey) || null;
  if (existing && isSameBucketPayload(existing, nextItem)) {
    counters.unchanged += 1;
    return;
  }

  if (dryRun) {
    if (existing) counters.updated += 1;
    else counters.created += 1;
    return;
  }

  await putItem(nextItem);
  if (existing) counters.updated += 1;
  else counters.created += 1;
}

async function syncDeletedBuckets({
  userID,
  existingItems,
  activeDayKeys,
  counters,
  event = "",
  mainOnly = false,
  dryRun = false,
}) {
  for (const item of existingItems) {
    const dayKey = String(item?.BucketDay || "");
    if (!dayKey || activeDayKeys.has(dayKey)) continue;
    counters.deleted += 1;
    if (!dryRun) {
      await deleteItem(userID, dayKey, event, mainOnly);
    }
  }
}

async function backfillEvent(userID, event, allEventsSourcesByDay, timeZone, { dryRun = false } = {}) {
  const ev = normalizeEvent(event);
  if (!ev) return { event: null, days: 0, all: null, main: null };

  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);
  const groupedAll = new Map();
  const groupedMain = new Map();

  for (const solve of solves) {
    const dayKey = getDayKey(solve?.CreatedAt, { timeZone });
    if (!dayKey) continue;

    const allBucket = groupedAll.get(dayKey) || [];
    allBucket.push(solve);
    groupedAll.set(dayKey, allBucket);

    if (normalizeSessionID(solve?.SessionID) === "main") {
      const mainBucket = groupedMain.get(dayKey) || [];
      mainBucket.push(solve);
      groupedMain.set(dayKey, mainBucket);
    }
  }

  const [existingAll, existingMain] = await Promise.all([
    queryDayBucketItemsByPrefix(userID, `DAYBUCKET#EVENT#${ev}#`),
    queryDayBucketItemsByPrefix(userID, `DAYBUCKET#EVENT#${ev}#MAIN#`),
  ]);
  const existingAllByDay = new Map(
    existingAll
      .filter((item) => String(item?.ScopeVariant || "") !== "MAIN")
      .map((item) => [String(item?.BucketDay || ""), item])
      .filter(([dayKey]) => !!dayKey)
  );
  const existingMainByDay = new Map(
    existingMain
      .map((item) => [String(item?.BucketDay || ""), item])
      .filter(([dayKey]) => !!dayKey)
  );
  const allCounters = { created: 0, updated: 0, unchanged: 0, deleted: 0 };
  const mainCounters = { created: 0, updated: 0, unchanged: 0, deleted: 0 };

  for (const [dayKey, bucketSolves] of groupedAll.entries()) {
    const item = buildDayBucketItem({
      userID,
      dayKey,
      event: ev,
      timeZone,
      solves: bucketSolves,
    });
    await syncBucketItem({
      existingByDay: existingAllByDay,
      nextItem: item,
      counters: allCounters,
      dryRun,
    });
    const sources = allEventsSourcesByDay.get(dayKey) || [];
    sources.push(item);
    allEventsSourcesByDay.set(dayKey, sources);
  }

  await syncDeletedBuckets({
    userID,
    existingItems: existingAll.filter((item) => String(item?.ScopeVariant || "") !== "MAIN"),
    activeDayKeys: new Set(groupedAll.keys()),
    counters: allCounters,
    event: ev,
    mainOnly: false,
    dryRun,
  });

  for (const [dayKey, bucketSolves] of groupedMain.entries()) {
    await syncBucketItem({
      existingByDay: existingMainByDay,
      nextItem: buildDayBucketItem({
        userID,
        dayKey,
        event: ev,
        mainOnly: true,
        timeZone,
        solves: bucketSolves,
      }),
      counters: mainCounters,
      dryRun,
    });
  }

  await syncDeletedBuckets({
    userID,
    existingItems: existingMain,
    activeDayKeys: new Set(groupedMain.keys()),
    counters: mainCounters,
    event: ev,
    mainOnly: true,
    dryRun,
  });

  return { event: ev, days: groupedAll.size, all: allCounters, main: mainCounters };
}

async function backfillAllEvents(userID, allEventsSourcesByDay, timeZone, { dryRun = false } = {}) {
  const existing = await queryDayBucketItemsByPrefix(userID, "DAYBUCKET#ALL#");
  const activeDays = new Set(allEventsSourcesByDay.keys());
  const existingByDay = new Map(
    existing
      .map((item) => [String(item?.BucketDay || ""), item])
      .filter(([dayKey]) => !!dayKey)
  );
  const counters = { created: 0, updated: 0, unchanged: 0, deleted: 0 };

  for (const [dayKey, sourceBuckets] of allEventsSourcesByDay.entries()) {
    await syncBucketItem({
      existingByDay,
      nextItem: buildDayBucketItem({
        userID,
        dayKey,
        timeZone,
        sourceBuckets,
      }),
      counters,
      dryRun,
    });
  }

  await syncDeletedBuckets({
    userID,
    existingItems: existing,
    activeDayKeys: activeDays,
    counters,
    dryRun,
  });

  return counters;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const dryRun = rawArgs.includes("--dry-run");
  const positionalArgs = rawArgs.filter((arg) => arg !== "--dry-run");
  const [userIDArg, eventArg] = positionalArgs;
  const userID = String(userIDArg || "").trim();
  const onlyEvent = normalizeEvent(eventArg || "");

  if (!userID) {
    console.error("Usage: node scripts/backfillDayBuckets.js <userID> [event] [--dry-run]");
    process.exit(1);
  }

  const timeZone = await getUserDayBucketTimeZone(userID);
  const events = onlyEvent ? [onlyEvent] : await listUserEvents(userID);
  const allEventsSourcesByDay = new Map();

  console.log(`${dryRun ? "Previewing" : "Backfilling"} day buckets for ${userID} in ${timeZone}...`);

  for (const event of events) {
    const result = await backfillEvent(userID, event, allEventsSourcesByDay, timeZone, { dryRun });
    console.log(
      `  ${result.event}: ${result.days} days | event c${result.all.created} u${result.all.updated} =${result.all.unchanged} d${result.all.deleted} | main c${result.main.created} u${result.main.updated} =${result.main.unchanged} d${result.main.deleted}`
    );
  }

  const allEventsCounters = await backfillAllEvents(userID, allEventsSourcesByDay, timeZone, {
    dryRun,
  });
  console.log(
    `All-events buckets: ${allEventsSourcesByDay.size} days | c${allEventsCounters.created} u${allEventsCounters.updated} =${allEventsCounters.unchanged} d${allEventsCounters.deleted}`
  );
}

main().catch((error) => {
  console.error("backfillDayBuckets failed:", error);
  process.exit(1);
});
