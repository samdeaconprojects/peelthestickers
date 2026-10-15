// server/lib/auth.js
//
// Password hashing, token signing and the Express middleware that turns a
// bearer token into req.auth. Everything identity-related in server.js goes
// through here so the trust boundary is in one place.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = process.env.PTS_TOKEN_TTL || "30d";
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

let secret = String(process.env.PTS_JWT_SECRET || "").trim();
if (!secret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("PTS_JWT_SECRET must be set in production");
  }
  secret = crypto.randomBytes(48).toString("hex");
  console.warn(
    "[auth] PTS_JWT_SECRET is not set; using a random secret, so every restart signs users out."
  );
}

const ADMIN_USER_IDS = new Set(
  String(process.env.PTS_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function normalizeUsername(value) {
  return String(value || "").trim();
}

function validateUsername(username) {
  const id = normalizeUsername(username);
  if (!id) return "Username is required";
  if (!USERNAME_RE.test(id)) {
    return "Username must be 3-32 characters: letters, numbers, dot, dash or underscore";
  }
  return null;
}

function validatePassword(password) {
  const pw = typeof password === "string" ? password : "";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (pw.length > MAX_PASSWORD_LENGTH) return "Password is too long";
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(String(password), String(hash));
  } catch {
    return false;
  }
}

function signToken(userID, extra = {}) {
  return jwt.sign({ sub: String(userID), ...extra }, secret, {
    expiresIn: TOKEN_TTL,
    issuer: "pts",
  });
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(String(token || ""), secret, { issuer: "pts" });
    const userID = String(payload?.sub || "").trim();
    if (!userID) return null;
    return { userID, payload };
  } catch {
    return null;
  }
}

function isAdmin(userID) {
  return ADMIN_USER_IDS.has(String(userID || "").trim());
}

function extractToken(req, { allowQuery = false } = {}) {
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (allowQuery && req.query?.token) return String(req.query.token).trim();
  return "";
}

// Paths that never need a token.
const PUBLIC_PATHS = new Set(["/health", "/auth/signup", "/auth/signin"]);

// EventSource cannot send headers, so the notification stream reads the token
// from the query string instead.
const QUERY_TOKEN_PREFIXES = ["/notifications/stream/"];

// Request-body fields that name the acting user. They must either match the
// token or be absent (in which case they are filled in from the token), so a
// route can keep reading req.body.userID and trust it.
const ACTOR_BODY_FIELDS = ["userID", "senderID", "hostID", "authorID", "createdBy", "ownerID"];

function buildAuthMiddleware() {
  return function authMiddleware(req, res, next) {
    const path = String(req.path || "");
    if (PUBLIC_PATHS.has(path)) return next();

    const allowQuery = QUERY_TOKEN_PREFIXES.some((prefix) => path.startsWith(prefix));
    const token = extractToken(req, { allowQuery });
    if (!token) return res.status(401).json({ error: "Sign in required", code: "UNAUTHENTICATED" });

    const verified = verifyToken(token);
    if (!verified) return res.status(401).json({ error: "Session expired", code: "UNAUTHENTICATED" });

    req.auth = { userID: verified.userID, isAdmin: isAdmin(verified.userID) };

    if (req.method !== "GET" && req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      for (const field of ACTOR_BODY_FIELDS) {
        if (!(field in req.body)) continue;
        const value = String(req.body[field] ?? "").trim();
        if (!value) {
          req.body[field] = req.auth.userID;
          continue;
        }
        if (value !== req.auth.userID && !req.auth.isAdmin) {
          return res.status(403).json({
            error: `${field} does not match the signed-in user`,
            code: "FORBIDDEN",
          });
        }
      }
    }

    return next();
  };
}

// Mutating routes with a :userID param where the param is the *target* user,
// not the actor, so another user may legitimately call them.
const USERID_PARAM_TARGET_ROUTES = [/^\/api\/postComments\//];

// GET routes with a :userID param that expose private data and so must be the
// caller's own. Other GETs (profile, posts, sessions, solves, stats) are
// readable by any signed-in user because profiles and shared averages show
// them.
const PRIVATE_GET_PREFIXES = [
  "/api/notifications/stream/",
  "/api/importJobs/",
  "/api/conversations/",
  "/api/groups/",
];

// Installed via app.param("userID", ...) so it runs for every route that has a
// :userID segment, before the handler.
function userIDParamGuard(req, res, next, value) {
  const target = String(value || "").trim();
  const auth = req.auth;
  if (!auth) return res.status(401).json({ error: "Sign in required", code: "UNAUTHENTICATED" });
  if (auth.isAdmin || target === auth.userID) return next();

  const originalUrl = String(req.originalUrl || req.path || "");
  if (req.method === "GET") {
    const isPrivate = PRIVATE_GET_PREFIXES.some((prefix) => originalUrl.startsWith(prefix));
    if (!isPrivate) return next();
  } else if (USERID_PARAM_TARGET_ROUTES.some((re) => re.test(originalUrl))) {
    return next();
  }

  return res.status(403).json({ error: "Not allowed for this user", code: "FORBIDDEN" });
}

function requireAdmin(req, res, next) {
  if (req.auth?.isAdmin) return next();
  return res.status(403).json({ error: "Admin only", code: "FORBIDDEN" });
}

module.exports = {
  validateUsername,
  validatePassword,
  normalizeUsername,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  isAdmin,
  buildAuthMiddleware,
  userIDParamGuard,
  requireAdmin,
  // exported for tests
  ACTOR_BODY_FIELDS,
  PRIVATE_GET_PREFIXES,
};
