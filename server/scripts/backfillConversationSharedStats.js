require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const {
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

function normalizeEvent(event) {
  return String(event || "333")
    .trim()
    .toUpperCase();
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

function mergeStats(target, source) {
  const next = {
    ...target,
    TotalSolves: Number(target.TotalSolves || 0) + Number(source.TotalSolves || 0),
    TotalWins: Number(target.TotalWins || 0) + Number(source.TotalWins || 0),
    TotalSessions: Number(target.TotalSessions || 0) + Number(source.TotalSessions || 0),
    LastSharedAt: source.LastSharedAt || target.LastSharedAt || null,
    ByEvent: { ...(target.ByEvent || {}) },
    ByUser: { ...(target.ByUser || {}) },
  };

  Object.entries(source.ByEvent || {}).forEach(([eventKey, values]) => {
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

  Object.entries(source.ByUser || {}).forEach(([userID, values]) => {
    const current = next.ByUser[userID] || {};
    next.ByUser[userID] = {
      Solves: Number(current.Solves || 0) + Number(values.Solves || 0),
      Wins: Number(current.Wins || 0) + Number(values.Wins || 0),
      Sessions: Number(current.Sessions || 0) + Number(values.Sessions || 0),
    };
  });

  return next;
}

function parseSharedAoN(text) {
  if (!String(text || "").startsWith("[sharedAoN]")) return null;
  try {
    return JSON.parse(String(text).slice("[sharedAoN]".length));
  } catch {
    return null;
  }
}

function parseSharedExtend(text) {
  if (!String(text || "").startsWith("[sharedExtend]")) return null;
  try {
    return JSON.parse(String(text).slice("[sharedExtend]".length));
  } catch {
    return null;
  }
}

function parseSharedUpdate(text) {
  if (!String(text || "").startsWith("[sharedUpdate]")) return null;
  const raw = String(text).slice("[sharedUpdate]".length);
  const [sharedID, solveIndexRaw, timeRaw, senderID] = raw.split("|");
  const solveIndex = Number(solveIndexRaw);
  const time = Number(timeRaw);
  if (!sharedID || !senderID || !Number.isFinite(solveIndex) || !Number.isFinite(time)) return null;
  return { sharedID, solveIndex, time, senderID };
}

async function scanConversationMetas() {
  let cursor = null;
  const items = [];

  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "begins_with(PK, :pk) AND SK = :sk",
        ExpressionAttributeValues: {
          ":pk": "CONVO#",
          ":sk": "META",
        },
        ExclusiveStartKey: cursor || undefined,
      })
    );
    items.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  return items;
}

async function getConversationMessagesAndMembers(conversationID) {
  let cursor = null;
  const items = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `CONVO#${conversationID}`,
        },
        ExclusiveStartKey: cursor || undefined,
      })
    );
    items.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey || null;
  } while (cursor);

  const members = items
    .filter((item) => String(item.SK || "").startsWith("MEMBER#"))
    .map((item) => String(item.UserID || "").trim())
    .filter(Boolean);

  const messages = items
    .filter((item) => String(item.SK || "").startsWith("MSG#"))
    .sort((a, b) => String(a.CreatedAt || "").localeCompare(String(b.CreatedAt || "")));

  return { members, messages };
}

function buildRunFromPayload(conversationID, payload, memberIDs, createdAt) {
  const creatorEvents = Array.isArray(payload.creatorEvents) ? payload.creatorEvents : [];
  const opponentEvents = Array.isArray(payload.opponentEvents) ? payload.opponentEvents : [];
  const creatorScrambles = Array.isArray(payload.creatorScrambles) ? payload.creatorScrambles : [];
  const opponentScrambles = Array.isArray(payload.opponentScrambles) ? payload.opponentScrambles : [];

  return {
    PK: `CONVO#${conversationID}`,
    SK: `SHAREDRUN#${payload.sharedID}`,
    ItemType: "SHAREDRUN",
    ConversationID: conversationID,
    SharedID: payload.sharedID,
    SharedType: String(payload.mode || payload.type || "average"),
    TargetWins: Number(payload.targetWins || 0) || null,
    BatchSize: Number(payload.batchSize || 0) || null,
    Count: Math.max(
      Number(payload.count || 0),
      creatorEvents.length,
      opponentEvents.length,
      creatorScrambles.length,
      opponentScrambles.length
    ),
    CreatorID: String(payload.creatorID || "").trim() || null,
    CreatorEvent: String(payload.creatorEvent || payload.event || "").trim() || null,
    OpponentEvent: String(payload.opponentEvent || payload.event || "").trim() || null,
    CreatorEvents: creatorEvents,
    OpponentEvents: opponentEvents,
    CreatorScrambles: creatorScrambles,
    OpponentScrambles: opponentScrambles,
    ParticipantIDs: memberIDs,
    RoundResults: {},
    Summary: {
      TotalSolves: 0,
      TotalWins: 0,
      ByUser: {},
      ByEvent: {},
    },
    CreatedAt: createdAt,
    UpdatedAt: createdAt,
  };
}

