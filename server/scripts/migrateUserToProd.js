require("dotenv").config();

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const {
  nowIso,
  parseSolveSK,
  normalizeEvent,
  normalizeSessionID,
  normalizePenalty,
  buildSolveItem,
  buildSolveTagItems,
  recomputeSessionStats,
  recomputeEventStats,
} = require("../lib/ptsCore");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function usageAndExit() {
  console.log(`
Usage:
  node scripts/migrateUserToProd.js --source-user samtest13 [--target-user samtest13m]

Options:
  --source-user <id>            Required source user id
  --target-user <id>            Target user id (default: source-user)
  --source-region <region>      Default: us-east-2
  --source-table <table>        Default: PTS
  --target-region <region>      Default: us-east-1
  --target-table <table>        Default: PTSProd
  --dry-run                     Read + transform + summary only; no writes
  --skip-solves                 Skip solve/session-stats migration and recompute
  --skip-recompute              Skip session/event stats recompute
  --allow-existing-target       Allow writing even if target PK already has items
`);
  process.exit(1);
}

function toDocClient(region) {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function queryAllByPk(ddb, tableName, pk) {
  const items = [];
  let cursor = undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: cursor,
      })
    );
    if (out.Items?.length) items.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return items;
}

function buildConversationID(a, b) {
  return [String(a || "").trim(), String(b || "").trim()].sort().join("#");
}

function remapConversationID(conversationID, sourceUserID, targetUserID) {
  const parts = String(conversationID || "").split("#");
  if (parts.length !== 2) return String(conversationID || "");
  const mapped = parts.map((p) => (p === sourceUserID ? targetUserID : p));
  return buildConversationID(mapped[0], mapped[1]);
}

async function batchWriteWithRetry(ddb, tableName, requests) {
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
            [tableName]: unprocessed,
          },
        })
      );
      const next = out?.UnprocessedItems?.[tableName] || [];
      wrote += unprocessed.length - next.length;
      unprocessed = next;
      if (!unprocessed.length) break;
      attempt += 1;
      if (attempt > 8) {
        throw new Error(`BatchWrite exceeded retries; unprocessed=${unprocessed.length}`);
      }
      const delay = Math.round(80 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return wrote;
}

function dedupePutRequestsByKey(putRequests = []) {
  const byKey = new Map();
  for (const req of putRequests) {
    const item = req?.PutRequest?.Item;
    if (!item) continue;
    const key = `${String(item.PK || "")}|${String(item.SK || "")}`;
    if (!key || key === "|") continue;
    byKey.set(key, req);
  }
  return Array.from(byKey.values());
}

function toIsoMaybe(v) {
  if (v == null) return null;
  if (typeof v === "number") {
    const ms = v < 2e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) return d.toISOString();
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return null;
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const it of v) {
        const s = String(it ?? "").trim();
        if (s) return s;
      }
      continue;
    }
    if (typeof v === "object") continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function normalizeLegacyTags(rawTags = {}) {
  const tags = rawTags && typeof rawTags === "object" ? rawTags : {};
  const custom = tags.Custom && typeof tags.Custom === "object" ? tags.Custom : {};

  const out = {
    CubeModel: firstNonEmpty(tags.CubeModel, tags.cubeModel, tags.cube),
    CrossColor: firstNonEmpty(tags.CrossColor, tags.crossColor, tags.cross),
    TimerInput: firstNonEmpty(tags.TimerInput, tags.InputType, tags.inputType),
    Custom1: firstNonEmpty(tags.Custom1, custom.Custom1, custom.custom1, custom[1]),
    Custom2: firstNonEmpty(tags.Custom2, custom.Custom2, custom.custom2, custom[2]),
    Custom3: firstNonEmpty(tags.Custom3, custom.Custom3, custom.custom3, custom[3]),
    Custom4: firstNonEmpty(tags.Custom4, custom.Custom4, custom.custom4, custom[4]),
    Custom5: firstNonEmpty(tags.Custom5, custom.Custom5, custom.custom5, custom[5]),
  };

  if (!out.Custom1 && Array.isArray(tags.Custom)) out.Custom1 = firstNonEmpty(tags.Custom[0]);
  if (!out.Custom2 && Array.isArray(tags.Custom)) out.Custom2 = firstNonEmpty(tags.Custom[1]);
  if (!out.Custom3 && Array.isArray(tags.Custom)) out.Custom3 = firstNonEmpty(tags.Custom[2]);
  if (!out.Custom4 && Array.isArray(tags.Custom)) out.Custom4 = firstNonEmpty(tags.Custom[3]);
  if (!out.Custom5 && Array.isArray(tags.Custom)) out.Custom5 = firstNonEmpty(tags.Custom[4]);

  return out;
}

