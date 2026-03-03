// src/services/importSolvesBatch.js
import { batchWrite } from "./batchWrite";
import { apiPost } from "./api";

/**
 * Bulk import solves into a specific event/session.
 * - Writes SOLVE items with unique timestamps
 * - Marks SESSIONSTATS stale=true so you can recompute overall stats
 *
 * Input solves should be in your UI shape:
 *   { time(ms), scramble, penalty, note, datetime?, tags?, originalTime? }
 */
export async function importSolvesBatch(userID, event, sessionID, solves = []) {
  if (!userID) throw new Error("importSolvesBatch: userID required");

  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!ev) throw new Error("importSolvesBatch: event required");

  const now = Date.now();
  const toIso = (ms) => new Date(ms).toISOString();

  // Ensure unique timestamps even if many solves share the same provided datetime
  const buildTs = (i, preferredIso) => {
    const base = preferredIso ? new Date(preferredIso).getTime() : now + i;
    const safe = Number.isFinite(base) ? base : now + i;
    return toIso(safe + i); // add i to avoid collisions
  };

  const addedSolves = [];

  const writeRequests = (solves || []).map((s, i) => {
    const ts = buildTs(i, s?.datetime);

    const ms = Number(s?.time);
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error(`importSolvesBatch: solve[${i}] has invalid time`);
    }

    const item = {
      PK: `USER#${userID}`,
      SK: `SOLVE#${ts}`,
      GSI1PK: `SESSION#${userID}#${ev}#${sid}`,
      GSI1SK: ts,

      Event: ev,
      SessionID: sid,
      TimeMs: ms,
      Penalty: s?.penalty ?? null,
      Scramble: s?.scramble ?? "",
      Note: s?.note ?? "",
      CreatedAt: ts,
      Tags: s?.tags ?? {},

      // legacy-friendly fields (your normalizers use these)
      Time: ms,
      DateTime: ts,
    };

    if (s?.originalTime != null) item.OriginalTime = Number(s.originalTime);

    addedSolves.push({
      time: ms,
      scramble: s?.scramble ?? "",
      event: ev,
      penalty: s?.penalty ?? null,
      note: s?.note ?? "",
      datetime: ts,
      tags: s?.tags ?? {},
      originalTime: s?.originalTime ?? undefined,
    });

    return { PutRequest: { Item: item } };
  });

  // 1) Batch write solve items (server endpoint)
  await batchWrite({ requests: writeRequests });

  // 2) Mark SESSIONSTATS stale (server endpoint)
  await apiPost("/api/markSessionStatsStale", {
    userID,
    event: ev,
    sessionID: sid,
    reason: "bulk_import",
  });

  return { addedSolves };
}