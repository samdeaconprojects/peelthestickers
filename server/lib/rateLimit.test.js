const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter, rateLimitMiddleware } = require("./rateLimit");

test("allows max hits per window, then blocks until the window resets", () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, false);
  assert.equal(limiter.hit("b").allowed, true, "keys are independent");
  t = 1000;
  assert.equal(limiter.hit("a").allowed, true);
});

test("sweep drops expired windows", () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 10, max: 1, now: () => t });
  limiter.hit("a");
  t = 20;
  limiter.sweep();
  assert.equal(limiter.size(), 0);
});

test("middleware answers 429 with Retry-After", () => {
  const limiter = createRateLimiter({ windowMs: 5000, max: 1 });
  const mw = rateLimitMiddleware(limiter, (req) => req.key);
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nexts = 0;
  mw({ key: "u" }, res, () => nexts++);
  mw({ key: "u" }, res, () => nexts++);
  mw({ key: "" }, res, () => nexts++);
  assert.equal(nexts, 2);
  assert.equal(res.code, 429);
  assert.ok(Number(res.headers["Retry-After"]) >= 1);
});
