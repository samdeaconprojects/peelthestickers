// Run with: npm test  (from server/)
process.env.PTS_JWT_SECRET = "test-secret-not-for-production";
process.env.PTS_ADMIN_USER_IDS = "root";

const test = require("node:test");
const assert = require("node:assert");

const {
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  buildAuthMiddleware,
  userIDParamGuard,
  requireAdmin,
} = require("./auth");

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function run(mw, req) {
  const res = fakeRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test("username and password validation", () => {
  assert.equal(validateUsername("sam_28"), null);
  assert.ok(validateUsername("ab"));
  assert.ok(validateUsername("has space"));
  assert.ok(validateUsername("USER#x"));
  assert.equal(validatePassword("longenough"), null);
  assert.ok(validatePassword("short"));
});

test("password hash round trip", async () => {
  const hash = await hashPassword("correct horse");
  assert.notEqual(hash, "correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("anything", null), false);
});

test("token round trip and tampering", () => {
  const token = signToken("sam");
  assert.deepEqual(verifyToken(token).userID, "sam");
  assert.equal(verifyToken(token + "x"), null);
  assert.equal(verifyToken(""), null);
});

test("middleware: public paths pass without a token", () => {
  const mw = buildAuthMiddleware();
  for (const path of ["/health", "/auth/signin", "/auth/signup"]) {
    const { nextCalled } = run(mw, { path, method: "POST", headers: {}, body: {} });
    assert.equal(nextCalled, true, path);
  }
});

test("middleware: missing or bad token is 401", () => {
  const mw = buildAuthMiddleware();
  let out = run(mw, { path: "/solve", method: "POST", headers: {}, body: {} });
  assert.equal(out.res.statusCode, 401);
  out = run(mw, { path: "/solve", method: "POST", headers: { authorization: "Bearer nope" }, body: {} });
  assert.equal(out.res.statusCode, 401);
});

test("middleware: actor fields are pinned to the token", () => {
  const mw = buildAuthMiddleware();
  const headers = { authorization: `Bearer ${signToken("sam")}` };

  let req = { path: "/solve", method: "POST", headers, body: { userID: "sam", ms: 1 } };
  let out = run(mw, req);
  assert.equal(out.nextCalled, true);
  assert.equal(req.auth.userID, "sam");

  req = { path: "/solve", method: "POST", headers, body: { userID: "", ms: 1 } };
  out = run(mw, req);
  assert.equal(out.nextCalled, true);
  assert.equal(req.body.userID, "sam");

  for (const field of ["userID", "senderID", "hostID", "authorID", "createdBy", "ownerID"]) {
    req = { path: "/x", method: "POST", headers, body: { [field]: "someone-else" } };
    out = run(mw, req);
    assert.equal(out.res.statusCode, 403, field);
  }

  // GET bodies are ignored.
  req = { path: "/x", method: "GET", headers, body: { userID: "someone-else" } };
  out = run(mw, req);
  assert.equal(out.nextCalled, true);
});

test("middleware: SSE stream accepts a query token, other routes do not", () => {
  const mw = buildAuthMiddleware();
  const token = signToken("sam");
  let out = run(mw, {
    path: "/notifications/stream/sam",
    method: "GET",
    headers: {},
    query: { token },
  });
  assert.equal(out.nextCalled, true);
  out = run(mw, { path: "/solves/sam", method: "GET", headers: {}, query: { token } });
  assert.equal(out.res.statusCode, 401);
});

test("admin flag comes from PTS_ADMIN_USER_IDS", () => {
  const mw = buildAuthMiddleware();
  const req = { path: "/x", method: "GET", headers: { authorization: `Bearer ${signToken("root")}` } };
  run(mw, req);
  assert.equal(req.auth.isAdmin, true);
  assert.equal(run(requireAdmin, req).nextCalled, true);
  const other = { auth: { userID: "sam", isAdmin: false } };
  assert.equal(run(requireAdmin, other).res.statusCode, 403);
});

test(":userID guard: own data always, others only for public GETs", () => {
  const guard = (req, value) => {
    const res = fakeRes();
    let nextCalled = false;
    userIDParamGuard(req, res, () => (nextCalled = true), value);
    return { res, nextCalled };
  };
  const me = { userID: "sam", isAdmin: false };

  assert.equal(guard({ auth: me, method: "DELETE", originalUrl: "/api/solve/sam/x" }, "sam").nextCalled, true);
  assert.equal(guard({ auth: me, method: "DELETE", originalUrl: "/api/solve/bob/x" }, "bob").res.statusCode, 403);
  assert.equal(guard({ auth: me, method: "GET", originalUrl: "/api/posts/bob" }, "bob").nextCalled, true);
  assert.equal(guard({ auth: me, method: "GET", originalUrl: "/api/conversations/bob" }, "bob").res.statusCode, 403);
  assert.equal(guard({ auth: me, method: "GET", originalUrl: "/api/importJobs/bob/j1" }, "bob").res.statusCode, 403);
  assert.equal(
    guard({ auth: me, method: "GET", originalUrl: "/api/notifications/stream/bob?token=x" }, "bob").res.statusCode,
    403
  );
  // Commenting on a friend's post targets their userID and is allowed.
  assert.equal(guard({ auth: me, method: "PUT", originalUrl: "/api/postComments/bob/123" }, "bob").nextCalled, true);
  assert.equal(guard({ auth: null, method: "GET", originalUrl: "/api/posts/bob" }, "bob").res.statusCode, 401);
  assert.equal(
    guard({ auth: { userID: "root", isAdmin: true }, method: "DELETE", originalUrl: "/api/solve/bob/x" }, "bob").nextCalled,
    true
  );
});
