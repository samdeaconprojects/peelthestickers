import { createScrambleGuide } from "./scrambleGuide";
import { SOLVED, applyMove, parseToken, formatToken } from "./recon/cube3";

// Random scrambles with random mistakes: following the shown fix must always
// land back on the scramble, and the next scramble move must then register.
let seed = 7;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const AX = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
function scramble(len) {
  const out = [];
  let prev = null;
  let prev2 = null;
  while (out.length < len) {
    const f = "URFDLB"[rnd(6)];
    if (f === prev || (prev2 && AX[f] === AX[prev] && f === prev2)) continue;
    out.push(f + ["", "'", "2"][rnd(3)]);
    prev2 = prev;
    prev = f;
  }
  return out;
}
const quarters = (tok) => {
  const p = parseToken(tok);
  if (p.amount !== 2) return [tok];
  const q = formatToken(p.base, rnd(2) ? 1 : 3);
  return [q, q];
};

test("fuzz: following the fix gets back on the scramble", () => {
  const failures = [];
  for (let trial = 0; trial < 1500 && !failures.length; trial++) {
    const scr = scramble(20);
    // On-track states by step count, to know what "the next move" is.
    const at = new Map(); // steps -> [{ state, next }]
    let s = SOLVED;
    let steps = 0;
    for (const t of scr) {
      const p = parseToken(t);
      if (p.amount === 2) {
        for (const h of [1, 3]) {
          const st = applyMove(s, { base: p.base, amount: h });
          at.set(`${st}`, { steps: steps + 1, next: formatToken(p.base, h) });
        }
      }
      at.set(`${s}`, { steps, next: quarters(t)[0], full: t });
      s = applyMove(s, p);
      steps += p.amount === 2 ? 2 : 1;
    }
    const total = steps;
    const g = createScrambleGuide(scr.join(" "));
    let state = SOLVED;
    let snap = g.snapshot();
    const log = [];
    const doMove = (m) => {
      log.push(m);
      state = applyMove(state, m);
      snap = g.onMove(m);
    };
    let guard = 0;
    while (!snap.complete && guard++ < 400) {
      if (snap.fix.length) {
        for (const tok of snap.fix) for (const q of quarters(tok)) doMove(q);
        if (snap.fix.length) {
          failures.push({ scr: scr.join(" "), log, why: "fix did not clear", snap });
          break;
        }
        continue;
      }
      if (rnd(5) === 0) {
        const n = 1 + rnd(3);
        for (let k = 0; k < n; k++) doMove("URFDLB"[rnd(6)] + (rnd(2) ? "" : "'"));
        continue;
      }
      const here = at.get(state);
      if (!here) {
        failures.push({ scr: scr.join(" "), log, why: "on track per guide but not per harness", snap });
        break;
      }
      const before = snap.progress;
      doMove(here.next);
      if (snap.fix.length || snap.progress !== before + 1) {
        failures.push({ scr: scr.join(" "), log, why: `${here.next} not registered: ${before} -> ${snap.progress}`, snap });
        break;
      }
    }
    if (!failures.length && !snap.complete) failures.push({ scr: scr.join(" "), why: "never completed", snap, total });
  }
  expect(failures).toEqual([]);
});