function getRoundEvent(runItem, participantID, solveIndex) {
  if (participantID && participantID === runItem.CreatorID) {
    return (
      runItem.CreatorEvents?.[solveIndex] ||
      runItem.CreatorEvent ||
      runItem.OpponentEvent ||
      "333"
    );
  }
  return (
    runItem.OpponentEvents?.[solveIndex] ||
    runItem.OpponentEvent ||
    runItem.CreatorEvent ||
    "333"
  );
}

function computeRunSummary(runItem) {
  const summary = {
    TotalSolves: 0,
    TotalWins: 0,
    ByUser: {},
    ByEvent: {},
  };

  Object.entries(runItem.RoundResults || {}).forEach(([solveIndexRaw, row]) => {
    const solveIndex = Number(solveIndexRaw);
    const entrants = Object.entries(row || {})
      .map(([participantID, result]) => ({
        participantID,
        time: Number(result?.time),
        event: normalizeEvent(result?.event || getRoundEvent(runItem, participantID, solveIndex)),
      }))
      .filter((entry) => entry.participantID && Number.isFinite(entry.time));

    entrants.forEach((entry) => {
      summary.TotalSolves += 1;
      summary.ByUser[entry.participantID] = {
        Solves: Number(summary.ByUser?.[entry.participantID]?.Solves || 0) + 1,
        Wins: Number(summary.ByUser?.[entry.participantID]?.Wins || 0),
      };
      summary.ByEvent[entry.event] = {
        Solves: Number(summary.ByEvent?.[entry.event]?.Solves || 0) + 1,
        Wins: Number(summary.ByEvent?.[entry.event]?.Wins || 0),
        ByUser: {
          ...(summary.ByEvent?.[entry.event]?.ByUser || {}),
          [entry.participantID]: {
            Solves:
              Number(summary.ByEvent?.[entry.event]?.ByUser?.[entry.participantID]?.Solves || 0) +
              1,
            Wins: Number(summary.ByEvent?.[entry.event]?.ByUser?.[entry.participantID]?.Wins || 0),
          },
        },
      };
    });

    if (entrants.length < 2) return;
    entrants.sort((a, b) => a.time - b.time);
    if (entrants[0].time === entrants[1].time) return;

    const winner = entrants[0];
    summary.TotalWins += 1;
    summary.ByUser[winner.participantID] = {
      Solves: Number(summary.ByUser?.[winner.participantID]?.Solves || 0),
      Wins: Number(summary.ByUser?.[winner.participantID]?.Wins || 0) + 1,
    };
    summary.ByEvent[winner.event] = {
      Solves: Number(summary.ByEvent?.[winner.event]?.Solves || 0),
      Wins: Number(summary.ByEvent?.[winner.event]?.Wins || 0) + 1,
      ByUser: {
        ...(summary.ByEvent?.[winner.event]?.ByUser || {}),
        [winner.participantID]: {
          Solves: Number(summary.ByEvent?.[winner.event]?.ByUser?.[winner.participantID]?.Solves || 0),
          Wins: Number(summary.ByEvent?.[winner.event]?.ByUser?.[winner.participantID]?.Wins || 0) + 1,
        },
      },
    };
  });

  return summary;
}

