// Scenario: a run stored the old way (every result in RoundResults on the
// SHAREDRUN item, stats already counted on META) gets new results from many
// players at once. The server must migrate it to cell items exactly once and
// keep counting from where it was.
import { PutCommand, UpdateCommand } from "/Users/samdeacon/Desktop/peelthestickers/server/node_modules/@aws-sdk/lib-dynamodb/dist-cjs/index.js";
import {
  call, signupMany, sendMessage, getRaw, sleep, ddb, TABLE, summarizeMetrics, metrics,
  getRunResults, getRoundTallies, auditRun, statsFromTruth,
} from "./lib.mjs";

const N = Number(process.env.N || 20);
const OLD_ROUNDS = 3;
const ROUNDS = 6;
const TAG = process.env.TAG || `m${Date.now().toString(36).slice(-4)}`;
const users = await signupMany(`lt_${TAG}_`, N);
const owner = users[0];
const grp = await call(owner.token, "POST", "/api/group", { ownerID: owner.userID, name: `Legacy ${TAG}`, memberIDs: users.map((u) => u.userID) });
if (grp.status !== 200) throw new Error(`group create failed: ${grp.status}`);
const conversationID = grp.json.item.ConversationID;
const sharedID = `SHARED#${conversationID}#333#${Date.now()}`;
const PK = `CONVO#${conversationID}`;

// Old-format run with OLD_ROUNDS rounds of results.
const truth = {};
const RoundResults = {};
for (let r = 0; r < OLD_ROUNDS; r += 1) {
  for (const u of users) {
    const t = 9000 + Math.floor(Math.random() * 100) * 10;
    (truth[r] ||= {})[u.userID] = t;
    (RoundResults[r] ||= {})[u.userID] = { time: t, event: "333", updatedAt: new Date().toISOString() };
  }
}
await ddb.send(new PutCommand({ TableName: TABLE, Item: {
  PK, SK: `SHAREDRUN#${sharedID}`, ItemType: "SHAREDRUN", ConversationID: conversationID, SharedID: sharedID,
  SharedType: "average", Count: ROUNDS, CreatorID: owner.userID, CreatorEvent: "333", OpponentEvent: "333",
  CreatorEvents: [], OpponentEvents: [], CreatorScrambles: Array(ROUNDS).fill("R U"), OpponentScrambles: Array(ROUNDS).fill("R U"),
  ParticipantIDs: users.map((u) => u.userID), RoundResults, Summary: { TotalSolves: 0 }, SummaryRev: 5, Rev: 5,
  CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString(),
} }));
// META stats as the old code would have left them.
const before = statsFromTruth(truth);
const SharedStats = { TotalSolves: before.solves, TotalWins: before.wins, TotalSessions: 1, LastSharedAt: null,
  ByUser: {}, ByEvent: { "333": { Solves: before.solves, Wins: before.wins, Sessions: 1, ByUser: {} } } };
for (const u of users) {
  const s = before.byUser[u.userID] || { solves: 0, wins: 0 };
  SharedStats.ByUser[u.userID] = { Solves: s.solves, Wins: s.wins, Sessions: 1 };
  SharedStats.ByEvent["333"].ByUser[u.userID] = { Solves: s.solves, Wins: s.wins, Sessions: 1 };
}
await ddb.send(new UpdateCommand({ TableName: TABLE, Key: { PK, SK: "META" }, UpdateExpression: "SET SharedStats = :s, SharedStatsRev = :r", ExpressionAttributeValues: { ":s": SharedStats, ":r": 3 } }));

// Everyone posts at once: an edit to the last old round, then new rounds,
// with duplicate sends mixed in.
await Promise.all(users.map(async (u, i) => {
  await sleep(Math.random() * 30);
  const sends = [];
  if (i % 3 === 0) sends.push([OLD_ROUNDS - 1, 8000 + i * 10]);
  for (let r = OLD_ROUNDS; r < ROUNDS; r += 1) sends.push([r, 9000 + Math.floor(Math.random() * 100) * 10]);
  for (const [r, t] of sends) {
    const text = `[sharedUpdate]${sharedID}|${r}|${t}|${u.userID}`;
    const res = await sendMessage(u, conversationID, text);
    if (res.status === 200) (truth[r] ||= {})[u.userID] = t;
    if (Math.random() < 0.3) await sendMessage(u, conversationID, text);
  }
}));
await sleep(300);

const run = await getRaw(PK, `SHAREDRUN#${sharedID}`);
const results = await getRunResults(conversationID, sharedID);
const tallies = await getRoundTallies(conversationID, sharedID);
let tallyMismatch = 0;
for (const [i, row] of Object.entries(truth)) for (const [u, t] of Object.entries(row)) if (tallies[i]?.[u] !== t) tallyMismatch += 1;
const meta = await getRaw(PK, "META");
console.log(JSON.stringify({
  scenario: "legacy run migration", N, OLD_ROUNDS, ROUNDS,
  run: { format: run?.Format, stillHasRoundResults: run?.RoundResults != null, stillHasSummary: run?.Summary != null },
  roundTallyMismatch: tallyMismatch,
  audit: auditRun({ truth, results, sharedStats: meta?.SharedStats, userIDs: users.map((u) => u.userID) }),
  latency: summarizeMetrics()["POST /api/message"],
  errors: metrics.errors.slice(0, 5),
}, null, 2));