function normalizeMigratedEvent(event) {
  const ev = normalizeEvent(event);
  const aliases = {
    "2": "222",
    "3": "333",
    "4": "444",
    "5": "555",
    "6": "666",
    "7": "777",
  };
  return aliases[ev] || ev;
}

function toMsWithHeuristic(v) {
  if (v == null) return null;

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (s.includes(":")) {
      const [mStr, secStr] = s.split(":");
      const m = Number(mStr);
      const sec = Number(secStr);
      if (Number.isFinite(m) && Number.isFinite(sec) && m >= 0 && sec >= 0) {
        return Math.round((m * 60 + sec) * 1000);
      }
    }
    const parsed = Number(s);
    if (!Number.isFinite(parsed)) return null;
    v = parsed;
  }

  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;

  if (n >= 1000) return Math.round(n); // likely ms
  if (Number.isInteger(n) && n >= 100) return Math.round(n * 10); // centiseconds
  return Math.round(n * 1000); // seconds
}

function inferRawTimeMs(item, penalty) {
  const explicitCandidates = [
    item?.RawTimeMs,
    item?.rawTimeMs,
    item?.OriginalTime,
    item?.originalTime,
    item?.TimeMs,
    item?.timeMs,
  ];

  for (const c of explicitCandidates) {
    const ms = toMsWithHeuristic(c);
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }

  const finalCandidate = toMsWithHeuristic(item?.FinalTimeMs ?? item?.Time ?? item?.time);
  if (!Number.isFinite(finalCandidate) || finalCandidate < 0) return null;
  if (penalty === "+2") return Math.max(0, finalCandidate - 2000);
  return finalCandidate;
}

function isClearlyInvalidSolveTime(event, rawTimeMs) {
  const ev = normalizeMigratedEvent(event);
  const ms = Number(rawTimeMs);
  if (!Number.isFinite(ms) || ms <= 0) return true;

  const minByEvent = {
    "222": 200,
    "333": 1000,
    "333OH": 1000,
    "444": 1000,
    "555": 1000,
    "666": 1000,
    "777": 1000,
    "SKEWB": 200,
    "PYRAMINX": 200,
    "CLOCK": 200,
    "SQ1": 300,
    "FTO": 200,
    "MEGAMINX": 1000,
    "MAGIC": 200,
    "RELAY": 1000,
    "ROUX": 1000,
  };

  const minMs = minByEvent[ev] ?? 100;
  return ms < minMs;
}

function normalizeProfileItem(sourceItem, targetUserID) {
  const next = { ...sourceItem };
  next.PK = `USER#${targetUserID}`;
  if (next.Username) next.Username = targetUserID;
  if (next.UpdatedAt) next.UpdatedAt = nowIso();
  return next;
}

function normalizeSessionItem(sourceItem, targetUserID) {
  const event = normalizeMigratedEvent(sourceItem?.Event);
  const sessionID = normalizeSessionID(sourceItem?.SessionID || sourceItem?.sessionID || "main");
  const name = String(sourceItem?.SessionName || sourceItem?.Name || sessionID).trim() || sessionID;
  const createdAt = toIsoMaybe(sourceItem?.CreatedAt) || nowIso();

  const next = {
    ...sourceItem,
    PK: `USER#${targetUserID}`,
    SK: `SESSION#${event}#${sessionID}`,
    ItemType: "SESSION",
    Event: event,
    SessionID: sessionID,
    SessionName: name,
    CreatedAt: createdAt,
    UpdatedAt: nowIso(),
  };

  return next;
}

