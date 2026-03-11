const {
  QueryCommand,
  GetCommand,
  PutCommand,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function normalizeEvent(event) {
  return String(event || "").trim().toUpperCase();
}

function normalizeSessionID(sessionID) {
  const sid = String(sessionID || "main").trim();
  return sid || "main";
}

function normalizePenalty(penalty) {
  if (penalty === "+2") return "+2";
  if (penalty === "DNF") return "DNF";
  return null;
}

function createSolveID() {
  return crypto.randomBytes(10).toString("hex");
}

function buildSolveSK(createdAt, solveID) {
  return `SOLVE#${createdAt}#${solveID}`;
}

function parseSolveSK(sk) {
  const s = String(sk || "");
  if (!s.startsWith("SOLVE#")) return { createdAt: null, solveID: null };

  const rest = s.slice("SOLVE#".length);
  const idx = rest.lastIndexOf("#");
  if (idx === -1) return { createdAt: rest, solveID: null };

  return {
    createdAt: rest.slice(0, idx),
    solveID: rest.slice(idx + 1),
  };
}

function computeFinalTimeMs(rawTimeMs, penalty) {
  const raw = Number(rawTimeMs);
  const p = normalizePenalty(penalty);

  if (!Number.isFinite(raw) || raw < 0) return null;
  if (p === "DNF") return null;
  if (p === "+2") return raw + 2000;
  return raw;
}

function getRawTimeMs(solve) {
  const raw = Number(
    solve?.RawTimeMs ??
      solve?.rawTimeMs ??
      solve?.Time ??
      solve?.time ??
      solve?.ms ??
      solve?.OriginalTime ??
      solve?.originalTime
  );
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

function getFinalTimeMs(solve) {
  if (isDnfSolve(solve)) return null;

  const explicit = Number(solve?.FinalTimeMs ?? solve?.finalTimeMs);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const raw = getRawTimeMs(solve);
  return computeFinalTimeMs(raw, solve?.Penalty ?? solve?.penalty);
}

function isDnfSolve(solve) {
  return (
    normalizePenalty(solve?.Penalty ?? solve?.penalty) === "DNF" ||
    solve?.IsDNF === true ||
    solve?.isDNF === true
  );
}

function getSortTimeMsForStats(solve) {
  const finalMs = getFinalTimeMs(solve);
  return Number.isFinite(finalMs) ? finalMs : Infinity;
}

function computeWindowAverageMs(solvesSlice) {
  if (!Array.isArray(solvesSlice) || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getSortTimeMsForStats);
  const dnfCount = times.filter((t) => !Number.isFinite(t)).length;

  if (dnfCount > 1) return Infinity;

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);

  if (trimmed.length === 0) return Infinity;

  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  const avg = sum / trimmed.length;

  return Number.isFinite(avg) ? Math.round(avg) : Infinity;
}

function computeWindowMeanMs(solvesSlice) {
  if (!Array.isArray(solvesSlice) || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getFinalTimeMs);
  if (times.some((t) => !Number.isFinite(t))) return Infinity;

  const sum = times.reduce((acc, t) => acc + t, 0);
  const avg = sum / times.length;
  return Number.isFinite(avg) ? Math.round(avg) : Infinity;
}

const BEST_WINDOW_CONFIGS = Object.freeze([
  {
    kind: "mo3",
    windowSize: 3,
    candidatesField: "TopMo3Candidates",
    valueField: "BestMo3Ms",
    startField: "BestMo3StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 5,
    candidatesField: "TopAo5Candidates",
    valueField: "BestAo5Ms",
    startField: "BestAo5StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 12,
    candidatesField: "TopAo12Candidates",
    valueField: "BestAo12Ms",
    startField: "BestAo12StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 25,
    candidatesField: "TopAo25Candidates",
    valueField: "BestAo25Ms",
    startField: "BestAo25StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 50,
    candidatesField: "TopAo50Candidates",
    valueField: "BestAo50Ms",
    startField: "BestAo50StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 100,
    candidatesField: "TopAo100Candidates",
    valueField: "BestAo100Ms",
    startField: "BestAo100StartSolveSK",
  },
  {
    kind: "ao",
    windowSize: 1000,
    candidatesField: "TopAo1000Candidates",
    valueField: "BestAo1000Ms",
    startField: "BestAo1000StartSolveSK",
  },
]);

const CACHED_WINDOW_CONFIGS = Object.freeze(
  BEST_WINDOW_CONFIGS.filter((config) => [3, 5, 12].includes(Number(config?.windowSize || 0)))
);

function computeConfiguredWindowValueMs(solvesSlice, config) {
  if (!config || !Array.isArray(solvesSlice) || solvesSlice.length !== config.windowSize) {
    return Infinity;
  }

  return config.kind === "mo3"
    ? computeWindowMeanMs(solvesSlice)
    : computeWindowAverageMs(solvesSlice);
}

function buildTopWindowCandidatesFromSolves(solves, config, k = 100) {
  const input = Array.isArray(solves) ? solves : [];
  const windowSize = Number(config?.windowSize || 0);

  if (!config || windowSize < 1 || input.length < windowSize) return [];

  const out = [];
  for (let i = 0; i <= input.length - windowSize; i++) {
    const slice = input.slice(i, i + windowSize);
    const startSolveSK = String(slice[0]?.SK || "");
    if (!startSolveSK) continue;

    const memberSolveSKs = slice.map((s) => String(s?.SK || "")).filter(Boolean);
    if (memberSolveSKs.length !== windowSize) continue;

    const valueMs = computeConfiguredWindowValueMs(slice, config);
    if (!Number.isFinite(valueMs)) continue;

    out.push({
      ValueMs: Number(valueMs),
      StartSolveSK: startSolveSK,
      MemberSolveSKs: memberSolveSKs,
    });
  }

  out.sort(
    (a, b) => a.ValueMs - b.ValueMs || String(a.StartSolveSK).localeCompare(String(b.StartSolveSK))
  );
  return out.slice(0, Math.max(1, Number(k || 100)));
}

function buildWindowCandidateStatsFromSolves(solves, k = 100) {
  const out = {};

  for (const config of BEST_WINDOW_CONFIGS) {
    const candidates = buildTopWindowCandidatesFromSolves(solves, config, k);
    const best = candidates[0] || null;

    out[config.candidatesField] = candidates;
    out[config.valueField] = best?.ValueMs ?? null;
    out[config.startField] = best?.StartSolveSK || null;
  }

  return out;
}

function buildCachedWindowCandidateStatsFromSolves(solves, k = 10) {
  const out = {};

  for (const config of CACHED_WINDOW_CONFIGS) {
    const candidates = buildTopWindowCandidatesFromSolves(solves, config, k);
    const best = candidates[0] || null;

    out[config.candidatesField] = candidates;
    out[config.valueField] = best?.ValueMs ?? null;
    out[config.startField] = best?.StartSolveSK || null;
  }

  return out;
}

function bestAoForWindow(solves, n) {
  if (!Array.isArray(solves) || solves.length < n) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  for (let i = 0; i <= solves.length - n; i++) {
    const avg = computeWindowAverageMs(solves.slice(i, i + n));
    if (!Number.isFinite(avg)) continue;
    if (best === null || avg < best) {
      best = avg;
      bestStart = solves[i]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function bestMeanForWindow(solves, n) {
  if (!Array.isArray(solves) || solves.length < n) {
    return { value: null, startSolveSK: null };
  }

  let best = null;
  let bestStart = null;
  for (let i = 0; i <= solves.length - n; i++) {
    const avg = computeWindowMeanMs(solves.slice(i, i + n));
    if (!Number.isFinite(avg)) continue;
    if (best === null || avg < best) {
      best = avg;
      bestStart = solves[i]?.SK || null;
    }
  }

  return { value: best, startSolveSK: bestStart };
}

function buildStatsFromSolves(solves = []) {
  if (!Array.isArray(solves) || solves.length === 0) {
    return {
      SolveCountTotal: 0,
      SolveCountIncluded: 0,
      DNFCount: 0,
      Plus2Count: 0,
      SumFinalTimeMs: 0,
      MeanMs: null,

      BestSingleMs: null,
      BestSingleSolveSK: null,
      BestSingleAt: null,

      BestMo3Ms: null,
      BestMo3StartSolveSK: null,

      BestAo5Ms: null,
      BestAo5StartSolveSK: null,

      BestAo12Ms: null,
      BestAo12StartSolveSK: null,

      BestAo25Ms: null,
      BestAo25StartSolveSK: null,

      BestAo50Ms: null,
      BestAo50StartSolveSK: null,

      BestAo100Ms: null,
      BestAo100StartSolveSK: null,

      BestAo1000Ms: null,
      BestAo1000StartSolveSK: null,

      TopMo3Candidates: [],
      TopAo5Candidates: [],

      LastSolveAt: null,
      LastRecomputedAt: nowIso(),
    };
  }

  let SolveCountTotal = 0;
  let SolveCountIncluded = 0;
  let DNFCount = 0;
  let Plus2Count = 0;
  let SumFinalTimeMs = 0;

  let BestSingleMs = null;
  let BestSingleSolveSK = null;
  let BestSingleAt = null;

  for (const solve of solves) {
    SolveCountTotal += 1;

    const penalty = normalizePenalty(solve?.Penalty);
    const isDNF = isDnfSolve(solve);
    if (isDNF) DNFCount += 1;
    if (penalty === "+2") Plus2Count += 1;

    const finalMs = getFinalTimeMs(solve);
    if (Number.isFinite(finalMs)) {
      SolveCountIncluded += 1;
      SumFinalTimeMs += finalMs;

      if (BestSingleMs === null || finalMs < BestSingleMs) {
        BestSingleMs = finalMs;
        BestSingleSolveSK = solve?.SK || null;
        BestSingleAt = solve?.CreatedAt || null;
      }
    }
  }

  const MeanMs =
    SolveCountIncluded > 0 ? Math.round(SumFinalTimeMs / SolveCountIncluded) : null;

  const mo3 = bestMeanForWindow(solves, 3);
  const ao5 = bestAoForWindow(solves, 5);
  const ao12 = bestAoForWindow(solves, 12);
  const ao25 = bestAoForWindow(solves, 25);
  const ao50 = bestAoForWindow(solves, 50);
  const ao100 = bestAoForWindow(solves, 100);
  const ao1000 = bestAoForWindow(solves, 1000);
  const cachedWindowStats = buildCachedWindowCandidateStatsFromSolves(solves, 10);
  const lastSolve = solves[solves.length - 1];

  return {
    SolveCountTotal,
    SolveCountIncluded,
    DNFCount,
    Plus2Count,
    SumFinalTimeMs,
    MeanMs,

    BestSingleMs,
    BestSingleSolveSK,
    BestSingleAt,

    BestMo3Ms: mo3.value,
    BestMo3StartSolveSK: mo3.startSolveSK,

    BestAo5Ms: ao5.value,
    BestAo5StartSolveSK: ao5.startSolveSK,

    BestAo12Ms: ao12.value,
    BestAo12StartSolveSK: ao12.startSolveSK,

    BestAo25Ms: ao25.value,
    BestAo25StartSolveSK: ao25.startSolveSK,

    BestAo50Ms: ao50.value,
    BestAo50StartSolveSK: ao50.startSolveSK,

    BestAo100Ms: ao100.value,
    BestAo100StartSolveSK: ao100.startSolveSK,

    BestAo1000Ms: ao1000.value,
    BestAo1000StartSolveSK: ao1000.startSolveSK,

    ...cachedWindowStats,

    LastSolveAt: lastSolve?.CreatedAt || null,
    LastRecomputedAt: nowIso(),
  };
}

function cleanTagValue(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function normalizeTagIndexValue(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return s || null;
}

function sanitizeTags(input = {}) {
  const legacyCustom = input?.Custom && typeof input.Custom === "object" ? input.Custom : {};

  return {
    CubeModel: cleanTagValue(input?.CubeModel),
    CrossColor: cleanTagValue(input?.CrossColor),
    TimerInput: cleanTagValue(input?.TimerInput || input?.InputType),
    Custom1: cleanTagValue(input?.Custom1),
    Custom2: cleanTagValue(input?.Custom2),
    Custom3: cleanTagValue(input?.Custom3),
    Custom4: cleanTagValue(input?.Custom4),
    Custom5: cleanTagValue(input?.Custom5),
    LegacyCustom: legacyCustom,
  };
}

function buildSolveItem({
  userID,
  event,
  sessionID,
  rawTimeMs,
  penalty = null,
  scramble = "",
  note = "",
  tags = {},
  createdAt,
  solveID,
  existing = null,
}) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const p = normalizePenalty(penalty);
  const raw = Number(rawTimeMs);

  if (!Number.isFinite(raw) || raw < 0) {
    throw new Error("Invalid rawTimeMs");
  }

  const finalTimeMs = computeFinalTimeMs(raw, p);
  const ts = String(createdAt || existing?.CreatedAt || nowIso());
  const sid2 = String(solveID || existing?.SolveID || createSolveID());
  const canonicalTags = sanitizeTags(tags);

  return {
    ...(existing || {}),

    PK: `USER#${userID}`,
    SK: buildSolveSK(ts, sid2),

    GSI1PK: `SESSION#${userID}#${ev}#${sid}`,
    GSI1SK: `${ts}#${sid2}`,

    GSI2PK: `EVENT#${userID}#${ev}`,
    GSI2SK: `${ts}#${sid}#${sid2}`,

    ItemType: "SOLVE",
    SolveID: sid2,

    Event: ev,
    SessionID: sid,

    RawTimeMs: raw,
    FinalTimeMs: finalTimeMs,
    Penalty: p,
    IsDNF: p === "DNF",

    Scramble: scramble ?? "",
    Note: note ?? "",

    Tag_CubeModel: canonicalTags.CubeModel,
    Tag_CrossColor: canonicalTags.CrossColor,
    Tag_TimerInput: canonicalTags.TimerInput,
    Tag_Custom1: canonicalTags.Custom1,
    Tag_Custom2: canonicalTags.Custom2,
    Tag_Custom3: canonicalTags.Custom3,
    Tag_Custom4: canonicalTags.Custom4,
    Tag_Custom5: canonicalTags.Custom5,

    Tags: {
      CubeModel: canonicalTags.CubeModel,
      CrossColor: canonicalTags.CrossColor,
      TimerInput: canonicalTags.TimerInput,
      Custom1: canonicalTags.Custom1,
      Custom2: canonicalTags.Custom2,
      Custom3: canonicalTags.Custom3,
      Custom4: canonicalTags.Custom4,
      Custom5: canonicalTags.Custom5,
      ...(Object.keys(canonicalTags.LegacyCustom || {}).length
        ? { LegacyCustom: canonicalTags.LegacyCustom }
        : {}),
    },

    CreatedAt: ts,
    UpdatedAt: nowIso(),
  };
}

function getSolveTagPairsFromItem(solveItem) {
  const pairs = [];

  const add = (key, value) => {
    const clean = cleanTagValue(value);
    if (!clean) return;
    pairs.push({ key, value: clean });
  };

  add("CubeModel", solveItem?.Tag_CubeModel);
  add("CrossColor", solveItem?.Tag_CrossColor);
  add("TimerInput", solveItem?.Tag_TimerInput);
  add("Custom1", solveItem?.Tag_Custom1);
  add("Custom2", solveItem?.Tag_Custom2);
  add("Custom3", solveItem?.Tag_Custom3);
  add("Custom4", solveItem?.Tag_Custom4);
  add("Custom5", solveItem?.Tag_Custom5);

  return pairs;
}

function buildSolveTagItems(solveItem) {
  const userID = String(solveItem?.PK || "").replace(/^USER#/, "");
  const createdAt = String(solveItem?.CreatedAt || "");
  const solveID = String(solveItem?.SolveID || "");
  const event = normalizeEvent(solveItem?.Event);
  const sessionID = normalizeSessionID(solveItem?.SessionID);

  return getSolveTagPairsFromItem(solveItem).map(({ key, value }) => {
    const valueNorm = normalizeTagIndexValue(value);

    return {
      PK: solveItem.PK,
      SK: `SOLVETAG#${key}#${valueNorm}#${createdAt}#${solveID}`,

      GSI3PK: `TAG#${userID}#${key}#${valueNorm}`,
      GSI3SK: `${event}#${sessionID}#${createdAt}#${solveID}`,

      ItemType: "SOLVETAG",
      UserID: userID,
      Event: event,
      SessionID: sessionID,
      TagKey: key,
      TagValue: value,
      SolvePK: solveItem.PK,
      SolveSK: solveItem.SK,
      SolveID: solveID,
      CreatedAt: createdAt,
      UpdatedAt: nowIso(),
    };
  });
}

async function batchWriteAll(ddb, tableName, requests) {
  if (!Array.isArray(requests) || requests.length === 0) return;

  // DynamoDB BatchWrite rejects duplicate PK/SK keys in a single call,
  // even if the operations are identical. Keep only the last operation per key.
  // This preserves "delete then put" replacement intent while avoiding hard failures.
  const getReqKey = (req, idx) => {
    const put = req?.PutRequest?.Item;
    if (put?.PK && put?.SK) return `${put.PK}|${put.SK}`;

    const del = req?.DeleteRequest?.Key;
    if (del?.PK && del?.SK) return `${del.PK}|${del.SK}`;

    return `__NO_KEY__${idx}`;
  };

  const deduped = [];
  const seen = new Set();
  for (let i = requests.length - 1; i >= 0; i--) {
    const req = requests[i];
    const key = getReqKey(req, i);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(req);
  }
  deduped.reverse();

  if (deduped.length !== requests.length) {
    console.warn(
      `[ptsCore] batchWriteAll deduped ${requests.length - deduped.length} duplicate key ops`
    );
  }

  const chunks = [];
  for (let i = 0; i < deduped.length; i += 25) {
    chunks.push(deduped.slice(i, i + 25));
  }

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
      unprocessed = next;

      if (!unprocessed.length) break;

      attempt += 1;
      if (attempt > 8) {
        throw new Error(`BatchWrite exceeded retries: ${unprocessed.length} unprocessed`);
      }

      const delay = Math.round(80 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function putSolveAndTagItems(ddb, tableName, solveItem) {
  const tagItems = buildSolveTagItems(solveItem);
  const requests = [
    { PutRequest: { Item: solveItem } },
    ...tagItems.map((item) => ({ PutRequest: { Item: item } })),
  ];
  await batchWriteAll(ddb, tableName, requests);
}

async function deleteSolveAndTagItems(ddb, tableName, solveItem) {
  const tagItems = buildSolveTagItems(solveItem);
  const requests = [
    {
      DeleteRequest: {
        Key: { PK: solveItem.PK, SK: solveItem.SK },
      },
    },
    ...tagItems.map((item) => ({
      DeleteRequest: {
        Key: { PK: item.PK, SK: item.SK },
      },
    })),
  ];
  await batchWriteAll(ddb, tableName, requests);
}

async function replaceSolveAndTagItems(ddb, tableName, oldSolveItem, newSolveItem) {
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

  await batchWriteAll(ddb, tableName, requests);
}

async function getAllSolvesBySession(ddb, tableName, userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);

  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESSION#${userID}#${ev}#${sid}`,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all.reverse();
}

async function getAllSolvesByEvent(ddb, tableName, userID, event) {
  const ev = normalizeEvent(event);

  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
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

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return all.reverse();
}

async function getLastNSolvesBySession(ddb, tableName, userID, event, sessionID, n) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);
  const limit = Math.max(1, Math.min(1000, Number(n || 12)));

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `SESSION#${userID}#${ev}#${sid}`,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (out.Items || []).reverse();
}

async function getLastNSolvesByEvent(ddb, tableName, userID, event, n) {
  const ev = normalizeEvent(event);
  const limit = Math.max(1, Math.min(1000, Number(n || 12)));

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${userID}#${ev}`,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (out.Items || []).reverse();
}

async function recomputeSessionStats(ddb, tableName, userID, event, sessionID) {
  const ev = normalizeEvent(event);
  const sid = normalizeSessionID(sessionID);

  const solves = await getAllSolvesBySession(ddb, tableName, userID, ev, sid);
  const stats = buildStatsFromSolves(solves);

  const item = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${ev}#${sid}`,
    ItemType: "SESSIONSTATS",
    Event: ev,
    SessionID: sid,
    UpdatedAt: nowIso(),
    stale: false,
    ...stats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function recomputeEventStats(ddb, tableName, userID, event) {
  const ev = normalizeEvent(event);

  const solves = await getAllSolvesByEvent(ddb, tableName, userID, ev);
  const stats = buildStatsFromSolves(solves);

  const item = {
    PK: `USER#${userID}`,
    SK: `EVENTSTATS#${ev}`,
    ItemType: "EVENTSTATS",
    Event: ev,
    UpdatedAt: nowIso(),
    stale: false,
    ...stats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

function mergeIncrementalStats(
  prevStats,
  solveItem,
  recentSolves,
  windowSize,
  { includeCounters = true } = {}
) {
  const prev = prevStats || buildStatsFromSolves([]);

  const penalty = normalizePenalty(solveItem?.Penalty);
  const finalMs = getFinalTimeMs(solveItem);
  const isIncluded = Number.isFinite(finalMs);

  let next = { ...prev };

  if (includeCounters) {
    next = {
      ...next,
      SolveCountTotal: Number(prev.SolveCountTotal || 0) + 1,
      SolveCountIncluded: Number(prev.SolveCountIncluded || 0) + (isIncluded ? 1 : 0),
      DNFCount: Number(prev.DNFCount || 0) + (penalty === "DNF" ? 1 : 0),
      Plus2Count: Number(prev.Plus2Count || 0) + (penalty === "+2" ? 1 : 0),
      SumFinalTimeMs: Number(prev.SumFinalTimeMs || 0) + (isIncluded ? finalMs : 0),
      LastSolveAt: solveItem?.CreatedAt || prev.LastSolveAt || null,
      LastRecomputedAt: nowIso(),
    };

    next.MeanMs =
      next.SolveCountIncluded > 0
        ? Math.round(next.SumFinalTimeMs / next.SolveCountIncluded)
        : null;

    if (isIncluded) {
      if (
        next.BestSingleMs == null ||
        finalMs < next.BestSingleMs ||
        (finalMs === next.BestSingleMs &&
          String(solveItem?.CreatedAt || "") < String(next.BestSingleAt || ""))
      ) {
        next.BestSingleMs = finalMs;
        next.BestSingleSolveSK = solveItem?.SK || null;
        next.BestSingleAt = solveItem?.CreatedAt || null;
      }
    }
  }

  const windowMap = {
    3: ["BestMo3Ms", "BestMo3StartSolveSK"],
    5: ["BestAo5Ms", "BestAo5StartSolveSK"],
    12: ["BestAo12Ms", "BestAo12StartSolveSK"],
    25: ["BestAo25Ms", "BestAo25StartSolveSK"],
    50: ["BestAo50Ms", "BestAo50StartSolveSK"],
    100: ["BestAo100Ms", "BestAo100StartSolveSK"],
    1000: ["BestAo1000Ms", "BestAo1000StartSolveSK"],
  };

  const fields = windowMap[windowSize] || null;

  if (Array.isArray(recentSolves) && recentSolves.length >= windowSize) {
    const candidateSlice = recentSolves.slice(-windowSize);
    const avg =
      windowSize === 3
        ? computeWindowMeanMs(candidateSlice)
        : computeWindowAverageMs(candidateSlice);

    if (Number.isFinite(avg) && fields) {
      const [valueField, startField] = fields;
      if (next[valueField] == null || avg < next[valueField]) {
        next[valueField] = avg;
        next[startField] = candidateSlice[0]?.SK || null;
      }
    }
  }

  return next;
}

async function getStatsItem(ddb, tableName, pk, sk) {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk },
    })
  );
  return out.Item || null;
}

async function upsertSessionStatsOnNewSolve(ddb, tableName, userID, solveItem) {
  const ev = normalizeEvent(solveItem?.Event);
  const sid = normalizeSessionID(solveItem?.SessionID);
  const pk = `USER#${userID}`;
  const sk = `SESSIONSTATS#${ev}#${sid}`;

  const existingStats = await getStatsItem(ddb, tableName, pk, sk);

  if (
    existingStats?.LastSolveAt &&
    String(solveItem?.CreatedAt || "") < String(existingStats.LastSolveAt)
  ) {
    return recomputeSessionStats(ddb, tableName, userID, ev, sid);
  }

  const recentSolves = await getLastNSolvesBySession(ddb, tableName, userID, ev, sid, 1000);

  let nextStats = mergeIncrementalStats(existingStats, solveItem, recentSolves, 3);
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 5, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 12, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 25, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 50, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 100, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 1000, {
    includeCounters: false,
  });

  const item = {
    PK: pk,
    SK: sk,
    ItemType: "SESSIONSTATS",
    Event: ev,
    SessionID: sid,
    UpdatedAt: nowIso(),
    stale: false,
    ...nextStats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function upsertEventStatsOnNewSolve(ddb, tableName, userID, solveItem) {
  const ev = normalizeEvent(solveItem?.Event);
  const pk = `USER#${userID}`;
  const sk = `EVENTSTATS#${ev}`;

  const existingStats = await getStatsItem(ddb, tableName, pk, sk);

  if (
    existingStats?.LastSolveAt &&
    String(solveItem?.CreatedAt || "") < String(existingStats.LastSolveAt)
  ) {
    return recomputeEventStats(ddb, tableName, userID, ev);
  }

  const recentSolves = await getLastNSolvesByEvent(ddb, tableName, userID, ev, 1000);

  let nextStats = mergeIncrementalStats(existingStats, solveItem, recentSolves, 3);
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 5, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 12, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 25, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 50, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 100, {
    includeCounters: false,
  });
  nextStats = mergeIncrementalStats(nextStats, solveItem, recentSolves, 1000, {
    includeCounters: false,
  });

  const item = {
    PK: pk,
    SK: sk,
    ItemType: "EVENTSTATS",
    Event: ev,
    UpdatedAt: nowIso(),
    stale: false,
    ...nextStats,
  };

  await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

module.exports = {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  normalizePenalty,
  createSolveID,
  buildSolveSK,
  parseSolveSK,
  computeFinalTimeMs,
  getRawTimeMs,
  getFinalTimeMs,
  isDnfSolve,
  computeWindowAverageMs,
  computeWindowMeanMs,
  buildStatsFromSolves,
  BEST_WINDOW_CONFIGS,
  CACHED_WINDOW_CONFIGS,
  buildTopWindowCandidatesFromSolves,
  buildWindowCandidateStatsFromSolves,
  buildCachedWindowCandidateStatsFromSolves,

  cleanTagValue,
  normalizeTagIndexValue,
  sanitizeTags,

  buildSolveItem,
  getSolveTagPairsFromItem,
  buildSolveTagItems,
  putSolveAndTagItems,
  replaceSolveAndTagItems,
  deleteSolveAndTagItems,

  getAllSolvesBySession,
  getAllSolvesByEvent,
  getLastNSolvesBySession,
  getLastNSolvesByEvent,

  recomputeSessionStats,
  recomputeEventStats,
  upsertSessionStatsOnNewSolve,
  upsertEventStatsOnNewSolve,
};
