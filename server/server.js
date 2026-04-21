const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const JSON_LIMIT = process.env.PTS_JSON_LIMIT || "10mb";
app.use(express.json({ limit: JSON_LIMIT }));

const port = process.env.PORT || 5050;

const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  getDayKey,
  getDayBucketTimeZone,
  normalizePenalty,
  STRICT_WINDOW_VERSION,
  DAY_BUCKET_VERSION,
  CACHED_WINDOW_CONFIGS,
  parseSolveSK,
  normalizeTagIndexValue,
  getRawTimeMs,
  getFinalTimeMs,
  buildDayBucketSK,
  buildDayBucketItem,
  mergeDayBucketSummaries,
  buildTagStatsSK,
  buildSolveTagSK,
  buildSolveItem,
  getSolveTagPairsFromItem,
  buildSolveTagItems,
  buildStatsFromSolves,
  buildTopWindowCandidatesFromSolves,
  getAllSolvesBySession,
  getAllSolvesByEvent,
  getLastNSolvesBySession,
  getLastNSolvesByEvent,
  getLastNSolvesByTag,
  recomputeSessionStats,
  recomputeEventStats,
  recomputeTagStats,
  putSolveAndTagItems,
  replaceSolveAndTagItems,
  deleteSolveAndTagItems,
  upsertTagStatsOnNewSolve,
  querySolvesBySparseTag,
  getSparseTagIndexConfig,
  buildSparseTagIndexPK,
} = require("./lib/ptsCore");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = process.env.PTS_TABLE || "PTSProd";
const USE_PK_SK = String(process.env.PTS_USE_PK_SK || "true").toLowerCase() === "true";
const ENABLE_SPARSE_TAG_READS =
  String(process.env.PTS_ENABLE_SPARSE_TAG_READS || "false").toLowerCase() === "true";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const BEST_CANDIDATES_K = Math.max(
  10,
  Math.min(500, Number(process.env.PTS_BEST_CANDIDATES_K || 100))
);
const CORE_EVENT_IDS = new Set([
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
  "MBLD",
  "CLOCK",
  "MEGAMINX",
  "PYRAMINX",
  "SKEWB",
  "SQ1",
  "FMC",
  "RELAY_2X2-4X4_222_333_444",
  "RELAY_2X2-7X7_222_333_444_555_666_777",
  "RELAY_MINIGUILDFORD_222_333_333OH_444_555_SKEWB_PYRAMINX_SQ1_CLOCK_MEGAMINX",
  "RELAY",
]);
const TAG_SCOPE_EVENT_ALIASES = Object.freeze({
  "333OH": "333",
  "333BLD": "333",
  "333FM": "333",
  "333FT": "333",
  "333MBLD": "333",
  "MBLD": "333",
  "444BLD": "444",
  "555BLD": "555",
});

function requirePkSk(res) {
  if (!USE_PK_SK) {
    res.status(500).json({
      error: "Server configured for non PK/SK table. Set PTS_USE_PK_SK=true.",
    });
    return false;
  }
  return true;
}

function isCoreEvent(event) {
  return CORE_EVENT_IDS.has(normalizeEvent(event));
}

function getTagScopeEventCandidates(event) {
  const normalized = normalizeEvent(event);
  const shared = TAG_SCOPE_EVENT_ALIASES[normalized] || normalized;
  if (!normalized) return [shared].filter(Boolean);
  if (shared === normalized) return [normalized];
  return [shared, normalized];
}

function hasCurrentStrictWindowVersion(item) {
  return Number(item?.StrictWindowVersion || 0) === STRICT_WINDOW_VERSION;
}

function hasCachedWorstMetrics(item) {
  if (!item) return false;

  const hasSingle =
    Number(item?.SolveCountIncluded || 0) === 0 || item?.WorstSingleMs !== undefined;
  const hasMo3 = Number(item?.SolveCountTotal || 0) < 3 || item?.WorstMo3Ms !== undefined;
  const hasAo5 = Number(item?.SolveCountTotal || 0) < 5 || item?.WorstAo5Ms !== undefined;
  const hasAo12 = Number(item?.SolveCountTotal || 0) < 12 || item?.WorstAo12Ms !== undefined;

  return hasSingle && hasMo3 && hasAo5 && hasAo12;
}

const ALLOWED_TAG_KEYS = new Set([
  "CubeModel",
  "CrossColor",
  "Method",
  "TimerInput",
  "SolveSource",
  "Custom1",
  "Custom2",
  "Custom3",
  "Custom4",
  "Custom5",
]);

function buildDefaultTagConfig(tagOptions = null) {
  return {
    Fixed: {
      CubeModel: {
        label: "Cube Model",
        options: Array.isArray(tagOptions?.CubeModels) ? tagOptions.CubeModels : [],
      },
      CrossColor: {
        label: "Start Color",
        options: Array.isArray(tagOptions?.CrossColors)
          ? tagOptions.CrossColors
          : ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
      },
      Method: {
        label: "Method",
        options: ["CFOP", "Roux", "ZZ", "Petrus", "LBL", "Other"],
      },
      TimerInput: {
        label: "Timer Input",
        options: ["Keyboard", "Type", "Stackmat", "GAN Bluetooth", "GAN Cube"],
      },
      SolveSource: {
        label: "Solve Source",
        options: ["Standard", "Practice", "Shared", "Relay", "Import", "SmartCube", "WCA"],
      },
    },
    CustomSlots: [
      { slot: "Custom1", label: "", options: [] },
      { slot: "Custom2", label: "", options: [] },
      { slot: "Custom3", label: "", options: [] },
      { slot: "Custom4", label: "", options: [] },
      { slot: "Custom5", label: "", options: [] },
    ],
  };
}

const WCA_EVENT_CODE_MAP = Object.freeze({
  "222": "222",
  "333": "333",
  "444": "444",
  "555": "555",
  "666": "666",
  "777": "777",
  "333oh": "333OH",
  "333bf": "333BLD",
  "444bf": "444BLD",
  "555bf": "555BLD",
  clock: "CLOCK",
  minx: "MEGAMINX",
  pyram: "PYRAMINX",
  skewb: "SKEWB",
  sq1: "SQ1",
  "333fm": "FMC",
  "333mbf": "MBLD",
});

const WCA_SUPPORTED_IMPORT_EVENTS = new Set([
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
]);

function normalizeWcaId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function titleizeSessionID(sessionID) {
  const sid = String(sessionID || "").trim();
  if (!sid || sid === "main") return "Main";
  return sid
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createImportJobID() {
  return `impjob_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

function buildImportJobSK(jobID) {
  return `IMPORTJOB#${String(jobID || "").trim()}`;
}

function normalizeImportJobStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (["PENDING", "RUNNING", "FINALIZING", "COMPLETED", "FAILED", "CANCELED"].includes(status)) {
    return status;
  }
  return "PENDING";
}

function normalizeImportSourceKey(value) {
  return String(value || "")
    .trim()
    .slice(0, 240);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableJsonValue(item));
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = stableJsonValue(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function stableJsonStringify(value) {
  return JSON.stringify(stableJsonValue(value));
}

function buildImportSessionScopeKey(event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  if (!ev) return "";
  return `${ev}|${sid}`;
}

function parseImportSessionScopeKey(value) {
  const [event = "", sessionID = "main"] = String(value || "").split("|");
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID || "main");
  if (!ev) return null;
  return { event: ev, sessionID: sid };
}

function buildDeterministicImportedSolveID({
  userID,
  sourceKey = "",
  event,
  sessionID,
  solve = {},
  importOrdinal = 0,
}) {
  const payload = stableJsonStringify({
    userID: String(userID || "").trim(),
    sourceKey: normalizeImportSourceKey(sourceKey),
    event: normalizeEvent(event),
    sessionID: normalizeSessionID(sessionID),
    importOrdinal: Number.isFinite(Number(importOrdinal)) ? Number(importOrdinal) : 0,
    createdAt: String(solve?.datetime || solve?.createdAt || solve?.CreatedAt || "").trim(),
    rawTimeMs: Number(
      solve?.rawTimeMs ??
        solve?.RawTimeMs ??
        solve?.originalTime ??
        solve?.OriginalTime ??
        solve?.time ??
        solve?.Time
    ),
    penalty: normalizePenalty(solve?.penalty ?? solve?.Penalty ?? null),
    scramble: String(solve?.scramble ?? solve?.Scramble ?? "").trim(),
    note: String(solve?.note ?? solve?.Note ?? "").trim(),
    tags: solve?.tags ?? solve?.Tags ?? {},
  });

  return `imp_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}

async function getImportJobItem(userID, jobID) {
  if (!userID || !jobID) return null;
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        PK: `USER#${userID}`,
        SK: buildImportJobSK(jobID),
      },
    })
  );
  return out.Item || null;
}

async function listImportJobs(userID, limit = 20) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userID}`,
        ":pfx": "IMPORTJOB#",
      },
      ScanIndexForward: false,
      Limit: Math.max(1, Math.min(100, Number(limit) || 20)),
    })
  );
  return Array.isArray(out?.Items) ? out.Items : [];
}

async function putImportJobItem(item) {
  if (!item?.PK || !item?.SK) throw new Error("Import job item missing PK/SK");
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

function publicImportJob(job) {
  if (!job) return null;
  return {
    jobID: String(job.JobID || ""),
    status: normalizeImportJobStatus(job.Status),
    format: String(job.Format || "").trim() || "unknown",
    sourceKey: String(job.SourceKey || "").trim() || "",
    totalSolves: Number(job.TotalSolves || 0),
    processedSolves: Number(job.ProcessedSolves || 0),
    totalChunks: Number(job.TotalChunks || 0),
    receivedChunks: Number(job.ReceivedChunks || 0),
    finalizedAt: job.FinalizedAt || null,
    createdAt: job.CreatedAt || null,
    updatedAt: job.UpdatedAt || null,
    startedAt: job.StartedAt || null,
    completedAt: job.CompletedAt || null,
    failedAt: job.FailedAt || null,
    error: job.Error || null,
    label: job.Label || "",
    metadata: job.Metadata && typeof job.Metadata === "object" ? job.Metadata : {},
    affectedEvents: Array.isArray(job.AffectedEvents) ? job.AffectedEvents : [],
    affectedSessionCount: Array.isArray(job.AffectedSessions) ? job.AffectedSessions.length : 0,
    recompute: job.Recompute && typeof job.Recompute === "object" ? job.Recompute : {},
  };
}

async function ensureSessionRecordExists(userID, event, sessionID, sessionName = null) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const key = { PK: `USER#${userID}`, SK: `SESSION#${ev}#${sid}` };

  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: key,
    })
  );

  if (existing.Item) return existing.Item;

  const ts = nowIso();
  const item = {
    ...key,
    ItemType: "SESSION",
    Event: ev,
    SessionID: sid,
    SessionName: String(sessionName || titleizeSessionID(sid) || "Main"),
    CreatedAt: ts,
    UpdatedAt: ts,
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  await ensureSessionStatsExists(userID, ev, sid);
  return item;
}

async function getAllSolvesForSession(userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const items = [];
  let cursor = null;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${ev}#${sid}`,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor || undefined,
      })
    );

    if (Array.isArray(out.Items) && out.Items.length) items.push(...out.Items);
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  return items;
}

async function getAllSolvesForEvent(userID, event) {
  const ev = normalizeEvent(event);
  const items = [];
  let cursor = null;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${userID}#${ev}`,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor || undefined,
      })
    );

    if (Array.isArray(out.Items) && out.Items.length) items.push(...out.Items);
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  return items;
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

function hasCurrentDayBucketVersion(item) {
  return Number(item?.DayBucketVersion || 0) === DAY_BUCKET_VERSION;
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

function getTimeZoneParts(date, timeZone) {
  const resolvedTimeZone = getDayBucketTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year || 0),
    month: Number(byType.month || 0),
    day: Number(byType.day || 0),
    hour: Number(byType.hour || 0),
    minute: Number(byType.minute || 0),
    second: Number(byType.second || 0),
  };
}

function getUtcMsForTimeZoneLocalParts(timeZone, year, month, day, hour = 0, minute = 0, second = 0) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const target = Date.UTC(year, month - 1, day, hour, minute, second, 0);

  for (let i = 0; i < 4; i += 1) {
    const actual = getTimeZoneParts(new Date(guess), timeZone);
    const actualUtc = Date.UTC(
      actual.year,
      Math.max(0, actual.month - 1),
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const diff = target - actualUtc;
    if (diff === 0) break;
    guess += diff;
  }

  return guess;
}

function shiftIsoDay(dayKey, offsetDays) {
  const match = String(dayKey || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(offsetDays || 0), 12, 0, 0, 0));
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCreatedAtRangeForLocalDays({ startDay = "", endDay = "", timeZone = "" } = {}) {
  const resolvedTimeZone = getDayBucketTimeZone(timeZone);
  const startKey = String(startDay || "").trim();
  const endKey = String(endDay || "").trim();
  const startMatch = startKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const endMatch = endKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const startIso = startMatch
    ? new Date(
        getUtcMsForTimeZoneLocalParts(
          resolvedTimeZone,
          Number(startMatch[1]),
          Number(startMatch[2]),
          Number(startMatch[3]),
          0,
          0,
          0
        )
      ).toISOString()
    : "";

  const exclusiveEndKey = endMatch ? shiftIsoDay(endKey, 1) : "";
  const exclusiveEndMatch = exclusiveEndKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const endExclusiveIso = exclusiveEndMatch
    ? new Date(
        getUtcMsForTimeZoneLocalParts(
          resolvedTimeZone,
          Number(exclusiveEndMatch[1]),
          Number(exclusiveEndMatch[2]),
          Number(exclusiveEndMatch[3]),
          0,
          0,
          0
        )
      ).toISOString()
    : "";

  return {
    timeZone: resolvedTimeZone,
    startIso,
    endExclusiveIso,
  };
}

function filterSolvesToDay(solves, dayKey, timeZone) {
  const day = String(dayKey || "").trim();
  return (Array.isArray(solves) ? solves : []).filter(
    (solve) => getDayKey(solve?.CreatedAt, { timeZone }) === day
  );
}

async function getEventSolvesForLocalDay(userID, event, dayKey, timeZone) {
  const ev = normalizeEvent(event);
  const day = String(dayKey || "").trim();
  if (!userID || !ev || !day) return [];

  const { startIso, endExclusiveIso } = getCreatedAtRangeForLocalDays({
    startDay: day,
    endDay: day,
    timeZone,
  });

  if (!startIso || !endExclusiveIso) return [];

  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk AND GSI2SK BETWEEN :startSk AND :endSk",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${userID}#${ev}`,
          ":startSk": startIso,
          ":endSk": endExclusiveIso,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (Array.isArray(out.Items) && out.Items.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  return all;
}

async function writeDayBucketItem(item) {
  if (!item) return null;
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

async function deleteDayBucketItem(userID, dayKey, event = "", mainOnly = false) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: {
        PK: `USER#${userID}`,
        SK: buildDayBucketSK({ dayKey, event, mainOnly }),
      },
    })
  );
  return null;
}

async function recomputeEventDayBucket(userID, event, dayKey, { mainOnly = false } = {}) {
  const ev = normalizeEvent(event);
  const day = String(dayKey || "").trim();
  if (!ev || !day) return null;

  const timeZone = await getUserDayBucketTimeZone(userID);
  const solves = await getEventSolvesForLocalDay(userID, ev, day, timeZone);
  const filtered = solves.filter((solve) =>
    mainOnly ? normalizeSessionID(solve?.SessionID) === "main" : true
  );

  if (!filtered.length) {
    return deleteDayBucketItem(userID, day, ev, mainOnly);
  }

  return writeDayBucketItem(
    buildDayBucketItem({
      userID,
      dayKey: day,
      event: ev,
      mainOnly,
      timeZone,
      solves: filtered,
    })
  );
}

async function recomputeAllEventsDayBucket(userID, dayKey) {
  const day = String(dayKey || "").trim();
  if (!day) return null;

  const timeZone = await getUserDayBucketTimeZone(userID);
  const events = await listUserEvents(userID);
  if (!events.length) {
    return deleteDayBucketItem(userID, day);
  }

  const eventItems = await batchGetItems(
    events.map((event) => ({
      PK: `USER#${userID}`,
      SK: buildDayBucketSK({ dayKey: day, event }),
    }))
  );
  const summaries = (eventItems || []).filter((item) => Number(item?.SolveCountTotal || 0) > 0);

  if (!summaries.length) {
    return deleteDayBucketItem(userID, day);
  }

  return writeDayBucketItem(
    buildDayBucketItem({
      userID,
      dayKey: day,
      timeZone,
      sourceBuckets: summaries,
    })
  );
}