function normalizeSolveIntoCanonical(sourceItem, targetUserID) {
  const penalty = normalizePenalty(sourceItem?.Penalty ?? sourceItem?.penalty ?? null);
  const event = normalizeMigratedEvent(sourceItem?.Event ?? sourceItem?.event);
  if (!event) return null;
  const sessionID = normalizeSessionID(sourceItem?.SessionID ?? sourceItem?.sessionID ?? "main");

  const createdAt =
    toIsoMaybe(sourceItem?.CreatedAt) ||
    toIsoMaybe(sourceItem?.DateTime) ||
    toIsoMaybe(sourceItem?.datetime) ||
    toIsoMaybe(parseSolveSK(sourceItem?.SK).createdAt) ||
    nowIso();

  const rawTimeMs = inferRawTimeMs(sourceItem, penalty);
  if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) return null;
  if (isClearlyInvalidSolveTime(event, rawTimeMs)) return null;

  const tags = normalizeLegacyTags(sourceItem?.Tags || sourceItem?.tags || {});
  const parsedSK = parseSolveSK(sourceItem?.SK);
  const sourceSolveID = String(sourceItem?.SolveID || parsedSK?.solveID || "").trim();
  const solveID =
    sourceSolveID ||
    crypto
      .createHash("sha1")
      .update(String(sourceItem?.SK || `${event}|${sessionID}|${createdAt}`))
      .digest("hex")
      .slice(0, 20);

  return buildSolveItem({
    userID: targetUserID,
    event,
    sessionID,
    rawTimeMs,
    penalty,
    scramble: sourceItem?.Scramble ?? sourceItem?.scramble ?? "",
    note: sourceItem?.Note ?? sourceItem?.note ?? "",
    tags,
    createdAt,
    solveID,
  });
}