async function backfillConversation(conversationMeta) {
  const conversationID = String(conversationMeta.ConversationID || "").trim();
  if (!conversationID) return { conversationID: "", runs: 0 };

  const { members, messages } = await getConversationMessagesAndMembers(conversationID);
  const runs = new Map();

  messages.forEach((message) => {
    const text = String(message.Text || "");
    const createdAt = String(message.CreatedAt || "");

    const payload = parseSharedAoN(text);
    if (payload?.sharedID) {
      runs.set(
        payload.sharedID,
        buildRunFromPayload(conversationID, payload, members, createdAt)
      );
      return;
    }

    const extend = parseSharedExtend(text);
    if (extend?.sharedID && runs.has(extend.sharedID)) {
      const run = runs.get(extend.sharedID);
      run.CreatorEvents = [...(run.CreatorEvents || []), ...(extend.creatorEvents || [])];
      run.OpponentEvents = [...(run.OpponentEvents || []), ...(extend.opponentEvents || [])];
      run.CreatorScrambles = [...(run.CreatorScrambles || []), ...(extend.creatorScrambles || [])];
      run.OpponentScrambles = [...(run.OpponentScrambles || []), ...(extend.opponentScrambles || [])];
      run.Count = Math.max(
        Number(run.Count || 0),
        Number(extend.count || 0),
        run.CreatorScrambles.length,
        run.OpponentScrambles.length
      );
      run.UpdatedAt = createdAt || run.UpdatedAt;
      return;
    }

    const update = parseSharedUpdate(text);
    if (update?.sharedID && runs.has(update.sharedID)) {
      const run = runs.get(update.sharedID);
      run.RoundResults[update.solveIndex] = {
        ...(run.RoundResults[update.solveIndex] || {}),
        [update.senderID]: {
          time: update.time,
          event: getRoundEvent(run, update.senderID, update.solveIndex),
          updatedAt: createdAt || run.UpdatedAt,
        },
      };
      run.UpdatedAt = createdAt || run.UpdatedAt;
    }
  });

  let sharedStats = createEmptySharedStats();

  for (const run of runs.values()) {
    run.Summary = computeRunSummary(run);
    await ddb.send(new PutCommand({ TableName: TABLE, Item: run }));

    const runStats = createEmptySharedStats();
    runStats.TotalSolves = Number(run.Summary.TotalSolves || 0);
    runStats.TotalWins = Number(run.Summary.TotalWins || 0);
    runStats.TotalSessions = 1;
    runStats.LastSharedAt = run.UpdatedAt || run.CreatedAt || null;

    const sessionEvent = normalizeEvent(run.CreatorEvent || run.OpponentEvent || "333");
    runStats.ByEvent[sessionEvent] = {
      Solves: 0,
      Wins: 0,
      Sessions: 1,
      ByUser: Object.fromEntries(
        members.map((userID) => [userID, { Solves: 0, Wins: 0, Sessions: 1 }])
      ),
    };

    Object.entries(run.Summary.ByEvent || {}).forEach(([eventKey, values]) => {
      runStats.ByEvent[eventKey] = {
        Solves: Number(values?.Solves || 0),
        Wins: Number(values?.Wins || 0),
        Sessions: Number(runStats.ByEvent?.[eventKey]?.Sessions || 0),
        ByUser: Object.fromEntries(
          Object.entries(values?.ByUser || {}).map(([userID, byUserValues]) => [
            userID,
            {
              Solves: Number(byUserValues?.Solves || 0),
              Wins: Number(byUserValues?.Wins || 0),
              Sessions: Number(runStats.ByEvent?.[eventKey]?.ByUser?.[userID]?.Sessions || 0),
            },
          ])
        ),
      };
    });

    members.forEach((userID) => {
      runStats.ByUser[userID] = {
        Solves: Number(run.Summary.ByUser?.[userID]?.Solves || 0),
        Wins: Number(run.Summary.ByUser?.[userID]?.Wins || 0),
        Sessions: 1,
      };
    });

    sharedStats = mergeStats(sharedStats, runStats);
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: {
        PK: `CONVO#${conversationID}`,
        SK: "META",
      },
      UpdateExpression: "SET SharedStats = :stats, UpdatedAt = :updated",
      ExpressionAttributeValues: {
        ":stats": sharedStats,
        ":updated": new Date().toISOString(),
      },
    })
  );

  for (const userID of members) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: `USER#${userID}`,
          SK: `CONVO#${conversationID}`,
        },
        UpdateExpression: "SET SharedStats = :stats, UpdatedAt = :updated",
        ExpressionAttributeValues: {
          ":stats": sharedStats,
          ":updated": new Date().toISOString(),
        },
      })
    );
  }

  return { conversationID, runs: runs.size };
}

async function main() {
  const conversationIDFilter = String(process.argv[2] || "").trim();
  const metas = await scanConversationMetas();
  const filtered = conversationIDFilter
    ? metas.filter((item) => String(item.ConversationID || "") === conversationIDFilter)
    : metas;

  let processed = 0;
  let runCount = 0;

  for (const meta of filtered) {
    const result = await backfillConversation(meta);
    if (!result.conversationID) continue;
    processed += 1;
    runCount += result.runs;
    console.log(`Backfilled ${result.conversationID} (${result.runs} shared runs)`);
  }

  console.log(`Done. Conversations: ${processed}. Shared runs: ${runCount}.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
