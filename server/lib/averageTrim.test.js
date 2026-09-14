// Run with: npm test  (from server/)
//
// These pin the ceil(5%)-per-side trim rule. The rule has to reproduce the WCA
// definitions on its own -- one trimmed solve per side at Ao5 and Ao12 -- because
// Mo3/Ao5/Ao12 are deliberately not special-cased anywhere in the code, and the
// day bucket caches (which stop at Ao12) are only safe to leave un-backfilled for
// as long as that stays true.

const test = require("node:test");
const assert = require("node:assert");

const { getTrimCountForWindow, computeWindowAverageMs } = require("./ptsCore");

function solve(rawTimeMs, penalty) {
  return { RawTimeMs: rawTimeMs, Penalty: penalty || null };
}

// Times ascending from 10.00s in 100ms steps, so the mean of any contiguous
// trimmed run is easy to state exactly.
function ramp(count) {
  return Array.from({ length: count }, (_, i) => solve(10000 + i * 100));
}

function dnfs(count) {
  return Array.from({ length: count }, () => solve(10000, "DNF"));
}

test("trim depth is ceil(5%) per side, never below one", () => {
  assert.strictEqual(getTrimCountForWindow(3), 1);
  assert.strictEqual(getTrimCountForWindow(5), 1);
  assert.strictEqual(getTrimCountForWindow(12), 1);
  assert.strictEqual(getTrimCountForWindow(25), 2);
  assert.strictEqual(getTrimCountForWindow(50), 3);
  assert.strictEqual(getTrimCountForWindow(100), 5);
  assert.strictEqual(getTrimCountForWindow(1000), 50);
});

test("Ao5 stays the WCA middle three", () => {
  const window = [solve(10000), solve(11000), solve(12000), solve(13000), solve(50000)];
  assert.strictEqual(computeWindowAverageMs(window), 12000);
});

test("Ao12 stays a single trim per side", () => {
  // 10.0 .. 11.1; trimming one from each end leaves 10.1 .. 11.0, mean 10.55.
  assert.strictEqual(computeWindowAverageMs(ramp(12)), 10550);
});

test("larger windows trim proportionally", () => {
  // Ao25 trims 2 per side: indexes 2..22, mean of 10.2 and 12.2 endpoints.
  assert.strictEqual(computeWindowAverageMs(ramp(25)), 11200);
  // Ao100 trims 5 per side: indexes 5..94.
  assert.strictEqual(computeWindowAverageMs(ramp(100)), 14950);
});

test("DNFs are absorbed by the trim up to its depth", () => {
  // One DNF in an Ao5 occupies the single slow slot; the rest averages normally.
  assert.strictEqual(
    computeWindowAverageMs([solve(10000), solve(11000), solve(12000), solve(13000), solve(0, "DNF")]),
    12000
  );
  // Five DNFs still fit inside an Ao100's five trimmed slow slots.
  assert.strictEqual(computeWindowAverageMs([...ramp(95), ...dnfs(5)]), 14950);
});

test("one more DNF than trimmed slots makes the average a DNF", () => {
  assert.strictEqual(
    computeWindowAverageMs([solve(10000), solve(11000), solve(12000), ...dnfs(2)]),
    Infinity
  );
  assert.strictEqual(computeWindowAverageMs([...ramp(94), ...dnfs(6)]), Infinity);
});