async function ensureSessionsForSolves(targetDdb, targetTable, targetUserID, solveSessionPairs, existingSessionsSet, dryRun) {
  const sessionItems = [];
  for (const pair of solveSessionPairs) {
    const key = `${pair.event}#${pair.sessionID}`;
    if (existingSessionsSet.has(key)) continue;
    existingSessionsSet.add(key);
    sessionItems.push({
      PK: `USER#${targetUserID}`,
      SK: `SESSION#${pair.event}#${pair.sessionID}`,
      ItemType: "SESSION",
      Event: pair.event,
      SessionID: pair.sessionID,
      SessionName: pair.sessionID,
      CreatedAt: nowIso(),
      UpdatedAt: nowIso(),
    });
  }

  if (!sessionItems.length || dryRun) return sessionItems.length;
  for (const item of sessionItems) {
    await targetDdb.send(new PutCommand({ TableName: targetTable, Item: item }));
  }
  return sessionItems.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceUserID = String(args["source-user"] || "").trim();
  if (!sourceUserID) usageAndExit();

  const targetUserID = String(args["target-user"] || sourceUserID).trim();
  if (!targetUserID) usageAndExit();

  const sourceRegion = String(args["source-region"] || "us-east-2");
  const sourceTable = String(args["source-table"] || "PTS");
  const targetRegion = String(args["target-region"] || "us-east-1");
  const targetTable = String(args["target-table"] || "PTSProd");
  const dryRun = !!args["dry-run"];
  const skipSolves = !!args["skip-solves"];
  const skipRecompute = !!args["skip-recompute"];
  const allowExistingTarget = !!args["allow-existing-target"];

  console.log("Migration config:");
  console.log({
    sourceUserID,
    targetUserID,
    sourceRegion,
    sourceTable,
    targetRegion,
    targetTable,
    dryRun,
    skipSolves,
    skipRecompute,
    allowExistingTarget,
  });

  const sourceDdb = toDocClient(sourceRegion);
  const targetDdb = toDocClient(targetRegion);

  const sourcePk = `USER#${sourceUserID}`;
  const targetPk = `USER#${targetUserID}`;

  const [sourceItems, targetExistingItems] = await Promise.all([
    queryAllByPk(sourceDdb, sourceTable, sourcePk),
    queryAllByPk(targetDdb, targetTable, targetPk),
  ]);

  if (!sourceItems.length) {
    throw new Error(`No source items found for ${sourcePk} in ${sourceRegion}/${sourceTable}`);
  }

  if (targetExistingItems.length > 0 && !allowExistingTarget) {
    throw new Error(
      `Target ${targetPk} already has ${targetExistingItems.length} items in ${targetRegion}/${targetTable}. ` +
      `Re-run with --allow-existing-target or use a new --target-user.`
    );
  }

  const sourceProfile = sourceItems.find((it) => String(it?.SK) === "PROFILE") || null;
  const sourceSessions = sourceItems.filter((it) => String(it?.SK || "").startsWith("SESSION#"));
  const sourceSolves = sourceItems.filter((it) => String(it?.SK || "").startsWith("SOLVE#"));
  const sourcePosts = sourceItems.filter((it) => String(it?.SK || "").startsWith("POST#"));

  const sessionItems = sourceSessions.map((s) => normalizeSessionItem(s, targetUserID));
  const sessionKeySet = new Set(
    sessionItems.map((s) => `${String(s.Event).toUpperCase()}#${String(s.SessionID || "main")}`)
  );

  const solveRequests = [];
  const eventSet = new Set();
  const sessionPairs = [];
  let skippedSolves = 0;

  if (!skipSolves) {
    for (const solve of sourceSolves) {
      const canonical = normalizeSolveIntoCanonical(solve, targetUserID);
      if (!canonical) {
        skippedSolves += 1;
        continue;
      }
      eventSet.add(canonical.Event);
      sessionPairs.push({ event: canonical.Event, sessionID: canonical.SessionID });
      solveRequests.push({ PutRequest: { Item: canonical } });
      const tagItems = buildSolveTagItems(canonical);
      for (const tagItem of tagItems) {
        solveRequests.push({ PutRequest: { Item: tagItem } });
      }
    }
  }

  const postRequestsRaw = sourcePosts.map((p) => ({
    PutRequest: {
      Item: {
        ...p,
        PK: `USER#${targetUserID}`,
      },
    },
  }));

  const sourceFriendIDs = Array.isArray(sourceProfile?.Friends)
    ? sourceProfile.Friends.map((f) => String(f || "").trim()).filter(Boolean)
    : [];

  const conversationIDs = Array.from(
    new Set(sourceFriendIDs.map((fid) => buildConversationID(sourceUserID, fid)))
  );

  const sourceConversationMessages = [];
  for (const convoID of conversationIDs) {
    const items = await queryAllByPk(sourceDdb, sourceTable, `CONVO#${convoID}`);
    if (items?.length) sourceConversationMessages.push(...items);
  }

  const messageRequestsRaw = sourceConversationMessages
    .filter((m) => String(m?.SK || "").startsWith("MSG#"))
    .map((m) => {
      const oldConvoID = String(m.PK || "").replace(/^CONVO#/, "");
      const newConvoID = remapConversationID(oldConvoID, sourceUserID, targetUserID);
      return {
        PutRequest: {
          Item: {
            ...m,
            PK: `CONVO#${newConvoID}`,
            SenderID: m?.SenderID === sourceUserID ? targetUserID : m?.SenderID,
          },
        },
      };
    });

  const profileItem = sourceProfile ? normalizeProfileItem(sourceProfile, targetUserID) : null;
  const profileRequestsRaw = profileItem ? [{ PutRequest: { Item: profileItem } }] : [];
  const sessionRequestsRaw = sessionItems.map((item) => ({ PutRequest: { Item: item } }));

  const profileRequests = dedupePutRequestsByKey(profileRequestsRaw);
  const sessionRequests = dedupePutRequestsByKey(sessionRequestsRaw);
  const solveRequestsDeduped = dedupePutRequestsByKey(solveRequests);
  const postRequests = dedupePutRequestsByKey(postRequestsRaw);
  const messageRequests = dedupePutRequestsByKey(messageRequestsRaw);

  const totalRequests =
    profileRequests.length +
    sessionRequests.length +
    solveRequestsDeduped.length +
    postRequests.length +
    messageRequests.length;
  console.log("Planned migration:");
  console.log({
    sourceItems: sourceItems.length,
    sourceProfile: !!sourceProfile,
    sourceSessions: sourceSessions.length,
    sourceSolves: sourceSolves.length,
    sourcePosts: sourcePosts.length,
    sourceMessages: sourceConversationMessages.length,
    skippedSolves,
    targetProfilePut: profileRequests.length,
    targetSessionPuts: sessionRequests.length,
    targetSolveAndTagPuts: solveRequestsDeduped.length,
    targetPostPuts: postRequests.length,
    targetMessagePuts: messageRequests.length,
    totalWriteRequests: totalRequests,
    eventsToRecompute: Array.from(eventSet).sort(),
  });

  if (dryRun) {
    console.log("Dry run complete. No writes were made.");
    return;
  }

  let wrote = 0;
  wrote += await batchWriteWithRetry(targetDdb, targetTable, profileRequests);
  wrote += await batchWriteWithRetry(targetDdb, targetTable, sessionRequests);
  wrote += await batchWriteWithRetry(targetDdb, targetTable, solveRequestsDeduped);
  wrote += await batchWriteWithRetry(targetDdb, targetTable, postRequests);
  wrote += await batchWriteWithRetry(targetDdb, targetTable, messageRequests);

  const ensuredCount = skipSolves
    ? 0
    : await ensureSessionsForSolves(
        targetDdb,
        targetTable,
        targetUserID,
        sessionPairs,
        sessionKeySet,
        false
      );

  console.log(`Write phase done: wrote ${wrote} request items; ensured ${ensuredCount} missing sessions.`);

  if (!skipRecompute && !skipSolves) {
    const uniqueSessionPairs = Array.from(new Set(sessionPairs.map((p) => `${p.event}#${p.sessionID}`)))
      .map((k) => {
        const [event, sessionID] = k.split("#");
        return { event, sessionID };
      })
      .sort((a, b) => (a.event.localeCompare(b.event) || a.sessionID.localeCompare(b.sessionID)));

    console.log(`Recomputing ${uniqueSessionPairs.length} sessions...`);
    for (const pair of uniqueSessionPairs) {
      await recomputeSessionStats(targetDdb, targetTable, targetUserID, pair.event, pair.sessionID);
    }

    const events = Array.from(eventSet).sort();
    console.log(`Recomputing ${events.length} events...`);
    for (const ev of events) {
      await recomputeEventStats(targetDdb, targetTable, targetUserID, ev);
    }
  } else {
    console.log("Skipped recompute by request (--skip-recompute) or because --skip-solves is set.");
  }

  const targetItemsAfter = await queryAllByPk(targetDdb, targetTable, targetPk);
  const targetSolveCount = targetItemsAfter.filter((it) => String(it?.SK || "").startsWith("SOLVE#")).length;
  const targetSessionCount = targetItemsAfter.filter((it) => String(it?.SK || "").startsWith("SESSION#")).length;

  console.log("Verification summary:");
  console.log({
    sourceSolveCount: sourceSolves.length,
    targetSolveCount,
    sourceSessionCount: sourceSessions.length,
    targetSessionCount,
    targetTotalItems: targetItemsAfter.length,
  });

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
