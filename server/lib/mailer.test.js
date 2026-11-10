// Run with: npm test  (from server/)
delete process.env.PTS_EMAIL_FROM;
const test = require("node:test");
const assert = require("node:assert");
const { normalizeEmail, validateEmail, isSendingEnabled } = require("./mailer");

test("email normalization and validation", () => {
  assert.equal(normalizeEmail("  Sam@Example.COM "), "sam@example.com");
  assert.equal(validateEmail("sam@example.com"), null);
  assert.equal(validateEmail("sam+cubes@mail.example.co.uk"), null);
  for (const bad of ["", "sam", "sam@", "@example.com", "sam@example", "s am@example.com", `${"a".repeat(250)}@x.com`]) {
    assert.ok(validateEmail(bad), bad);
  }
});

test("without PTS_EMAIL_FROM the mailer only logs", () => {
  assert.equal(isSendingEnabled(), false);
});
