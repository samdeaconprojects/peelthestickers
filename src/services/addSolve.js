// src/services/addSolve.js
import { apiPost } from "./api.js";

/**
 * Supports BOTH signatures:
 * NEW:
 *   addSolve(userID, { event, sessionID, ms, penalty, scramble, note, ts, tags })
 * OLD:
 *   addSolve(userID, sessionID, event, timeMs, scramble, penalty, note, tags)
 */
function normalizeArgs(userID, a1, a2, a3, a4, a5, a6, a7) {
  if (!userID) throw new Error("addSolve: userID is required");

  if (a1 && typeof a1 === "object" && !Array.isArray(a1)) {
    const solve = a1 || {};
    const opts = a2 || {};

    const rawEvent = solve.event ?? solve.Event ?? opts.event;
    if (!rawEvent) throw new Error("addSolve: event required");
    const event = String(rawEvent).toUpperCase();

    const sessionID = String(solve.sessionID ?? opts.sessionID ?? "main");

    const msRaw = solve.ms ?? solve.time ?? solve.TimeMs ?? solve.Time;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms < 0) throw new Error("addSolve: invalid ms");

    const penalty = solve.penalty ?? solve.Penalty ?? null;
    const scramble = solve.scramble ?? solve.Scramble ?? null;
    const note = solve.note ?? solve.Note ?? null;
    const tags = solve.tags ?? solve.Tags ?? {};
    const ts = String(solve.ts ?? solve.datetime ?? solve.DateTime ?? new Date().toISOString());

    return { userID, event, sessionID, ms, penalty, scramble, note, tags, ts };
  }

  // OLD positional
  const sessionID = String(a1 ?? "main");
  const event = String(a2 || "").toUpperCase();
  if (!event) throw new Error("addSolve: event required (old signature)");

  const ms = Number(a3);
  if (!Number.isFinite(ms) || ms < 0) throw new Error("addSolve: invalid ms");

  const scramble = a4 ?? null;
  const penalty = a5 ?? null;
  const note = a6 ?? null;
  const tags = a7 ?? {};
  const ts = new Date().toISOString();

  return { userID, event, sessionID, ms, penalty, scramble, note, tags, ts };
}

export const addSolve = async (userID, a1, a2, a3, a4, a5, a6, a7) => {
  const payload = normalizeArgs(userID, a1, a2, a3, a4, a5, a6, a7);
  // hits Express -> Dynamo
  return apiPost("/api/solve", payload);
};