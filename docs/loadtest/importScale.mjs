// End-to-end csTimer import at scale: generates an export, runs it through the real parsers, then
// uploads, finalizes and verifies against the sandbox API. Mirrors handleImportSolves in Stats.js.
//   N=200000 SESSIONS=4 node docs/loadtest/importScale.mjs
import { parseCsTimer, dedupeAndStabilize } from "../../src/utils/importParsers.js";

const API = process.env.SIM_API || "http://localhost:5098";
if (!/^http:\/\/localhost:\d+$/.test(API)) throw new Error("Refusing to run against a non-local API");
const N = Number(process.env.N || 5000);
const SESSIONS = Number(process.env.SESSIONS || 1);
const CHUNK = Number(process.env.CHUNK || 1500);
const USER = process.env.USER_ID || `imp${Date.now().toString(36)}`;
const PW = "loadtest-password-1";

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

async function api(token, method, path, body) {
  const t0 = performance.now();
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: performance.now() - t0 };
}

const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] || 0);
};

let r = await api(null, "POST", "/api/auth/signup", { username: USER, email: `${USER}@loadtest.invalid`, password: PW, acceptTerms: true });
if (r.status === 409) r = await api(null, "POST", "/api/auth/signin", { username: USER, password: PW });
const token = r.json?.token;
if (!token) throw new Error(`auth failed: ${JSON.stringify(r.json)}`);
await api(token, "POST", "/api/user", { userID: USER, name: USER, username: USER, profileEvent: "333" });

const { raw, expected } = generate();
console.log(`user=${USER} solves=${expected.total} sessions=${SESSIONS} file=${(raw.length / 1048576).toFixed(1)}MB`);

const solves = dedupeAndStabilize(parseCsTimer(raw, "333"), "333");
const bySession = new Map();
for (const s of solves) {
  const key = s._importSessionName;
  if (!bySession.has(key)) bySession.set(key, []);
  bySession.get(key).push({
    time: s.time, originalTime: s.originalTime, scramble: s.scramble, event: s.event, penalty: s.penalty,
    note: s.note, datetime: s.datetime, tags: { SolveSource: "Import", ...(s.tags || {}) },
    sessionID: `import_${key.toLowerCase()}`, _importSessionName: key,
  });
}

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

const job = await api(token, "POST", "/api/importJobs", { userID: USER, format: "cstimer", totalSolves: solves.length, totalChunks: Math.ceil(solves.length / CHUNK) });
console.log("create job:", job.status, job.status === 200 ? "" : JSON.stringify(job.json));
const jobID = job.json?.job?.jobID;
if (!jobID) { probing = false; process.exit(1); }

const started = Date.now();
const chunkMs = [];
let sent = 0;
let accepted = 0;
let failure = null;
outer: for (const group of bySession.values()) {
  for (let i = 0; i < group.length; i += CHUNK) {
    const chunk = group.slice(i, i + CHUNK);
    const c = await api(token, "POST", `/api/importJobs/${USER}/${jobID}/chunk`, { solves: chunk });
    chunkMs.push(c.ms);
    if (c.status !== 200) { failure = `chunk at ${sent}: HTTP ${c.status} ${JSON.stringify(c.json)}`; break outer; }
    sent += chunk.length;
    accepted += c.json.accepted;
    if (chunkMs.length % 20 === 0) console.log(`  ${sent}/${solves.length} ${Math.round(sent / ((Date.now() - started) / 1000))}/s`);
  }
}
const uploadS = (Date.now() - started) / 1000;
console.log(`upload: ${sent} sent, ${accepted} accepted in ${uploadS.toFixed(0)}s; chunk p50=${pct(chunkMs, 0.5)}ms p95=${pct(chunkMs, 0.95)}ms max=${pct(chunkMs, 1)}ms`);
if (failure) console.log("UPLOAD FAILED:", failure);

const fin0 = Date.now();
await api(token, "POST", `/api/importJobs/${USER}/${jobID}/finalize`, {});
let status = "";
let last = null;
for (;;) {
  const j = await api(token, "GET", `/api/importJobs/${USER}/${jobID}`).catch((e) => { console.log("poll error:", e.message, e.cause?.code || ""); return { status: 0, json: { error: e.message } }; });
  last = j.json?.job;
  status = String(last?.status || `HTTP${j.status}`).toUpperCase();
  if (["COMPLETED", "FAILED", "CANCELED"].includes(status) || j.status === 0) break;
  await new Promise((res) => setTimeout(res, 1500));
}
console.log(`finalize: ${status} in ${((Date.now() - fin0) / 1000).toFixed(0)}s ${last?.error ? `error=${last.error}` : ""}`);

probing = false;
await prober;
console.log(`health probe during import: n=${probes.length} p50=${pct(probes, 0.5)}ms p95=${pct(probes, 0.95)}ms max=${pct(probes, 1)}ms errors=${probeErrors}`);

// Verify the stored stats against what the generator produced.
const stats = await api(token, "GET", `/api/eventStats/${USER}?event=333`);
const item = stats.json?.item || stats.json || {};
const want = { total: expected.total, dnf: expected.dnf, plus2: expected.plus2, best: expected.best, sumFinal: expected.sum };
const got = { total: item.SolveCountTotal, dnf: item.DNFCount, plus2: item.Plus2Count, best: item.BestSingleMs, sumFinal: item.SumFinalTimeMs };
console.log("expected:", JSON.stringify(want));
console.log("stored:  ", JSON.stringify(got), JSON.stringify(want) === JSON.stringify(got) ? "MATCH" : "MISMATCH");
console.log(`stats item size: ${(JSON.stringify(item).length / 1024).toFixed(1)}KB`);

// Importing the same file again must add nothing.
if (process.env.RERUN) {
  const again = await api(token, "POST", "/api/importJobs", { userID: USER, format: "cstimer", totalSolves: solves.length });
  let added = 0;
  for (const group of bySession.values()) {
    for (let i = 0; i < group.length; i += CHUNK) {
      const c = await api(token, "POST", `/api/importJobs/${USER}/${again.json.job.jobID}/chunk`, { solves: group.slice(i, i + CHUNK) });
      added += c.json?.accepted ?? NaN;
    }
  }
  console.log(`re-import added ${added} solves ${added === 0 ? "(OK)" : "(DUPLICATES)"}`);
}
console.log(JSON.stringify({ user: USER, jobID, accepted, status }));