async function recomputeDayBucketsForSolveMutation({ userID, oldSolve = null, newSolve = null }) {
  const timeZone = await getUserDayBucketTimeZone(userID);
  const scopes = new Map();
  const addScope = (solve) => {
    if (!solve) return;
    const event = normalizeEvent(solve?.Event);
    const dayKey = getDayKey(solve?.CreatedAt, { timeZone });
    if (!event || !dayKey) return;
    scopes.set(`${event}|${dayKey}`, { event, dayKey });
  };

  addScope(oldSolve);
  addScope(newSolve);

  if (!scopes.size) return [];

  const results = [];
  for (const scope of scopes.values()) {
    const daySolves = await getEventSolvesForLocalDay(userID, scope.event, scope.dayKey, timeZone);
    const mainDaySolves = daySolves.filter(
      (solve) => normalizeSessionID(solve?.SessionID) === "main"
    );

    const eventBucket = daySolves.length
      ? await writeDayBucketItem(
          buildDayBucketItem({
            userID,
            dayKey: scope.dayKey,
            event: scope.event,
            timeZone,
            solves: daySolves,
          })
        )
      : await deleteDayBucketItem(userID, scope.dayKey, scope.event, false);

    const mainBucket = mainDaySolves.length
      ? await writeDayBucketItem(
          buildDayBucketItem({
            userID,
            dayKey: scope.dayKey,
            event: scope.event,
            mainOnly: true,
            timeZone,
            solves: mainDaySolves,
          })
        )
      : await deleteDayBucketItem(userID, scope.dayKey, scope.event, true);

    const allEventsBucket = await recomputeAllEventsDayBucket(userID, scope.dayKey);
    results.push({
      dayKey: scope.dayKey,
      event: scope.event,
      eventBucket,
      mainBucket,
      allEventsBucket,
    });
  }

  return results;
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

async function queryUserItemsByPrefix(userID, prefix) {
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

async function recomputeAllDayBucketsForEvent(userID, event) {
  const ev = normalizeEvent(event);
  if (!ev) return { event: null, daysAffected: [] };

  const timeZone = await getUserDayBucketTimeZone(userID);
  const solves = await getAllSolvesByEvent(ddb, TABLE, userID, ev);
  const groupedAll = new Map();
  const groupedMain = new Map();

  for (const solve of solves) {
    const dayKey = getDayKey(solve?.CreatedAt, { timeZone });
    if (!dayKey) continue;

    const bucket = groupedAll.get(dayKey) || [];
    bucket.push(solve);
    groupedAll.set(dayKey, bucket);

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

  const allDaysAffected = new Set();

  for (const dayKey of groupedAll.keys()) {
    allDaysAffected.add(dayKey);
    await writeDayBucketItem(
      buildDayBucketItem({
        userID,
        dayKey,
        event: ev,
        timeZone,
        solves: groupedAll.get(dayKey),
      })
    );
  }

  for (const item of existingAll) {
    if (String(item?.ScopeVariant || "") === "MAIN") continue;
    const dayKey = String(item?.BucketDay || "");
    if (!dayKey) continue;
    allDaysAffected.add(dayKey);
    if (!groupedAll.has(dayKey)) {
      await deleteDayBucketItem(userID, dayKey, ev);
    }
  }

  for (const dayKey of groupedMain.keys()) {
    allDaysAffected.add(dayKey);
    await writeDayBucketItem(
      buildDayBucketItem({
        userID,
        dayKey,
        event: ev,
        mainOnly: true,
        timeZone,
        solves: groupedMain.get(dayKey),
      })
    );
  }

  for (const item of existingMain) {
    const dayKey = String(item?.BucketDay || "");
    if (!dayKey) continue;
    allDaysAffected.add(dayKey);
    if (!groupedMain.has(dayKey)) {
      await deleteDayBucketItem(userID, dayKey, ev, true);
    }
  }

  for (const dayKey of Array.from(allDaysAffected).sort()) {
    await recomputeAllEventsDayBucket(userID, dayKey);
  }

  return {
    event: ev,
    daysAffected: Array.from(allDaysAffected).sort(),
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PTS-Timer-WCA-Import",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`WCA request failed (${res.status})`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("WCA response was not valid JSON");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWcaResultsPayload(wcaID) {
  const urls = [
    `https://www.worldcubeassociation.org/api/v0/persons/${encodeURIComponent(wcaID)}/results`,
    `https://www.worldcubeassociation.org/api/v0/persons/${encodeURIComponent(wcaID)}/results.json`,
    `https://www.worldcubeassociation.org/api/v0/persons/${encodeURIComponent(wcaID)}`,
    `https://www.worldcubeassociation.org/persons/${encodeURIComponent(wcaID)}.json`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      return await fetchJsonWithTimeout(url);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to fetch WCA results");
}

async function fetchWcaCompetitionPayload(competitionID) {
  const encoded = encodeURIComponent(String(competitionID || "").trim());
  if (!encoded) return null;

  const urls = [
    `https://www.worldcubeassociation.org/api/v0/competitions/${encoded}`,
    `https://www.worldcubeassociation.org/api/v0/competitions/${encoded}.json`,
    `https://www.worldcubeassociation.org/competitions/${encoded}.json`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      return await fetchJsonWithTimeout(url);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    console.warn(`[wca/import] Failed to fetch competition ${competitionID}: ${lastError.message}`);
  }
  return null;
}

function getWcaEventCode(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();

  if (!key) return "";
  if (WCA_EVENT_CODE_MAP[key]) return WCA_EVENT_CODE_MAP[key];

  const upper = String(raw || "").trim().toUpperCase();
  return WCA_SUPPORTED_IMPORT_EVENTS.has(upper) ? upper : "";
}

function getWcaAttemptValues(entry) {
  if (!entry || typeof entry !== "object") return [];

  if (Array.isArray(entry.attempts)) return entry.attempts;
  if (Array.isArray(entry.solves)) return entry.solves;
  if (Array.isArray(entry.results)) return entry.results;

  const values = [];
  for (let i = 1; i <= 5; i++) {
    const key = `value${i}`;
    if (typeof entry[key] !== "undefined" && entry[key] !== null) {
      values.push(entry[key]);
    }
  }
  return values;
}

function parseWcaAttemptValue(input) {
  const rawValue =
    input && typeof input === "object"
      ? input.result ?? input.value ?? input.time ?? input.best ?? null
      : input;
  const n = Number(rawValue);

  if (!Number.isFinite(n) || n === 0) return null;
  if (n < 0) {
    return {
      rawTimeMs: 0,
      penalty: "DNF",
    };
  }

  return {
    rawTimeMs: Math.round(n * 10),
    penalty: null,
  };
}

function parseWcaDateCandidate(input) {
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    const ms = Math.abs(input) >= 1e11 ? Math.round(input) : Math.round(input * 1000);
    const parsed = new Date(ms);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const value = String(input || "").trim();
  if (!value) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return parseWcaDateCandidate(Number(value));

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnlyMatch
    ? new Date(
        Date.UTC(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3]),
          12,
          0,
          0,
          0
        )
      )
    : new Date(value);

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function resolveImportedCreatedAt(input, fallbackMs = Date.now()) {
  const candidates = [
    input?.createdAt,
    input?.created_at,
    input?.CreatedAt,
    input?.datetime,
    input?.DateTime,
    input?.dateTime,
    input?.date,
    input?.Date,
    input?.timestamp,
    input?.timestamp_ms,
    input?.timestampMs,
    input?.ts,
  ];

  for (const candidate of candidates) {
    const parsed = parseWcaDateCandidate(candidate);
    if (parsed) return parsed.toISOString();
  }

  return new Date(fallbackMs).toISOString();
}

function getWcaRoundOrderValue(entry) {
  const rawRound =
    entry?.round_type_id ||
    entry?.roundTypeId ||
    entry?.round?.id ||
    entry?.round ||
    "";
  const round = String(rawRound || "").trim().toLowerCase();
  if (!round) return 0;

  if (round === "f") return 100;
  const match = round.match(/^r(\d+)$/);
  if (match) return Number(match[1]) || 0;
  return 0;
}

function getWcaCompetitionID(entry) {
  const directCompetition =
    entry?.competition?.id || entry?.competition_id || entry?.competitionId || entry?.competition;
  if (typeof directCompetition === "string" && directCompetition.trim()) {
    return directCompetition.trim();
  }

  const rootID = entry?.id;
  const looksLikeCompetitionPayload =
    typeof rootID === "string" &&
    rootID.trim() &&
    (entry?.class === "competition" ||
      entry?.start_date ||
      entry?.startDate ||
      entry?.end_date ||
      entry?.endDate ||
      Array.isArray(entry?.event_ids));

  if (looksLikeCompetitionPayload) {
    return rootID.trim();
  }

  return String(
    ""
  ).trim();
}

function buildWcaCompetitionDateMap(payload) {
  const queue = [payload];
  const seen = new Set();
  const out = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    const competitionID = getWcaCompetitionID(current);
    const start = parseWcaDateCandidate(
      current?.start_date ||
        current?.startDate ||
        current?.competition?.start_date ||
        current?.competition?.startDate
    );
    const end = parseWcaDateCandidate(
      current?.end_date ||
        current?.endDate ||
        current?.competition?.end_date ||
        current?.competition?.endDate
    );
    const single =
      parseWcaDateCandidate(current?.date) ||
      parseWcaDateCandidate(current?.competition_date) ||
      parseWcaDateCandidate(current?.competitionDate) ||
      parseWcaDateCandidate(current?.competition?.date);

    if (competitionID && (start || end || single)) {
      const prior = out.get(competitionID) || {};
      out.set(competitionID, {
        start: prior.start || start || single || null,
        end: prior.end || end || single || start || null,
        single: prior.single || single || start || end || null,
      });
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return out;
}

async function hydrateWcaCompetitionDateMap(payload) {
  const out = buildWcaCompetitionDateMap(payload);
  const queue = [payload];
  const seen = new Set();
  const missingCompetitionIDs = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    const competitionID = getWcaCompetitionID(current);
    if (competitionID && !out.has(competitionID)) {
      missingCompetitionIDs.add(competitionID);
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  for (const competitionID of missingCompetitionIDs) {
    const payload = await fetchWcaCompetitionPayload(competitionID);
    if (!payload) continue;

    const fetchedDates = buildWcaCompetitionDateMap(payload).get(competitionID);
    if (fetchedDates) {
      out.set(competitionID, fetchedDates);
    }
  }

  return out;
}

function getWcaResultDate(entry, competitionDateMap = null) {
  const candidates = [
    entry?.date,
    entry?.start_date,
    entry?.startDate,
    entry?.end_date,
    entry?.endDate,
    entry?.competition_date,
    entry?.competitionDate,
    entry?.round_date,
    entry?.roundDate,
    entry?.competition?.start_date,
    entry?.competition?.startDate,
    entry?.competition?.end_date,
    entry?.competition?.endDate,
    entry?.competition?.date,
    entry?.competition?.schedule?.start_date,
    entry?.competition?.schedule?.startDate,
    entry?.competition?.schedule?.end_date,
    entry?.competition?.schedule?.endDate,
    ...(Array.isArray(entry?.competition?.dates) ? entry.competition.dates : []),
  ];

  for (const candidate of candidates) {
    const parsed = parseWcaDateCandidate(candidate);
    if (parsed) return parsed;
  }

  let start = parseWcaDateCandidate(entry?.competition?.start_date || entry?.competition?.startDate);
  let end = parseWcaDateCandidate(entry?.competition?.end_date || entry?.competition?.endDate);
  if ((!start || !end) && competitionDateMap instanceof Map) {
    const competitionDates = competitionDateMap.get(getWcaCompetitionID(entry));
    if (competitionDates) {
      start = start || competitionDates.start || competitionDates.single || null;
      end = end || competitionDates.end || competitionDates.single || null;
    }
  }
  if (start && end) {
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const spanDays = Math.max(0, Math.round((endUtc - startUtc) / 86400000));
    const roundOrder = getWcaRoundOrderValue(entry);
    const derivedDayOffset = Math.min(spanDays, Math.max(0, roundOrder - 1));
    return new Date(startUtc + derivedDayOffset * 86400000 + 12 * 3600000);
  }

  return null;
}

function getWcaCompetitionLabel(entry) {
  const competition = getWcaCompetitionID(entry);
  const round = entry?.round_type_id || entry?.roundTypeId || entry?.round?.id || entry?.round || "";
  return [competition, round].filter(Boolean).join(" · ");
}

function extractWcaResultEntries(payload, competitionDateMap = null) {
  const resolvedCompetitionDateMap =
    competitionDateMap instanceof Map ? competitionDateMap : buildWcaCompetitionDateMap(payload);
  const queue = [payload];
  const seen = new Set();
  const rows = [];
  const rowSignatures = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    const eventCode = getWcaEventCode(
      current.event_id || current.eventId || current.event?.id || current.event
    );
    const attemptValues = getWcaAttemptValues(current);
    if (eventCode && attemptValues.length) {
      const happenedAt = getWcaResultDate(current, resolvedCompetitionDateMap);
      const signature = JSON.stringify({
        eventCode,
        attemptValues,
        happenedAt: happenedAt?.toISOString?.() || "",
        noteLabel: getWcaCompetitionLabel(current),
      });

      if (!rowSignatures.has(signature)) {
        rowSignatures.add(signature);
        rows.push({
          eventCode,
          attemptValues,
          happenedAt,
          noteLabel: getWcaCompetitionLabel(current),
        });
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return rows;
}

function buildWcaImportSolves(rows, settings = {}) {
  const orderedRows = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aTime = Number(a?.happenedAt?.getTime?.()) || 0;
    const bTime = Number(b?.happenedAt?.getTime?.()) || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.noteLabel || "").localeCompare(String(b?.noteLabel || ""));
  });
  const grouped = new Map();
  const skippedEvents = new Set();
  let timestampSeed = Date.now();

  const solveSource = String(settings?.wcaImportSolveSource || "WCA").trim();
  const sessionByEvent =
    settings?.wcaImportSessionByEvent && typeof settings.wcaImportSessionByEvent === "object"
      ? settings.wcaImportSessionByEvent
      : {};

  for (const row of orderedRows) {
    const eventCode = String(row?.eventCode || "").trim();
    if (!WCA_SUPPORTED_IMPORT_EVENTS.has(eventCode)) {
      if (eventCode) skippedEvents.add(eventCode);
      continue;
    }

    const sessionID = normalizeSessionID(sessionByEvent[eventCode] || "main");
    const bucketKey = `${eventCode}#${sessionID}`;
    const existing = grouped.get(bucketKey) || {
      event: eventCode,
      sessionID,
      solves: [],
    };

    const baseTime =
      row?.happenedAt && Number.isFinite(row.happenedAt.getTime())
        ? row.happenedAt.getTime()
        : timestampSeed;

    const notePrefix = row?.noteLabel ? `WCA import · ${row.noteLabel}` : "WCA import";
    const tags = solveSource ? { SolveSource: solveSource } : {};

    const attempts = Array.isArray(row?.attemptValues) ? row.attemptValues : [];
    for (let i = 0; i < attempts.length; i++) {
      const parsed = parseWcaAttemptValue(attempts[i]);
      if (!parsed) continue;

      existing.solves.push({
        rawTimeMs: parsed.rawTimeMs,
        penalty: parsed.penalty,
        scramble: "",
        note: notePrefix,
        datetime: new Date(baseTime + i * 1000).toISOString(),
        tags,
      });
    }

    timestampSeed = Math.max(timestampSeed + attempts.length + 1, baseTime + attempts.length + 1);
    grouped.set(bucketKey, existing);
  }

  return {
    groups: Array.from(grouped.values()),
    skippedEvents: Array.from(skippedEvents.values()),
  };
}

function buildWcaSolveSignature(input) {
  const createdAt = String(
    input?.datetime || input?.createdAt || input?.created_at || input?.CreatedAt || ""
  ).trim();
  const rawTimeMs = Number(input?.rawTimeMs ?? input?.RawTimeMs);
  const penalty = normalizePenalty(input?.penalty ?? input?.Penalty ?? null) || "";
  const note = String(input?.note ?? input?.Note ?? "").trim();

  return `${createdAt}|${Number.isFinite(rawTimeMs) ? rawTimeMs : "NaN"}|${penalty}|${note}`;
}

async function getSolveItem(userID, solveSKOrTimestamp) {
  const raw = String(solveSKOrTimestamp || "").trim();
  const sk = raw.startsWith("SOLVE#") ? raw : `SOLVE#${raw}`;

  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: sk },
    })
  );

  return out.Item || null;
}

function solveContribution(solve) {
  if (!solve) return null;
  const penalty = normalizePenalty(solve.Penalty);
  const finalMs = getFinalTimeMs(solve);
  return {
    total: 1,
    included: Number.isFinite(finalMs) ? 1 : 0,
    dnf: penalty === "DNF" ? 1 : 0,
    plus2: penalty === "+2" ? 1 : 0,
    sum: Number.isFinite(finalMs) ? finalMs : 0,
  };
}

function applyCoreDelta(prevStats, removeSolve = null, addSolve = null) {
  const next = {
    SolveCountTotal: Number(prevStats.SolveCountTotal || 0),
    SolveCountIncluded: Number(prevStats.SolveCountIncluded || 0),
    DNFCount: Number(prevStats.DNFCount || 0),
    Plus2Count: Number(prevStats.Plus2Count || 0),
    SumFinalTimeMs: Number(prevStats.SumFinalTimeMs || 0),
  };

  const remove = solveContribution(removeSolve);
  if (remove) {
    next.SolveCountTotal -= remove.total;
    next.SolveCountIncluded -= remove.included;
    next.DNFCount -= remove.dnf;
    next.Plus2Count -= remove.plus2;
    next.SumFinalTimeMs -= remove.sum;
  }

  const add = solveContribution(addSolve);
  if (add) {
    next.SolveCountTotal += add.total;
    next.SolveCountIncluded += add.included;
    next.DNFCount += add.dnf;
    next.Plus2Count += add.plus2;
    next.SumFinalTimeMs += add.sum;
  }

  next.SolveCountTotal = Math.max(0, next.SolveCountTotal);
  next.SolveCountIncluded = Math.max(0, next.SolveCountIncluded);
  next.DNFCount = Math.max(0, next.DNFCount);
  next.Plus2Count = Math.max(0, next.Plus2Count);
  next.SumFinalTimeMs = Math.max(0, next.SumFinalTimeMs);
  next.MeanMs =
    next.SolveCountIncluded > 0
      ? Math.round(next.SumFinalTimeMs / next.SolveCountIncluded)
      : null;

  return next;
}

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

function buildSingleRankItemsForSolve(userID, solve) {
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

async function syncSingleRankItemsForMutation({ userID, oldSolve = null, newSolve = null }) {
  const oldItems = buildSingleRankItemsForSolve(userID, oldSolve);
  const newItems = buildSingleRankItemsForSolve(userID, newSolve);

  const oldMap = new Map(oldItems.map((it) => [String(it.SK), it]));
  const newMap = new Map(newItems.map((it) => [String(it.SK), it]));

  const requests = [];

  for (const [oldSK, oldItem] of oldMap.entries()) {
    if (!newMap.has(oldSK)) {
      requests.push({
        DeleteRequest: {
          Key: { PK: oldItem.PK, SK: oldItem.SK },
        },
      });
    }
  }

  for (const [newSK, newItem] of newMap.entries()) {
    if (!oldMap.has(newSK)) {
      requests.push({
        PutRequest: {
          Item: newItem,
        },
      });
    }
  }

  await batchWriteRequestsWithRetry(requests);
}

function buildReplaceSolveAndTagRequests(oldSolveItem, newSolveItem) {
  const oldTagItems = buildSolveTagItems(oldSolveItem);
  const newTagItems = buildSolveTagItems(newSolveItem);
  const keyOf = (it) => `${it.PK}|${it.SK}`;
  const tagFingerprint = (it) =>
    [
      it?.GSI3PK || "",
      it?.GSI3SK || "",
      it?.Event || "",
      it?.SessionID || "",
      it?.TagKey || "",
      it?.TagValue || "",
      it?.SolvePK || "",
      it?.SolveSK || "",
      it?.SolveID || "",
      it?.CreatedAt || "",
    ].join("|");

  const oldSolveKey = keyOf(oldSolveItem);
  const newSolveKey = keyOf(newSolveItem);
  const oldTagMap = new Map(oldTagItems.map((item) => [keyOf(item), item]));
  const newTagMap = new Map(newTagItems.map((item) => [keyOf(item), item]));
  const requests = [];

  if (oldSolveKey !== newSolveKey) {
    requests.push({
      DeleteRequest: {
        Key: { PK: oldSolveItem.PK, SK: oldSolveItem.SK },
      },
    });
  }

  for (const [oldKey, oldItem] of oldTagMap.entries()) {
    if (!newTagMap.has(oldKey)) {
      requests.push({
        DeleteRequest: {
          Key: { PK: oldItem.PK, SK: oldItem.SK },
        },
      });
    }
  }

  requests.push({ PutRequest: { Item: newSolveItem } });

  for (const [newKey, newItem] of newTagMap.entries()) {
    const prior = oldTagMap.get(newKey);
    if (!prior || tagFingerprint(prior) !== tagFingerprint(newItem)) {
      requests.push({ PutRequest: { Item: newItem } });
    }
  }

  return requests;
}

function buildSingleRankMutationRequests({ userID, oldSolve = null, newSolve = null }) {
  const oldItems = buildSingleRankItemsForSolve(userID, oldSolve);
  const newItems = buildSingleRankItemsForSolve(userID, newSolve);

  const oldMap = new Map(oldItems.map((it) => [String(it.SK), it]));
  const newMap = new Map(newItems.map((it) => [String(it.SK), it]));
  const requests = [];

  for (const [oldSK, oldItem] of oldMap.entries()) {
    if (!newMap.has(oldSK)) {
      requests.push({
        DeleteRequest: {
          Key: { PK: oldItem.PK, SK: oldItem.SK },
        },
      });
    }
  }

  for (const [newSK, newItem] of newMap.entries()) {
    if (!oldMap.has(newSK)) {
      requests.push({
        PutRequest: {
          Item: newItem,
        },
      });
    }
  }

  return requests;
}

async function getTopSinglesForScope({ userID, event, sessionID = null, limit = 10 }) {
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;
  const max = Math.max(1, Math.min(50, Number(limit || 10)));
  const prefix = sid
    ? `SINGLERANK#SESSION#${ev}#${sid}#`
    : `SINGLERANK#EVENT#${ev}#`;

  let cursor = undefined;
  const out = [];

  while (out.length < max) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        ConsistentRead: true,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":skPrefix": prefix,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: cursor,
        Limit: Math.min(100, max - out.length),
      })
    );

    const items = res?.Items || [];
    out.push(...items);
    cursor = res?.LastEvaluatedKey;
    if (!cursor) break;
  }

  return out.slice(0, max);
}

function applyTopSinglesToStats(next, topSingles) {
  const items = Array.isArray(topSingles) ? topSingles : [];
  next.TopSingles10 = items.map((it) => ({
    SolveSK: it?.SolveSK || null,
    FinalTimeMs: Number.isFinite(Number(it?.FinalTimeMs)) ? Number(it.FinalTimeMs) : null,
    CreatedAt: it?.CreatedAt || null,
    SessionID: it?.SessionID || null,
  }));

  const best = items[0] || null;
  next.BestSingleMs =
    best && Number.isFinite(Number(best.FinalTimeMs)) ? Number(best.FinalTimeMs) : null;
  next.BestSingleSolveSK = best?.SolveSK || null;
  next.BestSingleAt = best?.CreatedAt || null;
}

function insertSolveIntoOrderedArray(solves, solve, sessionID = null) {
  const input = Array.isArray(solves) ? [...solves] : [];
  if (!solve) return input;

  const key = getScopeSortKeyFromSolve(solve, sessionID);
  let idx = input.findIndex((item) => getScopeSortKeyFromSolve(item, sessionID) > key);
  if (idx === -1) idx = input.length;
  input.splice(idx, 0, solve);
  return input;
}


function normalizeWindowCandidates(candidates, config, k = BEST_CANDIDATES_K) {
  const input = Array.isArray(candidates) ? candidates : [];
  const clean = [];
  for (const c of input) {
    const valueMs = Number(c?.ValueMs);
    const start = String(c?.StartSolveSK || "");
    const members = Array.isArray(c?.MemberSolveSKs)
      ? c.MemberSolveSKs.map((x) => String(x || "")).filter(Boolean)
      : [];
    if (!Number.isFinite(valueMs)) continue;
    if (!start) continue;
    if (members.length !== config.windowSize) continue;
    clean.push({
      ValueMs: Math.round(valueMs),
      StartSolveSK: start,
      MemberSolveSKs: members,
    });
  }

  clean.sort(
    (a, b) => a.ValueMs - b.ValueMs || String(a.StartSolveSK).localeCompare(String(b.StartSolveSK))
  );
  return clean.slice(0, Math.max(1, Number(k || BEST_CANDIDATES_K)));
}

function mergeWindowCandidates({
  prevCandidates,
  nextCandidates,
  config,
  touchedSolveSKs = new Set(),
  k = BEST_CANDIDATES_K,
}) {
  const merged = new Map();

  for (const c of normalizeWindowCandidates(prevCandidates, config, k)) {
    const touches = c.MemberSolveSKs.some((sk) => touchedSolveSKs.has(sk));
    if (touches) continue;
    merged.set(c.StartSolveSK, c);
  }

  for (const c of normalizeWindowCandidates(nextCandidates, config, k)) {
    merged.set(c.StartSolveSK, c);
  }

  const out = Array.from(merged.values());
  out.sort(
    (a, b) => a.ValueMs - b.ValueMs || String(a.StartSolveSK).localeCompare(String(b.StartSolveSK))
  );
  return out.slice(0, Math.max(1, Number(k || BEST_CANDIDATES_K)));
}

function maybePreserveBestForAddOnly(next, prev, { removeSolve = null, addSolve = null } = {}) {
  if (removeSolve || !addSolve) return;

  for (const config of CACHED_WINDOW_CONFIGS) {
    const prevValue = Number(prev?.[config.valueField]);
    const nextValue = Number(next?.[config.valueField]);
    if (Number.isFinite(prevValue) && (!Number.isFinite(nextValue) || nextValue > prevValue)) {
      next[config.valueField] = prevValue;
      next[config.startField] = prev?.[config.startField] || next?.[config.startField] || null;
    }
  }
}

function getScopeQueryParts({ userID, event, sessionID = null }) {
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;

  if (sid) {
    return {
      indexName: "GSI1",
      pkAttr: "GSI1PK",
      skAttr: "GSI1SK",
      pkValue: `SESSION#${userID}#${ev}#${sid}`,
    };
  }

  return {
    indexName: "GSI2",
    pkAttr: "GSI2PK",
    skAttr: "GSI2SK",
    pkValue: `EVENT#${userID}#${ev}`,
  };
}

function getScopeSortKeyFromSolve(solve, sessionID = null) {
  return sessionID ? String(solve?.GSI1SK || "") : String(solve?.GSI2SK || "");
}

function getTagScopeQueryParts({ userID, tagKey, tagValue, event, sessionID = null }) {
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();
  const tagValueNorm = normalizeTagIndexValue(value);
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;
  const sparseConfig = getSparseTagIndexConfig(key);

  if (!userID || !key || !tagValueNorm || !ev) return null;

  const rangePrefix = sid ? `${ev}#${sid}#` : `${ev}#`;
  const rangeStart = rangePrefix;
  const rangeEnd = `${rangePrefix}\uffff`;

  if (sparseConfig) {
    const pkValue = buildSparseTagIndexPK(key, userID, value);
    if (!pkValue) return null;
    return {
      indexName: sparseConfig.indexName,
      pkAttr: sparseConfig.attr,
      skAttr: "SolveTagSK",
      pkValue,
      hydrate: false,
      event: ev,
      sessionID: sid,
      rangeStart,
      rangeEnd,
    };
  }

  return {
    indexName: "GSI3",
    pkAttr: "GSI3PK",
    skAttr: "GSI3SK",
    pkValue: `TAG#${userID}#${key}#${tagValueNorm}`,
    hydrate: true,
    event: ev,
    sessionID: sid,
    rangeStart,
    rangeEnd,
  };
}

