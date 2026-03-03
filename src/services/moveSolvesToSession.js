// src/services/moveSolvesToSession.js
import { batchWrite, putReq } from "./batchWrite";
import { apiPost } from "./api";

/**
 * Normalizes a UI solve or DynamoDB solve item into a DynamoDB-ish item
 * that your app already understands.
 *
 * You may pass solves in either of these shapes:
 * UI shape (your normalizeSolve output):
 *  { time, scramble, event, penalty, note, datetime, tags, originalTime? }
 *
 * DB-ish shape:
 *  { PK, SK, Event, SessionID, Time, TimeMs, DateTime, CreatedAt, Tags, ... }
 */
function toDbSolveItem(userID, solve, eventOverrideUpper, sessionID) {
  if (!userID) throw new Error("toDbSolveItem: userID required");

  const isDb = !!solve?.PK && !!solve?.SK;

  const datetime =
    solve?.datetime ||
    solve?.DateTime ||
    solve?.CreatedAt ||
    (typeof solve?.SK === "string" && solve.SK.startsWith("SOLVE#")
      ? solve.SK.slice("SOLVE#".length)
      : null) ||
    new Date().toISOString();

  const eventUpper = String(eventOverrideUpper || solve?.event || solve?.Event || "").toUpperCase();
  if (!eventUpper) throw new Error("moveSolvesToSession: event is required (solve.event or opts.event)");

  const ms = Number(solve?.time ?? solve?.Time ?? solve?.TimeMs ?? solve?.ms);
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error("moveSolvesToSession: each solve must have a valid time in ms");
  }

  const penalty = solve?.penalty ?? solve?.Penalty ?? null;
  const scramble = solve?.scramble ?? solve?.Scramble ?? null;
  const note = solve?.note ?? solve?.Note ?? "";
  const tags = solve?.tags ?? solve?.Tags ?? {};
  const originalTime = solve?.originalTime ?? solve?.OriginalTime;

  const PK = `USER#${userID}`;
  const SK = isDb ? solve.SK : `SOLVE#${datetime}`;
  const base = isDb ? { ...solve } : {};

  const item = {
    ...base,
    PK,
    SK,

    // session query index
    GSI1PK: `SESSION#${userID}#${eventUpper}#${sessionID}`,
    GSI1SK: datetime,

    // canonical-ish fields
    Event: eventUpper,
    SessionID: sessionID,
    TimeMs: ms,
    Penalty: penalty,
    Scramble: scramble,
    Note: note,
    CreatedAt: solve?.CreatedAt || datetime,
    Tags: tags,

    // legacy-friendly
    Time: ms,
    DateTime: datetime,
  };

  if (originalTime != null) item.OriginalTime = originalTime;

  return item;
}

/**
 * Mark SESSIONSTATS stale via the server API.
 */
async function markSessionStatsStale(userID, eventUpper, sessionID, reason) {
  await apiPost("/api/markSessionStatsStale", {
    userID,
    event: eventUpper,
    sessionID,
    reason: reason || "bulk_move",
  });
}

/**
 * Move or copy a batch of solves to another session.
 *
 * - "move" (default): overwrites the existing solve items (same PK/SK) with new SessionID + GSI1PK
 * - "copy": creates new solve items with NEW timestamps (so they exist in both sessions)
 *
 * @param {string} userID
 * @param {Array<object>} solves - UI solves or DB items
 * @param {object} opts
 * @param {string} opts.event - e.g. "333"
 * @param {string} opts.fromSessionID - e.g. "main" (used only for stale stats)
 * @param {string} opts.toSessionID - destination sessionID
 * @param {"move"|"copy"} [opts.mode="move"]
 * @param {boolean} [opts.markStatsStale=true]
 */
export async function moveSolvesToSession(userID, solves = [], opts = {}) {
  const eventUpper = String(opts.event || "").toUpperCase();
  const fromSessionID = String(opts.fromSessionID || "main");
  const toSessionID = String(opts.toSessionID || "main");
  const mode = opts.mode || "move";
  const markStatsStale = opts.markStatsStale !== false;

  if (!userID) throw new Error("moveSolvesToSession: userID required");
  if (!eventUpper) throw new Error("moveSolvesToSession: opts.event required");

  if (!Array.isArray(solves) || solves.length === 0) {
    return { ok: true, mode, moved: 0 };
  }

  const putRequests = solves.map((s) => {
    if (mode === "copy") {
      const newTs = new Date().toISOString();
      const clone = { ...s, datetime: newTs, DateTime: newTs, CreatedAt: newTs };
      const item = toDbSolveItem(userID, clone, eventUpper, toSessionID);

      // force unique keys for the copy
      item.SK = `SOLVE#${newTs}`;
      item.GSI1SK = newTs;
      item.DateTime = newTs;
      item.CreatedAt = newTs;

      return putReq(item);
    }

    // move => overwrite same PK/SK (preserve datetime)
    const item = toDbSolveItem(userID, s, eventUpper, toSessionID);
    return putReq(item);
  });

  const res = await batchWrite({ requests: putRequests });

  if (markStatsStale) {
    await Promise.all([
      markSessionStatsStale(userID, eventUpper, fromSessionID, "bulk_move"),
      markSessionStatsStale(userID, eventUpper, toSessionID, mode === "copy" ? "bulk_copy" : "bulk_move"),
    ]);
  }

  return {
    ok: !!res?.ok,
    mode,
    wrote: res?.wrote ?? 0,
    moved: solves.length,
  };
}