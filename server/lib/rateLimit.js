// In-memory fixed-window rate limiter. Fine for the single API process this
// app runs as; with more than one instance, move the counters to Redis.
//
// The limits protect cost (one script hammering DynamoDB) and sign-in (password
// guessing), not fairness, so they sit well above what the app itself sends.

function createRateLimiter({ windowMs = 60000, max = 600, now = Date.now } = {}) {
  const counters = new Map(); // key -> { count, resetAt }

  function hit(key) {
    const t = now();
    let entry = counters.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      counters.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfterMs: Math.max(0, entry.resetAt - t),
    };
  }

  function sweep() {
    const t = now();
    for (const [key, entry] of counters) if (entry.resetAt <= t) counters.delete(key);
  }

  return { hit, sweep, size: () => counters.size };
}

// Express middleware. keyFn(req) returns the bucket key, or "" to skip.
function rateLimitMiddleware(limiter, keyFn, { code = "RATE_LIMITED" } = {}) {
  const timer = setInterval(() => limiter.sweep(), 60000);
  if (timer.unref) timer.unref();
  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();
    const result = limiter.hit(key);
    if (result.allowed) return next();
    res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(429).json({ error: "Too many requests, slow down a little.", code });
  };
}

module.exports = { createRateLimiter, rateLimitMiddleware };
