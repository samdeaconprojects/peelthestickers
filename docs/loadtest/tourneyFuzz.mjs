// Drive tournament.js the way App.js does (each player solves playerState().nextIndex
// until nobody has anything to do) and look for brackets that never finish.
import { buildTournament, computeTournamentState, playerState } from "./tournament.mjs";

const RES = Number(process.env.RES || 1); // time resolution in ms (10 = centiseconds)
const TRIALS = Number(process.env.TRIALS || 300);
const configs = [];
for (const format of ["bracket", "roundrobin"]) {
  configs.push({ format, matchRule: "average", params: { averageOf: 3 } });
  configs.push({ format, matchRule: "average", params: { averageOf: 5 } });
  for (const bestOf of [3, 5, 7]) configs.push({ format, matchRule: "bestof", params: { bestOf } });
  for (const roundCount of [1, 2, 3]) for (const setCount of [1, 2, 3]) configs.push({ format, matchRule: "sets", params: { roundCount, setCount } });
}

const stuck = {};
const examples = {};
let runs = 0;
const otherIssues = [];
for (const cfg of configs) {
  for (let trial = 0; trial < TRIALS; trial += 1) {
    const n = 2 + Math.floor(Math.random() * 15);
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const skill = Object.fromEntries(players.map((p) => [p.id, 9000 + Math.random() * 6000]));
    const t = buildTournament({ ...cfg, players, seeding: "random" });
    const rr = {};
    let guard = 0;
    for (;;) {
      if (guard++ > 5000) { otherIssues.push({ cfg, n, issue: "loop guard" }); break; }
      const state = computeTournamentState(t, rr);
      let progressed = false;
      for (const p of players) {
        const ps = playerState(t, state, rr, p.id);
        if (ps.status !== "solving") continue;
        const idx = ps.nextIndex;
        if (!(idx >= 0 && idx < t.totalSolves)) { otherIssues.push({ cfg, n, issue: `nextIndex ${idx} outside 0..${t.totalSolves - 1}` }); continue; }
        const raw = skill[p.id] * (0.85 + Math.random() * 0.3);
        rr[idx] = { ...(rr[idx] || {}), [p.id]: { time: Math.round(raw / RES) * RES } };
        progressed = true;
      }
      if (!progressed) break;
    }
    runs += 1;
    const final = computeTournamentState(t, rr);
    if (!final.isComplete) {
      const key = `${cfg.format}/${cfg.matchRule}/${JSON.stringify(cfg.params)}`;
      stuck[key] = (stuck[key] || 0) + 1;
      if (!examples[key]) {
        const pend = final.matches.filter((m) => !m.result?.decided && m.aId && m.bId)[0];
        examples[key] = pend ? { match: pend.id, a: pend.aId, b: pend.bId, score: pend.result?.scoreLabel, statuses: players.map((p) => playerState(t, final, rr, p.id).status).join(",") } : { note: "no pending match with both players" };
      }
    }
  }
}
const totalStuck = Object.values(stuck).reduce((s, v) => s + v, 0);
console.log(JSON.stringify({ RES, runs, totalStuck, stuckRate: (totalStuck / runs).toFixed(4), stuck, examples, otherIssues: otherIssues.slice(0, 5) }, null, 2));
