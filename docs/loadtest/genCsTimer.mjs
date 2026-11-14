// Writes a realistic csTimer export (the .txt csTimer's "Export to file" produces) for import tests.
//   N=100000 OUT=/tmp/cstimer-100k.txt node docs/loadtest/genCsTimer.mjs
//   N=1000000 PROFILE=heavy333 OUT=... node docs/loadtest/genCsTimer.mjs
//
// Shape, as csTimer writes it:
//   { "session1": [ [[penalty, timeMs, ...phaseEnds], scramble, comment, unixSeconds, smartCubeData?], ... ],
//     "session2": ...,
//     "properties": { "sessionData": "<JSON string>", "sessionN": 15, ...settings } }
// penalty is 0, 2000 (+2) or -1 (DNF); timeMs excludes the penalty. sessionData maps the session
// number to { name, opt: { scrType }, rank, stat: [count, dnfs, mean], date: [first, last] }.
// The generator also prints the totals the stored stats should come back with.
import { writeFileSync } from "node:fs";

const N = Number(process.env.N || 100000);
const OUT = process.env.OUT || `cstimer-${N}.txt`;
const PROFILE = process.env.PROFILE || "mixed";
let seed = Number(process.env.SEED || 12345);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (arr) => arr[(rnd() * arr.length) | 0];
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

// --- scrambles, roughly in csTimer's notation per puzzle ---
const FACES = ["R", "U", "F", "L", "D", "B"];
const SUF = ["", "'", "2"];
function nxn(len, wide = []) {
  const out = [];
  let last = -1;
  for (let i = 0; i < len; i++) {
    let f;
    do f = (rnd() * 6) | 0; while (f === last);
    last = f;
    const w = wide.length && rnd() < 0.35 ? pick(wide) : "";
    out.push(`${w.replace("#", FACES[f])}${w ? "" : FACES[f]}${pick(SUF)}`);
  }
  return out.join(" ");
}
const SCRAMBLERS = {
  "333": () => nxn(19 + ((rnd() * 3) | 0)),
  "222so": () => Array.from({ length: 9 + ((rnd() * 3) | 0) }, (_, i) => `${["R", "U", "F"][i % 3]}${pick(SUF)}`).join(" "),
  "444wca": () => nxn(44, ["#w"]),
  "555wca": () => nxn(60, ["#w"]),
  "666wca": () => nxn(80, ["#w", "3#w"]),
  "777wca": () => nxn(100, ["#w", "3#w"]),
  "333oh": () => nxn(20),
  "333ni": () => `${nxn(20)} ${pick(["", "Rw", "Uw'", "Fw2 Uw"])}`.trim(),
  pyrso: () => `${Array.from({ length: 9 }, () => `${pick(["R", "L", "U", "B"])}${pick(["", "'"])}`).join(" ")} ${pick(["l", "r'", "b", "u'"])}`,
  skbso: () => Array.from({ length: 9 }, () => `${pick(["R", "L", "U", "B"])}${pick(["", "'"])}`).join(" "),
  sqrs: () => Array.from({ length: 12 }, () => `(${((rnd() * 12) | 0) - 5},${((rnd() * 12) | 0) - 5})`).join(" / "),
  clkwca: () => "UR3+ DR2- DL1+ UL5- U4+ R6+ D3- L2+ ALL1+ y2 U2- R4+ D1+ L3- ALL5+",
  mgmp: () => Array.from({ length: 7 }, () => `${Array.from({ length: 5 }, (_, i) => `${i % 2 ? "D" : "R"}${pick(["++", "--"])}`).join(" ")} U${pick(["", "'"])}`).join("\n"),
};

// --- sessions: [scrType, display name, share of solves, mean ms, sd ms, dnf rate, +2 rate, phases] ---
const PROFILES = {
  // A long-time csTimer user: mostly 3x3, plus every side event they ever touched.
  mixed: [
    ["333", 1, 0.46, 11500, 1400, 0.012, 0.03, 0],
    ["333", "3x3 CFOP splits", 0.06, 12500, 1500, 0.015, 0.03, 4],
    ["222so", "2x2", 0.12, 3600, 900, 0.02, 0.03, 0],
    ["444wca", "4x4", 0.07, 44000, 4500, 0.02, 0.02, 0],
    ["555wca", "5x5", 0.03, 92000, 8000, 0.02, 0.02, 0],
    ["333oh", "OH", 0.08, 19500, 2800, 0.015, 0.03, 0],
    ["pyrso", "Pyra", 0.06, 4800, 1300, 0.03, 0.03, 0],
    ["skbso", "Skewb", 0.04, 5600, 1500, 0.03, 0.03, 0],
    ["sqrs", "Squan", 0.03, 21000, 4000, 0.03, 0.02, 0],
    ["mgmp", "Mega", 0.02, 62000, 7000, 0.02, 0.02, 0],
    ["clkwca", "Clock", 0.02, 9800, 2000, 0.04, 0.03, 0],
    ["333ni", "3BLD", 0.01, 48000, 12000, 0.35, 0.01, 0],
  ],
  // Someone who only does 3x3, all in csTimer's default session.
  heavy333: [["333", 1, 1, 11500, 1400, 0.012, 0.03, 0]],
};
const sessions = PROFILES[PROFILE];
if (!sessions) throw new Error(`unknown PROFILE ${PROFILE}`);

