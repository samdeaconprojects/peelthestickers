require("dotenv").config();

const { QueryCommand, GetCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const {
  nowIso,
  normalizeEvent,
  normalizeSessionID,
  normalizePenalty,
  parseSolveSK,
  getFinalTimeMs,
  getAllSolvesByEvent,
  buildSolveItem,
  replaceSolveAndTagItems,
  recomputeSessionStats,
  recomputeEventStats,
  recomputeTagStats,
} = require("../lib/ptsCore");

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

    if (!res.ok) throw new Error(`WCA request failed (${res.status})`);

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
  for (let i = 1; i <= 5; i += 1) {
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
  return match ? Number(match[1]) || 0 : 0;
}

function getWcaResultDate(entry) {
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

  const start = parseWcaDateCandidate(entry?.competition?.start_date || entry?.competition?.startDate);
  const end = parseWcaDateCandidate(entry?.competition?.end_date || entry?.competition?.endDate);
  if (start && end) {
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const spanDays = Math.max(0, Math.round((endUtc - startUtc) / 86400000));
    const derivedDayOffset = Math.min(spanDays, Math.max(0, getWcaRoundOrderValue(entry) - 1));
    return new Date(startUtc + derivedDayOffset * 86400000 + 12 * 3600000);
  }

  return null;
}

function getWcaCompetitionLabel(entry) {
  const competition =
    entry?.competition?.id ||
    entry?.competition_id ||
    entry?.competitionId ||
    entry?.competition ||
    "";
  const round = entry?.round_type_id || entry?.roundTypeId || entry?.round?.id || entry?.round || "";
  return [competition, round].filter(Boolean).join(" · ");
}

function extractWcaResultEntries(payload) {
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
      const signature = JSON.stringify({
        eventCode,
        attemptValues,
        happenedAt: getWcaResultDate(current)?.toISOString?.() || "",
        noteLabel: getWcaCompetitionLabel(current),
      });

      if (!rowSignatures.has(signature)) {
        rowSignatures.add(signature);
        rows.push({
          eventCode,
          attemptValues,
          happenedAt: getWcaResultDate(current),
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

function buildDerivedWcaSolves(rows) {
  const orderedRows = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aTime = Number(a?.happenedAt?.getTime?.()) || 0;
    const bTime = Number(b?.happenedAt?.getTime?.()) || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.noteLabel || "").localeCompare(String(b?.noteLabel || ""));
  });

  const out = [];
  let timestampSeed = Date.now();

  for (const row of orderedRows) {
    const eventCode = String(row?.eventCode || "").trim();
    if (!WCA_SUPPORTED_IMPORT_EVENTS.has(eventCode)) continue;

    const baseTime =
      row?.happenedAt && Number.isFinite(row.happenedAt.getTime())
        ? row.happenedAt.getTime()
        : timestampSeed;
    const note = row?.noteLabel ? `WCA import · ${row.noteLabel}` : "WCA import";
    const attempts = Array.isArray(row?.attemptValues) ? row.attemptValues : [];

    for (let i = 0; i < attempts.length; i += 1) {
      const parsed = parseWcaAttemptValue(attempts[i]);
      if (!parsed) continue;
      out.push({
        event: eventCode,
        note,
        rawTimeMs: parsed.rawTimeMs,
        penalty: parsed.penalty,
        datetime: new Date(baseTime + i * 1000).toISOString(),
      });
    }

    timestampSeed = Math.max(timestampSeed + attempts.length + 1, baseTime + attempts.length * 1000 + 1000);
  }

  return out;
}

function isWcaImportedSolve(solve) {
  return String(solve?.Note || "").trim().startsWith("WCA import");
}

function buildMatchKey(input) {
  const event = normalizeEvent(input?.event || input?.Event);
  const note = String(input?.note || input?.Note || "").trim();
  const rawTimeMs = Number(input?.rawTimeMs ?? input?.RawTimeMs);
  const penalty = normalizePenalty(input?.penalty ?? input?.Penalty ?? null) || "";
  return `${event}|${note}|${Number.isFinite(rawTimeMs) ? rawTimeMs : "NaN"}|${penalty}`;
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
      await new Promise((resolve) => setTimeout(resolve, Math.round(80 * Math.pow(2, attempt))));
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

    const requests = (out.Items || []).map((item) => ({
      DeleteRequest: {
        Key: { PK: item.PK, SK: item.SK },
      },
    }));
    if (requests.length) {
      deleted += await batchWriteRequestsWithRetry(requests);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return deleted;
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

async function getUserProfile(userID) {
  const out = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userID}`, SK: "PROFILE" },
    })
  );
  return out.Item || null;
}

async function repairUser(userID) {
  const profile = await getUserProfile(userID);
  if (!profile) throw new Error("User profile not found");

  const wcaID = normalizeWcaId(profile?.WCAID || "");
  if (!wcaID) throw new Error("User has no WCAID on profile");

  console.log(`Loading WCA results for ${userID} (${wcaID})...`);
  const payload = await fetchWcaResultsPayload(wcaID);
  const rows = extractWcaResultEntries(payload);
  const derivedSolves = buildDerivedWcaSolves(rows);
  console.log(`Derived ${derivedSolves.length} timestamped WCA attempts across ${rows.length} rows.`);
  const derivedByKey = new Map();

  for (const solve of derivedSolves) {
    const key = buildMatchKey(solve);
    const bucket = derivedByKey.get(key) || [];
    bucket.push(solve.datetime);
    derivedByKey.set(key, bucket);
  }

  for (const bucket of derivedByKey.values()) {
    bucket.sort((a, b) => String(a).localeCompare(String(b)));
  }

  const candidateEvents = Array.from(
    new Set(
      derivedSolves
        .map((solve) => normalizeEvent(solve.event))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const touchedEvents = new Set();
  const touchedSessions = new Map();
  const touchedTagScopes = new Map();
  let scanned = 0;
  let updated = 0;
  let unmatched = 0;

  for (const event of candidateEvents) {
    console.log(`Scanning imported ${event} solves...`);
    const solves = await getAllSolvesByEvent(ddb, TABLE, userID, event);
    const importedSolves = solves
      .filter(isWcaImportedSolve)
      .sort((a, b) => String(a?.CreatedAt || "").localeCompare(String(b?.CreatedAt || "")));

    for (const solve of importedSolves) {
      scanned += 1;
      const key = buildMatchKey(solve);
      const bucket = derivedByKey.get(key) || [];
      const nextDatetime = bucket.shift() || "";
      if (!nextDatetime) {
        unmatched += 1;
        continue;
      }

      if (String(solve?.CreatedAt || "") === nextDatetime) continue;

      const rebuilt = buildSolveItem({
        userID,
        event: solve?.Event,
        sessionID: solve?.SessionID,
        rawTimeMs: solve?.RawTimeMs,
        penalty: solve?.Penalty,
        scramble: solve?.Scramble || "",
        note: solve?.Note || "",
        tags: solve?.Tags || {},
        createdAt: nextDatetime,
        solveID: solve?.SolveID,
        existing: solve,
      });

      await replaceSolveAndTagItems(ddb, TABLE, solve, rebuilt);
      updated += 1;

      const ev = normalizeEvent(rebuilt.Event);
      const sid = normalizeSessionID(rebuilt.SessionID);
      touchedEvents.add(ev);
      touchedSessions.set(`${ev}|${sid}`, { event: ev, sessionID: sid });
      touchedTagScopes.set(`${ev}|${sid}|SolveSource|WCA`, {
        event: ev,
        sessionID: sid,
        tagKey: "SolveSource",
        tagValue: "WCA",
      });
      touchedTagScopes.set(`${ev}||SolveSource|WCA`, {
        event: ev,
        sessionID: null,
        tagKey: "SolveSource",
        tagValue: "WCA",
      });
    }
  }

  for (const event of touchedEvents) {
    console.log(`Rebuilding ranks and event stats for ${event}...`);
    await rebuildSingleRanksForEvent(userID, event);
    await recomputeEventStats(ddb, TABLE, userID, event);
  }

  for (const scope of touchedSessions.values()) {
    console.log(`Recomputing session stats for ${scope.event}/${scope.sessionID}...`);
    await recomputeSessionStats(ddb, TABLE, userID, scope.event, scope.sessionID);
  }

  for (const scope of touchedTagScopes.values()) {
    console.log(
      `Recomputing tag stats for ${scope.event}/${scope.sessionID || "all"} ${scope.tagKey}=${scope.tagValue}...`
    );
    await recomputeTagStats(ddb, TABLE, userID, scope.event, scope.sessionID, scope.tagKey, scope.tagValue);
  }

  return {
    userID,
    wcaID,
    candidateEvents,
    scanned,
    updated,
    unmatched,
    touchedEvents: Array.from(touchedEvents.values()),
  };
}

async function main() {
  const [, , userIDRaw] = process.argv;
  const userID = String(userIDRaw || "").trim();

  if (!userID) {
    console.error("Usage: node scripts/repairWcaImportDates.js <userID>");
    process.exit(1);
  }

  const result = await repairUser(userID);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("repairWcaImportDates failed:", err);
  process.exit(1);
});
