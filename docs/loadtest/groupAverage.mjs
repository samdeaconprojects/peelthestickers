// Scenario: one big group shared average, many users solving concurrently in
// "natural" patterns (staggered starts, varied speeds, drop-out + resume,
// network retries). Then audit what the server stored vs. what was sent.
import {
  call, signupMany, listenSSE, sendMessage, fetchLatest, fetchAllMessages,
  buildRoundResults, nextUnsolved, getRaw, sleep, rand, randInt, solveTime,
  fakeScramble, summarizeMetrics, metrics, getRunResults, getRoundTallies, auditRun,
} from "./lib.mjs";

const N = Number(process.env.N || 30);
const COUNT = Number(process.env.COUNT || 12);
const SPEED = Number(process.env.SPEED || 0.08); // wall-clock scale on solve time
const TAG = process.env.TAG || `g${Date.now().toString(36).slice(-4)}`;

const users = await signupMany(`lt_${TAG}_`, N);
const owner = users[0];
console.log(`signed up ${users.length} users`);

const grp = await call(owner.token, "POST", "/api/group", {
  ownerID: owner.userID,
  name: `Load ${TAG}`,
  memberIDs: users.map((u) => u.userID),
});
if (grp.status !== 200) throw new Error(`group create failed: ${grp.status} ${JSON.stringify(grp.json)}`);
const conversationID = grp.json?.item?.ConversationID || grp.json?.item?.conversationID || `GROUP#${grp.json?.item?.GroupID}`;
console.log("group", grp.status, conversationID);

// SSE for every member (count message.created for this convo).
const sseCounts = {};
const sseStreams = users.map((u) => {
  sseCounts[u.userID] = new Set();
  return listenSSE(u, (evt) => {
    if (evt?.type === "message.created" && evt.conversationID === conversationID) {
      sseCounts[u.userID].add(`${evt.message?.timestamp || evt.message?.createdAt}|${evt.message?.text}`);
    }
  });
});
await sleep(500);

const sharedID = `SHARED#${conversationID}#333#${Date.now()}`;
const scrambles = Array.from({ length: COUNT }, (_, i) => fakeScramble(i));
const aon = {
  v: 2, mode: "average", type: "average", sharedID, count: COUNT,
  hostID: owner.userID, hostName: owner.userID, creatorID: owner.userID,
  creatorEvent: "333", opponentEvent: "333",
  creatorEvents: scrambles.map(() => "333"), opponentEvents: scrambles.map(() => "333"),
  creatorScrambles: scrambles, opponentScrambles: scrambles, participantPlans: null,
};
const sent = []; // every message we successfully POSTed: {sender, text, ts}
const r0 = await sendMessage(owner, conversationID, `[sharedAoN]${JSON.stringify(aon)}`);
sent.push({ sender: owner.userID, text: `[sharedAoN]${JSON.stringify(aon)}`, ts: r0.json?.item?.CreatedAt });

// Ground truth: last time each user posted for each index.
const truth = {}; // idx -> uid -> time
const anomalies = [];
const sessionID = sharedID.split("#").slice(0, 3).join("#");

async function postSolve(u, idx, time) {
  const s = await call(u.token, "POST", "/api/solve", {
    userID: u.userID, event: "333", sessionID, rawTimeMs: time, penalty: null,
    scramble: scrambles[idx], note: "", createdAt: new Date().toISOString(), tags: {},
  });
  const text = `[sharedUpdate]${sharedID}|${idx}|${time}|${u.userID}`;
  const m = await sendMessage(u, conversationID, text);
  if (m.status === 200) {
    sent.push({ sender: u.userID, text, ts: m.json?.item?.CreatedAt });
    (truth[idx] ||= {})[u.userID] = time;
  }
  return { s, m, text };
}