// Practice happens in sittings of 12-150 solves about 25s apart, with hours to days between them.
const NOTES = ["", "", "", "pb", "lol", "pop", "lockup", "nice", "fast cross", "xcross", "skip", "OLL skip", "PLL skip", "bad cross", "corner twist"];
const out = {};
const sessionData = {};
const totals = { solves: 0, dnf: 0, plus2: 0, byEvent: {}, firstTs: Infinity, lastTs: 0 };
// About 50 solves a day of practice, capped at 12 years, ending late 2026.
const span = Math.round(Math.min(12 * 365, Math.max(30, N / 50)) * 86400);
const start = 1790812800 - span;
const counts = sessions.map(([, , share]) => Math.round(N * share));
counts[0] += N - counts.reduce((a, b) => a + b, 0);
// Sittings are drawn session by session but all within the same span, so dates interleave.

sessions.forEach(([scrType, name, , mean, sd, dnfRate, plus2Rate, phases], idx) => {
  const num = idx + 1;
  const n = counts[idx];
  const rows = new Array(n);
  let t = start + ((rnd() * 86400 * 3) | 0);
  const perSolveGap = Math.max(0, span / Math.max(1, n) - 30) * 0.9; // sittings themselves take ~30s a solve
  let sum = 0;
  let counted = 0;
  let dnfs = 0;
  let sittingLeft = 0;
  const scr = SCRAMBLERS[scrType];
  for (let i = 0; i < n; i++) {
    if (sittingLeft <= 0) {
      sittingLeft = 12 + ((rnd() * 140) | 0);
      t += Math.round(perSolveGap * sittingLeft * (0.3 + rnd() * 1.4));
    }
    sittingLeft -= 1;
    t += 14 + ((rnd() * 30) | 0);
    // Times improve over the span, then level off.
    const progress = i / Math.max(1, n);
    const m = mean * (1.6 - 0.6 * Math.min(1, progress * 1.4));
    let ms = Math.max(Math.round(mean * 0.35), Math.round(m + gauss() * sd * (1.4 - 0.5 * progress)));
    if (rnd() < 0.003) ms = Math.round(ms * (2 + rnd() * 3)); // the odd disaster
    const r = rnd();
    const penalty = r < dnfRate ? -1 : r < dnfRate + plus2Rate ? 2000 : 0;
    const timePart = [penalty, ms];
    if (phases) {
      // Multi-phase timing stores cumulative phase ends, last phase first.
      let acc = 0;
      const ends = [];
      const weights = [0.2, 0.45, 0.17, 0.18];
      for (let p = 0; p < phases - 1; p++) {
        acc += Math.round(ms * weights[p] * (0.8 + rnd() * 0.4));
        ends.push(Math.min(ms - 1, acc));
      }
      timePart.push(...ends.reverse());
    }
    const comment = rnd() < 0.04 ? pick(NOTES) : "";
    const row = [timePart, scr(), comment, t];
    rows[i] = row;

    totals.solves += 1;
    if (penalty < 0) { totals.dnf += 1; dnfs += 1; }
    else {
      if (penalty > 0) totals.plus2 += 1;
      sum += ms + penalty;
      counted += 1;
    }
    totals.firstTs = Math.min(totals.firstTs, t);
    totals.lastTs = Math.max(totals.lastTs, t);
  }
  out[`session${num}`] = rows;
  const ev = scrType;
  totals.byEvent[ev] = (totals.byEvent[ev] || 0) + n;
  sessionData[num] = {
    name,
    opt: scrType === "333" ? (phases ? { phases } : {}) : { scrType },
    rank: num,
    stat: [n, dnfs, counted ? Math.round(sum / counted) : -1],
    date: n ? [rows[0][3], rows[n - 1][3]] : [null, null],
  };
});

out.properties = {
  sessionData: JSON.stringify(sessionData),
  sessionN: sessions.length,
  session: 1,
  useMilli: false,
  timeFormat: "h",
  scrType: "333",
  color: "u",
  tools: false,
  toolsfunc: '["image"]',
};

const raw = JSON.stringify(out);
writeFileSync(OUT, raw);
console.log(JSON.stringify({
  out: OUT,
  profile: PROFILE,
  solves: totals.solves,
  sessions: sessions.length,
  mb: +(raw.length / 1048576).toFixed(1),
  dnf: totals.dnf,
  plus2: totals.plus2,
  byScrType: totals.byEvent,
  from: new Date(totals.firstTs * 1000).toISOString().slice(0, 10),
  to: new Date(totals.lastTs * 1000).toISOString().slice(0, 10),
}));
