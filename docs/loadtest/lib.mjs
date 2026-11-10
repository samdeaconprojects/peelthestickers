// Shared helpers for the PTS shared-average load simulation.
// Talks ONLY to the sandboxed API on :5099 (dynalite-backed PTSLoadTest table).
import { DynamoDBClient } from "/Users/samdeacon/Desktop/peelthestickers/server/node_modules/@aws-sdk/client-dynamodb/dist-cjs/index.js";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "/Users/samdeacon/Desktop/peelthestickers/server/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js";

// SIM_API / SIM_DDB pick another sandbox pair (e.g. a second one on 5199/4667);
// both must be on localhost, so these scripts can never reach PTSProd.
export const API = process.env.SIM_API || "http://localhost:5099";
if (!/^http:\/\/localhost:\d+$/.test(API)) throw new Error("Refusing to run against non-sandbox API");
const DDB_ENDPOINT = process.env.SIM_DDB || "http://localhost:4567";
if (!/^http:\/\/localhost:\d+$/.test(DDB_ENDPOINT)) throw new Error("Refusing to read a non-local DynamoDB");

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: DDB_ENDPOINT,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
  })
);
export const TABLE = "PTSLoadTest";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

// ---------- metrics ----------
export const metrics = { calls: {}, errors: [] };
function record(route, status, ms) {
  const m = (metrics.calls[route] ||= { n: 0, ms: [], status: {} });
  m.n += 1;
  m.ms.push(ms);
  m.status[status] = (m.status[status] || 0) + 1;
}
export function summarizeMetrics() {
  const out = {};
  for (const [route, m] of Object.entries(metrics.calls)) {
    const s = [...m.ms].sort((a, b) => a - b);
    const p = (q) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
    out[route] = { n: m.n, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: Math.round(s[s.length - 1]), status: m.status };
  }
  return out;
}

export async function call(token, method, path, body) {
  const route = `${method} ${path.replace(/\/[^/?]*%23[^/?]*/g, "/:id").replace(/\?.*$/, "").replace(/\/lt[_a-z0-9]+/g, "/:user")}`;
  const t0 = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (e) {
    status = "NET:" + (e?.cause?.code || e.message);
  }
  const ms = performance.now() - t0;
  record(route, status, ms);
  if (!(status >= 200 && status < 300)) metrics.errors.push({ route, status, body: json });
  return { status, json, ms };
}

// ---------- users ----------
const PW = "loadtest-password-1";
export async function signupMany(prefix, n) {
  const users = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const userID = `${prefix}${String(i).padStart(2, "0")}`;
      let r = await call(null, "POST", "/api/auth/signup", { username: userID, password: PW });
      if (r.status === 409) r = await call(null, "POST", "/api/auth/signin", { username: userID, password: PW });
      if (!r.json?.token) throw new Error(`signup failed ${userID}: ${JSON.stringify(r.json)}`);
      await call(r.json.token, "POST", "/api/user", { userID, name: userID, username: userID, profileEvent: "333" });
      return { userID, token: r.json.token };
    })
  );
  return users;
}

// ---------- SSE listener ----------
export function listenSSE(user, onEvent) {
  const ctrl = new AbortController();
  const state = { events: 0, connected: false, error: null };
  (async () => {
    try {
      const res = await fetch(`${API}/api/notifications/stream/${user.userID}?token=${encodeURIComponent(user.token)}`, { signal: ctrl.signal });
      state.connected = res.ok;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            state.events += 1;
            onEvent?.(parsed);
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") state.error = e.message;
    }
  })();
  return { stop: () => ctrl.abort(), state };
}

