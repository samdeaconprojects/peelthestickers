// server/scripts/backfillAverageTrim.js
//
// One-time backfill for the switch to the ceil(5%)-per-side average trim.
//
// Ao25/Ao50/Ao100/Ao1000 used to trim a single best and worst regardless of window
// size, so every stored BestAo25Ms/BestAo50Ms/BestAo100Ms/BestAo1000Ms (and their
// Worst/StartSolveSK companions) on EVENTSTATS and SESSIONSTATS items is now stale.
// Mo3/Ao5/Ao12 are unaffected -- the new rule still trims exactly one per side there --
// which is why day buckets, whose caches stop at Ao12, need no backfill at all.
//
// It also populates BestMo5..BestMo1000 (and their NoDnf twins), which did not exist
// before and so are null on every previously written stats item.
//
// Usage: node scripts/backfillAverageTrim.js <userID> [event] [--dry-run]

require("dotenv").config();

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  normalizeEvent,
  normalizeSessionID,
  recomputeEventStats,
  recomputeSessionStats,
  getAllSolvesByEvent,
  getAllSolvesBySession,
  buildStatsFromSolves,
} = require("../lib/ptsCore");

// The windows whose definition moved, plus the best means, which are new fields and
// so are null on every item written before this backfill.
const AFFECTED_FIELDS = [
  "BestAo25Ms",
  "WorstAo25Ms",
  "BestAo50Ms",
  "WorstAo50Ms",
  "BestAo100Ms",
  "WorstAo100Ms",
  "BestAo1000Ms",
  "WorstAo1000Ms",
  ...[5, 12, 25, 50, 100, 1000].flatMap((n) => [`BestMo${n}Ms`, `BestMo${n}NoDnfMs`]),
];

async function queryAll(params) {
  let cursor;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({ ...params, ExclusiveStartKey: cursor })
    );
    all.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all;
}

async function listStatsItems(userID, prefix) {
  return queryAll({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
    ExpressionAttributeValues: { ":pk": `USER#${userID}`, ":pfx": prefix },
  });
}

function asFiniteOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function diffAffectedFields(prev, next) {
  const changes = [];

  for (const field of AFFECTED_FIELDS) {
    const before = asFiniteOrNull(prev?.[field]);
    const after = asFiniteOrNull(next?.[field]);
    if (before !== after) changes.push({ field, before, after });
  }

  return changes;
}

function formatChanges(changes) {
  if (!changes.length) return "unchanged";
  return changes
    .map(({ field, before, after }) => `${field} ${before ?? "-"} -> ${after ?? "-"}`)
    .join(", ");
}

async function processScope({ label, prev, loadSolves, recompute, dryRun }) {
  if (dryRun) {
    const solves = await loadSolves();
    const changes = diffAffectedFields(prev, buildStatsFromSolves(solves));
    console.log(`  ${label}: ${formatChanges(changes)}`);
    return changes.length > 0 ? 1 : 0;
  }

  const next = await recompute();
  const changes = diffAffectedFields(prev, next);
  console.log(`  ${label}: ${formatChanges(changes)}`);
  return changes.length > 0 ? 1 : 0;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const dryRun = rawArgs.includes("--dry-run");
  const positionalArgs = rawArgs.filter((arg) => arg !== "--dry-run");
  const [userIDArg, eventArg] = positionalArgs;
  const userID = String(userIDArg || "").trim();
  const onlyEvent = normalizeEvent(eventArg || "");

  if (!userID) {
    console.error("Usage: node scripts/backfillAverageTrim.js <userID> [event] [--dry-run]");
    process.exit(1);
  }

  const [eventStats, sessionStats] = await Promise.all([
    listStatsItems(userID, "EVENTSTATS#"),
    listStatsItems(userID, "SESSIONSTATS#"),
  ]);

  const matchesEvent = (item) =>
    !onlyEvent || normalizeEvent(item?.Event) === onlyEvent;

  const events = eventStats.filter(matchesEvent);
  const sessions = sessionStats.filter(matchesEvent);

  console.log(
    `${dryRun ? "Previewing" : "Backfilling"} Ao25+ averages for ${userID}: ` +
      `${events.length} event scopes, ${sessions.length} session scopes`
  );

  let changed = 0;

  for (const item of events) {
    const ev = normalizeEvent(item?.Event);
    if (!ev) continue;

    changed += await processScope({
      label: `EVENT ${ev}`,
      prev: item,
      loadSolves: () => getAllSolvesByEvent(ddb, TABLE, userID, ev),
      recompute: () => recomputeEventStats(ddb, TABLE, userID, ev),
      dryRun,
    });
  }

  for (const item of sessions) {
    const ev = normalizeEvent(item?.Event);
    const sid = normalizeSessionID(item?.SessionID);
    if (!ev || !sid) continue;

    changed += await processScope({
      label: `SESSION ${ev}/${sid}`,
      prev: item,
      loadSolves: () => getAllSolvesBySession(ddb, TABLE, userID, ev, sid),
      recompute: () => recomputeSessionStats(ddb, TABLE, userID, ev, sid),
      dryRun,
    });
  }

  console.log(
    `${dryRun ? "Would update" : "Updated"} ${changed} of ${events.length + sessions.length} scopes.`
  );
}

main().catch((error) => {
  console.error("backfillAverageTrim failed:", error);
  process.exit(1);
});
