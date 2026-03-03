// server/server.js
const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json());

const port = process.env.PORT || 5050;

// --- DynamoDB (AWS SDK v3) ---
const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-2";
const TABLE = process.env.PTS_TABLE || "PTS";

// NOTE: your actual Dynamo table must match this expectation
// (PK/SK + GSI1) if you want solves queries to work.
const USE_PK_SK = String(process.env.PTS_USE_PK_SK || "true").toLowerCase() === "true";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
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
// Sign-in fetch (PROFILE)
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

// Create user profile
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
    } = req.body || {};

    const id = String(userID || "").trim();
    if (!id) return res.status(400).json({ error: "Missing userID" });

    const item = {
      PK: `USER#${id}`,
      SK: "PROFILE",
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
      DateFounded: new Date().toISOString(),
      CubeCollection: cubeCollection ?? {},
      Settings: settings ?? {},
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/user error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Update user profile (top-level overwrite of fields you send)
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

    for (const [k, v] of Object.entries(updates)) {
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
        ReturnValues: "ALL_NEW",
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

    return res.json({ ok: true, items: out.Items || [] });
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
    const ev = String(event || "").toUpperCase();
    const sid = String(sessionID || "").trim();
    const name = String(sessionName || "").trim();

    if (!id) return res.status(400).json({ error: "Missing userID" });
    if (!ev) return res.status(400).json({ error: "Missing event" });
    if (!sid) return res.status(400).json({ error: "Missing sessionID" });
    if (!name) return res.status(400).json({ error: "Missing sessionName" });

    const item = {
      PK: `USER#${id}`,
      SK: `SESSION#${ev}#${sid}`,
      Event: ev,
      SessionID: sid,
      SessionName: name,
      CreatedAt: new Date().toISOString(),
    };

    if (opts?.sessionType === "RELAY") {
      item.SessionType = "RELAY";
      item.RelayLegs = Array.isArray(opts.relayLegs) ? opts.relayLegs : [];
    }

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/session error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- SESSIONSTATS --------------------
app.get("/api/sessionStats/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = String(req.query?.event || "").toUpperCase();
  const sessionID = String(req.query?.sessionID || "main");

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!event) return res.status(400).json({ error: "Missing event" });

  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
      })
    );

    return res.json({ ok: true, item: out.Item || null });
  } catch (e) {
    console.error("GET /api/sessionStats error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Mark SESSIONSTATS stale (client uses this after imports/moves/new solves)
app.post("/api/markSessionStatsStale", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const event = String(req.body?.event || "").toUpperCase();
    const sessionID = String(req.body?.sessionID || "main");
    const reason = String(req.body?.reason || "stale").trim();

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SESSIONSTATS#${event}#${sessionID}` },
        UpdateExpression: "SET stale = :t, staleReason = :r, staleAt = :a",
        ExpressionAttributeValues: {
          ":t": true,
          ":r": reason,
          ":a": new Date().toISOString(),
        },
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    // If SESSIONSTATS doesn't exist yet, ignore.
    console.warn("POST /api/markSessionStatsStale (ok if missing):", e?.message || e);
    return res.json({ ok: true, skipped: true });
  }
});

