const express = require("express");
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
  normalizePenalty,
  CACHED_WINDOW_CONFIGS,
  parseSolveSK,
  normalizeTagIndexValue,
  getRawTimeMs,
  getFinalTimeMs,
  buildSolveItem,
  buildSolveTagItems,
  buildStatsFromSolves,
  buildTopWindowCandidatesFromSolves,
  getLastNSolvesBySession,
  getLastNSolvesByEvent,
  recomputeSessionStats,
  recomputeEventStats,
  putSolveAndTagItems,
  replaceSolveAndTagItems,
  deleteSolveAndTagItems,
} = require("./lib/ptsCore");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = process.env.PTS_TABLE || "PTSProd";
const USE_PK_SK = String(process.env.PTS_USE_PK_SK || "true").toLowerCase() === "true";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const BEST_CANDIDATES_K = Math.max(
  10,
  Math.min(500, Number(process.env.PTS_BEST_CANDIDATES_K || 100))
);

function requirePkSk(res) {
  if (!USE_PK_SK) {
    res.status(500).json({
      error: "Server configured for non PK/SK table. Set PTS_USE_PK_SK=true.",
    });
    return false;
  }
  return true;
}

function buildDefaultTagConfig(tagOptions = null) {
  return {
    Fixed: {
      CubeModel: {
        label: "Cube Model",
        options: Array.isArray(tagOptions?.CubeModels) ? tagOptions.CubeModels : [],
      },
      CrossColor: {
        label: "Cross Color",
        options: Array.isArray(tagOptions?.CrossColors)
          ? tagOptions.CrossColors
          : ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
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

async function applySolveMutationStats({ userID, oldSolve = null, newSolve = null }) {
  if (oldSolve && newSolve) {
    const sameScope =
      normalizeEvent(oldSolve.Event) === normalizeEvent(newSolve.Event) &&
      normalizeSessionID(oldSolve.SessionID) === normalizeSessionID(newSolve.SessionID);
    const samePenalty =
      normalizePenalty(oldSolve.Penalty) === normalizePenalty(newSolve.Penalty);
    const sameFinal = getFinalTimeMs(oldSolve) === getFinalTimeMs(newSolve);
    if (sameScope && samePenalty && sameFinal) return;
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

// -------------------- SESSIONSTATS --------------------
app.get("/api/sessionStats/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = normalizeEvent(req.query?.event);
  const sessionID = normalizeSessionID(req.query?.sessionID || "main");

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
        ConsistentRead: true,
      })
    );
    let item = out.Item || null;

    if (
      item &&
      Number(item.SolveCountIncluded || 0) > 0 &&
      (!Number.isFinite(Number(item.BestSingleMs)) ||
        !Array.isArray(item.TopSingles10) ||
        item.TopSingles10.length === 0)
    ) {
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
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `EVENTSTATS#${event}` },
        ConsistentRead: true,
      })
    );
    let item = out.Item || null;

    if (
      item &&
      Number(item.SolveCountIncluded || 0) > 0 &&
      (!Number.isFinite(Number(item.BestSingleMs)) ||
        !Array.isArray(item.TopSingles10) ||
        item.TopSingles10.length === 0)
    ) {
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

    return res.json({ ok: true, item });
  } catch (e) {
    console.error("GET /api/eventStats error:", e);
    return res.status(500).json({ error: "Server error" });
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
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${event}#${sessionID}`,
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      })
    );

    return res.json({
      ok: true,
      items: out.Items || [],
      lastKey: out.LastEvaluatedKey || null,
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
  const sessionID = normalizeSessionID(req.query?.sessionID || "main");
  const n = Math.max(1, Math.min(5000, Number(req.query?.n || 100)));

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${event}#${sessionID}`,
        },
        ScanIndexForward: false,
        Limit: n,
      })
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
  const n = Math.max(1, Math.min(50, Number(req.query?.n || 5)));

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
  const sessionID = normalizeSessionID(req.query?.sessionID || "");
  const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 100)));
  const hydrate = String(req.query?.hydrate || "true").toLowerCase() !== "false";
  const cursorRaw = req.query?.cursor ? String(req.query.cursor) : null;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!rawTagKey) return res.status(400).json({ error: "Missing tagKey" });
  if (!rawTagValue) return res.status(400).json({ error: "Missing tagValue" });

  const allowedTagKeys = new Set([
    "CubeModel",
    "CrossColor",
    "TimerInput",
    "Custom1",
    "Custom2",
    "Custom3",
    "Custom4",
    "Custom5",
  ]);

  if (!allowedTagKeys.has(rawTagKey)) {
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
    const createdAt = String(req.body?.createdAt || req.body?.ts || nowIso());

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
    ]);

    return res.json({
      ok: true,
      item: solveItem,
      sessionStats,
      eventStats,
    });
  } catch (e) {
    console.error("POST /api/solve error:", e);
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

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });
    if (solves.length === 0) return res.json({ ok: true, addedSolves: [], wrote: 0 });
    if (solves.length > 5000) {
      return res.status(400).json({ error: "Too many solves in one batch (max 5000)" });
    }

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

      let createdAt = String(s.datetime || s.DateTime || "").trim();
      if (!createdAt || !Number.isFinite(new Date(createdAt).getTime())) {
        createdAt = new Date(baseNow + i).toISOString();
      }

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
    return res.json({ ok: true, addedSolves, wrote });
  } catch (e) {
    console.error("POST /api/importSolvesBatch error:", e);
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
          "GSI3PK",
          "GSI3SK",
          "Tag_CubeModel",
          "Tag_CrossColor",
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
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/recomputeEventStats error:", e);
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
      Note: req.body?.note ?? "",
      Event: req.body?.event ?? "",
      SolveList: req.body?.solveList ?? [],
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
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": "POST#",
        },
        ScanIndexForward: false,
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
    }));

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/customEvents error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- MESSAGES --------------------
app.post("/api/message", async (req, res) => {
  if (!requirePkSk(res)) return;

  const conversationID = String(req.body?.conversationID || "").trim();
  const senderID = String(req.body?.senderID || "").trim();
  const text = String(req.body?.text ?? "");

  if (!conversationID) return res.status(400).json({ error: "Missing conversationID" });
  if (!senderID) return res.status(400).json({ error: "Missing senderID" });

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

  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/message error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/messages/:conversationID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const conversationID = String(req.params.conversationID || "").trim();
  if (!conversationID) return res.status(400).json({ error: "Missing conversationID" });

  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `CONVO#${conversationID}`,
          ":pfx": "MSG#",
        },
        ScanIndexForward: true,
      })
    );

    const items = (out.Items || []).map((it) => ({
      sender: it.SenderID,
      text: it.Text,
      timestamp: it.CreatedAt,
    }));

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("GET /api/messages error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`PTS API running on http://localhost:${port}`);
  console.log(`Dynamo region=${REGION}, table=${TABLE}, pk/sk=${USE_PK_SK}`);
});
