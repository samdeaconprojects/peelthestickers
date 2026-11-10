// src/services/getSolvesScoped.js
// Solves across any set of events and sessions (GET /api/solvesScoped).
import { apiGet } from "./api.js";
import { createCachedRequestLoader } from "./requestCache.js";

const scopedPageLoader = createCachedRequestLoader(async (path) => {
  const data = await apiGet(path);
  return {
    items: data?.items || [],
    lastKey: data?.lastKey || null,
    timeZone: data?.timeZone || "",
  };
}, { cacheMs: 1500 });

// events: "all" | string | string[]  ->  "all" or "333,444"
function normalizeEventsParam(events) {
  if (events == null || events === "all") return "all";
  const list = (Array.isArray(events) ? events : String(events).split(","))
    .map((ev) => String(ev || "").trim().toUpperCase())
    .filter(Boolean);
  return list.length ? [...new Set(list)].join(",") : "all";
}

// pairs: "333:main,444:abc" | string[] | [{ event, sessionID }]
function normalizePairsParam(pairs) {
  if (!pairs) return "";
  const list = (Array.isArray(pairs) ? pairs : String(pairs).split(","))
    .map((pair) => {
      if (pair && typeof pair === "object") {
        const ev = String(pair.event || "").trim().toUpperCase();
        const sid = String(pair.sessionID || "main").trim() || "main";
        return ev ? `${ev}:${sid}` : "";
      }
      const text = String(pair || "").trim();
      const idx = text.indexOf(":");
      if (idx <= 0) return "";
      return `${text.slice(0, idx).toUpperCase()}:${text.slice(idx + 1) || "main"}`;
    })
    .filter(Boolean);
  return [...new Set(list)].join(",");
}

function buildScopedQuery({ events, pairs, sessionsMode, limit, cursor, startDay, endDay, timeZone } = {}) {
  const qs = new URLSearchParams({
    events: normalizeEventsParam(events),
    limit: String(Math.max(1, Math.min(5000, Number(limit) || 100))),
  });
  const pairsParam = normalizePairsParam(pairs);
  if (pairsParam) qs.set("pairs", pairsParam);
  if (String(sessionsMode || "").toLowerCase() === "main") qs.set("sessions", "main");
  if (cursor) qs.set("cursor", JSON.stringify(cursor));
  if (startDay) qs.set("startDay", String(startDay).trim());
  if (endDay) qs.set("endDay", String(endDay).trim());
  if (timeZone) qs.set("timeZone", String(timeZone).trim());
  return qs;
}

// One page, newest first: { items, lastKey, timeZone }. Pass lastKey back as
// cursor to continue; lastKey is null once the scope is exhausted.
export const getSolvesScopedPage = async (userID, opts = {}) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getSolvesScopedPage: userID required");

  const qs = buildScopedQuery(opts);
  return scopedPageLoader.run(`solvesScoped::${id}::${qs.toString()}`, {
    loadArg: `/api/solvesScoped/${encodeURIComponent(id)}?${qs.toString()}`,
    force: opts?.force === true,
  });
};

// Last n solves across the scope, oldest -> newest. The server may stop
// short of n on sparse filters, so keep paging until n or the end. A sparse filter
// can scan the whole history, so pass isCancelled to stop once nobody is waiting.
export const getLastNSolvesScoped = async (userID, opts = {}) => {
  const n = Math.max(1, Math.min(5000, Number(opts?.n ?? opts?.limit) || 100));
  const all = [];
  const seenCursors = new Set();
  let cursor = null;

  do {
    const { items, lastKey } = await getSolvesScopedPage(userID, {
      ...opts,
      limit: n - all.length,
      cursor,
    });
    if (items?.length) all.push(...items);

    const nextCursorKey = lastKey ? JSON.stringify(lastKey) : "";
    if (nextCursorKey && seenCursors.has(nextCursorKey)) {
      throw new Error("getLastNSolvesScoped: repeated cursor");
    }
    if (nextCursorKey) seenCursors.add(nextCursorKey);
    cursor = lastKey || null;
  } while (cursor && all.length < n && !opts?.isCancelled?.());

  return all.slice(0, n).reverse();
};

export function invalidateSolvesScopedCache(userID = "") {
  const id = String(userID || "").trim();
  scopedPageLoader.invalidate(id ? `solvesScoped::${id}` : undefined);
}