function getTagScopeSortKeyFromSolve(solve) {
  return buildSolveTagSK(solve?.Event, solve?.SessionID, solve?.CreatedAt, solve?.SolveID);
}

async function queryTagScopeItems({
  userID,
  event,
  sessionID = null,
  tagKey,
  tagValue,
  comparator = null,
  anchorSortKey = null,
  scanIndexForward = true,
  limit = 100,
}) {
  const scope = getTagScopeQueryParts({ userID, event, sessionID, tagKey, tagValue });
  if (!scope) return [];

  let keyConditionExpression = `${scope.pkAttr} = :pk AND ${scope.skAttr} BETWEEN :from AND :to`;
  const expressionAttributeValues = {
    ":pk": scope.pkValue,
    ":from": scope.rangeStart,
    ":to": scope.rangeEnd,
  };

  if (comparator && anchorSortKey) {
    if (comparator === "<" || comparator === "<=") {
      expressionAttributeValues[":to"] = anchorSortKey;
    } else if (comparator === ">" || comparator === ">=") {
      expressionAttributeValues[":from"] = anchorSortKey;
    }
  }

  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: scope.indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: scanIndexForward,
      Limit: Math.max(1, Math.min(1000, Number(limit || 100))),
    })
  );

  const items = out?.Items || [];
  if (!scope.hydrate || items.length === 0) {
    if (comparator === "<" || comparator === "<=" || comparator === ">" || comparator === ">=") {
      const cmp = String(anchorSortKey || "");
      return items.filter((solve) => {
        const sortKey = getTagScopeSortKeyFromSolve(solve);
        if (!cmp) return true;
        if (comparator === "<") return sortKey < cmp;
        if (comparator === "<=") return sortKey <= cmp;
        if (comparator === ">") return sortKey > cmp;
        return sortKey >= cmp;
      });
    }
    return items;
  }

  const solveKeys = items
    .map((item) => ({ PK: item?.SolvePK, SK: item?.SolveSK }))
    .filter((item) => item.PK && item.SK);
  const solves = await batchGetItems(solveKeys);
  const solveMap = new Map((solves || []).map((solve) => [`${solve.PK}|${solve.SK}`, solve]));

  const hydrated = items
    .map((item) => solveMap.get(`${item?.SolvePK}|${item?.SolveSK}`))
    .filter(Boolean);

  if (comparator === "<" || comparator === ">" || comparator === ">=" || comparator === "<=") {
    const cmp = String(anchorSortKey || "");
    return hydrated.filter((solve) => {
      const sortKey = getTagScopeSortKeyFromSolve(solve);
      if (!cmp) return true;
      if (comparator === "<") return sortKey < cmp;
      if (comparator === "<=") return sortKey <= cmp;
      if (comparator === ">") return sortKey > cmp;
      return sortKey >= cmp;
    });
  }

  return hydrated;
}

async function queryTagScopeNeighborhood({
  userID,
  event,
  sessionID = null,
  tagKey,
  tagValue,
  anchorSortKey,
  beforeCount,
  afterCount,
  includeAnchor,
}) {
  const beforeLimit = Math.max(0, Number(beforeCount || 0));
  const afterLimit = Math.max(0, Number(afterCount || 0));
  const before = [];
  const after = [];

  if (beforeLimit > 0) {
    const items = await queryTagScopeItems({
      userID,
      event,
      sessionID,
      tagKey,
      tagValue,
      comparator: "<",
      anchorSortKey,
      scanIndexForward: false,
      limit: beforeLimit,
    });
    before.push(...items.reverse());
  }

  if (afterLimit > 0) {
    const items = await queryTagScopeItems({
      userID,
      event,
      sessionID,
      tagKey,
      tagValue,
      comparator: includeAnchor ? ">=" : ">",
      anchorSortKey,
      scanIndexForward: true,
      limit: afterLimit,
    });
    after.push(...items);
  }

  return { before, after };
}

async function queryScopeNeighborhood({
  userID,
  event,
  sessionID = null,
  anchorSortKey,
  beforeCount,
  afterCount,
  includeAnchor,
}) {
  const scope = getScopeQueryParts({ userID, event, sessionID });
  const beforeLimit = Math.max(0, Number(beforeCount || 0));
  const afterLimit = Math.max(0, Number(afterCount || 0));
  const before = [];
  const after = [];

  if (beforeLimit > 0) {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: scope.indexName,
        KeyConditionExpression: `${scope.pkAttr} = :pk AND ${scope.skAttr} < :anchor`,
        ExpressionAttributeValues: {
          ":pk": scope.pkValue,
          ":anchor": anchorSortKey,
        },
        ScanIndexForward: false,
        Limit: beforeLimit,
      })
    );
    before.push(...((out.Items || []).reverse()));
  }

  if (afterLimit > 0) {
    const comparator = includeAnchor ? ">=" : ">";
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: scope.indexName,
        KeyConditionExpression: `${scope.pkAttr} = :pk AND ${scope.skAttr} ${comparator} :anchor`,
        ExpressionAttributeValues: {
          ":pk": scope.pkValue,
          ":anchor": anchorSortKey,
        },
        ScanIndexForward: true,
        Limit: afterLimit,
      })
    );
    after.push(...(out.Items || []));
  }

  return { before, after };
}

function buildBoundaryWindowCandidates(solves, config, boundaryIndex) {
  const input = Array.isArray(solves) ? solves : [];
  const out = [];

  for (let i = 0; i <= input.length - config.windowSize; i++) {
    const endExclusive = i + config.windowSize;
    if (!(i < boundaryIndex && endExclusive > boundaryIndex)) continue;
    out.push(...buildTopWindowCandidatesFromSolves(input.slice(i, endExclusive), config, 1));
  }

  return out;
}

function buildAnchorWindowCandidates(solves, config, anchorSolveSK) {
  const input = Array.isArray(solves) ? solves : [];
  const anchor = String(anchorSolveSK || "");
  if (!anchor) return [];

  const out = [];
  for (let i = 0; i <= input.length - config.windowSize; i++) {
    const slice = input.slice(i, i + config.windowSize);
    const memberSolveSKs = slice.map((s) => String(s?.SK || ""));
    if (!memberSolveSKs.includes(anchor)) continue;
    out.push(...buildTopWindowCandidatesFromSolves(slice, config, 1));
  }

  return out;
}

function dedupeWindowCandidates(candidates, config) {
  const merged = new Map();
  for (const candidate of normalizeWindowCandidates(candidates, config, Number.MAX_SAFE_INTEGER)) {
    const existing = merged.get(candidate.StartSolveSK);
    if (!existing || candidate.ValueMs < existing.ValueMs) {
      merged.set(candidate.StartSolveSK, candidate);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.ValueMs - b.ValueMs || String(a.StartSolveSK).localeCompare(String(b.StartSolveSK))
  );
}

async function getLastSolveAtForScope({ userID, event, sessionID = null }) {
  const items = sessionID
    ? await getLastNSolvesBySession(ddb, TABLE, userID, event, sessionID, 1)
    : await getLastNSolvesByEvent(ddb, TABLE, userID, event, 1);
  return items[0]?.CreatedAt || null;
}

async function getLastSolveAtForTagScope({
  userID,
  event,
  sessionID = null,
  tagKey,
  tagValue,
}) {
  const items = await getLastNSolvesByTag(
    ddb,
    TABLE,
    userID,
    tagKey,
    tagValue,
    { event, sessionID: sessionID || "" },
    1
  );
  return items[0]?.CreatedAt || null;
}

async function getOrBuildStatsBase({
  userID,
  event,
  sessionID = null,
  itemType,
  sk,
}) {
  const existingOut = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: sk },
      ConsistentRead: true,
    })
  );

  if (existingOut.Item) return existingOut.Item;

  const empty = {
    __synthetic: true,
    PK: `USER#${userID}`,
    SK: sk,
    ItemType: itemType,
    Event: event,
    UpdatedAt: nowIso(),
    stale: false,
    ...buildStatsFromSolves([]),
  };
  if (sessionID) empty.SessionID = sessionID;
  return empty;
}

async function applyIncrementalStatsForScope({
  userID,
  event,
  sessionID = null,
  removeSolve = null,
  addSolve = null,
}) {
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;
  const isSession = !!sid;
  const sk = isSession ? `SESSIONSTATS#${ev}#${sid}` : `EVENTSTATS#${ev}`;
  const itemType = isSession ? "SESSIONSTATS" : "EVENTSTATS";

  const prev = await getOrBuildStatsBase({
    userID,
    event: ev,
    sessionID: sid,
    itemType,
    sk,
  });

  const hasWindowCache = CACHED_WINDOW_CONFIGS.every((config) =>
    Array.isArray(prev?.[config.candidatesField])
  );
  if (prev.__synthetic || !hasWindowCache) {
    return sid
      ? recomputeSessionStats(ddb, TABLE, userID, ev, sid)
      : recomputeEventStats(ddb, TABLE, userID, ev);
  }

  const core = applyCoreDelta(prev, removeSolve, addSolve);
  const touchedSolveSKs = new Set(
    [String(removeSolve?.SK || ""), String(addSolve?.SK || "")].filter(Boolean)
  );
  const maxWindowSize = CACHED_WINDOW_CONFIGS.reduce(
    (max, config) => Math.max(max, Number(config.windowSize || 0)),
    0
  );
  const anchorSolve = addSolve || null;
  const anchorSortKey = anchorSolve
    ? getScopeSortKeyFromSolve(anchorSolve, sid)
    : getScopeSortKeyFromSolve(removeSolve, sid);

  const [topSingles, lastSolveAt, neighborhood] = await Promise.all([
    getTopSinglesForScope({
      userID,
      event: ev,
      sessionID: isSession ? sid : null,
      limit: 10,
    }),
    getLastSolveAtForScope({ userID, event: ev, sessionID: isSession ? sid : null }),
    anchorSortKey
      ? queryScopeNeighborhood({
          userID,
          event: ev,
          sessionID: sid,
          anchorSortKey,
          beforeCount: Math.max(0, maxWindowSize - 1),
          afterCount: addSolve ? maxWindowSize : Math.max(0, maxWindowSize - 1),
          includeAnchor: !!addSolve,
        })
      : Promise.resolve({ before: [], after: [] }),
  ]);

  const next = {
    ...prev,
    ...core,
    UpdatedAt: nowIso(),
    LastSolveAt: lastSolveAt,
    LastRecomputedAt: nowIso(),
    stale: false,
  };

  applyTopSinglesToStats(next, topSingles);

  const combinedNeighborhood = [...(neighborhood?.before || []), ...(neighborhood?.after || [])];
  const boundaryIndex = (neighborhood?.before || []).length;

  for (const config of CACHED_WINDOW_CONFIGS) {
    const localCandidates = addSolve
      ? buildAnchorWindowCandidates(combinedNeighborhood, config, addSolve.SK)
      : buildBoundaryWindowCandidates(combinedNeighborhood, config, boundaryIndex);

    const mergedCandidates = mergeWindowCandidates({
      prevCandidates: prev?.[config.candidatesField],
      nextCandidates: dedupeWindowCandidates(localCandidates, config),
      config,
      touchedSolveSKs,
      k: 10,
    });

    next[config.candidatesField] = mergedCandidates;
    next[config.valueField] = mergedCandidates[0]?.ValueMs ?? null;
    next[config.startField] = mergedCandidates[0]?.StartSolveSK || null;

    const shouldExist = Number(core.SolveCountTotal || 0) >= Number(config.windowSize || 0);
    if (shouldExist && mergedCandidates.length === 0) {
      return sid
        ? recomputeSessionStats(ddb, TABLE, userID, ev, sid)
        : recomputeEventStats(ddb, TABLE, userID, ev);
    }
  }

  maybePreserveBestForAddOnly(next, prev, { removeSolve, addSolve });

  await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
  return next;
}

async function getOrBuildTagStatsBase({
  userID,
  event,
  sessionID = null,
  tagKey,
  tagValue,
}) {
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();
  const sk = buildTagStatsSK(ev, sid, key, value);

  const existingOut = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: sk },
      ConsistentRead: true,
    })
  );

  if (existingOut.Item) return existingOut.Item;

  const empty = {
    __synthetic: true,
    PK: `USER#${userID}`,
    SK: sk,
    ItemType: "TAGSTATS",
    Event: ev,
    TagKey: key,
    TagValue: value,
    TagValueNorm: normalizeTagIndexValue(value),
    UpdatedAt: nowIso(),
    stale: false,
    ...buildStatsFromSolves([]),
  };
  if (sid) empty.SessionID = sid;
  return empty;
}

async function applyIncrementalTagStatsForScope({
  userID,
  event,
  sessionID = null,
  tagKey,
  tagValue,
  removeSolves = [],
  addSolves = [],
}) {
  const ev = normalizeEvent(event);
  const sid = sessionID ? normalizeSessionID(sessionID) : null;
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();
  const tagValueNorm = normalizeTagIndexValue(value);

  if (!userID || !ev || !key || !tagValueNorm) return null;

  const prev = await getOrBuildTagStatsBase({
    userID,
    event: ev,
    sessionID: sid,
    tagKey: key,
    tagValue: value,
  });

  const hasWindowCache = CACHED_WINDOW_CONFIGS.every((config) =>
    Array.isArray(prev?.[config.candidatesField])
  );
  if (prev.__synthetic || !hasWindowCache) {
    return recomputeTagStats(ddb, TABLE, userID, ev, sid, key, value);
  }

  const removes = (Array.isArray(removeSolves) ? removeSolves : []).filter(Boolean);
  const adds = (Array.isArray(addSolves) ? addSolves : []).filter(Boolean);

  if (
    removes.some((solve) => String(solve?.SK || "") === String(prev?.BestSingleSolveSK || "")) ||
    removes.some((solve) => String(solve?.SK || "") === String(prev?.WorstSingleSolveSK || ""))
  ) {
    return recomputeTagStats(ddb, TABLE, userID, ev, sid, key, value);
  }

  let core = prev;
  for (const solve of removes) core = applyCoreDelta(core, solve, null);
  for (const solve of adds) core = applyCoreDelta(core, null, solve);

  const touchedSolveSKs = new Set(
    [...removes, ...adds].map((solve) => String(solve?.SK || "")).filter(Boolean)
  );
  const maxWindowSize = CACHED_WINDOW_CONFIGS.reduce(
    (max, config) => Math.max(max, Number(config.windowSize || 0)),
    0
  );

  const anchors = [
    ...removes.map((solve) => ({ type: "remove", solve })),
    ...adds.map((solve) => ({ type: "add", solve })),
  ];

  const [lastSolveAt, neighborhoods] = await Promise.all([
    getLastSolveAtForTagScope({
      userID,
      event: ev,
      sessionID: sid,
      tagKey: key,
      tagValue: value,
    }),
    Promise.all(
      anchors.map(async ({ type, solve }) => {
        const anchorSortKey = getTagScopeSortKeyFromSolve(solve);
        if (!anchorSortKey) return { type, solve, before: [], after: [] };
        const neighborhood = await queryTagScopeNeighborhood({
          userID,
          event: ev,
          sessionID: sid,
          tagKey: key,
          tagValue: value,
          anchorSortKey,
          beforeCount: Math.max(0, maxWindowSize - 1),
          afterCount: type === "add" ? maxWindowSize : Math.max(0, maxWindowSize - 1),
          includeAnchor: type === "add",
        });
        return { type, solve, ...neighborhood };
      })
    ),
  ]);

  const next = {
    ...prev,
    ...core,
    UpdatedAt: nowIso(),
    LastSolveAt: lastSolveAt,
    LastRecomputedAt: nowIso(),
    stale: false,
  };

  if (next.SolveCountIncluded <= 0) {
    next.BestSingleMs = null;
    next.BestSingleSolveSK = null;
    next.BestSingleAt = null;
    next.WorstSingleMs = null;
    next.WorstSingleSolveSK = null;
  }

  for (const solve of adds) {
    const finalMs = getFinalTimeMs(solve);
    if (!Number.isFinite(finalMs)) continue;

    if (
      next.BestSingleMs == null ||
      finalMs < next.BestSingleMs ||
      (finalMs === next.BestSingleMs &&
        String(solve?.CreatedAt || "") < String(next.BestSingleAt || ""))
    ) {
      next.BestSingleMs = finalMs;
      next.BestSingleSolveSK = solve?.SK || null;
      next.BestSingleAt = solve?.CreatedAt || null;
    }

    if (next.WorstSingleMs == null || finalMs > next.WorstSingleMs) {
      next.WorstSingleMs = finalMs;
      next.WorstSingleSolveSK = solve?.SK || null;
    }
  }

  for (const config of CACHED_WINDOW_CONFIGS) {
    const localCandidates = [];

    for (const neighborhood of neighborhoods) {
      const combined = [...(neighborhood.before || []), ...(neighborhood.after || [])];
      if (neighborhood.type === "add") {
        localCandidates.push(
          ...buildAnchorWindowCandidates(combined, config, neighborhood.solve?.SK)
        );
      } else {
        localCandidates.push(
          ...buildBoundaryWindowCandidates(combined, config, (neighborhood.before || []).length)
        );
      }
    }

    const mergedCandidates = mergeWindowCandidates({
      prevCandidates: prev?.[config.candidatesField],
      nextCandidates: dedupeWindowCandidates(localCandidates, config),
      config,
      touchedSolveSKs,
      k: 10,
    });

    next[config.candidatesField] = mergedCandidates;
    next[config.valueField] = mergedCandidates[0]?.ValueMs ?? null;
    next[config.startField] = mergedCandidates[0]?.StartSolveSK || null;

    const shouldExist = Number(core.SolveCountTotal || 0) >= Number(config.windowSize || 0);
    if (shouldExist && mergedCandidates.length === 0) {
      return recomputeTagStats(ddb, TABLE, userID, ev, sid, key, value);
    }
  }

  const item = {
    PK: `USER#${userID}`,
    SK: buildTagStatsSK(ev, sid, key, value),
    ItemType: "TAGSTATS",
    Event: ev,
    TagKey: key,
    TagValue: value,
    TagValueNorm: tagValueNorm,
    UpdatedAt: nowIso(),
    stale: false,
    ...next,
  };
  if (sid) item.SessionID = sid;

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

function addTagScopeMutation(plan, solve, direction) {
  if (!solve) return;
  const event = normalizeEvent(solve.Event);
  const sessionID = normalizeSessionID(solve.SessionID);

  for (const pair of getSolveTagPairsFromItem(solve)) {
    const tagKey = String(pair?.key || "").trim();
    const tagValue = String(pair?.value || "").trim();
    if (!event || !sessionID || !tagKey || !tagValue) continue;

    const scopes = [
      { scopeKey: `TS|${event}|${sessionID}|${tagKey}|${tagValue}`, event, sessionID, tagKey, tagValue },
      { scopeKey: `TE|${event}|${tagKey}|${tagValue}`, event, sessionID: null, tagKey, tagValue },
    ];

    for (const scope of scopes) {
      const existing = plan.get(scope.scopeKey) || {
        event: scope.event,
        sessionID: scope.sessionID,
        tagKey: scope.tagKey,
        tagValue: scope.tagValue,
        removeSolves: [],
        addSolves: [],
      };
      if (direction === "remove") existing.removeSolves.push(solve);
      if (direction === "add") existing.addSolves.push(solve);
      plan.set(scope.scopeKey, existing);
    }
  }
}

async function applySolveMutationStats({ userID, oldSolve = null, newSolve = null }) {
  if (oldSolve && newSolve) {
    const sameScope =
      normalizeEvent(oldSolve.Event) === normalizeEvent(newSolve.Event) &&
      normalizeSessionID(oldSolve.SessionID) === normalizeSessionID(newSolve.SessionID);
    const samePenalty =
      normalizePenalty(oldSolve.Penalty) === normalizePenalty(newSolve.Penalty);
    const sameFinal = getFinalTimeMs(oldSolve) === getFinalTimeMs(newSolve);
    const tagFingerprint = (solve) =>
      getSolveTagPairsFromItem(solve)
        .map((pair) => `${String(pair?.key || "").trim()}|${String(pair?.value || "").trim()}`)
        .sort((a, b) => a.localeCompare(b))
        .join("||");
    const sameTags = tagFingerprint(oldSolve) === tagFingerprint(newSolve);
    if (sameScope && samePenalty && sameFinal && sameTags) return;
  }

  const plan = new Map();

  const addScopeMutation = ({ scope, event, sessionID = null, removeSolve = null, addSolve = null }) => {
    if (!event) return;
    const key = scope === "session" ? `S|${event}|${sessionID}` : `E|${event}`;
    const prev = plan.get(key) || {
      scope,
      event,
      sessionID,
      removeSolve: null,
      addSolve: null,
    };
    if (removeSolve) prev.removeSolve = removeSolve;
    if (addSolve) prev.addSolve = addSolve;
    plan.set(key, prev);
  };

  if (oldSolve) {
    addScopeMutation({
      scope: "session",
      event: oldSolve.Event,
      sessionID: oldSolve.SessionID,
      removeSolve: oldSolve,
    });
    addScopeMutation({ scope: "event", event: oldSolve.Event, removeSolve: oldSolve });
  }

  if (newSolve) {
    addScopeMutation({
      scope: "session",
      event: newSolve.Event,
      sessionID: newSolve.SessionID,
      addSolve: newSolve,
    });
    addScopeMutation({ scope: "event", event: newSolve.Event, addSolve: newSolve });
  }

  const jobs = [];
  for (const entry of plan.values()) {
    jobs.push(
      applyIncrementalStatsForScope({
        userID,
        event: entry.event,
        sessionID: entry.scope === "session" ? entry.sessionID : null,
        removeSolve: entry.removeSolve,
        addSolve: entry.addSolve,
      })
    );
  }

  const tagScopeMutations = new Map();
  addTagScopeMutation(tagScopeMutations, oldSolve, "remove");
  addTagScopeMutation(tagScopeMutations, newSolve, "add");

  for (const entry of tagScopeMutations.values()) {
    jobs.push(
      applyIncrementalTagStatsForScope({
        userID,
        event: entry.event,
        sessionID: entry.sessionID,
        tagKey: entry.tagKey,
        tagValue: entry.tagValue,
        removeSolves: entry.removeSolves,
        addSolves: entry.addSolves,
      })
    );
  }

  await Promise.all(jobs);
}

function runInBackground(label, fn) {
  setImmediate(async () => {
    const started = Date.now();
    try {
      await fn();
      console.log(`${label} completed in ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`${label} failed:`, err);
    }
  });
}

async function finalizeImportJobInBackground(userID, jobID) {
  const current = await getImportJobItem(userID, jobID);
  if (!current) throw new Error("Import job not found");

  const affectedSessions = Array.isArray(current.AffectedSessions) ? current.AffectedSessions : [];
  const affectedEvents = Array.isArray(current.AffectedEvents) ? current.AffectedEvents : [];

  const recomputeState = {
    sessionsCompleted: 0,
    totalSessions: affectedSessions.length,
    eventsCompleted: 0,
    totalEvents: affectedEvents.length,
  };

  const started = {
    ...current,
    Status: "FINALIZING",
    Error: null,
    FinalizedAt: nowIso(),
    UpdatedAt: nowIso(),
    Recompute: recomputeState,
  };
  await putImportJobItem(started);

  try {
    for (const rawScope of affectedSessions) {
      const latest = await getImportJobItem(userID, jobID);
      if (normalizeImportJobStatus(latest?.Status) === "CANCELED") return;
      const scope = parseImportSessionScopeKey(rawScope);
      if (!scope) continue;
      await recomputeSessionStats(ddb, TABLE, userID, scope.event, scope.sessionID);
      recomputeState.sessionsCompleted += 1;
      await putImportJobItem({
        ...(await getImportJobItem(userID, jobID)),
        Recompute: { ...recomputeState },
        UpdatedAt: nowIso(),
      });
    }

    for (const event of affectedEvents) {
      const latest = await getImportJobItem(userID, jobID);
      if (normalizeImportJobStatus(latest?.Status) === "CANCELED") return;
      const ev = normalizeEvent(event);
      if (!ev) continue;
      await recomputeEventStats(ddb, TABLE, userID, ev);
      await recomputeAllDayBucketsForEvent(userID, ev);
      recomputeState.eventsCompleted += 1;
      await putImportJobItem({
        ...(await getImportJobItem(userID, jobID)),
        Recompute: { ...recomputeState },
        UpdatedAt: nowIso(),
      });
    }

    const finished = await getImportJobItem(userID, jobID);
    await putImportJobItem({
      ...(finished || started),
      Status: "COMPLETED",
      Error: null,
      CompletedAt: nowIso(),
      UpdatedAt: nowIso(),
      Recompute: { ...recomputeState },
    });
  } catch (err) {
    const failed = await getImportJobItem(userID, jobID);
    await putImportJobItem({
      ...(failed || started),
      Status: "FAILED",
      Error: err?.message || "Import finalize failed",
      FailedAt: nowIso(),
      UpdatedAt: nowIso(),
      Recompute: { ...recomputeState },
    });
    throw err;
  }
}

async function batchGetItems(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return [];

  const out = [];
  const chunks = [];
  for (let i = 0; i < keys.length; i += 100) {
    chunks.push(keys.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    let requestKeys = chunk;

    while (requestKeys.length > 0) {
      const res = await ddb.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE]: {
              Keys: requestKeys,
            },
          },
        })
      );

      const got = res?.Responses?.[TABLE] || [];
      out.push(...got);

      const unprocessed = res?.UnprocessedKeys?.[TABLE]?.Keys || [];
      requestKeys = unprocessed;

      if (requestKeys.length > 0) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }

  return out;
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

async function deleteItemsByKey(keys) {
  const unique = new Map();

  for (const key of keys || []) {
    const pk = String(key?.PK || "").trim();
    const sk = String(key?.SK || "").trim();
    if (!pk || !sk) continue;
    unique.set(`${pk}|${sk}`, { PK: pk, SK: sk });
  }

  const requests = Array.from(unique.values()).map((key) => ({
    DeleteRequest: {
      Key: key,
    },
  }));

  return batchWriteRequestsWithRetry(requests);
}

async function getCustomEventItem(userID, event) {
  const ev = normalizeEvent(event);
  if (!userID || !ev) return null;

  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: `CUSTOMEVENT#${ev}` },
      ConsistentRead: true,
    })
  );

  return out.Item || null;
}

function buildEmptySessionStatsItem(userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const base = buildStatsFromSolves([]);

  return {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${ev}#${sid}`,
    ItemType: "SESSIONSTATS",
    Event: ev,
    SessionID: sid,
    UpdatedAt: nowIso(),
    stale: false,
    ...base,
  };
}

async function ensureSessionStatsExists(userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);

  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        PK: `USER#${userID}`,
        SK: `SESSIONSTATS#${ev}#${sid}`,
      },
    })
  );

  if (existing?.Item) return existing.Item;

  const item = buildEmptySessionStatsItem(userID, ev, sid);
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

