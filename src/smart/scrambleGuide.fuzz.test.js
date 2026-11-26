import { createScrambleGuide } from "./scrambleGuide";
import { parseToken, formatToken } from "./recon/cube3";

// Random scrambles with random mistakes (between moves and halfway through
// doubles). The simulated user only knows what the display shows: which
// tokens are crossed out, and the fix. Following the fix must always land
// back on the scramble at a token boundary, and the next token must then
// register.
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
    const ends = []; // steps at the end of each token
    scr.reduce((n, t) => {
      ends.push(n + (parseToken(t).amount === 2 ? 2 : 1));
      return n + (parseToken(t).amount === 2 ? 2 : 1);
    }, 0);
    const g = createScrambleGuide(scr.join(" "));
    let snap = g.snapshot();
    const log = [];
    const doMove = (m) => {
      log.push(m);
      snap = g.onMove(m);
    };
    const mistake = () => {
      const n = 1 + rnd(3);
      for (let k = 0; k < n; k++) doMove("URFDLB"[rnd(6)] + (rnd(2) ? "" : "'"));
    };
    const fail = (why) => failures.push({ scr: scr.join(" "), log, why, snap });
    let guard = 0;
    while (!snap.complete && guard++ < 400) {
      if (snap.fix.length) {
        for (const tok of snap.fix) for (const q of quarters(tok)) doMove(q);
        if (snap.fix.length) {
          fail("fix did not clear");
          break;
        }
        continue;
      }
      // What the display shows: the first token not crossed out.
      const i = ends.findIndex((e) => e > snap.progress);
      const boundary = i > 0 ? ends[i - 1] : 0;
      if (snap.progress !== boundary) {
        // Quiet halfway through a double is only OK straight after turning its
        // first quarter (a stray turn can land there too): the same turn again
        // finishes it.
        const last = log[log.length - 1];
        const ok =
          snap.progress === boundary + 1 && parseToken(scr[i]).amount === 2 &&
          parseToken(last).base === parseToken(scr[i]).base;
        if (!ok) {
          fail(`left halfway through ${scr[i]} with nothing to say so`);
          break;
        }
        doMove(last);
        if (snap.fix.length || snap.progress !== ends[i]) {
          fail(`finishing ${scr[i]} not registered: ${snap.progress}`);
          break;
        }
        continue;
      }
      if (rnd(5) === 0) {
        mistake();
        continue;
      }
      const qs = quarters(scr[i]);
      doMove(qs[0]);
      if (qs.length === 2 && rnd(4) === 0) {
        mistake(); // wrong turn halfway through a double
        continue;
      }
      if (qs.length === 2) doMove(qs[1]);
      if (snap.fix.length || snap.progress !== ends[i]) {
        fail(`${scr[i]} not registered: ${boundary} -> ${snap.progress}`);
        break;
      }
    }
    if (!failures.length && !snap.complete) fail("never completed");
  }
  expect(failures).toEqual([]);
});
