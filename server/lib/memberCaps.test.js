// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");

const { readCap, hasPlaceFor } = require("./memberCaps");

test("hasPlaceFor lets people in until the cap is reached", () => {
  assert.equal(hasPlaceFor(["a"], "b", 2), true);
  assert.equal(hasPlaceFor(["a", "b"], "c", 2), false);
  assert.equal(hasPlaceFor(["a", "b", "c"], "d", 2), false);
});

test("hasPlaceFor always lets an existing member back in", () => {
  assert.equal(hasPlaceFor(["a", "b"], "a", 2), true);
  assert.equal(hasPlaceFor(["a", "b", "c"], "c", 2), true);
});

test("hasPlaceFor treats a missing member list as empty", () => {
  assert.equal(hasPlaceFor(undefined, "a", 1), true);
});

test("readCap only accepts positive whole numbers", () => {
  assert.equal(readCap("100", 50), 100);
  assert.equal(readCap(undefined, 50), 50);
  assert.equal(readCap("", 50), 50);
  assert.equal(readCap("0", 50), 50);
  assert.equal(readCap("-5", 50), 50);
  assert.equal(readCap("abc", 50), 50);
});
