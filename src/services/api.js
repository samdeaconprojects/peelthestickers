// src/services/api.js

// If REACT_APP_API_BASE is set (e.g. "https://api.ptstimer.com"), use it.
// Otherwise, use relative URLs so CRA proxy works in dev.
const API_BASE = (process.env.REACT_APP_API_BASE || "").trim().replace(/\/+$/, "");
const LOG_API_REQUESTS = String(process.env.REACT_APP_LOG_API || "").toLowerCase() === "true";
let apiRequestCounter = 0;

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text().catch(() => "");
  return { text };
}

function toUrl(path) {
  if (!path) return API_BASE || "";
  // absolute passthrough
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  // IMPORTANT: if no base, return relative path (this is the old working behavior)
  if (!API_BASE) return path;

  // base + path
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function shouldLogApiRequests() {
  if (LOG_API_REQUESTS) return true;
  if (typeof window === "undefined") return false;

  try {
    if (window.__PTS_LOG_API__ === true) return true;
    return window.localStorage?.getItem("pts.logApi") === "true";
  } catch {
    return false;
  }
}

function summarizeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};

  const summary = {};

  if (body.userID) summary.userID = String(body.userID).trim();
  if (body.event || body.Event) summary.event = String(body.event || body.Event).trim();
  if (body.sessionID || body.SessionID) {
    summary.sessionID = String(body.sessionID || body.SessionID).trim();
  }
  if (body.solveRef) summary.solveRef = String(body.solveRef).trim();
  if (Array.isArray(body.solveRefs)) summary.solveRefs = body.solveRefs.length;
  if (Array.isArray(body.solveList)) summary.solveList = body.solveList.length;
  if (Array.isArray(body.comments)) summary.comments = body.comments.length;
  if (Array.isArray(body.updates)) summary.updates = body.updates.length;
  if (body.updates && typeof body.updates === "object" && !Array.isArray(body.updates)) {
    summary.updateKeys = Object.keys(body.updates).sort();
  }
  if (body.tags && typeof body.tags === "object") {
    summary.tagKeys = Object.keys(body.tags).sort();
  }

  return summary;
}

function summarizeData(data) {
  if (!data || typeof data !== "object") return {};

  const summary = {};
  if (Array.isArray(data.items)) summary.items = data.items.length;
  if (data.item && typeof data.item === "object") {
    summary.itemType = String(data.item.ItemType || data.item.type || "object");
  }
  if (data.lastKey) summary.hasMore = true;
  if (data.ok === true) summary.ok = true;

  return summary;
}

function logApiRequest(stage, meta) {
  if (!shouldLogApiRequests()) return;
  const prefix = stage === "error" ? "[api:error]" : "[api]";
  console.log(prefix, meta);
}

async function request(method, path, body) {
  const url = toUrl(path);
  const requestID = `${method}-${Date.now()}-${++apiRequestCounter}`;
  const startedAt = Date.now();
  const options = {
    method,
    headers: { Accept: "application/json" },
  };

  if (typeof body !== "undefined") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body ?? {});
  }

  try {
    const res = await fetch(url, options);
    const data = await parseResponse(res);
    const durationMs = Date.now() - startedAt;

    logApiRequest(res.ok ? "done" : "error", {
      requestID,
      method,
      path,
      status: res.status,
      ok: res.ok,
      durationMs,
      ...summarizeBody(body),
      ...summarizeData(data),
    });

    if (!res.ok) {
      const msg = data?.error || data?.text || `${method} ${path} failed (${res.status})`;
      const err = new Error(msg);
      err.__apiLogged = true;
      throw err;
    }

    return data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (!error?.__apiLogged) {
      logApiRequest("error", {
        requestID,
        method,
        path,
        ok: false,
        durationMs,
        error: error?.message || "Unknown error",
        ...summarizeBody(body),
      });
    }
    throw error;
  }
}

export async function apiGet(path) {
  return request("GET", path);
}

export async function apiPost(path, body) {
  return request("POST", path, body);
}

export async function apiPut(path, body) {
  return request("PUT", path, body);
}

export async function apiDelete(path) {
  return request("DELETE", path);
}
