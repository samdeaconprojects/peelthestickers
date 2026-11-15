// End-to-end csTimer import at scale: reads (or generates) an export, runs it through the same
// parse -> dedupe -> group -> chunk steps the import modal and Stats.js use, then uploads, finalizes
// and verifies the stored per-event stats against the parsed solves.
//   FILE=/path/cstimer.txt node --max-old-space-size=8000 docs/loadtest/importScale.mjs
//   N=200000 SESSIONS=4 node docs/loadtest/importScale.mjs        (old synthetic 3x3-only file)
// CONCURRENCY uploads that many chunks at once. BACKGROUND=1 uses the app's background path
// (gzipped chunks to /stage, then /queue, then the server's worker) instead of /chunk + /finalize.
// LIVE_SOLVES=1 keeps saving a 3x3 solve every 2s while the import runs, timing each save and
// counting them into the expected stats.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseCsTimer, dedupeAndStabilize, detectFormat, chunkImportSolves } from "../../src/utils/importParsers.js";

const API = process.env.SIM_API || "http://localhost:5098";
if (!/^http:\/\/localhost:\d+$/.test(API)) throw new Error("Refusing to run against a non-local API");
const FILE = process.env.FILE || "";
const N = Number(process.env.N || 5000);
const SESSIONS = Number(process.env.SESSIONS || 1);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 1));
const USER = process.env.USER_ID || `imp${Date.now().toString(36)}`;
const PW = "loadtest-password-1";

let peakRss = 0;
const memTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 200);
const stages = {};
const stage = (name, fn) => {
  const t0 = performance.now();
  const out = fn();
  stages[name] = Math.round(performance.now() - t0);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  return out;
};

const MOVES = ["R", "R'", "U", "U'", "F", "F'", "L", "L'", "D", "D'", "B", "B'", "R2", "U2", "F2", "L2", "D2", "B2"];
const scramble = () => Array.from({ length: 20 }, () => MOVES[(Math.random() * 18) | 0]).join(" ");

function generate() {
  const out = { properties: { sessionData: {} } };
  let ts = 1400000000;
  const expected = { total: 0, dnf: 0, plus2: 0, best: Infinity, sum: 0, counted: 0 };
  for (let s = 1; s <= SESSIONS; s++) {
    const rows = [];
    const count = Math.floor(N / SESSIONS);
    for (let i = 0; i < count; i++) {
      ts += 1 + ((Math.random() * 40) | 0);
      const r = Math.random();
      const flag = r < 0.02 ? -1 : r < 0.05 ? 2000 : 0;
      const ms = 7000 + ((Math.random() * 9000) | 0);
      rows.push([[flag, ms], scramble(), i % 50 === 0 ? "pb attempt" : "", ts]);
      expected.total += 1;
      if (flag < 0) expected.dnf += 1;
      else {
        const final = ms + (flag > 0 ? 2000 : 0);
        if (flag > 0) expected.plus2 += 1;
        expected.best = Math.min(expected.best, final);
        expected.sum += final;
        expected.counted += 1;
      }
    }
    out[`session${s}`] = rows;
    out.properties.sessionData[s] = { name: `S${s}`, opt: {} };
  }
  out.properties.sessionData = JSON.stringify(out.properties.sessionData);
  return { raw: JSON.stringify(out), expected };
}

async function api(token, method, path, body, { gzip = false } = {}) {
  const t0 = performance.now();
  const json0 = body ? JSON.stringify(body) : undefined;
  const res = await fetch(API + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(gzip ? { "content-encoding": "gzip" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: json0 && gzip ? gzipSync(json0) : json0,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: performance.now() - t0 };
}

const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] || 0);
};


const raw = stage("read/generate", () => (FILE ? readFileSync(FILE, "utf8") : generate().raw));
console.log(`user=${USER} file=${FILE || "(generated)"} size=${(raw.length / 1048576).toFixed(1)}MB`);