function normalizeConversationType(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "GROUP") return "GROUP";
  return "DM";
}

function normalizeMemberIDs(memberIDs) {
  return Array.from(
    new Set(
      (Array.isArray(memberIDs) ? memberIDs : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
}

function parseLegacyDmConversationID(conversationID) {
  const raw = String(conversationID || "").trim();
  const parts = raw.split("#").map((part) => String(part || "").trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const sorted = [...parts].sort();
  if (sorted.join("#") !== raw) return null;
  return sorted;
}

function buildConversationMetaItem({
  conversationID,
  conversationType,
  memberIDs,
  name = "",
  createdBy = "",
  createdAt,
}) {
  const ts = String(createdAt || nowIso());
  const type = normalizeConversationType(conversationType);
  const members = normalizeMemberIDs(memberIDs);
  const item = {
    PK: `CONVO#${conversationID}`,
    SK: "META",
    ItemType: "CONVERSATION",
    ConversationID: conversationID,
    ConversationType: type,
    Name: String(name || "").trim(),
    CreatedBy: String(createdBy || members[0] || "").trim() || null,
    MemberCount: members.length,
    CreatedAt: ts,
    UpdatedAt: ts,
    LastMessageAt: null,
    LastMessagePreview: "",
    SharedStats: {
      TotalSolves: 0,
      TotalWins: 0,
      TotalSessions: 0,
      LastSharedAt: null,
      ByEvent: {},
      ByUser: {},
    },
  };

  if (type === "DM") {
    item.DMKey = [...members].sort().join("#");
  }

  return item;
}

function buildConversationMemberItems(conversationID, memberIDs, conversationType, createdAt) {
  const ts = String(createdAt || nowIso());
  const type = normalizeConversationType(conversationType);
  return normalizeMemberIDs(memberIDs).map((userID) => ({
    PK: `CONVO#${conversationID}`,
    SK: `MEMBER#${userID}`,
    ItemType: "CONVOMEMBER",
    ConversationID: conversationID,
    ConversationType: type,
    UserID: userID,
    Role: type === "GROUP" ? "MEMBER" : "PARTICIPANT",
    JoinedAt: ts,
    CreatedAt: ts,
    UpdatedAt: ts,
  }));
}

function buildUserConversationItems({
  conversationID,
  conversationType,
  memberIDs,
  name = "",
  createdAt,
}) {
  const ts = String(createdAt || nowIso());
  const type = normalizeConversationType(conversationType);
  const members = normalizeMemberIDs(memberIDs);

  return members.map((userID) => {
    const otherMemberIDs = members.filter((id) => id !== userID);
    const displayName =
      type === "DM" ? otherMemberIDs[0] || userID : String(name || "").trim() || conversationID;

    return {
      PK: `USER#${userID}`,
      SK: `CONVO#${conversationID}`,
      ItemType: "USERCONVO",
      ConversationID: conversationID,
      ConversationType: type,
      Name: String(name || "").trim(),
      DisplayName: displayName,
      OtherUserID: type === "DM" ? otherMemberIDs[0] || null : null,
      MemberIDs: members,
      CreatedAt: ts,
      UpdatedAt: ts,
      LastMessageAt: null,
      LastMessagePreview: "",
      SharedStats: {
        TotalSolves: 0,
        TotalWins: 0,
        TotalSessions: 0,
        LastSharedAt: null,
        ByEvent: {},
        ByUser: {},
      },
    };
  });
}

function createEmptySharedStats() {
  return {
    TotalSolves: 0,
    TotalWins: 0,
    TotalSessions: 0,
    LastSharedAt: null,
    ByEvent: {},
    ByUser: {},
  };
}

function normalizeSharedStats(stats) {
  const safe = stats && typeof stats === "object" ? stats : {};
  return {
    TotalSolves: Number(safe.TotalSolves || 0),
    TotalWins: Number(safe.TotalWins || 0),
    TotalSessions: Number(safe.TotalSessions || 0),
    LastSharedAt: safe.LastSharedAt || null,
    ByEvent: safe.ByEvent && typeof safe.ByEvent === "object" ? safe.ByEvent : {},
    ByUser: safe.ByUser && typeof safe.ByUser === "object" ? safe.ByUser : {},
  };
}

function normalizeSharedPayload(text) {
  if (!String(text || "").startsWith("[sharedAoN]")) return null;
  try {
    const parsed = JSON.parse(String(text).slice("[sharedAoN]".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSharedUpdateMessage(text) {
  if (!String(text || "").startsWith("[sharedUpdate]")) return null;
  const raw = String(text).slice("[sharedUpdate]".length);
  const [sharedID, solveIndexRaw, timeRaw, senderID] = raw.split("|");
  const solveIndex = Number(solveIndexRaw);
  const time = Number(timeRaw);
  if (!sharedID || !senderID || !Number.isFinite(solveIndex) || !Number.isFinite(time)) return null;
  return {
    sharedID,
    solveIndex,
    time,
    senderID,
  };
}

function parseSharedExtendMessage(text) {
  if (!String(text || "").startsWith("[sharedExtend]")) return null;
  try {
    const parsed = JSON.parse(String(text).slice("[sharedExtend]".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getSharedRunKey(sharedID) {
  return `SHAREDRUN#${String(sharedID || "").trim()}`;
}

async function getSharedRun(conversationID, sharedID) {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        PK: `CONVO#${conversationID}`,
        SK: getSharedRunKey(sharedID),
      },
      ConsistentRead: true,
    })
  );
  return out.Item || null;
}

function buildSharedRunItem({
  conversationID,
  sharedID,
  payload,
  participantIDs = [],
  createdAt,
}) {
  const ts = String(createdAt || nowIso());
  const creatorEvents = Array.isArray(payload?.creatorEvents) ? payload.creatorEvents : [];
  const opponentEvents = Array.isArray(payload?.opponentEvents) ? payload.opponentEvents : [];
  const creatorScrambles = Array.isArray(payload?.creatorScrambles) ? payload.creatorScrambles : [];
  const opponentScrambles = Array.isArray(payload?.opponentScrambles) ? payload.opponentScrambles : [];

  return {
    PK: `CONVO#${conversationID}`,
    SK: getSharedRunKey(sharedID),
    ItemType: "SHAREDRUN",
    ConversationID: conversationID,
    SharedID: sharedID,
    SharedType: String(payload?.mode || payload?.type || "average").trim() || "average",
    TargetWins: Number(payload?.targetWins || 0) || null,
    BatchSize: Number(payload?.batchSize || 0) || null,
    Count: Math.max(
      Number(payload?.count || 0),
      creatorEvents.length,
      opponentEvents.length,
      creatorScrambles.length,
      opponentScrambles.length
    ),
    CreatorID: String(payload?.creatorID || "").trim() || null,
    CreatorEvent: String(payload?.creatorEvent || payload?.event || "").trim() || null,
    OpponentEvent: String(payload?.opponentEvent || payload?.event || "").trim() || null,
    CreatorEvents: creatorEvents,
    OpponentEvents: opponentEvents,
    CreatorScrambles: creatorScrambles,
    OpponentScrambles: opponentScrambles,
    ParticipantIDs: normalizeMemberIDs(participantIDs),
    RoundResults: {},
    Summary: {
      TotalSolves: 0,
      TotalWins: 0,
      ByUser: {},
      ByEvent: {},
    },
    CreatedAt: ts,
    UpdatedAt: ts,
  };
}

function getSharedRoundEvent(runItem, participantID, solveIndex) {
  const idx = Number(solveIndex);
  if (!Number.isFinite(idx) || idx < 0) return null;

  if (participantID && participantID === runItem?.CreatorID) {
    return (
      runItem?.CreatorEvents?.[idx] ||
      runItem?.CreatorEvent ||
      runItem?.OpponentEvent ||
      null
    );
  }

  if (participantID && runItem?.ParticipantIDs?.includes(participantID)) {
    return (
      runItem?.OpponentEvents?.[idx] ||
      runItem?.OpponentEvent ||
      runItem?.CreatorEvent ||
      null
    );
  }

  return (
    runItem?.CreatorEvents?.[idx] ||
    runItem?.OpponentEvents?.[idx] ||
    runItem?.CreatorEvent ||
    runItem?.OpponentEvent ||
    null
  );
}

function computeSharedRunSummary(runItem) {
  const roundResults = runItem?.RoundResults && typeof runItem.RoundResults === "object"
    ? runItem.RoundResults
    : {};

  const summary = {
    TotalSolves: 0,
    TotalWins: 0,
    ByUser: {},
    ByEvent: {},
  };

  const addSolve = (userID, event) => {
    const uid = String(userID || "").trim();
    const ev = normalizeEvent(event || runItem?.CreatorEvent || runItem?.OpponentEvent || "333");
    if (!uid) return;

    summary.TotalSolves += 1;
    summary.ByUser[uid] = {
      Solves: Number(summary.ByUser?.[uid]?.Solves || 0) + 1,
      Wins: Number(summary.ByUser?.[uid]?.Wins || 0),
    };
    summary.ByEvent[ev] = {
      Solves: Number(summary.ByEvent?.[ev]?.Solves || 0) + 1,
      Wins: Number(summary.ByEvent?.[ev]?.Wins || 0),
      ByUser: {
        ...(summary.ByEvent?.[ev]?.ByUser || {}),
        [uid]: {
          Solves: Number(summary.ByEvent?.[ev]?.ByUser?.[uid]?.Solves || 0) + 1,
          Wins: Number(summary.ByEvent?.[ev]?.ByUser?.[uid]?.Wins || 0),
        },
      },
    };
  };

  const addWin = (userID, event) => {
    const uid = String(userID || "").trim();
    const ev = normalizeEvent(event || runItem?.CreatorEvent || runItem?.OpponentEvent || "333");
    if (!uid) return;

    summary.TotalWins += 1;
    summary.ByUser[uid] = {
      Solves: Number(summary.ByUser?.[uid]?.Solves || 0),
      Wins: Number(summary.ByUser?.[uid]?.Wins || 0) + 1,
    };
    summary.ByEvent[ev] = {
      Solves: Number(summary.ByEvent?.[ev]?.Solves || 0),
      Wins: Number(summary.ByEvent?.[ev]?.Wins || 0) + 1,
      ByUser: {
        ...(summary.ByEvent?.[ev]?.ByUser || {}),
        [uid]: {
          Solves: Number(summary.ByEvent?.[ev]?.ByUser?.[uid]?.Solves || 0),
          Wins: Number(summary.ByEvent?.[ev]?.ByUser?.[uid]?.Wins || 0) + 1,
        },
      },
    };
  };

  Object.entries(roundResults).forEach(([solveIndex, row]) => {
    const entrants = Object.entries(row || {})
      .map(([participantID, result]) => ({
        participantID,
        time: Number(result?.time),
        event: result?.event || getSharedRoundEvent(runItem, participantID, solveIndex),
      }))
      .filter((entry) => entry.participantID && Number.isFinite(entry.time));

    entrants.forEach((entry) => addSolve(entry.participantID, entry.event));

    if (entrants.length < 2) return;

    const best = entrants.reduce((winner, entry) => {
      if (!winner) return entry;
      if (entry.time < winner.time) return entry;
      return winner;
    }, null);

    const tied = entrants.filter((entry) => entry.time === best?.time);
    if (best && tied.length === 1) {
      addWin(best.participantID, best.event);
    }
  });

  return summary;
}

function buildSharedStatsDelta(previousSummary, nextSummary, eventForSession = null, timestamp = null) {
  const prev = previousSummary && typeof previousSummary === "object" ? previousSummary : {};
  const next = nextSummary && typeof nextSummary === "object" ? nextSummary : {};
  const delta = createEmptySharedStats();

  delta.TotalSolves = Number(next.TotalSolves || 0) - Number(prev.TotalSolves || 0);
  delta.TotalWins = Number(next.TotalWins || 0) - Number(prev.TotalWins || 0);
  delta.LastSharedAt = timestamp || null;

  const eventKeys = new Set([
    ...Object.keys(prev.ByEvent || {}),
    ...Object.keys(next.ByEvent || {}),
  ]);
  eventKeys.forEach((eventKey) => {
    const prevEvent = prev.ByEvent?.[eventKey] || {};
    const nextEvent = next.ByEvent?.[eventKey] || {};
    const eventDelta = {
      Solves: Number(nextEvent.Solves || 0) - Number(prevEvent.Solves || 0),
      Wins: Number(nextEvent.Wins || 0) - Number(prevEvent.Wins || 0),
      Sessions: 0,
      ByUser: {},
    };
    const eventUserKeys = new Set([
      ...Object.keys(prevEvent.ByUser || {}),
      ...Object.keys(nextEvent.ByUser || {}),
    ]);
    eventUserKeys.forEach((userID) => {
      const prevUser = prevEvent.ByUser?.[userID] || {};
      const nextUser = nextEvent.ByUser?.[userID] || {};
      const userDelta = {
        Solves: Number(nextUser.Solves || 0) - Number(prevUser.Solves || 0),
        Wins: Number(nextUser.Wins || 0) - Number(prevUser.Wins || 0),
        Sessions: 0,
      };
      if (userDelta.Solves || userDelta.Wins || userDelta.Sessions) {
        eventDelta.ByUser[userID] = userDelta;
      }
    });
    if (eventDelta.Solves || eventDelta.Wins || eventDelta.Sessions) {
      delta.ByEvent[eventKey] = eventDelta;
    }
  });

  if (eventForSession) {
    const ev = normalizeEvent(eventForSession);
    delta.ByEvent[ev] = {
      Solves: Number(delta.ByEvent?.[ev]?.Solves || 0),
      Wins: Number(delta.ByEvent?.[ev]?.Wins || 0),
      Sessions: Number(delta.ByEvent?.[ev]?.Sessions || 0) + 1,
      ByUser: {
        ...(delta.ByEvent?.[ev]?.ByUser || {}),
      },
    };
  }

  const userKeys = new Set([
    ...Object.keys(prev.ByUser || {}),
    ...Object.keys(next.ByUser || {}),
  ]);
  userKeys.forEach((userID) => {
    const prevUser = prev.ByUser?.[userID] || {};
    const nextUser = next.ByUser?.[userID] || {};
    const userDelta = {
      Solves: Number(nextUser.Solves || 0) - Number(prevUser.Solves || 0),
      Wins: Number(nextUser.Wins || 0) - Number(prevUser.Wins || 0),
      Sessions: 0,
    };
    if (userDelta.Solves || userDelta.Wins || userDelta.Sessions) {
      delta.ByUser[userID] = userDelta;
    }
  });

  return delta;
}

function mergeSharedStats(baseStats, deltaStats) {
  const base = normalizeSharedStats(baseStats);
  const delta = deltaStats && typeof deltaStats === "object" ? deltaStats : {};
  const next = {
    ...base,
    TotalSolves: Number(base.TotalSolves || 0) + Number(delta.TotalSolves || 0),
    TotalWins: Number(base.TotalWins || 0) + Number(delta.TotalWins || 0),
    TotalSessions: Number(base.TotalSessions || 0) + Number(delta.TotalSessions || 0),
    LastSharedAt: delta.LastSharedAt || base.LastSharedAt || null,
    ByEvent: { ...(base.ByEvent || {}) },
    ByUser: { ...(base.ByUser || {}) },
  };

  Object.entries(delta.ByEvent || {}).forEach(([eventKey, values]) => {
    const current = next.ByEvent[eventKey] || {};
    next.ByEvent[eventKey] = {
      Solves: Number(current.Solves || 0) + Number(values.Solves || 0),
      Wins: Number(current.Wins || 0) + Number(values.Wins || 0),
      Sessions: Number(current.Sessions || 0) + Number(values.Sessions || 0),
      ByUser: { ...(current.ByUser || {}) },
    };
    Object.entries(values.ByUser || {}).forEach(([userID, byUserValues]) => {
      const currentByUser = next.ByEvent[eventKey].ByUser[userID] || {};
      next.ByEvent[eventKey].ByUser[userID] = {
        Solves: Number(currentByUser.Solves || 0) + Number(byUserValues.Solves || 0),
        Wins: Number(currentByUser.Wins || 0) + Number(byUserValues.Wins || 0),
        Sessions: Number(currentByUser.Sessions || 0) + Number(byUserValues.Sessions || 0),
      };
    });
  });

  Object.entries(delta.ByUser || {}).forEach(([userID, values]) => {
    const current = next.ByUser[userID] || {};
    next.ByUser[userID] = {
      Solves: Number(current.Solves || 0) + Number(values.Solves || 0),
      Wins: Number(current.Wins || 0) + Number(values.Wins || 0),
      Sessions: Number(current.Sessions || 0) + Number(values.Sessions || 0),
    };
  });

  return next;
}

async function applySharedStatsToConversation({
  conversationID,
  memberIDs,
  deltaStats,
  timestamp,
}) {
  const convoKey = { PK: `CONVO#${conversationID}`, SK: "META" };
  const existingMeta = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: convoKey, ConsistentRead: true })
  );
  const nextMetaStats = mergeSharedStats(existingMeta.Item?.SharedStats, deltaStats);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: convoKey,
      UpdateExpression: "SET SharedStats = :stats, UpdatedAt = :updated",
      ExpressionAttributeValues: {
        ":stats": nextMetaStats,
        ":updated": String(timestamp || nowIso()),
      },
    })
  );

  await Promise.all(
    normalizeMemberIDs(memberIDs).map(async (userID) => {
      const userKey = { PK: `USER#${userID}`, SK: `CONVO#${conversationID}` };
      const existingUser = await ddb.send(
        new GetCommand({ TableName: TABLE, Key: userKey, ConsistentRead: true })
      );
      const nextUserStats = mergeSharedStats(existingUser.Item?.SharedStats, deltaStats);
      return ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: userKey,
          UpdateExpression: "SET SharedStats = :stats, UpdatedAt = :updated",
          ExpressionAttributeValues: {
            ":stats": nextUserStats,
            ":updated": String(timestamp || nowIso()),
          },
        })
      );
    })
  );
}

