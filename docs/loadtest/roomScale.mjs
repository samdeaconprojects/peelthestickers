// Live room at scale with the real client behaviour: every spectator polls
// GET /api/room/:id/state every 2.5s (App.js), posts a solve per scramble,
// host polls the leaderboard every 5s and publishes a scramble every ~12s.
import { call, signupMany, sleep, rand, randInt, API } from "./lib.mjs";

const N = Number(process.env.N || 100);
const SECONDS = Number(process.env.SECONDS || 40);
const TAG = process.env.TAG || `rs${N}`;

const t0 = Date.now();
const users = [];
for (let i = 0; i < N; i += 100) users.push(...(await signupMany(`lt_${TAG}_${i / 100}_`, Math.min(100, N - i))));
const host = users[0];
const viewers = users.slice(1);
for (let i = 0; i < viewers.length; i += 50) {
  await Promise.all(viewers.slice(i, i + 50).map((u) => call(u.token, "POST", `/api/follow/${host.userID}`, { userID: u.userID })));
}
await call(host.token, "POST", "/api/room/open", { hostID: host.userID, hostName: host.userID, event: "333" });
await call(host.token, "POST", `/api/room/${host.userID}/scramble`, { hostID: host.userID, index: 0, scramble: "R U F", event: "333" });
for (let i = 0; i < viewers.length; i += 50) {
  await Promise.all(viewers.slice(i, i + 50).map((u) => call(u.token, "POST", `/api/room/${host.userID}/join`, { userID: u.userID, name: u.userID, color: "#2EC4B6" })));
}
console.error(`setup ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const polls = [];
const bytes = [];
let stop = false;
let hostIndex = 0;

async function rawState(u, fromIndex) {
  const s = performance.now();
  const res = await fetch(`${API}/api/room/${host.userID}/state?fromIndex=${fromIndex}`, { headers: { authorization: `Bearer ${u.token}` } });
  const text = await res.text();
  polls.push({ ms: performance.now() - s, status: res.status });
  bytes.push(text.length);
  return JSON.parse(text);
}

async function viewer(u) {
  await sleep(rand(0, 2500));
  let have = 0;
  let solvedTo = -1;
  let nextSolveAt = Date.now() + rand(8000, 16000);
  while (!stop) {
    const t = Date.now();
    const st = await rawState(u, have).catch(() => null);
    if (st?.scrambles?.length) have += st.scrambles.length;
    if (Date.now() >= nextSolveAt && solvedTo < have - 1) {
      solvedTo += 1;
      await call(u.token, "POST", `/api/room/${host.userID}/solve`, { userID: u.userID, index: solvedTo, time: randInt(8000, 20000) });
      nextSolveAt = Date.now() + rand(8000, 16000);
    }
    await sleep(Math.max(0, 2500 - (Date.now() - t)));
  }
}
async function hostLoop() {
  while (!stop) {
    await sleep(12000);
    if (stop) break;
    hostIndex += 1;
    await call(host.token, "POST", `/api/room/${host.userID}/scramble`, { hostID: host.userID, index: hostIndex, scramble: `R U F #${hostIndex}`, event: "333" });
  }
}
async function hostCount() {
  while (!stop) {
    await call(host.token, "GET", `/api/room/${host.userID}/leaderboard`);
    await sleep(5000);
  }
}

const runStart = Date.now();
const all = Promise.all([...viewers.map(viewer), hostLoop(), hostCount()]);
await sleep(SECONDS * 1000);
stop = true;
await all;
const dur = (Date.now() - runStart) / 1000;

const ms = polls.map((p) => p.ms).sort((a, b) => a - b);
const pct = (q) => Math.round(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]);
const avgBytes = bytes.reduce((s, b) => s + b, 0) / bytes.length;
const pollsPerSec = polls.length / dur;
// DynamoDB read units per poll: META strongly-consistent get (1) + members query
// (eventually consistent: ceil(KB/4) * 0.5) + scrambles query (~0.5).
const memberKB = (avgBytes * 1.25) / 1024; // stored items are a bit larger than the JSON we return
const rcuPerPoll = 1 + Math.ceil(memberKB / 4) * 0.5 + 0.5;
console.log(JSON.stringify({
  viewers: viewers.length,
  durationS: Math.round(dur),
  pollsPerSec: +pollsPerSec.toFixed(1),
  stateLatencyMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
  non200: polls.filter((p) => p.status !== 200).length,
  responseKB: +(avgBytes / 1024).toFixed(1),
  egressMBps: +((avgBytes * pollsPerSec) / 1e6).toFixed(2),
  estDynamoReadUnitsPerSec_onRoomPartition: Math.round(rcuPerPoll * pollsPerSec),
}, null, 2));