// Same order as ImportSolvesModal.buildPlan (detect, parse, dedupe, keep csTimer session names)
// then Stats.handleImportSolves (normalize, group per event + session, chunk).
const fmt = stage("detectFormat", () => detectFormat(raw));
if (fmt !== "cstimer") throw new Error(`detected ${fmt}, expected cstimer`);
const parsed = stage("parseCsTimer", () => parseCsTimer(raw, "333"));
const solves = stage("dedupe", () => dedupeAndStabilize(parsed, "333"));
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "s";
const groups = stage("group+chunk", () => {
  const byKey = new Map();
  for (const s of solves) {
    const ev = String(s.event || "333").toUpperCase();
    const name = String(s._importSessionName || "Imported").trim();
    const key = `${ev}::${name.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, { ev, name, solves: [] });
    byKey.get(key).solves.push({
      time: s.time, scramble: s.scramble || "", event: ev, penalty: s.penalty ?? null, note: s.note ?? "",
      datetime: s.datetime, tags: { SolveSource: "Import", ...(s.tags || {}) }, originalTime: s.originalTime,
    });
  }
  return [...byKey.values()].map((g) => {
    const sessionID = `import_${slug(g.name)}_${g.ev.toLowerCase()}`;
    const clean = g.solves.map((solve, i) => ({ ...solve, sessionID, _importSessionName: g.name, importOrdinal: i }));
    return { ...g, sessionID, chunks: chunkImportSolves(clean) };
  });
});

// What the stored EVENTSTATS should say, per event.
const expectedByEvent = {};
for (const s of solves) {
  const ev = String(s.event || "333").toUpperCase();
  const e = (expectedByEvent[ev] ||= { total: 0, dnf: 0, plus2: 0, best: Infinity, sumFinal: 0 });
  e.total += 1;
  if (s.penalty === "DNF") { e.dnf += 1; continue; }
  const final = s.time + (s.penalty === "+2" ? 2000 : 0);
  if (s.penalty === "+2") e.plus2 += 1;
  e.best = Math.min(e.best, final);
  e.sumFinal += final;
}
const totalChunks = groups.reduce((n, g) => n + g.chunks.length, 0);
console.log(`client prep: ${JSON.stringify(stages)} parsed=${parsed.length} kept=${solves.length} groups=${groups.length} chunks=${totalChunks} peakRSS=${(peakRss / 1048576).toFixed(0)}MB`);
if (process.env.PREP_ONLY) { clearInterval(memTimer); process.exit(0); }

let r = await api(null, "POST", "/api/auth/signup", { username: USER, email: `${USER}@loadtest.invalid`, password: PW, acceptTerms: true });
if (r.status === 409) r = await api(null, "POST", "/api/auth/signin", { username: USER, password: PW });
const token = r.json?.token;
if (!token) throw new Error(`auth failed: ${JSON.stringify(r.json)}`);
await api(token, "POST", "/api/user", { userID: USER, name: USER, username: USER, profileEvent: "333" });

// Latency seen by everyone else on this single-process API while the import runs.
const probes = [];
let probeErrors = 0;
let probing = true;
const prober = (async () => {
  while (probing) {
    const t0 = performance.now();
    try { await fetch(`${API}/api/health`); } catch { probeErrors += 1; }
    probes.push(performance.now() - t0);
    await new Promise((res) => setTimeout(res, 500));
  }
})();

const job = await api(token, "POST", "/api/importJobs", { userID: USER, format: "cstimer", totalSolves: solves.length, totalChunks });
console.log("create job:", job.status, job.status === 200 ? "" : JSON.stringify(job.json));
const jobID = job.json?.job?.jobID;
if (!jobID) { probing = false; process.exit(1); }

const BACKGROUND = !!process.env.BACKGROUND;
const started = Date.now();

// Someone solving while their import runs: a save every 2s, each one timed.
const live = { saved: 0, failed: 0, ms: [], dnf: 0, best: Infinity, sum: 0, running: !!process.env.LIVE_SOLVES };
const liveSolver = (async () => {
  while (live.running) {
    const ms = 9000 + ((Math.random() * 4000) | 0);
    const r = await api(token, "POST", "/api/solve", {
      userID: USER, event: "333", sessionID: "main", rawTimeMs: ms, scramble: "R U R' U'", note: "", tags: {},
    }).catch(() => ({ status: 0, ms: 0 }));
    if (r.status === 200) {
      live.saved += 1; live.ms.push(r.ms); live.sum += ms; live.best = Math.min(live.best, ms);
    } else {
      live.failed += 1;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
})();

const chunkMs = [];
let sent = 0;
let accepted = 0;
let failure = null;
const queue = groups.flatMap((g) => g.chunks);
let next = 0;
let lastLog = 0;
let throttleRetries = 0;
let throttledItems = 0;
let chunkRetries = 0;
async function worker() {
  while (!failure && next < queue.length) {
    const index = next++;
    const chunk = queue[index];
    // Retried like Stats.sendImportChunk: about two minutes for 5xx, 429 and network errors.
    let c;
    for (let attempt = 0; ; attempt += 1) {
      c = await (BACKGROUND
        ? api(token, "POST", `/api/importJobs/${USER}/${jobID}/stage`, { index, solves: chunk }, { gzip: true })
        : api(token, "POST", `/api/importJobs/${USER}/${jobID}/chunk`, { solves: chunk })
      ).catch((e) => ({ status: 0, json: { error: e.message }, ms: 0 }));
      const retryable = !c.status || c.status >= 500 || c.status === 429;
      if (c.status === 200 || !retryable || attempt >= 6) break;
      chunkRetries += 1;
      console.log(`  chunk retry ${attempt + 1}: HTTP ${c.status} ${String(c.json?.error || "").slice(0, 80)}`);
      await new Promise((res) => setTimeout(res, Math.min(30000, 2000 * 2 ** attempt)));
    }
    chunkMs.push(c.ms);
    if (c.status !== 200) { failure = `chunk at ${sent}: HTTP ${c.status} ${JSON.stringify(c.json)}`; return; }
    sent += chunk.length;
    accepted += c.json.accepted || 0;
    throttleRetries += c.json.throttle?.retries || 0;
    throttledItems += c.json.throttle?.unprocessedItems || 0;
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      console.log(`  ${sent}/${solves.length} ${Math.round(sent / ((Date.now() - started) / 1000))}/s chunk=${Math.round(c.ms)}ms throttleRetries=${throttleRetries}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const uploadS = (Date.now() - started) / 1000;
console.log(`upload: ${sent} sent, ${accepted} accepted in ${uploadS.toFixed(0)}s; chunk p50=${pct(chunkMs, 0.5)}ms p95=${pct(chunkMs, 0.95)}ms max=${pct(chunkMs, 1)}ms`);
console.log(`throttling: ${throttleRetries} retry rounds, ${throttledItems} items sent back by DynamoDB, ${chunkRetries} chunk resends`);
if (failure) console.log("UPLOAD FAILED:", failure);

const fin0 = Date.now();
if (BACKGROUND) {
  const q = await api(token, "POST", `/api/importJobs/${USER}/${jobID}/queue`, { totalChunks: queue.length });
  console.log(`queue: HTTP ${q.status} ${q.status === 202 ? "" : JSON.stringify(q.json)}`);
} else {
  await api(token, "POST", `/api/importJobs/${USER}/${jobID}/finalize`, {});
}
let status = "";
let last = null;
let pollErrors = 0;
let lastPhase = "";
let lastBgLog = 0;
for (;;) {
  const j = await api(token, "GET", `/api/importJobs/${USER}/${jobID}`).catch((e) => ({ status: 0, json: { error: e.message } }));
  // The API restarting under a background import is expected to be survivable; keep asking.
  if (j.status !== 200) {
    pollErrors += 1;
    if (pollErrors % 10 === 1) console.log(`  poll error ${pollErrors}: HTTP ${j.status}`);
    if (pollErrors > 400) break;
    await new Promise((res) => setTimeout(res, 1500));
    continue;
  }
  last = j.json?.job;
  status = String(last?.status || "").toUpperCase();
  if (BACKGROUND && (status !== lastPhase || Date.now() - lastBgLog > 15000)) {
    lastPhase = status;
    lastBgLog = Date.now();
    const el = (Date.now() - fin0) / 1000;
    console.log(`  [${el.toFixed(0)}s] ${status} scanned=${last.scannedSolves}/${last.stagedSolves} new=${last.processedSolves} ${Math.round(last.scannedSolves / Math.max(1, el))}/s live saves=${live.saved}`);
  }
  if (["COMPLETED", "FAILED", "CANCELED"].includes(status)) break;
  await new Promise((res) => setTimeout(res, 1500));
}
if (BACKGROUND) accepted = Number(last?.processedSolves || 0);
live.running = false;
await liveSolver;
if (live.saved || live.failed) {
  console.log(`live solves during import: saved=${live.saved} failed=${live.failed} p50=${pct(live.ms, 0.5)}ms p95=${pct(live.ms, 0.95)}ms max=${pct(live.ms, 1)}ms`);
  const e = (expectedByEvent["333"] ||= { total: 0, dnf: 0, plus2: 0, best: Infinity, sumFinal: 0 });
  e.total += live.saved; e.sumFinal += live.sum; e.best = Math.min(e.best, live.best);
}
const finalizeS = ((Date.now() - fin0) / 1000).toFixed(0);
console.log(`finalize: ${status} in ${finalizeS}s ${last?.error ? `error=${last.error}` : ""}`);

probing = false;
await prober;
console.log(`health probe during import: n=${probes.length} p50=${pct(probes, 0.5)}ms p95=${pct(probes, 0.95)}ms max=${pct(probes, 1)}ms errors=${probeErrors}`);

// Verify the stored stats against the parsed solves, event by event.
let allMatch = true;
for (const [ev, e] of Object.entries(expectedByEvent).sort()) {
  const stats = await api(token, "GET", `/api/eventStats/${USER}?event=${ev}`);
  const item = stats.json?.item || stats.json || {};
  const want = { total: e.total, dnf: e.dnf, plus2: e.plus2, best: e.best, sumFinal: e.sumFinal };
  const got = { total: item.SolveCountTotal, dnf: item.DNFCount, plus2: item.Plus2Count, best: item.BestSingleMs, sumFinal: item.SumFinalTimeMs };
  const ok = JSON.stringify(want) === JSON.stringify(got);
  allMatch &&= ok;
  console.log(`${ev.padEnd(9)} ${ok ? "MATCH" : "MISMATCH"} ${JSON.stringify(got)}${ok ? "" : ` want ${JSON.stringify(want)}`}`);
}
console.log(`stats: ${allMatch ? "ALL MATCH" : "MISMATCH"}`);

// Day buckets (calendar/history views): per event and all-events, they must add up to the totals.
if (process.env.SIM_DDB) {
  const { ddb } = await import("./lib.mjs");
  const { QueryCommand } = await import("/Users/samdeacon/Desktop/peelthestickers/server/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js");
  const sums = {};
  let cursor;
  do {
    const out = await ddb.send(new QueryCommand({
      TableName: "PTSLoadTest",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": `USER#${USER}`, ":p": "DAYBUCKET#" },
      ExclusiveStartKey: cursor,
    }));
    for (const it of out.Items || []) {
      const key = it.SK.startsWith("DAYBUCKET#ALL#") ? "ALL" : it.ScopeVariant === "MAIN" ? null : it.Event;
      if (!key) continue;
      const b = (sums[key] ||= { days: 0, total: 0, dnf: 0 });
      b.days += 1;
      b.total += Number(it.SolveCountTotal || 0);
      b.dnf += Number(it.DNFCount || 0);
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  let bucketsOk = (sums.ALL?.total || 0) === solves.length + live.saved;
  for (const [ev, e] of Object.entries(expectedByEvent)) {
    bucketsOk &&= sums[ev]?.total === e.total && sums[ev]?.dnf === e.dnf;
  }
  allMatch &&= bucketsOk;
  console.log(`day buckets: ${bucketsOk ? "MATCH" : "MISMATCH"} all-events days=${sums.ALL?.days} solves=${sums.ALL?.total}`);
  if (!bucketsOk) console.log(JSON.stringify(sums));
}

// Importing the same file again must add nothing.
if (process.env.RERUN) {
  const t0 = Date.now();
  const again = await api(token, "POST", "/api/importJobs", { userID: USER, format: "cstimer", totalSolves: solves.length, totalChunks });
  let added = 0;
  for (const chunk of queue) {
    const c = await api(token, "POST", `/api/importJobs/${USER}/${again.json.job.jobID}/chunk`, { solves: chunk });
    added += c.json?.accepted ?? NaN;
  }
  console.log(`re-import added ${added} solves in ${((Date.now() - t0) / 1000).toFixed(0)}s ${added === 0 ? "(OK)" : "(DUPLICATES)"}`);
}
clearInterval(memTimer);
console.log(`timing: upload=${uploadS.toFixed(0)}s finalize=${finalizeS}s total=${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log(JSON.stringify({ user: USER, jobID, accepted, status, statsMatch: allMatch }));
