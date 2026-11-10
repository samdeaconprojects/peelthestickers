// Scenario: a host goes live, many viewers join/leave/rejoin and race along.
import { call, signupMany, listenSSE, sleep, rand, randInt, summarizeMetrics } from "./lib.mjs";

const N = Number(process.env.N || 50);
const SCR = Number(process.env.SCR || 15);
const TAG = process.env.TAG || `r${Date.now().toString(36).slice(-4)}`;
const users = await signupMany(`lt_${TAG}_`, N);
const host = users[0];
const roomID = host.userID;
const issues = [];

const follows = await Promise.all(users.slice(1).map((u) => call(u.token, "POST", `/api/follow/${host.userID}`, { userID: u.userID })));
console.error("follow statuses", follows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}));
await call(host.token, "POST", "/api/room/open", { hostID: host.userID, hostName: host.userID, event: "333" });

const recv = {}; // userID -> Map(index -> receivedAt)
const streams = users.map((u) => {
  recv[u.userID] = new Map();
  return listenSSE(u, (evt) => { if (evt?.type === "room.scramble") recv[u.userID].set(evt.index, Date.now()); });
});
await sleep(400);

const published = new Map();
const progress = {}; // truth: userID -> {index,time}
let hostDone = false;

async function viewer(u) {
  await sleep(rand(0, 3000));
  const j = await call(u.token, "POST", `/api/room/${roomID}/join`, { userID: u.userID, name: u.userID });
  if (j.status !== 200) { issues.push({ kind: "join-failed", u: u.userID, status: j.status }); return; }
  let idx = 0;
  const rejoiner = Math.random() < 0.2;
  let rejoined = false;
  while (!hostDone || idx < published.size) {
    if (!published.has(idx)) { await sleep(100); continue; }
    await sleep(rand(300, 900));
    const time = randInt(8000, 20000);
    const r = await call(u.token, "POST", `/api/room/${roomID}/solve`, { userID: u.userID, index: idx, time });
    if (r.status === 200) progress[u.userID] = { index: idx, time };
    idx += 1;
    if (rejoiner && !rejoined && idx === 4) {
      // Page reload: client re-joins the room.
      rejoined = true;
      await call(u.token, "POST", `/api/room/${roomID}/join`, { userID: u.userID, name: u.userID });
      const lb = await call(u.token, "GET", `/api/room/${roomID}/leaderboard`);
      const me = lb.json?.leaderboard?.find((x) => x.userID === u.userID);
      if (me && me.currentIndex !== progress[u.userID]?.index) issues.push({ kind: "rejoin-resets-progress", u: u.userID, before: progress[u.userID]?.index, after: me.currentIndex });
      progress[u.userID] = { index: me?.currentIndex, time: me?.lastTime };
    }
  }
}

const hostLoop = (async () => {
  for (let i = 0; i < SCR; i += 1) {
    await sleep(800);
    const t = Date.now();
    const r = await call(host.token, "POST", `/api/room/${roomID}/scramble`, { hostID: host.userID, index: i, scramble: `R U F #${i}`, event: "333" });
    if (r.status === 200) published.set(i, t);
  }
  hostDone = true;
})();

// An outsider (not a member) peeks at the room.
const outsiderPeek = (async () => {
  await sleep(3000);
  const [outsider] = await signupMany(`lt_${TAG}x_`, 1);
  const st = await call(outsider.token, "GET", `/api/room/${roomID}/state`);
  return { stateStatus: st.status, scramblesVisible: st.json?.scrambles?.length || 0 };
})();

await Promise.all([hostLoop, ...users.slice(1).map(viewer)]);
await sleep(800);
streams.forEach((s) => s.stop());

// SSE delivery per viewer for scrambles published after they joined
let missedSse = 0;
const lags = [];
for (const u of users.slice(1)) {
  for (const [idx, pubAt] of published) {
    const got = recv[u.userID].get(idx);
    if (got == null) missedSse += 1; else lags.push(got - pubAt);
  }
}
lags.sort((a, b) => a - b);

const lb = await call(host.token, "GET", `/api/room/${roomID}/leaderboard`);
let lbWrong = 0;
for (const row of lb.json?.leaderboard || []) {
  const t = progress[row.userID];
  if (t && (row.currentIndex !== t.index || row.lastTime !== t.time)) lbWrong += 1;
}
const order = (lb.json?.leaderboard || []).map((r) => r.currentIndex);
// Check sorting with index 0 vs -1
const zeroSort = (() => {
  const rows = [{ currentIndex: 0 }, { currentIndex: -1 }, { currentIndex: 2 }].sort((a, b) => (b.currentIndex || -1) - (a.currentIndex || -1));
  return rows.map((r) => r.currentIndex).join(",");
})();

console.log(JSON.stringify({
  scenario: "live room", N, SCR,
  published: published.size,
  sseScrambleMisses: missedSse,
  sseNote: "misses include scrambles published before a viewer joined (expected; those come via /join)",
  sseLagMs: { p50: lags[Math.floor(lags.length * 0.5)], p95: lags[Math.floor(lags.length * 0.95)], max: lags[lags.length - 1] },
  leaderboardRows: lb.json?.leaderboard?.length,
  leaderboardMismatches: lbWrong,
  leaderboardSortedIndices: order.slice(0, 10),
  sortWithIndexZero: zeroSort,
  outsider: await outsiderPeek,
  issues: issues.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {}),
  issueSamples: issues.slice(0, 4),
  latency: Object.fromEntries(Object.entries(summarizeMetrics()).filter(([k]) => k.includes("room"))),
}, null, 2));
