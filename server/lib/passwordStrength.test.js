// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");
const { checkPassword } = require("./passwordStrength");

test("good passwords pass", () => {
  for (const pw of [
    "blue cube orange tuesday",
    "Stackmat-Garage-77",
    "fishbowl lantern",
    "q8#Lr!2vNz0p",
    "monkeybusiness99",
  ]) {
    assert.equal(checkPassword(pw, { username: "sam" }), null, pw);
  }
});

test("too short is refused", () => {
  assert.match(checkPassword("Short1!"), /at least 10/);
  assert.match(checkPassword("abcdefgh1"), /at least 10/);
});

test("common passwords are refused, even padded", () => {
  for (const pw of [
    "password12",
    "Password123!",
    "qwerty123456",
    "!!monkey2024",
    "iloveyou1234",
    "dragon123456",
    "football2026",
  ]) {
    assert.ok(checkPassword(pw), pw);
  }
});

test("repeats, sequences and keyboard rows are refused", () => {
  for (const pw of ["aaaaaaaaaa", "abcabcabcabc", "1234567890", "0987654321", "qwertyuiop", "poiuytrewq", "abcdefghijkl", "asdfghjkl1"]) {
    assert.ok(checkPassword(pw), pw);
  }
});

test("username and site name can't be in the password", () => {
  assert.match(checkPassword("cubewizard-solves", { username: "CubeWizard" }), /username/);
  assert.match(checkPassword("my peelthestickers pw"), /site's name/);
  assert.equal(checkPassword("cube wizard solves fast", { username: "zz" }), null);
});