const behaviours = {};
async function agent(u, i) {
  const skill = rand(7000, 25000);
  const roll = Math.random();
  const kind = i === 0 ? "steady" : roll < 0.2 ? "resumer" : roll < 0.3 ? "retrier" : roll < 0.35 ? "quitter" : "steady";
  behaviours[u.userID] = kind;
  await sleep(rand(0, 4000)); // staggered "open the chat"

  // Client opens the convo: first page of 25 messages; joins if not creator.
  await fetchLatest(u, conversationID, 25);
  if (u !== owner) {
    const t = `[sharedJoin]${sharedID}|${u.userID}`;
    const j = await sendMessage(u, conversationID, t);
    if (j.status === 200) sent.push({ sender: u.userID, text: t, ts: j.json?.item?.CreatedAt });
  }

  const stopAfter = kind === "resumer" ? randInt(2, COUNT - 3) : kind === "quitter" ? randInt(1, COUNT - 2) : COUNT;
  let idx = 0;
  for (; idx < stopAfter; idx += 1) {
    await sleep(solveTime(skill) * SPEED + rand(200, 900) * SPEED * 5); // solve + inspection
    const time = solveTime(skill);
    const { m, text } = await postSolve(u, idx, time);
    if (kind === "retrier" && Math.random() < 0.3) {
      // Flaky network: client retries the same broadcast.
      const dup = await sendMessage(u, conversationID, text);
      if (dup.status === 200) sent.push({ sender: u.userID, text, ts: dup.json?.item?.CreatedAt, dup: true });
    }
    if (m.status !== 200) anomalies.push({ kind: "broadcast-failed", user: u.userID, idx, status: m.status });
  }
  if (kind !== "resumer") return;

  // Walk away, come back, reopen chat (latest 25 msgs only, like the client),
  // compute where to resume exactly like App.js does.
  await sleep(rand(3000, 8000));
  const page = await fetchLatest(u, conversationID, 25);
  const rr = buildRoundResults(page, sharedID);
  const hasAoN = page.some((m) => m.text?.startsWith("[sharedAoN]") && m.text.includes(sharedID));
  const resumeAt = nextUnsolved(rr, u.userID, COUNT, 0);
  const actualNext = idx;
  if (!hasAoN) anomalies.push({ kind: "resume-card-not-in-first-page", user: u.userID });
  if (resumeAt !== actualNext) {
    anomalies.push({ kind: "resume-wrong-index", user: u.userID, resumeAt, actualNext, visibleOwnResults: Object.keys(rr).filter((k) => rr[k][u.userID]).length });
  }
  // Continue the way the client would: from resumeAt, skipping what it *thinks* is solved.
  const done = new Set(Object.keys(truth).filter((k) => truth[k][u.userID] != null).map(Number));
  let cur = resumeAt;
  let guard = 0;
  while (cur !== -1 && guard++ < COUNT * 2) {
    await sleep(solveTime(skill) * SPEED);
    if (done.has(cur)) anomalies.push({ kind: "re-solved-index (overwrites earlier time)", user: u.userID, idx: cur, old: truth[cur][u.userID] });
    await postSolve(u, cur, solveTime(skill));
    done.add(cur);
    rr[cur] = { ...(rr[cur] || {}), [u.userID]: { time: 1 } };
    cur = nextUnsolved(rr, u.userID, COUNT, cur + 1);
  }
}

