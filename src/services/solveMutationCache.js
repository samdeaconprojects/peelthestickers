import { invalidateLastNSolvesCache, invalidateSolvesSessionCache } from "./getSolvesBySession.js";
import { invalidateSessionStatsCache } from "./getSessionStats.js";
import { invalidateEventStatsCache } from "./getEventStats.js";
import { invalidateSolvesByTagCache } from "./getSolvesByTag.js";

function normalizeEvent(event = "") {
  return String(event || "").trim().toUpperCase();
}

function normalizeSessionID(sessionID = "") {
  return String(sessionID || "").trim();
}

function getSolveScopeFromItem(item = null) {
  if (!item || typeof item !== "object") return null;

  const event = normalizeEvent(item?.Event || item?.event);
  const sessionID = normalizeSessionID(item?.SessionID || item?.sessionID || "main");
  if (!event) return null;

  return { event, sessionID };
}

export function invalidateSolveMutationCaches(userID, scopes = [], options = {}) {
  const id = String(userID || "").trim();
  if (!id) return;

  const uniqueScopes = Array.from(
    new Map(
      (Array.isArray(scopes) ? scopes : [])
        .map((scope) => {
          const event = normalizeEvent(scope?.event);
          const sessionID = normalizeSessionID(scope?.sessionID || scope?.SessionID || "main");
          if (!event) return null;
          return [`${event}::${sessionID}`, { event, sessionID }];
        })
        .filter(Boolean)
    ).values()
  );

  if (!uniqueScopes.length) {
    invalidateLastNSolvesCache(id);
    invalidateSolvesSessionCache(id);
    invalidateSessionStatsCache(id);
    invalidateEventStatsCache(id);
    invalidateSolvesByTagCache(id);
    return;
  }

  const invalidateTagCaches = options?.invalidateTagCaches !== false;

  for (const scope of uniqueScopes) {
    invalidateLastNSolvesCache(id, scope.event);
    invalidateSolvesSessionCache(id, scope.event, scope.sessionID);
    invalidateSessionStatsCache(id, scope.event, scope.sessionID);
    invalidateEventStatsCache(id, scope.event);
  }

  if (invalidateTagCaches) {
    invalidateSolvesByTagCache(id);
  }
}

export function buildSolveMutationScopes(...items) {
  return items.map(getSolveScopeFromItem).filter(Boolean);
}