async function processSharedMessageEffects({
  conversationID,
  text,
  memberIDs,
  timestamp,
}) {
  const sharedPayload = normalizeSharedPayload(text);
  if (sharedPayload?.sharedID) {
    const existingRun = await getSharedRun(conversationID, sharedPayload.sharedID);
    if (!existingRun) {
      const item = buildSharedRunItem({
        conversationID,
        sharedID: sharedPayload.sharedID,
        payload: sharedPayload,
        participantIDs: memberIDs,
        createdAt: timestamp,
      });
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      const deltaStats = createEmptySharedStats();
      deltaStats.TotalSessions = 1;
      deltaStats.LastSharedAt = timestamp;
      const eventKey = normalizeEvent(
        sharedPayload.creatorEvent || sharedPayload.event || sharedPayload.opponentEvent || "333"
      );
      deltaStats.ByEvent[eventKey] = { Solves: 0, Wins: 0, Sessions: 1 };
      normalizeMemberIDs(memberIDs).forEach((userID) => {
        deltaStats.ByUser[userID] = { Solves: 0, Wins: 0, Sessions: 1 };
      });
      deltaStats.ByEvent[eventKey].ByUser = Object.fromEntries(
        normalizeMemberIDs(memberIDs).map((userID) => [userID, { Solves: 0, Wins: 0, Sessions: 1 }])
      );

      await applySharedStatsToConversation({
        conversationID,
        memberIDs,
        deltaStats,
        timestamp,
      });
    }
    return;
  }

  const updatePayload = parseSharedUpdateMessage(text);
  if (!updatePayload?.sharedID) {
    const extendPayload = parseSharedExtendMessage(text);
    if (!extendPayload?.sharedID) return;

    const runItem = await getSharedRun(conversationID, extendPayload.sharedID);
    if (!runItem) return;

    const creatorEvents = Array.isArray(extendPayload.creatorEvents) ? extendPayload.creatorEvents : [];
    const opponentEvents = Array.isArray(extendPayload.opponentEvents) ? extendPayload.opponentEvents : [];
    const creatorScrambles = Array.isArray(extendPayload.creatorScrambles)
      ? extendPayload.creatorScrambles
      : [];
    const opponentScrambles = Array.isArray(extendPayload.opponentScrambles)
      ? extendPayload.opponentScrambles
      : [];

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: `CONVO#${conversationID}`,
          SK: getSharedRunKey(extendPayload.sharedID),
        },
        UpdateExpression:
          "SET CreatorEvents = :creatorEvents, OpponentEvents = :opponentEvents, CreatorScrambles = :creatorScrambles, OpponentScrambles = :opponentScrambles, #count = :count, UpdatedAt = :updated",
        ExpressionAttributeNames: {
          "#count": "Count",
        },
        ExpressionAttributeValues: {
          ":creatorEvents": [...(runItem.CreatorEvents || []), ...creatorEvents],
          ":opponentEvents": [...(runItem.OpponentEvents || []), ...opponentEvents],
          ":creatorScrambles": [...(runItem.CreatorScrambles || []), ...creatorScrambles],
          ":opponentScrambles": [...(runItem.OpponentScrambles || []), ...opponentScrambles],
          ":count": Math.max(
            Number(runItem.Count || 0),
            Number(extendPayload.count || 0),
            (runItem.CreatorScrambles || []).length + creatorScrambles.length,
            (runItem.OpponentScrambles || []).length + opponentScrambles.length
          ),
          ":updated": String(timestamp || nowIso()),
        },
      })
    );
    return;
  }

  const runItem = await getSharedRun(conversationID, updatePayload.sharedID);
  if (!runItem) return;

  const existingRow = runItem.RoundResults?.[updatePayload.solveIndex] || {};
  const existingResult = existingRow?.[updatePayload.senderID] || null;
  const existingTime = Number(existingResult?.time);

  if (Number.isFinite(existingTime) && existingTime === updatePayload.time) {
    return;
  }

  const previousSummary = runItem.Summary || createEmptySharedStats();
  const nextRoundResults = {
    ...(runItem.RoundResults || {}),
    [updatePayload.solveIndex]: {
      ...existingRow,
      [updatePayload.senderID]: {
        time: updatePayload.time,
        event:
          existingResult?.event ||
          getSharedRoundEvent(runItem, updatePayload.senderID, updatePayload.solveIndex),
        updatedAt: String(timestamp || nowIso()),
      },
    },
  };

  const nextRun = {
    ...runItem,
    RoundResults: nextRoundResults,
  };
  const nextSummary = computeSharedRunSummary(nextRun);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: {
        PK: `CONVO#${conversationID}`,
        SK: getSharedRunKey(updatePayload.sharedID),
      },
      UpdateExpression: "SET RoundResults = :roundResults, Summary = :summary, UpdatedAt = :updated",
      ExpressionAttributeValues: {
        ":roundResults": nextRoundResults,
        ":summary": nextSummary,
        ":updated": String(timestamp || nowIso()),
      },
    })
  );

  const deltaStats = buildSharedStatsDelta(previousSummary, nextSummary, null, timestamp);
  if (
    deltaStats.TotalSolves ||
    deltaStats.TotalWins ||
    Object.keys(deltaStats.ByEvent || {}).length ||
    Object.keys(deltaStats.ByUser || {}).length
  ) {
    await applySharedStatsToConversation({
      conversationID,
      memberIDs: runItem.ParticipantIDs || memberIDs,
      deltaStats,
      timestamp,
    });
  }
}

async function getConversationMeta(conversationID) {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `CONVO#${conversationID}`, SK: "META" },
      ConsistentRead: true,
    })
  );
  return out.Item || null;
}

async function listConversationMembers(conversationID) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
      ExpressionAttributeValues: {
        ":pk": `CONVO#${conversationID}`,
        ":pfx": "MEMBER#",
      },
      ConsistentRead: true,
    })
  );
  return out.Items || [];
}

async function createConversationRecords({
  conversationID,
  conversationType,
  memberIDs,
  name = "",
  createdBy = "",
}) {
  const members = normalizeMemberIDs(memberIDs);
  const ts = nowIso();
  const meta = buildConversationMetaItem({
    conversationID,
    conversationType,
    memberIDs: members,
    name,
    createdBy,
    createdAt: ts,
  });
  const memberItems = buildConversationMemberItems(
    conversationID,
    members,
    conversationType,
    ts
  );
  const userItems = buildUserConversationItems({
    conversationID,
    conversationType,
    memberIDs: members,
    name,
    createdAt: ts,
  });

  await batchWriteRequestsWithRetry(
    [meta, ...memberItems, ...userItems].map((Item) => ({ PutRequest: { Item } }))
  );

  return { meta, members: memberItems, userItems };
}

async function ensureLegacyConversationRecords(conversationID, actorUserID = "") {
  const existing = await getConversationMeta(conversationID);
  if (existing) {
    const members = await listConversationMembers(conversationID);
    return { meta: existing, members, created: false };
  }

  const legacyMembers = parseLegacyDmConversationID(conversationID);
  if (!legacyMembers) return { meta: null, members: [], created: false };
  if (actorUserID && !legacyMembers.includes(String(actorUserID || "").trim())) {
    return { meta: null, members: [], created: false };
  }

  const created = await createConversationRecords({
    conversationID,
    conversationType: "DM",
    memberIDs: legacyMembers,
    createdBy: actorUserID || legacyMembers[0],
  });

  return { meta: created.meta, members: created.members, created: true };
}

async function touchConversationActivity({
  conversationID,
  meta,
  members,
  timestamp,
  preview,
}) {
  const ts = String(timestamp || nowIso());
  const lastMessagePreview = String(preview || "").slice(0, 280);
  const memberItems = Array.isArray(members) ? members : [];
  const memberIDs = memberItems
    .map((item) => String(item?.UserID || "").trim())
    .filter(Boolean);
  const type = normalizeConversationType(meta?.ConversationType);
  const name = String(meta?.Name || "").trim();

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `CONVO#${conversationID}`, SK: "META" },
      UpdateExpression:
        "SET LastMessageAt = :last, LastMessagePreview = :preview, UpdatedAt = :updated, MemberCount = :count",
      ExpressionAttributeValues: {
        ":last": ts,
        ":preview": lastMessagePreview,
        ":updated": ts,
        ":count": memberIDs.length,
      },
    })
  );

  await Promise.all(
    memberIDs.map((userID) => {
      const otherMemberIDs = memberIDs.filter((id) => id !== userID);
      const displayName = type === "DM" ? otherMemberIDs[0] || userID : name || conversationID;
      return ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userID}`, SK: `CONVO#${conversationID}` },
          UpdateExpression:
            "SET ConversationID = :cid, ConversationType = :type, #name = :name, DisplayName = :displayName, OtherUserID = :other, MemberIDs = :members, LastMessageAt = :last, LastMessagePreview = :preview, UpdatedAt = :updated, ItemType = :itemType",
          ExpressionAttributeNames: {
            "#name": "Name",
          },
          ExpressionAttributeValues: {
            ":cid": conversationID,
            ":type": type,
            ":name": name,
            ":displayName": displayName,
            ":other": type === "DM" ? otherMemberIDs[0] || null : null,
            ":members": memberIDs,
            ":last": ts,
            ":preview": lastMessagePreview,
            ":updated": ts,
            ":itemType": "USERCONVO",
          },
        })
      );
    })
  );
}

function normalizeGroupID(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9#_-]/g, "")
    .slice(0, 120);
}

function buildGroupMetaItem({
  groupID,
  name,
  ownerID,
  memberIDs,
  conversationID,
  color = "",
  photo = "",
  createdAt,
}) {
  const ts = String(createdAt || nowIso());
  const members = normalizeMemberIDs(memberIDs);
  return {
    PK: `GROUP#${groupID}`,
    SK: "META",
    ItemType: "GROUP",
    GroupID: groupID,
    Name: String(name || "").trim(),
    OwnerID: String(ownerID || "").trim(),
    ConversationID: String(conversationID || "").trim(),
    MemberCount: members.length,
    Color: String(color || "").trim(),
    Photo: String(photo || "").trim(),
    CreatedAt: ts,
    UpdatedAt: ts,
  };
}

function buildGroupMemberItems({ groupID, memberIDs, ownerID, createdAt }) {
  const ts = String(createdAt || nowIso());
  return normalizeMemberIDs(memberIDs).map((userID) => ({
    PK: `GROUP#${groupID}`,
    SK: `MEMBER#${userID}`,
    ItemType: "GROUPMEMBER",
    GroupID: groupID,
    UserID: userID,
    Role: userID === ownerID ? "OWNER" : "MEMBER",
    JoinedAt: ts,
    CreatedAt: ts,
    UpdatedAt: ts,
  }));
}

function buildUserGroupItems({
  groupID,
  memberIDs,
  ownerID,
  name,
  conversationID,
  color = "",
  photo = "",
  createdAt,
}) {
  const ts = String(createdAt || nowIso());
  return normalizeMemberIDs(memberIDs).map((userID) => ({
    PK: `USER#${userID}`,
    SK: `GROUP#${groupID}`,
    ItemType: "USERGROUP",
    GroupID: groupID,
    Name: String(name || "").trim(),
    ConversationID: String(conversationID || "").trim(),
    Role: userID === ownerID ? "OWNER" : "MEMBER",
    Color: String(color || "").trim(),
    Photo: String(photo || "").trim(),
    CreatedAt: ts,
    UpdatedAt: ts,
  }));
}

async function getGroupMeta(groupID) {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `GROUP#${groupID}`, SK: "META" },
      ConsistentRead: true,
    })
  );
  return out.Item || null;
}

async function listGroupMembers(groupID) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
      ExpressionAttributeValues: {
        ":pk": `GROUP#${groupID}`,
        ":pfx": "MEMBER#",
      },
      ConsistentRead: true,
    })
  );
  return out.Items || [];
}

async function isUserInGroup(groupID, userID) {
  if (!groupID || !userID) return false;
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `GROUP#${groupID}`, SK: `MEMBER#${userID}` },
      ConsistentRead: true,
    })
  );
  return !!out.Item;
}

// -------------------- Health --------------------
app.get("/api/health", (_, res) => res.json({ ok: true }));