const t0 = Date.now();
await Promise.all(users.map((u, i) => agent(u, i)));
console.log(`agents finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await sleep(1500);
sseStreams.forEach((s) => s.stop());

// ---------------- AUDIT ----------------
const stored = await fetchAllMessages(owner, conversationID);
const storedKeys = new Map();
stored.forEach((m) => storedKeys.set(`${m.sender}|${m.text}`, (storedKeys.get(`${m.sender}|${m.text}`) || 0) + 1));
const sentKeys = new Map();
sent.forEach((m) => sentKeys.set(`${m.sender}|${m.text}`, (sentKeys.get(`${m.sender}|${m.text}`) || 0) + 1));
let lost = 0;
const lostSamples = [];
for (const [k, n] of sentKeys) {
  const got = storedKeys.get(k) || 0;
  if (got < n) { lost += n - got; if (lostSamples.length < 5) lostSamples.push(k.slice(0, 120)); }
}
const tsDupes = {};
sent.forEach((m) => { tsDupes[m.ts] = (tsDupes[m.ts] || 0) + 1; });
const tsCollisions = Object.values(tsDupes).filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);

// Client-visible standings from ALL messages vs truth
const rrAll = buildRoundResults(stored, sharedID);
let clientMismatch = 0;
for (const [i, row] of Object.entries(truth)) for (const [u, t] of Object.entries(row)) if (rrAll[i]?.[u]?.time !== t) clientMismatch += 1;

// Server results (cell items) + SharedStats (META only)
const run = await getRaw(`CONVO#${conversationID}`, `SHAREDRUN#${sharedID}`);
const results = await getRunResults(conversationID, sharedID);
const tallies = await getRoundTallies(conversationID, sharedID);
let tallyMismatch = 0;
let truthSolves = 0;
for (const [i, row] of Object.entries(truth)) {
  for (const [u, t] of Object.entries(row)) {
    truthSolves += 1;
    if (tallies[i]?.[u] !== t) tallyMismatch += 1;
  }
}
const meta = await getRaw(`CONVO#${conversationID}`, "META");
const audit = auditRun({ truth, results, sharedStats: meta?.SharedStats, userIDs: users.map((u) => u.userID) });
// What the conversation list hands each client (should be META's copy).
const listed = await Promise.all(
  users.slice(0, 5).map(async (u) => {
    const r = await call(u.token, "GET", `/api/conversations/${u.userID}`);
    return (r.json?.items || []).find((it) => it.ConversationID === conversationID)?.SharedStats || null;
  })
);
const listedMatchesMeta = listed.filter((st) => JSON.stringify(st) === JSON.stringify(meta?.SharedStats)).length;
const statsRoute = await call(users[1].token, "GET", `/api/conversation/${encodeURIComponent(conversationID)}/shared-stats`);
const userRowHasStats = (await getRaw(`USER#${users[1].userID}`, `CONVO#${conversationID}`))?.SharedStats != null;

// What a late joiner sees on open (first page of 25)
const lateView = await fetchLatest(users[N - 1], conversationID, 25);
const lateRR = buildRoundResults(lateView, sharedID);
const lateVisible = Object.values(lateRR).reduce((s, row) => s + Object.keys(row).length, 0);

// SSE delivery
const sseMissed = users.map((u) => stored.length - sseCounts[u.userID].size);

const report = {
  scenario: "big group shared average",
  N, COUNT, conversationID, sharedID,
  behaviours: Object.values(behaviours).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}),
  messages: { sentOK: sent.length, stored: stored.length, lost, lostSamples, sameMsTimestampCollisions: tsCollisions },
  clientView: {
    truthSolveEntries: truthSolves,
    mismatchesFromFullHistory: clientMismatch,
    lateJoinerFirstPage: { messages: lateView.length, visibleResultEntries: lateVisible, cardPresent: lateView.some((m) => m.text?.includes("[sharedAoN]")) },
  },
  serverRun: {
    runExists: !!run,
    runFormat: run?.Format ?? null,
    runItemBytes: Buffer.byteLength(JSON.stringify(run || {})),
    roundTallyMismatch: tallyMismatch,
    truthSolves,
  },
  audit,
  sharedStats: {
    metaTotalSolves: meta?.SharedStats?.TotalSolves,
    metaTotalWins: meta?.SharedStats?.TotalWins,
    metaTotalSessions: meta?.SharedStats?.TotalSessions,
    metaItemBytes: Buffer.byteLength(JSON.stringify(meta || {})),
    conversationListMatchesMeta: `${listedMatchesMeta}/${listed.length}`,
    statsRouteStatus: statsRoute.status,
    statsRouteMatchesMeta: JSON.stringify(statsRoute.json?.sharedStats) === JSON.stringify(meta?.SharedStats),
    memberRowCarriesStats: userRowHasStats,
  },
  sse: { minMissed: Math.min(...sseMissed), maxMissed: Math.max(...sseMissed), connected: sseStreams.filter((s) => s.state.connected).length },
  anomalies: anomalies.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {}),
  anomalySamples: anomalies.slice(0, 8),
  latency: summarizeMetrics(),
  errors: metrics.errors.slice(0, 10),
};
console.log(JSON.stringify(report, null, 2));