// -------------------- SOLVES --------------------
app.get("/api/solves/:userID", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const event = String(req.query?.event || "").toUpperCase();
  const sessionID = String(req.query?.sessionID || "main");
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
        ScanIndexForward: false, // newest first
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
  const event = String(req.query?.event || "").toUpperCase();
  const sessionID = String(req.query?.sessionID || "main");
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
        ScanIndexForward: false, // newest first
        Limit: n,
      })
    );

    return res.json({ ok: true, items: out.Items || [] });
  } catch (e) {
    console.error("GET /api/solvesLastN error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/solve", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    const event = String(req.body?.event || "").toUpperCase();
    const sessionID = String(req.body?.sessionID || "main");
    const ms = Number(req.body?.ms);
    const ts = String(req.body?.ts || new Date().toISOString());

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });
    if (!Number.isFinite(ms) || ms < 0) return res.status(400).json({ error: "Invalid ms" });

    const penalty = req.body?.penalty ?? null;
    const scramble = req.body?.scramble ?? null;
    const note = req.body?.note ?? null;
    const tags = req.body?.tags ?? {};

    const solveItem = {
      PK: `USER#${userID}`,
      SK: `SOLVE#${ts}`,
      GSI1PK: `SESSION#${userID}#${event}#${sessionID}`,
      GSI1SK: ts,

      Event: event,
      SessionID: sessionID,
      TimeMs: ms,
      Penalty: penalty,
      Scramble: scramble,
      Note: note,
      CreatedAt: ts,
      Tags: tags,

      // legacy-friendly
      Time: ms,
      DateTime: ts,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: solveItem }));

    return res.json({ ok: true, ts, event, sessionID, statsUpdated: true });
  } catch (e) {
    console.error("POST /api/solve error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/solve/:userID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const timestamp = String(req.params.timestamp || "").trim();
  const updates = req.body?.updates;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!timestamp) return res.status(400).json({ error: "Missing timestamp" });
  if (!updates || typeof updates !== "object") return res.status(400).json({ error: "Missing updates" });

  try {
    const expr = [];
    const names = {};
    const values = {};

    for (const [k, v] of Object.entries(updates)) {
      if (typeof v === "undefined") continue;
      names[`#${k}`] = k;
      values[`:${k}`] = v;
      expr.push(`#${k} = :${k}`);
    }

    if (!expr.length) return res.json({ ok: true, skipped: true });

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SOLVE#${timestamp}` },
        UpdateExpression: `SET ${expr.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/solve error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/solvePenalty/:userID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const timestamp = String(req.params.timestamp || "").trim();
  const originalTime = Number(req.body?.originalTime);
  const penalty = req.body?.penalty;

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!timestamp) return res.status(400).json({ error: "Missing timestamp" });
  if (!Number.isFinite(originalTime)) return res.status(400).json({ error: "Invalid originalTime" });

  let updatedTime = originalTime;
  if (penalty === "+2") updatedTime += 2000;
  if (penalty === "DNF") updatedTime = Number.MAX_SAFE_INTEGER;

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SOLVE#${timestamp}` },
        UpdateExpression:
          "SET Penalty = :p, #Time = :t, OriginalTime = if_not_exists(OriginalTime, :o)",
        ExpressionAttributeNames: { "#Time": "Time" },
        ExpressionAttributeValues: {
          ":p": penalty,
          ":t": updatedTime,
          ":o": originalTime,
        },
      })
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/solvePenalty error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/solve/:userID/:timestamp", async (req, res) => {
  if (!requirePkSk(res)) return;

  const userID = String(req.params.userID || "").trim();
  const timestamp = String(req.params.timestamp || "").trim();

  if (!userID) return res.status(400).json({ error: "Missing userID" });
  if (!timestamp) return res.status(400).json({ error: "Missing timestamp" });

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `SOLVE#${timestamp}` },
      })
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/solve error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- BATCH WRITE (used by imports/moves) --------------------
app.post("/api/batchWrite", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const tableName = TABLE; // ✅ lock it (server decides)
    const requests = req.body?.requests;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.json({ ok: true, wrote: 0, tableName });
    }

    console.log("batchWrite -> table:", tableName, "requests:", requests.length);

    // chunk to 25
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

    return res.json({ ok: true, wrote, tableName }); // ✅ include tableName in success too
  } catch (e) {
    console.error("POST /api/batchWrite error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// -------------------- Helpers: load solves for a session (paged) --------------------
async function getAllSolvesBySession(userID, eventUpper, sessionID) {
  const gsi1pk = `SESSION#${userID}#${eventUpper}#${sessionID}`;
  let cursor = undefined;
  const all = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": gsi1pk },
        ScanIndexForward: false, // newest first
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) all.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  // return oldest -> newest (what your stats builder expects)
  return all.reverse();
}

// -------------------- Helpers: stats builder --------------------
function getEffectiveTimeMs(solve) {
  const base = Number(solve?.Time ?? solve?.TimeMs ?? solve?.time ?? solve?.ms);
  const penalty = solve?.Penalty ?? solve?.penalty ?? null;

  if (!Number.isFinite(base)) return Infinity;
  if (penalty === "DNF") return Infinity;
  if (penalty === "+2") return base + 2000;
  return base;
}

function computeWindowAverageMs(solvesSlice) {
  if (!Array.isArray(solvesSlice) || solvesSlice.length === 0) return Infinity;

  const times = solvesSlice.map(getEffectiveTimeMs);
  const dnfCount = times.filter((t) => !Number.isFinite(t)).length;
  if (dnfCount > 1) return Infinity;

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  if (trimmed.length === 0) return Infinity;

  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  const avg = sum / trimmed.length;
  return Number.isFinite(avg) ? avg : Infinity;
}

function buildSessionStatsFromSolves(solves) {
  if (!Array.isArray(solves) || solves.length === 0) {
    return {
      solveCount: 0,
      totalTimeMs: 0,
      overallAvgMs: null,
      bestSingleMs: null,
      bestSingleDateTime: null,
      bestAo5Ms: null,
      bestAo5StartIndex: null,
      bestAo12Ms: null,
      bestAo12StartIndex: null,
      lastSolveDateTime: null,
      lastRecomputedAt: new Date().toISOString(),
    };
  }

  let solveCount = 0;
  let totalTimeMs = 0;
  let bestSingleMs = null;
  let bestSingleDateTime = null;

  for (const solve of solves) {
    const t = getEffectiveTimeMs(solve);
    solveCount++;

    if (Number.isFinite(t)) {
      if (bestSingleMs === null || t < bestSingleMs) {
        bestSingleMs = t;
        bestSingleDateTime = solve.DateTime || solve.datetime || null;
      }
      totalTimeMs += t;
    }
  }

  const overallAvgMs = solveCount > 0 && totalTimeMs > 0 ? Math.round(totalTimeMs / solveCount) : null;

  let bestAo5Ms = null;
  let bestAo5StartIndex = null;
  let bestAo12Ms = null;
  let bestAo12StartIndex = null;

  if (solves.length >= 5) {
    for (let i = 0; i <= solves.length - 5; i++) {
      const avg = computeWindowAverageMs(solves.slice(i, i + 5));
      if (Number.isFinite(avg) && (bestAo5Ms === null || avg < bestAo5Ms)) {
        bestAo5Ms = avg;
        bestAo5StartIndex = i;
      }
    }
  }

  if (solves.length >= 12) {
    for (let i = 0; i <= solves.length - 12; i++) {
      const avg = computeWindowAverageMs(solves.slice(i, i + 12));
      if (Number.isFinite(avg) && (bestAo12Ms === null || avg < bestAo12Ms)) {
        bestAo12Ms = avg;
        bestAo12StartIndex = i;
      }
    }
  }

  const lastSolve = solves[solves.length - 1];
  const lastSolveDateTime = lastSolve?.DateTime || lastSolve?.datetime || null;

  return {
    solveCount,
    totalTimeMs,
    overallAvgMs,
    bestSingleMs,
    bestSingleDateTime,
    bestAo5Ms,
    bestAo5StartIndex,
    bestAo12Ms,
    bestAo12StartIndex,
    lastSolveDateTime,
    lastRecomputedAt: new Date().toISOString(),
  };
}

// -------------------- POST /api/recomputeSessionStats --------------------
app.post("/api/recomputeSessionStats", async (req, res) => {
  try {
    const userID = String(req.body?.userID || "").trim();
    const event = String(req.body?.event || "").toUpperCase();
    const sessionID = String(req.body?.sessionID || "main");

    if (!userID) return res.status(400).json({ error: "Missing userID" });
    if (!event) return res.status(400).json({ error: "Missing event" });

    if (!USE_PK_SK) {
      return res.status(500).json({
        error: "PTS_USE_PK_SK must be true for recomputeSessionStats.",
      });
    }

    const solves = await getAllSolvesBySession(userID, event, sessionID);
    const stats = buildSessionStatsFromSolves(solves);

    const now = new Date().toISOString();
    const item = {
      PK: `USER#${userID}`,
      SK: `SESSIONSTATS#${event}#${sessionID}`,
      Event: event,
      SessionID: sessionID,
      DateTime: now,
      stale: false,
      ...stats,
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return res.json({ ok: true, item });
  } catch (e) {
    console.error("POST /api/recomputeSessionStats error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -------------------- POSTS --------------------
app.post("/api/post", async (req, res) => {
  if (!requirePkSk(res)) return;

  try {
    const userID = String(req.body?.userID || "").trim();
    if (!userID) return res.status(400).json({ error: "Missing userID" });

    const timestamp = new Date().toISOString();
    const item = {
      PK: `USER#${userID}`,
      SK: `POST#${timestamp}`,
      Note: req.body?.note ?? "",
      Event: req.body?.event ?? "",
      SolveList: req.body?.solveList ?? [],
      Comments: req.body?.comments ?? [],
      DateTime: timestamp,
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

  if (!Array.isArray(comments)) return res.status(400).json({ error: "comments must be an array" });

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userID}`, SK: `POST#${timestamp}` },
        UpdateExpression: "SET Comments = :c",
        ExpressionAttributeValues: { ":c": comments },
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

  const item = {
    PK: `USER#${userID}`,
    SK: `CUSTOMEVENT#${eventID}`,
    EventID: eventID,
    EventName: eventName,
    CreatedAt: new Date().toISOString(),
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

    const items = (out.Items || []).map((it) => ({ id: it.EventID, name: it.EventName }));
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

  const timestamp = new Date().toISOString();

  const item = {
    PK: `CONVO#${conversationID}`,
    SK: `MSG#${timestamp}`,
    SenderID: senderID,
    Text: text,
    DateTime: timestamp,
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
      timestamp: it.DateTime,
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