// -------------------- Debug: table shape --------------------
app.get("/api/_table", async (_, res) => {
  try {
    const out = await ddb.send(new DescribeTableCommand({ TableName: TABLE }));
    const t = out.Table || {};
    return res.json({
      TableName: t.TableName,
      KeySchema: t.KeySchema,
      AttributeDefinitions: t.AttributeDefinitions,
      GSIs: (t.GlobalSecondaryIndexes || []).map((g) => ({
        IndexName: g.IndexName,
        KeySchema: g.KeySchema,
        Projection: g.Projection,
      })),
    });
  } catch (e) {
    console.error("DescribeTable error:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// -------------------- USER --------------------
app.get("/api/user/:userID", async (req, res) => {
  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!requirePkSk(res)) return;

  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
      })
    );
    if (!out.Item) return res.status(404).json({ user: null });
    return res.json({ user: out.Item });
  } catch (e) {
    console.error("GET /api/user error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/user", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const {
      userID,
      name,
      username,
      color,
      profileEvent,
      profileScramble,
      chosenStats,
      headerStats,
      wcaid,
      cubeCollection,
      settings,
      tagConfig,
      tagCatalog,
      tagOptions,
    } = req.body || {};

    const id = String(userID || "").trim();
    if (!id) return res.status(400).json({ error: "Missing userID" });

    const ts = nowIso();

    const item = {
      PK: `USER#${id}`,
      SK: "PROFILE",
      ItemType: "PROFILE",

      Name: name ?? "",
      Username: username ?? id,
      Friends: [],
      Posts: [],
      Color: color ?? "#2EC4B6",
      ProfileEvent: profileEvent ?? "333",
      ProfileScramble: profileScramble ?? "",
      ChosenStats: chosenStats ?? [],
      HeaderStats: headerStats ?? [],
      WCAID: wcaid ?? "",
      DateFounded: ts,
      CubeCollection: cubeCollection ?? [],
      Settings: settings ?? {},

      TagConfig: tagConfig ?? buildDefaultTagConfig(tagOptions),
      TagCatalog: tagCatalog ?? { Global: {}, ByEvent: {} },
      TagColorCatalog: { Global: {}, ByEvent: {} },

      CreatedAt: ts,
      UpdatedAt: ts,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/user error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/user/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const updates = req.body?.updates;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Missing updates object" });
  }

  try {
    const expr = [];
    const names = {};
    const values = {};
    const merged = { ...updates, UpdatedAt: nowIso() };

    if (merged.TagOptions && !merged.TagConfig) {
      merged.TagConfig = buildDefaultTagConfig(merged.TagOptions);
    }

    for (const [k, v] of Object.entries(merged)) {
      if (k === "PK" || k === "SK") continue;
      if (typeof v === "undefined") continue;
      names[`#${k}`] = k;
      values[`:${k}`] = v;
      expr.push(`#${k} = :${k}`);
    }

    if (!expr.length) return res.json({ ok: true, item: null });

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
        UpdateExpression: `SET ${expr.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
      })
    );

    return res.json({ ok: true, item: out.Item || null });
  } catch (e) {
    console.error("PUT /api/user error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- SESSIONS --------------------
// -------------------- SESSIONS --------------------
app.get("/api/sessions/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "SESSION#",
        },
      })
    );

    const sessionItems = out.Items || [];

    if (sessionItems.length === 0) {
      return res.json({ ok: true, items: [] });
    }

    const statsKeys = sessionItems
      .filter((s) => s?.Event && s?.SessionID)
      .map((s) => ({
        PK: `USER#${userID}`,
        SK: `SESSIONSTATS#${String(s.Event).toUpperCase()}#${String(s.SessionID || "main")}`,
      }));

    const statsItems = await batchGetItems(statsKeys);
    const statsMap = new Map(
      (statsItems || []).map((item) => [`${item.Event}#${item.SessionID}`, item])
    );

    const enriched = sessionItems.map((session) => {
      const ev = String(session.Event || "").toUpperCase();
      const sid = String(session.SessionID || "main");
      const stats = statsMap.get(`${ev}#${sid}`) || null;

      return {
        ...session,
        Stats: stats,
      };
    });

    enriched.sort((a, b) => {
      const evCmp = String(a.Event || "").localeCompare(String(b.Event || ""));
      if (evCmp !== 0) return evCmp;

      if (a.SessionID === "main") return -1;
      if (b.SessionID === "main") return 1;

      return String(a.SessionName || a.SessionID || "").localeCompare(
        String(b.SessionName || b.SessionID || "")
      );
    });

    return res.json({ ok: true, items: enriched });
  } catch (e) {
    console.error("GET /api/sessions error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/session", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const { userID, event, sessionID, sessionName, opts } = req.body || {};
    const id = String(userID || "").trim();
    const ev = normalizeEvent(event);
    const sid = normalizeSessionID(sessionID);
    const name = String(sessionName || "").trim();

    if (!id) return res.status(400).json({ error: "Missing userID" });
    if (!ev) return res.status(400).json({ error: "Missing event" });
    if (!sid) return res.status(400).json({ error: "Missing sessionID" });
    if (!name) return res.status(400).json({ error: "Missing sessionName" });

    const ts = nowIso();

    const item = {
      PK: `USER#${id}`,
      SK: `SESSION#${ev}#${sid}`,
      ItemType: "SESSION",
      Event: ev,
      SessionID: sid,
      SessionName: name,
      CreatedAt: ts,
      UpdatedAt: ts,
    };

    if (opts?.sessionType === "RELAY") {
      item.SessionType = "RELAY";
      item.RelayLegs = Array.isArray(opts.relayLegs) ? opts.relayLegs : [];
    }

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

    const statsItem = await ensureSessionStatsExists(id, ev, sid);

    return res.json({
      ok: true,
      item: {
        ...item,
        Stats: statsItem,
      },
    });
  } catch (e) {
    console.error("POST /api/session error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/session/:userID/:event/:sessionID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.params.event);
  const sessionID = normalizeSessionID(req.params.sessionID || "main");

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });
  if (!sessionID) return res.status(400).json({ error: "Missing sessionID" });

  try {
    const customEventItem = await getCustomEventItem(userID, event);
    const isCustomEvent = !!customEventItem;
    const isMainSession = sessionID === "main";
    const deleteWholeEvent = isMainSession && isCustomEvent;

    if (isMainSession && !isCustomEvent) {
      return res.status(403).json({
        error: isCoreEvent(event)
          ? "Main session for core events cannot be deleted."
          : "Main session can only be deleted for custom events and custom relays.",
      });
    }

    const sessionItem = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SESSION#${event}#${sessionID}` },
        ConsistentRead: true,
      })
    );

    if (!deleteWholeEvent && !sessionItem.Item) {
      return res.json({ ok: true, skipped: true, deletedEvent: false });
    }

    const solves = deleteWholeEvent
      ? await getAllSolvesForEvent(userID, event)
      : await getAllSolvesForSession(userID, event, sessionID);

    for (const solve of solves) {
      await deleteSolveAndTagItems(ddb, TABLE, solve);
    }

    if (solves.length === 0) {
      if (deleteWholeEvent) {
        const [sessionItems, sessionStatsItems] = await Promise.all([
          queryUserItemsByPrefix(userID, `SESSION#${event}#`),
          queryUserItemsByPrefix(userID, `SESSIONSTATS#${event}#`),
        ]);

        await deleteItemsByKey([
          { PK: `USER#${userID}`, SK: `CUSTOMEVENT#${event}` },
          { PK: `USER#${userID}`, SK: `EVENTSTATS#${event}` },
          ...sessionItems.map((item) => ({ PK: item?.PK, SK: item?.SK })),
          ...sessionStatsItems.map((item) => ({ PK: item?.PK, SK: item?.SK })),
        ]);
      } else {
        await deleteItemsByKey([
          { PK: `USER#${userID}`, SK: `SESSION#${event}#${sessionID}` },
          { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
        ]);
      }
    } else if (deleteWholeEvent) {
      const prefixDeletes = [
        `SESSION#${event}#`,
        `SESSIONSTATS#${event}#`,
        `EVENTSTATS#${event}`,
        `TAGSTATS#${event}#`,
        `SINGLERANK#EVENT#${event}#`,
        `SINGLERANK#SESSION#${event}#`,
        `DAYBUCKET#EVENT#${event}#`,
        `CUSTOMEVENT#${event}`,
      ];

      const prefixItems = await Promise.all(
        prefixDeletes.map((prefix) => queryUserItemsByPrefix(userID, prefix))
      );

      await deleteItemsByKey(prefixItems.flat().map((item) => ({ PK: item?.PK, SK: item?.SK })));
      runInBackground(`sessionDelete:eventCleanup:${userID}:${event}`, () =>
        recomputeAllDayBucketsForEvent(userID, event)
      );
    } else {
      const sessionTagStatsItems = await queryUserItemsByPrefix(
        userID,
        `TAGSTATS#${event}#${sessionID}#`
      );

      const deleteRequests = [];
      const affectedEventTagScopes = new Map();
      const affectedDayKeys = new Set();
      const dayBucketTimeZone = await getUserDayBucketTimeZone(userID);

      for (const solve of solves) {
        deleteRequests.push({
          DeleteRequest: {
            Key: { PK: solve.PK, SK: solve.SK },
          },
        });

        for (const tagItem of buildSolveTagItems(solve)) {
          deleteRequests.push({
            DeleteRequest: {
              Key: { PK: tagItem.PK, SK: tagItem.SK },
            },
          });
        }

        for (const rankItem of buildSingleRankItemsForSolve(userID, solve)) {
          deleteRequests.push({
            DeleteRequest: {
              Key: { PK: rankItem.PK, SK: rankItem.SK },
            },
          });
        }

        for (const pair of getSolveTagPairsFromItem(solve)) {
          const tagKey = String(pair?.key || "").trim();
          const tagValue = String(pair?.value || "").trim();
          if (!tagKey || !tagValue) continue;
          affectedEventTagScopes.set(`${tagKey}|${tagValue}`, { tagKey, tagValue });
        }

        const dayKey = getDayKey(solve?.CreatedAt, { timeZone: dayBucketTimeZone });
        if (dayKey) affectedDayKeys.add(dayKey);
      }

      for (const item of sessionTagStatsItems) {
        deleteRequests.push({
          DeleteRequest: {
            Key: { PK: item.PK, SK: item.SK },
          },
        });
      }

      deleteRequests.push(
        {
          DeleteRequest: {
            Key: { PK: `USER#${userID}`, SK: `SESSION#${event}#${sessionID}` },
          },
        },
        {
          DeleteRequest: {
            Key: { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
          },
        }
      );

      await batchWriteRequestsWithRetry(deleteRequests);

      runInBackground(`sessionDelete:cleanup:${userID}:${event}:${sessionID}`, () =>
        Promise.all([
          recomputeEventStats(ddb, TABLE, userID, event),
          ...Array.from(affectedEventTagScopes.values()).map(({ tagKey, tagValue }) =>
            recomputeTagStats(ddb, TABLE, userID, event, null, tagKey, tagValue)
          ),
          ...Array.from(affectedDayKeys).flatMap((dayKey) => [
            recomputeEventDayBucket(userID, event, dayKey, { mainOnly: false }),
            recomputeEventDayBucket(userID, event, dayKey, { mainOnly: true }),
            recomputeAllEventsDayBucket(userID, dayKey),
          ]),
        ])
      );
    }

    return res.json({
      ok: true,
      deletedEvent: deleteWholeEvent,
      deletedSessionID: sessionID,
      deletedSolveCount: solves.length,
    });
  } catch (e) {
    console.error("DELETE /api/session error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- SESSIONSTATS --------------------
app.get("/api/sessionStats/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionID = normalizeSessionID(req.query?.sessionID || "main");

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const shouldRepairTopSinglesOnRead =
      String(req.query?.repairTopSingles || "false").toLowerCase() === "true";
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
        ConsistentRead: true,
      })
    );
    let item = out.Item || null;
    const needsRecompute =
      !!item && (!hasCurrentStrictWindowVersion(item) || !hasCachedWorstMetrics(item));
    const needsTopSinglesRepair =
      !!item &&
      Number(item.SolveCountIncluded || 0) > 0 &&
      (!Number.isFinite(Number(item.BestSingleMs)) ||
        !Array.isArray(item.TopSingles10) ||
        item.TopSingles10.length === 0);

    if (item && needsTopSinglesRepair && shouldRepairTopSinglesOnRead) {
      const topSingles = await getTopSinglesForScope({
        userID,
        event,
        sessionID,
        limit: 10,
      });
      if (topSingles.length > 0) {
        const next = { ...item, UpdatedAt: nowIso() };
        applyTopSinglesToStats(next, topSingles);
        await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
        item = next;
      }
    }

    if (item) {
      item = {
        ...item,
        NeedsRecompute: needsRecompute,
        NeedsTopSinglesRepair: needsTopSinglesRepair,
      };
    }

    return res.json({ ok: true, item });
  } catch (e) {
    console.error("GET /api/sessionStats error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- EVENTSTATS --------------------
app.get("/api/eventStats/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const shouldRepairTopSinglesOnRead =
      String(req.query?.repairTopSingles || "false").toLowerCase() === "true";
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `EVENTSTATS#${event}` },
        ConsistentRead: true,
      })
    );
    let item = out.Item || null;
    const needsRecompute =
      !!item && (!hasCurrentStrictWindowVersion(item) || !hasCachedWorstMetrics(item));
    const needsTopSinglesRepair =
      !!item &&
      Number(item.SolveCountIncluded || 0) > 0 &&
      (!Number.isFinite(Number(item.BestSingleMs)) ||
        !Array.isArray(item.TopSingles10) ||
        item.TopSingles10.length === 0);

    if (item && needsTopSinglesRepair && shouldRepairTopSinglesOnRead) {
      const topSingles = await getTopSinglesForScope({
        userID,
        event,
        sessionID: null,
        limit: 10,
      });
      if (topSingles.length > 0) {
        const next = { ...item, UpdatedAt: nowIso() };
        applyTopSinglesToStats(next, topSingles);
        await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
        item = next;
      }
    }

    if (item) {
      item = {
        ...item,
        NeedsRecompute: needsRecompute,
        NeedsTopSinglesRepair: needsTopSinglesRepair,
      };
    }

    return res.json({ ok: true, item });
  } catch (e) {
    console.error("GET /api/eventStats error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- TAGSTATS --------------------
app.get("/api/tagStats/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionIDRaw = String(req.query?.sessionID || "").trim();
  const tagKey = String(req.query?.tagKey || "").trim();
  const tagValue = String(req.query?.tagValue || "").trim();
  const sessionID = sessionIDRaw ? normalizeSessionID(sessionIDRaw) : null;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });
  if (!tagKey) return res.status(400).json({ error: "Missing tagKey" });
  if (!tagValue) return res.status(400).json({ error: "Missing tagValue" });

  try {
    const statsKey = buildTagStatsSK(event, sessionID, tagKey, tagValue);
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: statsKey },
        ConsistentRead: true,
      })
    );

    let item = out.Item || null;
    if (!item || !hasCurrentStrictWindowVersion(item)) {
      item = await recomputeTagStats(ddb, TABLE, userID, event, sessionID, tagKey, tagValue);
    }

    return res.json({ ok: true, item });
  } catch (e) {
    console.error("GET /api/tagStats error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/tagValues/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionIDRaw = String(req.query?.sessionID || "").trim();
  const sessionID = sessionIDRaw ? normalizeSessionID(sessionIDRaw) : "";

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  const valuesByField = Object.fromEntries(
    Array.from(ALLOWED_TAG_KEYS).map((field) => [field, new Set()])
  );

  try {
    const profileOut = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
        ConsistentRead: true,
      })
    );
    const tagCatalog =
      profileOut.Item?.TagCatalog && typeof profileOut.Item.TagCatalog === "object"
        ? profileOut.Item.TagCatalog
        : {};
    const globalCatalog =
      tagCatalog.Global && typeof tagCatalog.Global === "object" ? tagCatalog.Global : {};
    const byEventCatalog =
      tagCatalog.ByEvent && typeof tagCatalog.ByEvent === "object" ? tagCatalog.ByEvent : {};

    for (const field of ALLOWED_TAG_KEYS) {
      for (const value of Array.isArray(globalCatalog?.[field]) ? globalCatalog[field] : []) {
        const clean = String(value || "").trim();
        if (clean) valuesByField[field].add(clean);
      }
    }

    for (const eventKey of getTagScopeEventCandidates(event)) {
      const scoped = byEventCatalog?.[eventKey];
      if (!scoped || typeof scoped !== "object") continue;

      for (const field of ALLOWED_TAG_KEYS) {
        for (const value of Array.isArray(scoped?.[field]) ? scoped[field] : []) {
          const clean = String(value || "").trim();
          if (clean) valuesByField[field].add(clean);
        }
      }
    }

    const resolvedValuesByField = Object.fromEntries(
      Object.entries(valuesByField).map(([field, values]) => [
        field,
        Array.from(values).sort((a, b) => a.localeCompare(b)),
      ])
    );

    console.log("GET /api/tagValues", {
      userID,
      event,
      sessionID: sessionID || null,
      counts: Object.fromEntries(
        Object.entries(resolvedValuesByField).map(([field, values]) => [field, values.length])
      ),
      cubeModels: resolvedValuesByField.CubeModel || [],
    });

    return res.json({
      ok: true,
      valuesByField: resolvedValuesByField,
    });
  } catch (e) {
    console.error("GET /api/tagValues error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- SOLVES --------------------
app.get("/api/solves/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionID = normalizeSessionID(req.query?.sessionID || "main");
  const limit = Math.max(1, Math.min(2000, Number(req.query?.limit || 200)));
  const cursorRaw = req.query?.cursor ? String(req.query.cursor) : null;
  const startDay = String(req.query?.startDay || "").trim();
  const endDay = String(req.query?.endDay || "").trim();
  const requestedTimeZone = String(req.query?.timeZone || "").trim();

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  let cursor = undefined;
  if (cursorRaw) {
    try {
      cursor = JSON.parse(decodeURIComponent(cursorRaw));
    } catch {
      cursor = undefined;
    }
  }

  try {
    const fallbackTimeZone = await getUserDayBucketTimeZone(userID);
    const { timeZone, startIso, endExclusiveIso } = getCreatedAtRangeForLocalDays({
      startDay,
      endDay,
      timeZone: requestedTimeZone || fallbackTimeZone,
    });

    let keyConditionExpression = "GSI1PK = :pk";
    const expressionAttributeValues = {
      ":pk": `SESSION#${userID}#${event}#${sessionID}`,
    };

    if (startIso && endExclusiveIso) {
      keyConditionExpression += " AND GSI1SK BETWEEN :startSk AND :endSk";
      expressionAttributeValues[":startSk"] = startIso;
      expressionAttributeValues[":endSk"] = endExclusiveIso;
    } else if (startIso) {
      keyConditionExpression += " AND GSI1SK >= :startSk";
      expressionAttributeValues[":startSk"] = startIso;
    } else if (endExclusiveIso) {
      keyConditionExpression += " AND GSI1SK <= :endSk";
      expressionAttributeValues[":endSk"] = endExclusiveIso;
    }

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      })
    );

    return res.json({
      ok: true,
      items: out.Items || [],
      lastKey: out.LastEvaluatedKey || null,
      timeZone,
    });
  } catch (e) {
    console.error("GET /api/solves error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/solvesLastN/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const rawSessionID = String(req.query?.sessionID || "").trim();
  const sessionID = rawSessionID ? normalizeSessionID(rawSessionID) : null;
  const n = Math.max(1, Math.min(5000, Number(req.query?.n || 100)));

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const out = await ddb.send(
      new QueryCommand(
        sessionID
          ? {
              TableName: TABLE,
              IndexName: "GSI1",
              KeyConditionExpression: "GSI1PK = :pk",
              ExpressionAttributeValues: {
                ":pk": `SESSION#${userID}#${event}#${sessionID}`,
              },
              ScanIndexForward: false,
              Limit: n,
            }
          : {
              TableName: TABLE,
              IndexName: "GSI2",
              KeyConditionExpression: "GSI2PK = :pk",
              ExpressionAttributeValues: {
                ":pk": `EVENT#${userID}#${event}`,
              },
              ScanIndexForward: false,
              Limit: n,
            }
      )
    );

    return res.json({ ok: true, items: out.Items || [] });
  } catch (e) {
    console.error("GET /api/solvesLastN error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/solveWindow/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionID = normalizeSessionID(req.query?.sessionID || "main");
  const startSolveRef = String(req.query?.startSolveRef || "").trim();
  const n = Math.max(1, Math.min(1000, Number(req.query?.n || 5)));

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });
  if (!startSolveRef) return res.status(400).json({ error: "Missing startSolveRef" });

  const parsed = parseSolveSK(startSolveRef);
  const createdAt = String(parsed?.createdAt || "").trim();
  const solveID = String(parsed?.solveID || "").trim();

  if (!createdAt || !solveID) {
    return res.status(400).json({ error: "Invalid startSolveRef" });
  }

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND GSI1SK >= :start",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${event}#${sessionID}`,
          ":start": `${createdAt}#${solveID}`,
        },
        ScanIndexForward: true,
        Limit: n,
      })
    );

    return res.json({ ok: true, items: out.Items || [] });
  } catch (e) {
    console.error("GET /api/solveWindow error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- TAG QUERIES --------------------
app.get("/api/solvesByTag/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const rawTagKey = String(req.query?.tagKey || "").trim();
  const rawTagValue = String(req.query?.tagValue || "").trim();
  const event = normalizeEvent(req.query?.event || "");
  const sessionIDRaw = String(req.query?.sessionID || "").trim();
  const sessionID = sessionIDRaw ? normalizeSessionID(sessionIDRaw) : "";
  const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 100)));
  const hydrate = String(req.query?.hydrate || "true").toLowerCase() !== "false";
  const cursorRaw = req.query?.cursor ? String(req.query.cursor) : null;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!rawTagKey) return res.status(400).json({ error: "Missing tagKey" });
  if (!rawTagValue) return res.status(400).json({ error: "Missing tagValue" });

  if (!ALLOWED_TAG_KEYS.has(rawTagKey)) {
    return res.status(400).json({ error: "Invalid tagKey" });
  }

  const tagValueNorm = normalizeTagIndexValue(rawTagValue);

  let keyConditionExpression = "GSI3PK = :pk";
  const exprValues = {
    ":pk": `TAG#${userID}#${rawTagKey}#${tagValueNorm}`,
  };

  if (event && sessionID) {
    keyConditionExpression += " AND begins_with(GSI3SK, :sk)";
    exprValues[":sk"] = `${event}#${sessionID}#`;
  } else if (event) {
    keyConditionExpression += " AND begins_with(GSI3SK, :sk)";
    exprValues[":sk"] = `${event}#`;
  }

  let cursor = undefined;
  if (cursorRaw) {
    try {
      cursor = JSON.parse(decodeURIComponent(cursorRaw));
    } catch {
      cursor = undefined;
    }
  }

  try {
    if (ENABLE_SPARSE_TAG_READS && ["CubeModel", "CrossColor", "Method"].includes(rawTagKey)) {
      const sparseOut = await querySolvesBySparseTag(ddb, TABLE, userID, rawTagKey, rawTagValue, {
        event,
        sessionID,
        limit,
        cursor,
      });

      return res.json({
        ok: true,
        items: sparseOut.items || [],
        lastKey: sparseOut.lastKey || null,
        source: "sparse-gsi",
      });
    }

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI3",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: exprValues,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      })
    );

    const tagItems = out.Items || [];

    if (!hydrate) {
      return res.json({
        ok: true,
        items: tagItems,
        lastKey: out.LastEvaluatedKey || null,
      });
    }

    const keys = tagItems
      .filter((it) => it?.SolvePK && it?.SolveSK)
      .map((it) => ({ PK: it.SolvePK, SK: it.SolveSK }));

    const solves = await batchGetItems(keys);
    const solveMap = new Map(solves.map((s) => [`${s.PK}|${s.SK}`, s]));

    const hydrated = tagItems
      .map((it) => solveMap.get(`${it.SolvePK}|${it.SolveSK}`))
      .filter(Boolean)
      .sort((a, b) => String(b.CreatedAt || "").localeCompare(String(a.CreatedAt || "")));

    return res.json({
      ok: true,
      items: hydrated,
      lastKey: out.LastEvaluatedKey || null,
      source: "solvetag",
    });
  } catch (e) {
    console.error("GET /api/solvesByTag error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/solve", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const event = normalizeEvent(req.body?.event);
    const sessionID = normalizeSessionID(req.body?.sessionID || "main");
    const rawTimeMs = Number(req.body?.rawTimeMs ?? req.body?.ms);
    const createdAt = resolveImportedCreatedAt(req.body, Date.now());

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });
    if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) {
      return res.status(400).json({ error: "Invalid rawTimeMs" });
    }

    const penalty = normalizePenalty(req.body?.penalty ?? null);
    const scramble = req.body?.scramble ?? "";
    const note = req.body?.note ?? "";
    const tags = req.body?.tags ?? {};

    const solveItem = buildSolveItem({
      userID,
      event,
      sessionID,
      rawTimeMs,
      penalty,
      scramble,
      note,
      tags,
      createdAt,
    });

    await putSolveAndTagItems(ddb, TABLE, solveItem);
    await syncSingleRankItemsForMutation({ userID, oldSolve: null, newSolve: solveItem });

    const tagPairs = getSolveTagPairsFromItem(solveItem);
    const tagStatJobs = tagPairs.flatMap((pair) => {
      const tagKey = String(pair?.key || "").trim();
      const tagValue = String(pair?.value || "").trim();
      if (!tagKey || !tagValue) return [];

      return [
        upsertTagStatsOnNewSolve(ddb, TABLE, userID, solveItem, {
          event: solveItem.Event,
          sessionID: solveItem.SessionID,
          tagKey,
          tagValue,
        }),
        upsertTagStatsOnNewSolve(ddb, TABLE, userID, solveItem, {
          event: solveItem.Event,
          sessionID: null,
          tagKey,
          tagValue,
        }),
      ];
    });

    const [sessionStats, eventStats] = await Promise.all([
      applyIncrementalStatsForScope({
        userID,
        event: solveItem.Event,
        sessionID: solveItem.SessionID,
        addSolve: solveItem,
      }),
      applyIncrementalStatsForScope({
        userID,
        event: solveItem.Event,
        addSolve: solveItem,
      }),
      ...tagStatJobs,
    ]);
    runInBackground(`dayBuckets:add:${userID}:${solveItem.Event}`, () =>
      recomputeDayBucketsForSolveMutation({
        userID,
        newSolve: solveItem,
      })
    );

    return res.json({
      ok: true,
      item: solveItem,
      sessionStats,
      eventStats,
      dayBuckets: { queued: true },
    });
  } catch (e) {
    console.error("POST /api/solve error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/importJobs", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const format = String(req.body?.format || "unknown").trim() || "unknown";
    const sourceKey = normalizeImportSourceKey(req.body?.sourceKey || "");
    const totalSolves = Math.max(0, Number(req.body?.totalSolves || 0));
    const totalChunks = Math.max(0, Number(req.body?.totalChunks || 0));
    const label = String(req.body?.label || "").trim().slice(0, 160);
    const metadata =
      req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

    if (!userID) return res.status(400).json({ error: "Missing userID" });

    const jobID = createImportJobID();
    const ts = nowIso();
    const item = {
      PK: `USER#${userID}`,
      SK: buildImportJobSK(jobID),
      ItemType: "IMPORTJOB",
      JobID: jobID,
      UserID: userID,
      Status: "PENDING",
      Format: format,
      SourceKey: sourceKey,
      Label: label,
      Metadata: metadata,
      TotalSolves: totalSolves,
      ProcessedSolves: 0,
      TotalChunks: totalChunks,
      ReceivedChunks: 0,
      AffectedEvents: [],
      AffectedSessions: [],
      Recompute: {
        sessionsCompleted: 0,
        totalSessions: 0,
        eventsCompleted: 0,
        totalEvents: 0,
      },
      CreatedAt: ts,
      UpdatedAt: ts,
      StartedAt: null,
      FinalizedAt: null,
      CompletedAt: null,
      FailedAt: null,
      Error: null,
    };

    await putImportJobItem(item);
    return res.json({ ok: true, job: publicImportJob(item) });
  } catch (e) {
    console.error("POST /api/importJobs error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/importJobs/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.params.userID || "").trim();
    const limit = Number(req.query?.limit || 20);

    if (!userID) return res.status(400).json({ error: "Missing userID" });

    const items = await listImportJobs(userID, limit);
    return res.json({ ok: true, items: items.map((item) => publicImportJob(item)) });
  } catch (e) {
    console.error("GET /api/importJobs/:userID error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/importJobs/:userID/:jobID", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.params.userID || "").trim();
    const jobID = String(req.params.jobID || "").trim();

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!jobID) return res.status(400).json({ error: "Missing jobID" });

    const item = await getImportJobItem(userID, jobID);
    if (!item) return res.status(404).json({ error: "Import job not found" });
    return res.json({ ok: true, job: publicImportJob(item) });
  } catch (e) {
    console.error("GET /api/importJobs/:userID/:jobID error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/importJobs/:userID/:jobID/cancel", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.params.userID || "").trim();
    const jobID = String(req.params.jobID || "").trim();

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!jobID) return res.status(400).json({ error: "Missing jobID" });

    const item = await getImportJobItem(userID, jobID);
    if (!item) return res.status(404).json({ error: "Import job not found" });

    const status = normalizeImportJobStatus(item.Status);
    if (status === "COMPLETED") {
      return res.status(409).json({ error: "Completed jobs cannot be canceled" });
    }
    if (status === "FAILED") {
      return res.status(409).json({ error: "Failed jobs cannot be canceled" });
    }

    const next = {
      ...item,
      Status: "CANCELED",
      Error: null,
      UpdatedAt: nowIso(),
    };
    await putImportJobItem(next);
    return res.json({ ok: true, job: publicImportJob(next) });
  } catch (e) {
    console.error("POST /api/importJobs/:userID/:jobID/cancel error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/importJobs/:userID/:jobID/chunk", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.params.userID || "").trim();
    const jobID = String(req.params.jobID || "").trim();
    const solves = Array.isArray(req.body?.solves) ? req.body.solves : [];
    const sourceKey = normalizeImportSourceKey(req.body?.sourceKey || "");

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!jobID) return res.status(400).json({ error: "Missing jobID" });
    if (solves.length === 0) return res.json({ ok: true, wrote: 0, accepted: 0, skipped: 0 });
    if (solves.length > 5000) {
      return res.status(400).json({ error: "Too many solves in one chunk (max 5000)" });
    }

    const job = await getImportJobItem(userID, jobID);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    const status = normalizeImportJobStatus(job.Status);
    if (["FINALIZING", "COMPLETED", "FAILED", "CANCELED"].includes(status)) {
      return res.status(409).json({ error: `Import job is ${status.toLowerCase()}` });
    }

    const requests = [];
    const solveItems = [];
    const sessionScopeKeys = new Set(Array.isArray(job.AffectedSessions) ? job.AffectedSessions : []);
    const eventSet = new Set(Array.isArray(job.AffectedEvents) ? job.AffectedEvents : []);
    const ensuredSessions = new Set();
    let validSolves = 0;

    for (const rawSolve of solves) {
      const event = normalizeEvent(rawSolve?.event || rawSolve?.Event);
      const sessionID = normalizeSessionID(
        rawSolve?.sessionID || rawSolve?.SessionID || rawSolve?._importSessionID || "main"
      );

      if (!event) continue;

      const sessionScopeKey = buildImportSessionScopeKey(event, sessionID);
      if (!sessionScopeKey) continue;

      if (!ensuredSessions.has(sessionScopeKey)) {
        await ensureSessionRecordExists(
          userID,
          event,
          sessionID,
          rawSolve?._importSessionName || rawSolve?.sessionName || rawSolve?.SessionName || null
        );
        ensuredSessions.add(sessionScopeKey);
      }

      let rawTimeMs = Number(
        rawSolve?.rawTimeMs ??
          rawSolve?.RawTimeMs ??
          rawSolve?.originalTime ??
          rawSolve?.OriginalTime ??
          rawSolve?.time ??
          rawSolve?.Time
      );
      if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) continue;

      const penalty = normalizePenalty(rawSolve?.penalty ?? rawSolve?.Penalty ?? null);
      if (
        penalty === "+2" &&
        typeof rawSolve?.originalTime === "undefined" &&
        typeof rawSolve?.OriginalTime === "undefined" &&
        typeof rawSolve?.rawTimeMs === "undefined" &&
        typeof rawSolve?.RawTimeMs === "undefined"
      ) {
        rawTimeMs = Math.max(0, rawTimeMs - 2000);
      }

      const createdAt = resolveImportedCreatedAt(rawSolve, Date.now() + validSolves);
      const solveID = buildDeterministicImportedSolveID({
        userID,
        sourceKey: sourceKey || job.SourceKey || job.JobID,
        event,
        sessionID,
        solve: { ...rawSolve, datetime: createdAt },
        importOrdinal: rawSolve?.importOrdinal ?? rawSolve?._importOrdinal ?? validSolves,
      });

      const solveItem = buildSolveItem({
        userID,
        event,
        sessionID,
        rawTimeMs,
        penalty,
        scramble: rawSolve?.scramble ?? rawSolve?.Scramble ?? "",
        note: rawSolve?.note ?? rawSolve?.Note ?? "",
        tags: rawSolve?.tags ?? rawSolve?.Tags ?? {},
        createdAt,
        solveID,
      });

      solveItems.push(solveItem);
      requests.push({ PutRequest: { Item: solveItem } });
      for (const tagItem of buildSolveTagItems(solveItem)) {
        requests.push({ PutRequest: { Item: tagItem } });
      }
      for (const rankItem of buildSingleRankItemsForSolve(userID, solveItem)) {
        requests.push({ PutRequest: { Item: rankItem } });
      }

      sessionScopeKeys.add(sessionScopeKey);
      eventSet.add(event);
      validSolves += 1;
    }

    const existingSolveItems = await batchGetItems(
      solveItems.map((item) => ({ PK: item.PK, SK: item.SK }))
    );
    const existingSolveKeys = new Set(existingSolveItems.map((item) => `${item?.PK}|${item?.SK}`));
    const accepted = solveItems.reduce(
      (count, item) => count + (existingSolveKeys.has(`${item.PK}|${item.SK}`) ? 0 : 1),
      0
    );

    const wrote = await batchWriteRequestsWithRetry(requests);
    const ts = nowIso();
    const next = {
      ...job,
      Status: "RUNNING",
      StartedAt: job.StartedAt || ts,
      UpdatedAt: ts,
      Error: null,
      ProcessedSolves: Number(job.ProcessedSolves || 0) + accepted,
      ReceivedChunks: Number(job.ReceivedChunks || 0) + 1,
      AffectedEvents: Array.from(eventSet).sort((a, b) => a.localeCompare(b)),
      AffectedSessions: Array.from(sessionScopeKeys).sort((a, b) => a.localeCompare(b)),
    };
    await putImportJobItem(next);

    return res.json({
      ok: true,
      wrote,
      accepted,
      skipped: Math.max(0, solves.length - accepted),
      job: publicImportJob(next),
    });
  } catch (e) {
    console.error("POST /api/importJobs/:userID/:jobID/chunk error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/importJobs/:userID/:jobID/finalize", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.params.userID || "").trim();
    const jobID = String(req.params.jobID || "").trim();

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!jobID) return res.status(400).json({ error: "Missing jobID" });

    const job = await getImportJobItem(userID, jobID);
    if (!job) return res.status(404).json({ error: "Import job not found" });

    const status = normalizeImportJobStatus(job.Status);
    if (status === "COMPLETED") return res.json({ ok: true, job: publicImportJob(job) });
    if (status === "FINALIZING") return res.json({ ok: true, job: publicImportJob(job) });
    if (status === "FAILED") return res.status(409).json({ error: "Import job failed" });
    if (status === "CANCELED") return res.status(409).json({ error: "Import job canceled" });

    const prepared = {
      ...job,
      Status: "FINALIZING",
      Error: null,
      FinalizedAt: nowIso(),
      UpdatedAt: nowIso(),
      Recompute: {
        sessionsCompleted: 0,
        totalSessions: Array.isArray(job.AffectedSessions) ? job.AffectedSessions.length : 0,
        eventsCompleted: 0,
        totalEvents: Array.isArray(job.AffectedEvents) ? job.AffectedEvents.length : 0,
      },
    };
    await putImportJobItem(prepared);

    runInBackground(`importJob:finalize:${userID}:${jobID}`, () =>
      finalizeImportJobInBackground(userID, jobID)
    );

    return res.json({ ok: true, job: publicImportJob(prepared) });
  } catch (e) {
    console.error("POST /api/importJobs/:userID/:jobID/finalize error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/importSolvesBatch", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const event = normalizeEvent(req.body?.event);
    const sessionID = normalizeSessionID(req.body?.sessionID || "main");
    const solves = Array.isArray(req.body?.solves) ? req.body.solves : [];
    const skipPostWriteRecompute = !!req.body?.skipPostWriteRecompute;

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });
    if (solves.length === 0) return res.json({ ok: true, addedSolves: [], wrote: 0 });
    if (solves.length > 5000) {
      return res.status(400).json({ error: "Too many solves in one batch (max 5000)" });
    }

    await ensureSessionRecordExists(
      userID,
      event,
      sessionID,
      sessionID === "main" ? "Main" : null
    );

    const requests = [];
    const addedSolves = [];
    const baseNow = Date.now();

    for (let i = 0; i < solves.length; i++) {
      const s = solves[i] || {};
      const penalty = normalizePenalty(s.penalty ?? s.Penalty ?? null);

      let rawTimeMs = Number(s.rawTimeMs ?? s.RawTimeMs ?? s.originalTime ?? s.OriginalTime ?? s.time ?? s.Time);
      if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) continue;

      if (
        penalty === "+2" &&
        typeof s.originalTime === "undefined" &&
        typeof s.OriginalTime === "undefined" &&
        typeof s.rawTimeMs === "undefined" &&
        typeof s.RawTimeMs === "undefined"
      ) {
        rawTimeMs = Math.max(0, rawTimeMs - 2000);
      }

      const createdAt = resolveImportedCreatedAt(s, baseNow + i);

      const solveItem = buildSolveItem({
        userID,
        event,
        sessionID,
        rawTimeMs,
        penalty,
        scramble: s.scramble ?? s.Scramble ?? "",
        note: s.note ?? s.Note ?? "",
        tags: s.tags ?? s.Tags ?? {},
        createdAt,
      });

      requests.push({ PutRequest: { Item: solveItem } });
      const tagItems = buildSolveTagItems(solveItem);
      for (const tagItem of tagItems) {
        requests.push({ PutRequest: { Item: tagItem } });
      }
      const rankItems = buildSingleRankItemsForSolve(userID, solveItem);
      for (const rankItem of rankItems) {
        requests.push({ PutRequest: { Item: rankItem } });
      }

      addedSolves.push({
        solveRef: solveItem.SK,
        time: solveItem.FinalTimeMs,
        rawTime: solveItem.RawTimeMs,
        originalTime: solveItem.RawTimeMs,
        scramble: solveItem.Scramble || "",
        event: solveItem.Event,
        penalty: solveItem.Penalty || null,
        note: solveItem.Note || "",
        datetime: solveItem.CreatedAt,
        tags: solveItem.Tags || {},
        sessionID: solveItem.SessionID || sessionID,
      });
    }

    const wrote = await batchWriteRequestsWithRetry(requests);
    let sessionStats = null;
    let eventStats = null;
    let dayBuckets = { event, daysAffected: [] };

    if (addedSolves.length > 0 && !skipPostWriteRecompute) {
      [sessionStats, eventStats, dayBuckets] = await Promise.all([
        recomputeSessionStats(ddb, TABLE, userID, event, sessionID),
        recomputeEventStats(ddb, TABLE, userID, event),
        recomputeAllDayBucketsForEvent(userID, event),
      ]);
    }

    return res.json({ ok: true, addedSolves, wrote, sessionStats, eventStats, dayBuckets });
  } catch (e) {
    console.error("POST /api/importSolvesBatch error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/wca/import", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const wcaID = normalizeWcaId(req.body?.wcaID || req.body?.WCAID || "");
    const incomingSettings =
      req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!wcaID) return res.status(400).json({ error: "Missing WCA ID" });

    const userOut = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
      })
    );

    const userItem = userOut.Item || null;
    if (!userItem) return res.status(404).json({ error: "User not found" });

    const payload = await fetchWcaResultsPayload(wcaID);
    const competitionDateMap = await hydrateWcaCompetitionDateMap(payload);
    const rows = extractWcaResultEntries(payload, competitionDateMap);
    const { groups, skippedEvents } = buildWcaImportSolves(rows, incomingSettings);

    if (!groups.length) {
      return res.status(400).json({
        error: "No importable WCA solve data was found for that ID.",
      });
    }

    const requests = [];
    let importedSolveCount = 0;
    let importedEventCount = 0;

    for (const group of groups) {
      const event = normalizeEvent(group.event);
      const sessionID = normalizeSessionID(group.sessionID);
      const solves = Array.isArray(group.solves) ? group.solves : [];
      if (!solves.length) continue;

      await ensureSessionRecordExists(
        userID,
        event,
        sessionID,
        sessionID === "main" ? "Main" : null
      );

      const existingSolves = await getAllSolvesForSession(userID, event, sessionID);
      const existingSignatures = new Set(existingSolves.map((item) => buildWcaSolveSignature(item)));
      let groupAddedCount = 0;

      for (let i = 0; i < solves.length; i++) {
        const s = solves[i] || {};
        const createdAt = resolveImportedCreatedAt(s, Date.now() + i * 1000);
        const signature = buildWcaSolveSignature({
          datetime: createdAt,
          rawTimeMs: s.rawTimeMs,
          penalty: s.penalty,
          note: s.note,
        });
        if (existingSignatures.has(signature)) continue;

        const solveItem = buildSolveItem({
          userID,
          event,
          sessionID,
          rawTimeMs: s.rawTimeMs,
          penalty: s.penalty,
          scramble: s.scramble ?? "",
          note: s.note ?? "",
          tags: s.tags ?? {},
          createdAt,
        });

        requests.push({ PutRequest: { Item: solveItem } });
        for (const tagItem of buildSolveTagItems(solveItem)) {
          requests.push({ PutRequest: { Item: tagItem } });
        }
        for (const rankItem of buildSingleRankItemsForSolve(userID, solveItem)) {
          requests.push({ PutRequest: { Item: rankItem } });
        }
        existingSignatures.add(signature);
        importedSolveCount += 1;
        groupAddedCount += 1;
      }

      if (groupAddedCount > 0) importedEventCount += 1;
    }

    if (requests.length) {
      await batchWriteRequestsWithRetry(requests);

      const affectedEvents = new Set();
      for (const group of groups) {
        if (!Array.isArray(group.solves) || !group.solves.length) continue;
        await recomputeSessionStats(ddb, TABLE, userID, group.event, group.sessionID);
        affectedEvents.add(normalizeEvent(group.event));
      }

      for (const event of affectedEvents) {
        if (!event) continue;
        await recomputeEventStats(ddb, TABLE, userID, event);
        await recomputeAllDayBucketsForEvent(userID, event);
      }
    }

    const mergedSettings = {
      ...(userItem.Settings && typeof userItem.Settings === "object" ? userItem.Settings : {}),
      ...incomingSettings,
      wcaImportLastSyncAt: nowIso(),
    };

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
        UpdateExpression: "SET #WCAID = :wcaid, #Settings = :settings, #UpdatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#WCAID": "WCAID",
          "#Settings": "Settings",
          "#UpdatedAt": "UpdatedAt",
        },
        ExpressionAttributeValues: {
          ":wcaid": wcaID,
          ":settings": mergedSettings,
          ":updatedAt": nowIso(),
        },
      })
    );

    const updatedUser = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: "PROFILE" },
      })
    );

    return res.json({
      ok: true,
      importedSolveCount,
      importedEventCount,
      skippedEvents,
      user: updatedUser.Item || null,
    });
  } catch (e) {
    console.error("POST /api/wca/import error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/solves/move-session", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const startedAt = Date.now();
    const userID = String(req.body?.userID || "").trim();
    const fromEvent = normalizeEvent(req.body?.fromEvent);
    const fromSessionID = normalizeSessionID(req.body?.fromSessionID || "main");
    const toEvent = normalizeEvent(req.body?.toEvent || fromEvent);
    const toSessionID = normalizeSessionID(req.body?.toSessionID || "main");
    const solveRefsRaw = Array.isArray(req.body?.solveRefs) ? req.body.solveRefs : [];

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!fromEvent) return res.status(400).json({ error: "Missing fromEvent" });
    if (!toEvent) return res.status(400).json({ error: "Missing toEvent" });

    const solveRefs = Array.from(
      new Set(
        solveRefsRaw
          .map((ref) => String(ref || "").trim())
          .filter(Boolean)
          .map((ref) => (ref.startsWith("SOLVE#") ? ref : `SOLVE#${ref}`))
      )
    );

    if (solveRefs.length === 0) {
      return res.json({ ok: true, requested: 0, moved: 0, wrote: 0 });
    }

    if (solveRefs.length > 1000) {
      return res.status(400).json({ error: "Too many solves in one move (max 1000)" });
    }

    const readStartedAt = Date.now();
    const existingItems = await batchGetItems(
      solveRefs.map((solveRef) => ({
        PK: `USER#${userID}`,
        SK: solveRef,
      }))
    );
    const readMs = Date.now() - readStartedAt;

    const existingBySK = new Map(existingItems.map((item) => [String(item?.SK || ""), item]));
    const writeRequests = [];
    const sessionScopes = new Map();
    const eventScopes = new Set();
    const tagScopeMutations = new Map();
    let skipped = 0;

    for (const solveRef of solveRefs) {
      const existing = existingBySK.get(solveRef);
      if (!existing) {
        skipped += 1;
        continue;
      }

      const rawTimeMs = getRawTimeMs(existing);
      if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) {
        skipped += 1;
        continue;
      }

      const oldEvent = normalizeEvent(existing.Event);
      const oldSessionID = normalizeSessionID(existing.SessionID);
      const nextEvent = toEvent;
      const nextSessionID = toSessionID;

      if (oldEvent === nextEvent && oldSessionID === nextSessionID) {
        skipped += 1;
        continue;
      }

      const rebuilt = buildSolveItem({
        userID,
        event: nextEvent,
        sessionID: nextSessionID,
        rawTimeMs,
        penalty: existing.Penalty,
        scramble: existing.Scramble ?? "",
        note: existing.Note ?? "",
        tags: existing.Tags ?? {},
        createdAt: existing.CreatedAt,
        solveID: existing.SolveID,
        existing,
      });

      writeRequests.push(...buildReplaceSolveAndTagRequests(existing, rebuilt));
      writeRequests.push(...buildSingleRankMutationRequests({ userID, oldSolve: existing, newSolve: rebuilt }));

      sessionScopes.set(`${oldEvent}|${oldSessionID}`, { event: oldEvent, sessionID: oldSessionID });
      sessionScopes.set(`${nextEvent}|${nextSessionID}`, { event: nextEvent, sessionID: nextSessionID });
      eventScopes.add(oldEvent);
      eventScopes.add(nextEvent);
      addTagScopeMutation(tagScopeMutations, existing, "remove");
      addTagScopeMutation(tagScopeMutations, rebuilt, "add");
    }

    const writeStartedAt = Date.now();
    const wrote = await batchWriteRequestsWithRetry(writeRequests);
    const writeMs = Date.now() - writeStartedAt;

    const recomputeStartedAt = Date.now();
    await Promise.all([
      ...Array.from(sessionScopes.values()).map((scope) =>
        recomputeSessionStats(ddb, TABLE, userID, scope.event, scope.sessionID)
      ),
      ...Array.from(eventScopes.values()).map((event) => recomputeEventStats(ddb, TABLE, userID, event)),
      ...Array.from(tagScopeMutations.values()).map((scope) =>
        applyIncrementalTagStatsForScope({
          userID,
          event: scope.event,
          sessionID: scope.sessionID,
          tagKey: scope.tagKey,
          tagValue: scope.tagValue,
          removeSolves: scope.removeSolves,
          addSolves: scope.addSolves,
        })
      ),
    ]);
    const recomputeMs = Date.now() - recomputeStartedAt;

    return res.json({
      ok: true,
      requested: solveRefs.length,
      moved: solveRefs.length - skipped,
      skipped,
      wrote,
      timings: {
        totalMs: Date.now() - startedAt,
        readMs,
        writeMs,
        recomputeMs,
      },
      fromEvent,
      fromSessionID,
      toEvent,
      toSessionID,
    });
  } catch (e) {
    console.error("POST /api/solves/move-session error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/solves/bulk-tags", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const updatesRaw = Array.isArray(req.body?.updates) ? req.body.updates : [];

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!updatesRaw.length) return res.json({ ok: true, updated: 0, items: [] });
    if (updatesRaw.length > 1000) {
      return res.status(400).json({ error: "Too many solves in one bulk tag update (max 1000)" });
    }

    const normalizedUpdates = Array.from(
      new Map(
        updatesRaw
          .map((entry) => {
            const solveRef = String(entry?.solveRef || "").trim();
            const ref = solveRef && !solveRef.startsWith("SOLVE#") ? `SOLVE#${solveRef}` : solveRef;
            const tags = entry?.tags && typeof entry.tags === "object" ? entry.tags : {};
            return [ref, { solveRef: ref, tags }];
          })
          .filter(([solveRef]) => Boolean(solveRef))
      ).values()
    );

    if (!normalizedUpdates.length) return res.json({ ok: true, updated: 0, items: [] });

    const existingItems = await batchGetItems(
      normalizedUpdates.map(({ solveRef }) => ({
        PK: `USER#${userID}`,
        SK: solveRef,
      }))
    );
    const existingBySK = new Map(existingItems.map((item) => [String(item?.SK || ""), item]));

    const writeRequests = [];
    const tagScopeMutations = new Map();
    const updatedItems = [];

    for (const update of normalizedUpdates) {
      const existing = existingBySK.get(update.solveRef);
      if (!existing) continue;

      const nextTags = update.tags && typeof update.tags === "object" ? update.tags : {};
      const rebuilt = buildSolveItem({
        userID,
        event: existing.Event,
        sessionID: existing.SessionID,
        rawTimeMs: getRawTimeMs(existing),
        penalty: existing.Penalty,
        scramble: existing.Scramble ?? "",
        note: existing.Note ?? "",
        tags: nextTags,
        createdAt: existing.CreatedAt,
        solveID: existing.SolveID,
        existing,
      });

      const oldPairs = getSolveTagPairsFromItem(existing)
        .map((pair) => `${String(pair?.key || "").trim()}|${String(pair?.value || "").trim()}`)
        .sort((a, b) => a.localeCompare(b))
        .join("||");
      const newPairs = getSolveTagPairsFromItem(rebuilt)
        .map((pair) => `${String(pair?.key || "").trim()}|${String(pair?.value || "").trim()}`)
        .sort((a, b) => a.localeCompare(b))
        .join("||");

      if (oldPairs === newPairs) {
        updatedItems.push(existing);
        continue;
      }

      writeRequests.push(...buildReplaceSolveAndTagRequests(existing, rebuilt));
      addTagScopeMutation(tagScopeMutations, existing, "remove");
      addTagScopeMutation(tagScopeMutations, rebuilt, "add");
      updatedItems.push(rebuilt);
    }

    const wrote = await batchWriteRequestsWithRetry(writeRequests);

    await Promise.all(
      Array.from(tagScopeMutations.values()).map((scope) =>
        applyIncrementalTagStatsForScope({
          userID,
          event: scope.event,
          sessionID: scope.sessionID,
          tagKey: scope.tagKey,
          tagValue: scope.tagValue,
          removeSolves: scope.removeSolves,
          addSolves: scope.addSolves,
        })
      )
    );

    return res.json({
      ok: true,
      updated: updatedItems.length,
      wrote,
      items: updatedItems,
    });
  } catch (e) {
    console.error("POST /api/solves/bulk-tags error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.put("/api/solve/:userID/:solveRef", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const solveRef = String(req.params.solveRef || "").trim();
  const updates = req.body?.updates;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!solveRef) return res.status(400).json({ error: "Missing solveRef" });
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Missing updates" });
  }

  try {
    const existing = await getSolveItem(userID, solveRef);
    if (!existing) return res.status(404).json({ error: "Solve not found" });

    const nextEvent = normalizeEvent(updates.Event ?? existing.Event);
    const nextSessionID = normalizeSessionID(updates.SessionID ?? existing.SessionID);

    let nextRawTimeMs =
      typeof updates.RawTimeMs !== "undefined"
        ? Number(updates.RawTimeMs)
        : getRawTimeMs(existing);

    if (!Number.isFinite(nextRawTimeMs) || nextRawTimeMs < 0) {
      return res.status(400).json({ error: "Invalid RawTimeMs in updates" });
    }

    const nextPenalty =
      typeof updates.Penalty !== "undefined"
        ? normalizePenalty(updates.Penalty)
        : normalizePenalty(existing.Penalty);

    const nextScramble =
      typeof updates.Scramble !== "undefined" ? updates.Scramble : existing.Scramble ?? "";

    const nextNote =
      typeof updates.Note !== "undefined" ? updates.Note : existing.Note ?? "";

    const nextTags =
      typeof updates.Tags !== "undefined" ? updates.Tags : existing.Tags ?? {};

    const rebuilt = buildSolveItem({
      userID,
      event: nextEvent,
      sessionID: nextSessionID,
      rawTimeMs: nextRawTimeMs,
      penalty: nextPenalty,
      scramble: nextScramble,
      note: nextNote,
      tags: nextTags,
      createdAt: existing.CreatedAt,
      solveID: existing.SolveID,
      existing,
    });

    for (const [k, v] of Object.entries(updates)) {
      if (
        [
          "PK",
          "SK",
          "Event",
          "SessionID",
          "RawTimeMs",
          "FinalTimeMs",
          "Penalty",
          "IsDNF",
          "Scramble",
          "Note",
          "Tags",
          "CreatedAt",
          "UpdatedAt",
          "SolveID",
          "GSI1PK",
          "GSI1SK",
          "GSI2PK",
          "GSI2SK",
          "SolveTagSK",
          "CubeModelIdx",
          "StartColorIdx",
          "MethodIdx",
          "GSI3PK",
          "GSI3SK",
          "Tag_CubeModel",
          "Tag_CrossColor",
          "Tag_Method",
          "Tag_TimerInput",
          "Tag_Custom1",
          "Tag_Custom2",
          "Tag_Custom3",
          "Tag_Custom4",
          "Tag_Custom5",
        ].includes(k)
      ) {
        continue;
      }
      rebuilt[k] = v;
    }

    await replaceSolveAndTagItems(ddb, TABLE, existing, rebuilt);
    await syncSingleRankItemsForMutation({ userID, oldSolve: existing, newSolve: rebuilt });

    await applySolveMutationStats({
      userID,
      oldSolve: existing,
      newSolve: rebuilt,
    });

    runInBackground(`dayBuckets:edit:${userID}:${rebuilt.Event}`, () =>
      recomputeDayBucketsForSolveMutation({
        userID,
        oldSolve: existing,
        newSolve: rebuilt,
      })
    );

    return res.json({ ok: true, item: rebuilt });
  } catch (e) {
    console.error("PUT /api/solve error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.put("/api/solvePenalty/:userID/:solveRef", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const solveRef = String(req.params.solveRef || "").trim();
  const penalty = normalizePenalty(req.body?.penalty ?? null);

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!solveRef) return res.status(400).json({ error: "Missing solveRef" });

  try {
    const existing = await getSolveItem(userID, solveRef);
    if (!existing) return res.status(404).json({ error: "Solve not found" });

    const rawTimeMs =
      Number.isFinite(Number(req.body?.rawTimeMs))
        ? Number(req.body.rawTimeMs)
        : getRawTimeMs(existing);

    if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) {
      return res.status(400).json({ error: "Invalid rawTimeMs" });
    }

    const updated = buildSolveItem({
      userID,
      event: existing.Event,
      sessionID: existing.SessionID,
      rawTimeMs,
      penalty,
      scramble: existing.Scramble ?? "",
      note: existing.Note ?? "",
      tags: existing.Tags ?? {},
      createdAt: existing.CreatedAt,
      solveID: existing.SolveID,
      existing,
    });

    await replaceSolveAndTagItems(ddb, TABLE, existing, updated);
    await syncSingleRankItemsForMutation({ userID, oldSolve: existing, newSolve: updated });

    await applySolveMutationStats({
      userID,
      oldSolve: existing,
      newSolve: updated,
    });

    runInBackground(`dayBuckets:penalty:${userID}:${updated.Event}`, () =>
      recomputeDayBucketsForSolveMutation({
        userID,
        oldSolve: existing,
        newSolve: updated,
      })
    );

    return res.json({ ok: true, item: updated });
  } catch (e) {
    console.error("PUT /api/solvePenalty error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.delete("/api/solve/:userID/:solveRef", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const solveRef = String(req.params.solveRef || "").trim();

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!solveRef) return res.status(400).json({ error: "Missing solveRef" });

  try {
    const existing = await getSolveItem(userID, solveRef);
    if (!existing) return res.json({ ok: true, skipped: true });

    await deleteSolveAndTagItems(ddb, TABLE, existing);
    await syncSingleRankItemsForMutation({ userID, oldSolve: existing, newSolve: null });

    await applySolveMutationStats({
      userID,
      oldSolve: existing,
      newSolve: null,
    });

    runInBackground(`dayBuckets:delete:${userID}:${existing.Event}`, () =>
      recomputeDayBucketsForSolveMutation({
        userID,
        oldSolve: existing,
        newSolve: null,
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/solve error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- BATCH WRITE --------------------
app.post("/api/batchWrite", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const tableName = TABLE;
    const requests = req.body?.requests;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.json({ ok: true, wrote: 0, tableName });
    }

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
            RequestItems: { [tableName]: unprocessed },
          })
        );

        const next = out?.UnprocessedItems?.[tableName] || [];
        wrote += unprocessed.length - next.length;
        unprocessed = next;

        if (!unprocessed.length) break;

        attempt += 1;
        if (attempt > 8) {
          return res.status(500).json({
            ok: false,
            error: `batchWrite exceeded retries; unprocessed=${unprocessed.length}`,
            unprocessed,
            tableName,
          });
        }

        const delay = Math.round(80 * Math.pow(2, attempt));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return res.json({ ok: true, wrote, tableName });
  } catch (e) {
    console.error("POST /api/batchWrite error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

// -------------------- RECOMPUTE --------------------
app.post("/api/recomputeSessionStats", async (req, res) => {
  try {
    const userID = String(req.body?.userID || "").trim();
    const event = normalizeEvent(req.body?.event);
    const sessionID = normalizeSessionID(req.body?.sessionID || "main");

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });

    const item = await recomputeSessionStats(ddb, TABLE, userID, event, sessionID);
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/recomputeSessionStats error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/recomputeEventStats", async (req, res) => {
  try {
    const userID = String(req.body?.userID || "").trim();
    const event = normalizeEvent(req.body?.event);

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });

    const item = await recomputeEventStats(ddb, TABLE, userID, event);
    const dayBuckets = await recomputeAllDayBucketsForEvent(userID, event);
    return res.json({ ok: true, item, dayBuckets });
  } catch (e) {
    console.error("POST /api/recomputeEventStats error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/dayBuckets/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const mainOnly = String(req.query?.mainOnly || "false").toLowerCase() === "true";
  const startDay = String(req.query?.startDay || "").trim();
  const endDay = String(req.query?.endDay || "").trim();

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (mainOnly && !event) {
    return res.status(400).json({ error: "mainOnly requires event" });
  }

  try {
    const timeZone = await getUserDayBucketTimeZone(userID);
    const prefix = event
      ? mainOnly
        ? `DAYBUCKET#EVENT#${event}#MAIN`
        : `DAYBUCKET#EVENT#${event}`
      : "DAYBUCKET#ALL";

    const rangeStart = `${prefix}#${startDay || "0000-00-00"}`;
    const rangeEnd = `${prefix}#${endDay || "9999-99-99"}`;

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":start": rangeStart,
          ":end": rangeEnd,
        },
        ScanIndexForward: true,
      })
    );

    const items = (out.Items || []).filter((item) => hasCurrentDayBucketVersion(item));
    const aggregateSummary = items.length ? mergeDayBucketSummaries(items) : null;
    return res.json({
      ok: true,
      items,
      aggregateSummary,
      scope: event ? (mainOnly ? "event-main" : "event") : "all-events",
      event: event || null,
      timeZone,
    });
  } catch (e) {
    console.error("GET /api/dayBuckets error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/recomputeTagStats", async (req, res) => {
  try {
    const userID = String(req.body?.userID || "").trim();
    const event = normalizeEvent(req.body?.event);
    const sessionIDRaw = String(req.body?.sessionID || "").trim();
    const tagKey = String(req.body?.tagKey || "").trim();
    const tagValue = String(req.body?.tagValue || "").trim();
    const sessionID = sessionIDRaw ? normalizeSessionID(sessionIDRaw) : null;

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });
    if (!tagKey) return res.status(400).json({ error: "Missing tagKey" });
    if (!tagValue) return res.status(400).json({ error: "Missing tagValue" });

    const item = await recomputeTagStats(ddb, TABLE, userID, event, sessionID, tagKey, tagValue);
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/recomputeTagStats error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/admin/backfill-session-stats/:userID", async (req, res) => {
  try {
    const userID = String(req.params.userID || "").trim();
    if (!userID) return res.status(400).json({ error: "Missing userID" });

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "SESSION#",
        },
      })
    );

    const sessions = out.Items || [];
    let processedSessions = 0;
    const eventSet = new Set();

    for (const s of sessions) {
      if (!s?.Event || !s?.SessionID) continue;
      await recomputeSessionStats(ddb, TABLE, userID, s.Event, s.SessionID);
      eventSet.add(s.Event);
      processedSessions += 1;
    }

    for (const ev of eventSet) {
      await recomputeEventStats(ddb, TABLE, userID, ev);
    }

    return res.json({
      ok: true,
      processedSessions,
      processedEvents: eventSet.size,
    });
  } catch (e) {
    console.error("POST /api/admin/backfill-session-stats error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- POSTS --------------------
app.post("/api/post", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    if (!userID) return res.status(400).json({ error: "Missing userID" });

    const timestamp = nowIso();
    const item = {
      PK: `USER#${userID}`,
      SK: `POST#${timestamp}`,
      ItemType: "POST",
      PostType: req.body?.postType ?? "solve",
      Note: req.body?.note ?? "",
      Event: req.body?.event ?? "",
      SolveList: req.body?.solveList ?? [],
      StatShare: req.body?.statShare ?? null,
      Comments: req.body?.comments ?? [],
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/post error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/posts/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "POST#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return res.json({ ok: true, items: out.Items || [] });
  } catch (e) {
    console.error("GET /api/posts error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/post/:userID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const timestamp = String(req.params.timestamp || "").trim();

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `POST#${timestamp}` },
      })
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/post error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/postComments/:userID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const timestamp = String(req.params.timestamp || "").trim();
  const comments = req.body?.comments;

  if (!Array.isArray(comments)) {
    return res.status(400).json({ error: "comments must be an array" });
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `POST#${timestamp}` },
        UpdateExpression: "SET Comments = :c, UpdatedAt = :u",
        ExpressionAttributeValues: {
          ":c": comments,
          ":u": nowIso(),
        },
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/postComments error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- CUSTOM EVENTS --------------------
app.post("/api/customEvent", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.body?.userID || "").trim();
  const eventName = String(req.body?.eventName || "").trim();
  const opts = req.body?.opts || {};

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!eventName) return res.status(400).json({ error: "Missing eventName" });

  const eventID = eventName.toUpperCase().replace(/\s+/g, "_");
  const ts = nowIso();

  const item = {
    PK: `USER#${userID}`,
    SK: `CUSTOMEVENT#${eventID}`,
    ItemType: "CUSTOMEVENT",
    EventID: eventID,
    EventName: eventName,
    CreatedAt: ts,
    UpdatedAt: ts,
  };

  if (opts?.isRelayEvent) {
    item.IsRelayEvent = true;
    item.RelayLegs = Array.isArray(opts.relayLegs) ? opts.relayLegs : [];
  }

  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/customEvent error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/customEvents/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "CUSTOMEVENT#",
        },
      })
    );

    const items = (out.Items || []).map((it) => ({
      id: it.EventID,
      name: it.EventName,
      isRelayEvent: it.IsRelayEvent === true,
      relayLegs: Array.isArray(it.RelayLegs) ? it.RelayLegs : [],
    }));

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/customEvents error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- GROUPS --------------------
app.post("/api/group", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const ownerID = String(req.body?.ownerID || "").trim();
    const name = String(req.body?.name || "").trim();
    const providedGroupID = normalizeGroupID(req.body?.groupID || "");
    const color = String(req.body?.color || "").trim();
    const photo = String(req.body?.photo || "").trim();
    const memberIDs = normalizeMemberIDs([ownerID, ...(req.body?.memberIDs || [])]);

    if (!ownerID) return res.status(400).json({ error: "Missing ownerID" });
    if (!name) return res.status(400).json({ error: "Missing name" });
    if (memberIDs.length < 2) {
      return res.status(400).json({ error: "Groups require at least 2 members" });
    }

    const groupID =
      providedGroupID ||
      `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const conversationID = `GROUP#${groupID}`;

    const existing = await getGroupMeta(groupID);
    if (existing) {
      const members = await listGroupMembers(groupID);
      return res.json({ ok: true, item: existing, members, existed: true });
    }

    const ts = nowIso();
    const groupMeta = buildGroupMetaItem({
      groupID,
      name,
      ownerID,
      memberIDs,
      conversationID,
      color,
      photo,
      createdAt: ts,
    });
    const groupMembers = buildGroupMemberItems({ groupID, memberIDs, ownerID, createdAt: ts });
    const userGroups = buildUserGroupItems({
      groupID,
      memberIDs,
      ownerID,
      name,
      conversationID,
      color,
      photo,
      createdAt: ts,
    });

    await createConversationRecords({
      conversationID,
      conversationType: "GROUP",
      memberIDs,
      name,
      createdBy: ownerID,
    });
    await batchWriteRequestsWithRetry(
      [groupMeta, ...groupMembers, ...userGroups].map((Item) => ({ PutRequest: { Item } }))
    );

    return res.json({ ok: true, item: groupMeta, members: groupMembers, existed: false });
  } catch (e) {
    console.error("POST /api/group error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/groups/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "GROUP#",
        },
      })
    );

    const items = (out.Items || []).sort((a, b) =>
      String(a.Name || "").localeCompare(String(b.Name || ""))
    );

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/groups error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- MESSAGES --------------------
app.post("/api/conversation", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const conversationType = normalizeConversationType(req.body?.conversationType);
    const memberIDs = normalizeMemberIDs(req.body?.memberIDs);
    const createdBy = String(req.body?.createdBy || "").trim();
    const providedConversationID = String(req.body?.conversationID || "").trim();
    const name = String(req.body?.name || "").trim();

    if (memberIDs.length < 2) {
      return res.status(400).json({ error: "conversation requires at least 2 members" });
    }

    if (conversationType === "DM" && memberIDs.length !== 2) {
      return res.status(400).json({ error: "DM conversations require exactly 2 members" });
    }

    const sortedMembers = [...memberIDs].sort();
    const conversationID =
      providedConversationID ||
      (conversationType === "DM"
        ? sortedMembers.join("#")
        : `GROUP#${Date.now().toString(36)}#${Math.random().toString(36).slice(2, 8)}`);

    const existing = await getConversationMeta(conversationID);
    if (existing) {
      const members = await listConversationMembers(conversationID);
      return res.json({ ok: true, item: existing, members, existed: true });
    }

    const created = await createConversationRecords({
      conversationID,
      conversationType,
      memberIDs: sortedMembers,
      name,
      createdBy: createdBy || sortedMembers[0],
    });

    return res.json({ ok: true, item: created.meta, members: created.members, existed: false });
  } catch (e) {
    console.error("POST /api/conversation error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/conversations/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "CONVO#",
        },
      })
    );

    const items = (out.Items || [])
      .sort((a, b) =>
        String(b.LastMessageAt || b.UpdatedAt || "").localeCompare(
          String(a.LastMessageAt || a.UpdatedAt || "")
        )
      )
      .slice(0, limit);

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/conversations error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.post("/api/message", async (req, res) => {
  if (!requirePkSk(res)) return;

  const conversationID = String(req.body?.conversationID || "").trim();
  const senderID = String(req.body?.senderID || "").trim();
  const text = String(req.body?.text ?? "");

  if (!conversationID) return res.status(400).json({ error: "Missing conversationID" });
  if (!senderID) return res.status(400).json({ error: "Missing senderID" });

  try {
    let meta = await getConversationMeta(conversationID);
    let members = [];

    if (!meta) {
      const legacy = await ensureLegacyConversationRecords(conversationID, senderID);
      meta = legacy.meta;
      members = legacy.members;
    } else {
      members = await listConversationMembers(conversationID);
    }

    if (!meta) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const senderIsMember = members.some((member) => member?.UserID === senderID);
    if (!senderIsMember) {
      return res.status(403).json({ error: "Sender is not a member of this conversation" });
    }

    const timestamp = nowIso();
    const item = {
      PK: `CONVO#${conversationID}`,
      SK: `MSG#${timestamp}`,
      ItemType: "MESSAGE",
      SenderID: senderID,
      Text: text,
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    await processSharedMessageEffects({
      conversationID,
      text,
      memberIDs: members.map((member) => member?.UserID).filter(Boolean),
      timestamp,
    });
    await touchConversationActivity({
      conversationID,
      meta,
      members,
      timestamp,
      preview: text,
    });

    return res.json({ ok: true, item, conversation: { ...meta, LastMessageAt: timestamp } });
  } catch (e) {
    console.error("POST /api/message error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/messages/:conversationID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const conversationID = String(req.params.conversationID || "").trim();
  const viewerID = String(req.query?.userID || "").trim();
  if (!conversationID) return res.status(400).json({ error: "Missing conversationID" });

  try {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    let cursor = null;

    if (req.query?.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(String(req.query.cursor), "base64url").toString("utf8"));
      } catch (err) {
        return res.status(400).json({ error: "Invalid cursor" });
      }
    }

    let meta = await getConversationMeta(conversationID);
    let members = [];

    if (!meta) {
      const legacy = await ensureLegacyConversationRecords(conversationID, viewerID);
      meta = legacy.meta;
      members = legacy.members;
    } else {
      members = await listConversationMembers(conversationID);
    }

    if (meta && viewerID) {
      const viewerIsMember = members.some((member) => member?.UserID === viewerID);
      if (!viewerIsMember) {
        return res.status(403).json({ error: "User is not a member of this conversation" });
      }
    }

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `CONVO#${conversationID}`,
          ":pfx": "MSG#",
        },
        ConsistentRead: true,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor || undefined,
      })
    );

    const items = (out.Items || [])
      .slice()
      .reverse()
      .map((it) => ({
      sender: it.SenderID,
      text: it.Text,
      timestamp: it.CreatedAt,
    }));

    const nextCursor = out.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(out.LastEvaluatedKey), "utf8").toString("base64url")
      : null;

    return res.json({
      ok: true,
      items,
      conversation: meta,
      nextCursor,
      hasMore: !!out.LastEvaluatedKey,
    });
  } catch (e) {
    console.error("GET /api/messages error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// -------------------- GROUP POSTS --------------------
app.post("/api/groupPost", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const groupID = normalizeGroupID(req.body?.groupID || "");
    const authorID = String(req.body?.authorID || "").trim();
    const authorName = String(req.body?.authorName || "").trim();

    if (!groupID) return res.status(400).json({ error: "Missing groupID" });
    if (!authorID) return res.status(400).json({ error: "Missing authorID" });

    const isMember = await isUserInGroup(groupID, authorID);
    if (!isMember) {
      return res.status(403).json({ error: "Author is not a member of this group" });
    }

    const timestamp = nowIso();
    const item = {
      PK: `GROUP#${groupID}`,
      SK: `POST#${timestamp}`,
      ItemType: "POST",
      PostOwnerType: "GROUP",
      GroupID: groupID,
      AuthorID: authorID,
      AuthorName: authorName || authorID,
      PostType: req.body?.postType ?? "solve",
      Note: req.body?.note ?? "",
      Event: req.body?.event ?? "",
      SolveList: req.body?.solveList ?? [],
      StatShare: req.body?.statShare ?? null,
      Comments: req.body?.comments ?? [],
      CreatedAt: timestamp,
      UpdatedAt: timestamp,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/groupPost error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.get("/api/groupPosts/:groupID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const groupID = normalizeGroupID(req.params.groupID || "");
  const viewerID = String(req.query?.userID || "").trim();

  if (!groupID) return res.status(400).json({ error: "Missing groupID" });

  try {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    if (viewerID) {
      const isMember = await isUserInGroup(groupID, viewerID);
      if (!isMember) {
        return res.status(403).json({ error: "User is not a member of this group" });
      }
    }

    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${groupID}`,
          ":pfx": "POST#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return res.json({ ok: true, items: out.Items || [] });
  } catch (e) {
    console.error("GET /api/groupPosts error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.put("/api/groupPostComments/:groupID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const groupID = normalizeGroupID(req.params.groupID || "");
  const timestamp = String(req.params.timestamp || "").trim();
  const userID = String(req.body?.userID || "").trim();
  const comments = req.body?.comments;

  if (!groupID) return res.status(400).json({ error: "Missing groupID" });
  if (!timestamp) return res.status(400).json({ error: "Missing timestamp" });
  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!Array.isArray(comments)) {
    return res.status(400).json({ error: "comments must be an array" });
  }

  try {
    const isMember = await isUserInGroup(groupID, userID);
    if (!isMember) {
      return res.status(403).json({ error: "User is not a member of this group" });
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${groupID}`, SK: `POST#${timestamp}` },
        UpdateExpression: "SET Comments = :c, UpdatedAt = :u",
        ExpressionAttributeValues: {
          ":c": comments,
          ":u": nowIso(),
        },
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/groupPostComments error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.delete("/api/groupPost/:groupID/:timestamp/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const groupID = normalizeGroupID(req.params.groupID || "");
  const timestamp = String(req.params.timestamp || "").trim();
  const userID = String(req.params.userID || "").trim();

  if (!groupID) return res.status(400).json({ error: "Missing groupID" });
  if (!timestamp) return res.status(400).json({ error: "Missing timestamp" });
  if (!userID) return res.status(400).json({ error: "Missing userID" });

  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${groupID}`, SK: `POST#${timestamp}` },
        ConsistentRead: true,
      })
    );

    const post = out.Item || null;
    if (!post) return res.status(404).json({ error: "Group post not found" });
    if (String(post.AuthorID || "").trim() !== userID) {
      return res.status(403).json({ error: "Only the post author can delete this group post" });
    }

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${groupID}`, SK: `POST#${timestamp}` },
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/groupPost error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

app.listen(port, () => {
  console.log(`PTS API running on http://localhost:${port}`);
  console.log(`Dynamo region=${REGION}, table=${TABLE}, pk/sk=${USE_PK_SK}`);
});
