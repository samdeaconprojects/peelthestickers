// Scenario: many simultaneous 1v1 shared averages. Opponents of similar speed
// finish each round within a few hundred ms of each other.
import { call, signupMany, sendMessage, fetchAllMessages, getRaw, sleep, rand, randInt, summarizeMetrics, getRunResults } from "./lib.mjs";

const PAIRS = Number(process.env.PAIRS || 30);
const ROUNDS = Number(process.env.ROUNDS || 12);
const GAP = Number(process.env.GAP || 300); // max ms between the two finishing
const TAG = process.env.TAG || `p${Date.now().toString(36).slice(-4)}`;
const users = await signupMany(`lt_${TAG}_`, PAIRS * 2);

const results = [];
await Promise.all(Array.from({ length: PAIRS }, async (_, p) => {
  const a = users[2 * p];
  const b = users[2 * p + 1];
  const c = await call(a.token, "POST", "/api/conversation", { conversationType: "DM", memberIDs: [a.userID, b.userID], createdBy: a.userID });
  const conversationID = c.json?.item?.ConversationID || [a.userID, b.userID].sort().join("#");
  const sharedID = `SHARED#${conversationID}#333#${Date.now()}${p}`;
  const aon = { v: 2, mode: "average", sharedID, count: ROUNDS, creatorID: a.userID, creatorEvent: "333", opponentEvent: "333", creatorScrambles: Array(ROUNDS).fill("R U"), opponentScrambles: Array(ROUNDS).fill("R U") };
  await sendMessage(a, conversationID, `[sharedAoN]${JSON.stringify(aon)}`);
  const truth = {};
  for (let r = 0; r < ROUNDS; r += 1) {
    await sleep(rand(500, 1500));
    await Promise.all([a, b].map(async (u) => {
      await sleep(rand(0, GAP));
      const t = randInt(9000, 13000);
      const m = await sendMessage(u, conversationID, `[sharedUpdate]${sharedID}|${r}|${t}|${u.userID}`);
      if (m.status === 200) (truth[r] ||= {})[u.userID] = t;
    }));
  }
  await sleep(300);
  const run = { RoundResults: await getRunResults(conversationID, sharedID) };
  let missing = 0;
  let truthWins = { [a.userID]: 0, [b.userID]: 0 };
  for (const [r, row] of Object.entries(truth)) {
    for (const u of Object.keys(row)) if (run?.RoundResults?.[r]?.[u]?.time !== row[u]) missing += 1;
    const [x, y] = [row[a.userID], row[b.userID]];
    if (x != null && y != null && x !== y) truthWins[x < y ? a.userID : b.userID] += 1;
  }
  const stored = (await fetchAllMessages(a, conversationID)).filter((m) => m.text.startsWith("[sharedUpdate]")).length;
  const meta = await getRaw(`CONVO#${conversationID}`, "META");
  results.push({
    missing,
    lostMsgs: ROUNDS * 2 - stored,
    winsTruth: truthWins[a.userID] + truthWins[b.userID],
    winsStats: Number(meta?.SharedStats?.TotalWins || 0),
    aWinsOK: Number(meta?.SharedStats?.ByUser?.[a.userID]?.Wins || 0) === truthWins[a.userID],
    conversationID, sharedID, a, b,
  });
}));

// Spoof check: can user A post a time attributed to user B?
const s = results[0];
const spoof = await sendMessage(s.a, s.conversationID, `[sharedUpdate]${s.sharedID}|0|1|${s.b.userID}`);
const run0 = { RoundResults: await getRunResults(s.conversationID, s.sharedID) };

const pairsWithLoss = results.filter((r) => r.missing > 0).length;
console.log(JSON.stringify({
  scenario: "concurrent 1v1 pairs", PAIRS, ROUNDS, GAP,
  pairsWithServerRoundResultLoss: pairsWithLoss,
  totalServerRoundEntriesLost: results.reduce((s2, r) => s2 + r.missing, 0),
  totalEntries: PAIRS * ROUNDS * 2,
  pairsWithLostChatMessages: results.filter((r) => r.lostMsgs > 0).length,
  totalLostChatMessages: results.reduce((s2, r) => s2 + r.lostMsgs, 0),
  pairsWhereWinStatsWrong: results.filter((r) => r.winsStats !== r.winsTruth || !r.aWinsOK).length,
  spoof: { status: spoof.status, storedTimeForVictimAtIndex0: run0?.RoundResults?.[0]?.[s.b.userID]?.time },
  latency: summarizeMetrics()["POST /api/message"],
}, null, 2));