// ---------- messages ----------
export async function sendMessage(user, conversationID, text) {
  return call(user.token, "POST", "/api/message", { conversationID, senderID: user.userID, text });
}
export async function fetchLatest(user, conversationID, limit = 25) {
  const r = await call(user.token, "GET", `/api/messages/${encodeURIComponent(conversationID)}?limit=${limit}`);
  return r.json?.items || [];
}
export async function fetchAllMessages(user, conversationID) {
  const all = [];
  let cursor = "";
  for (let guard = 0; guard < 200; guard += 1) {
    const qs = `limit=500${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await call(user.token, "GET", `/api/messages/${encodeURIComponent(conversationID)}?${qs}`);
    all.unshift(...(r.json?.items || []));
    if (!r.json?.hasMore) break;
    cursor = r.json.nextCursor;
  }
  return all;
}

// Mirrors Social.js buildRoundResultsFromMessages / parseSharedUpdatePayload.
export function buildRoundResults(messages, sharedID) {
  const rr = {};
  for (const m of messages) {
    if (!String(m?.text || "").startsWith("[sharedUpdate]")) continue;
    const [sid, idx, time, uid] = m.text.slice("[sharedUpdate]".length).split("|");
    if (sid !== sharedID) continue;
    const i = Number(idx);
    const t = Number(time);
    if (!Number.isFinite(i) || !Number.isFinite(t) || !uid) continue;
    rr[i] = { ...(rr[i] || {}), [uid]: { time: t } };
  }
  return rr;
}
// Mirrors App.js findSharedNextUnsolvedIndex.
export function nextUnsolved(rr, userID, total, from = 0) {
  for (let step = 0; step < total; step += 1) {
    const i = (from + step) % total;
    if (!Number.isFinite(Number(rr?.[i]?.[userID]?.time))) return i;
  }
  return -1;
}

export async function getRaw(PK, SK) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK, SK }, ConsistentRead: true }));
  return out.Item || null;
}
export async function queryRaw(PK, prefix) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": PK, ":p": prefix },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export const fakeScramble = (i) => `R U R' U' F2 D L2 B' #${i}`;
// Realistic-ish solve time in ms for a "skill" mean (ms), with rare DNF-ish outliers.
export function solveTime(meanMs) {
  const t = meanMs * (0.8 + Math.random() * 0.45);
  return Math.round(Math.random() < 0.05 ? t * 1.6 : t);
}

// ---------- shared-run audit ----------
// Results the server stored for a run: its cell items (one per player per
// round), or the old single-item RoundResults map for runs made before those.
export async function getRunResults(conversationID, sharedID) {
  const cells = await queryRaw(`CONVO#${conversationID}`, `SHAREDRUN#${sharedID}#CELL#`);
  if (!cells.length) {
    const run = await getRaw(`CONVO#${conversationID}`, `SHAREDRUN#${sharedID}`);
    return run?.RoundResults || {};
  }
  const rr = {};
  for (const c of cells) (rr[c.SolveIndex] ||= {})[c.UserID] = { time: Number(c.Time), event: c.Event };
  return rr;
}
// The per-round tallies the stats are counted from ({ idx: { uid: time } }).
export async function getRoundTallies(conversationID, sharedID) {
  const rounds = await queryRaw(`CONVO#${conversationID}`, `SHAREDRUN#${sharedID}#ROUND#`);
  const out = {};
  for (const r of rounds) {
    out[r.SolveIndex] = Object.fromEntries(
      Object.entries(r).filter(([k]) => k.startsWith("T#")).map(([k, v]) => [k.slice(2), Number(v)])
    );
  }
  return out;
}
// Solves and wins implied by truth ({ idx: { uid: time } }): a round's winner
// is the unique fastest among two or more entrants.
export function statsFromTruth(truth) {
  const out = { solves: 0, wins: 0, byUser: {} };
  const bump = (u, f) => { (out.byUser[u] ||= { solves: 0, wins: 0 })[f] += 1; };
  for (const row of Object.values(truth)) {
    const entries = Object.entries(row);
    entries.forEach(([u]) => { out.solves += 1; bump(u, "solves"); });
    if (entries.length < 2) continue;
    const best = Math.min(...entries.map(([, t]) => t));
    const leaders = entries.filter(([, t]) => t === best);
    if (leaders.length === 1) { out.wins += 1; bump(leaders[0][0], "wins"); }
  }
  return out;
}
// Compares stored results and META.SharedStats against truth. All counts 0 = exact.
export function auditRun({ truth, results, sharedStats, event = "333", userIDs = [] }) {
  let missing = 0;
  let wrong = 0;
  let extra = 0;
  for (const [i, row] of Object.entries(truth)) {
    for (const [u, t] of Object.entries(row)) {
      const got = results?.[i]?.[u]?.time;
      if (got == null) missing += 1;
      else if (got !== t) wrong += 1;
    }
  }
  for (const [i, row] of Object.entries(results || {})) {
    for (const u of Object.keys(row)) if (truth?.[i]?.[u] == null) extra += 1;
  }
  const expected = statsFromTruth(truth);
  const ss = sharedStats || {};
  const users = new Set([...userIDs, ...Object.keys(expected.byUser)]);
  let byUserSolvesWrong = 0;
  let byUserWinsWrong = 0;
  let byEventUserWrong = 0;
  for (const u of users) {
    const e = expected.byUser[u] || { solves: 0, wins: 0 };
    if (Number(ss.ByUser?.[u]?.Solves || 0) !== e.solves) byUserSolvesWrong += 1;
    if (Number(ss.ByUser?.[u]?.Wins || 0) !== e.wins) byUserWinsWrong += 1;
    const ev = ss.ByEvent?.[event]?.ByUser?.[u] || {};
    if (Number(ev.Solves || 0) !== e.solves || Number(ev.Wins || 0) !== e.wins) byEventUserWrong += 1;
  }
  return {
    resultsMissing: missing,
    resultsWrong: wrong,
    resultsExtra: extra,
    expectedSolves: expected.solves,
    storedSolves: Number(ss.TotalSolves || 0),
    expectedWins: expected.wins,
    storedWins: Number(ss.TotalWins || 0),
    eventSolves: Number(ss.ByEvent?.[event]?.Solves || 0),
    eventWins: Number(ss.ByEvent?.[event]?.Wins || 0),
    byUserSolvesWrong,
    byUserWinsWrong,
    byEventUserWrong,
    exact:
      !missing && !wrong && !extra &&
      Number(ss.TotalSolves || 0) === expected.solves && Number(ss.TotalWins || 0) === expected.wins &&
      Number(ss.ByEvent?.[event]?.Solves || 0) === expected.solves &&
      Number(ss.ByEvent?.[event]?.Wins || 0) === expected.wins &&
      !byUserSolvesWrong && !byUserWinsWrong && !byEventUserWrong,
  };
}
