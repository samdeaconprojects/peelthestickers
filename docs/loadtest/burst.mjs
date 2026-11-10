// Scenario: everyone finishes the same round at (nearly) the same instant —
// what happens at the end of a close race / when a hosted room advances.
import {
  call, signupMany, sendMessage, fetchAllMessages, getRaw, sleep, summarizeMetrics, metrics,
  getRunResults, getRoundTallies, auditRun,
} from "./lib.mjs";

const N = Number(process.env.N || 40);
const ROUNDS = Number(process.env.ROUNDS || 5);
const TAG = process.env.TAG || `b${Date.now().toString(36).slice(-4)}`;
const users = await signupMany(`lt_${TAG}_`, N);
const owner = users[0];
const grp = await call(owner.token, "POST", "/api/group", { ownerID: owner.userID, name: `Burst ${TAG}`, memberIDs: users.map((u) => u.userID) });
if (grp.status !== 200) throw new Error(`group create failed: ${grp.status} ${JSON.stringify(grp.json)}`);
const conversationID = grp.json.item.ConversationID || `GROUP#${grp.json.item.GroupID}`;
const sharedID = `SHARED#${conversationID}#333#${Date.now()}`;
const aon = { v: 2, mode: "average", sharedID, count: ROUNDS, creatorID: owner.userID, creatorEvent: "333", opponentEvent: "333", creatorScrambles: Array(ROUNDS).fill("R U"), opponentScrambles: Array(ROUNDS).fill("R U") };
await sendMessage(owner, conversationID, `[sharedAoN]${JSON.stringify(aon)}`);

const truth = {};
let sentOK = 0;
const t0 = Date.now();
for (let r = 0; r < ROUNDS; r += 1) {
  // jitter 0-50ms: "everyone stops their timer at about the same time".
  // Times are in centiseconds-ish steps so ties happen, as with typed times.
  await Promise.all(users.map(async (u) => {
    await sleep(Math.random() * 50);
    const t = 9000 + Math.floor(Math.random() * 300) * 10;
    const res = await sendMessage(u, conversationID, `[sharedUpdate]${sharedID}|${r}|${t}|${u.userID}`);
    if (res.status === 200) { sentOK += 1; (truth[r] ||= {})[u.userID] = t; }
  }));
  await sleep(300);
}
const wallS = (Date.now() - t0) / 1000;
await sleep(500);
const stored = (await fetchAllMessages(owner, conversationID)).filter((m) => m.text.startsWith("[sharedUpdate]"));
const results = await getRunResults(conversationID, sharedID);
const tallies = await getRoundTallies(conversationID, sharedID);
let tallyMismatch = 0;
for (const [i, row] of Object.entries(truth)) for (const [u, t] of Object.entries(row)) if (tallies[i]?.[u] !== t) tallyMismatch += 1;
const meta = await getRaw(`CONVO#${conversationID}`, "META");
const audit = auditRun({ truth, results, sharedStats: meta?.SharedStats, userIDs: users.map((u) => u.userID) });
console.log(JSON.stringify({
  scenario: "burst", N, ROUNDS, wallS,
  updatesSentOK: sentOK,
  updatesStored: stored.length,
  updatesLost: sentOK - stored.length,
  serverResultsPerRound: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Object.keys(v).length])),
  roundTallyMismatch: tallyMismatch,
  audit,
  metaSessions: meta?.SharedStats?.TotalSessions,
  metaItemBytes: Buffer.byteLength(JSON.stringify(meta)),
  latency: summarizeMetrics()["POST /api/message"],
  errors: metrics.errors.slice(0, 5),
}, null, 2));
