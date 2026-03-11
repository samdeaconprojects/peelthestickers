// src/services/addSolve.js
import { apiPost } from "./api.js";

/**
 * NEW canonical signature:
 *   addSolve(userID, { event, sessionID, rawTimeMs, penalty, scramble, note, createdAt, tags })
 *
 * OLD temporary shorthand also supported:
 *   addSolve(userID, { event, sessionID, ms, penalty, scramble, note, ts, tags })
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

    const rawTimeMs = Number(solve.rawTimeMs ?? solve.ms);
    if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) {
      throw new Error("addSolve: invalid rawTimeMs");
    }

    const penalty = solve.penalty ?? solve.Penalty ?? null;
    const scramble = solve.scramble ?? solve.Scramble ?? "";
    const note = solve.note ?? solve.Note ?? "";
    const tags = solve.tags ?? solve.Tags ?? {};
    const createdAt = String(solve.createdAt ?? solve.ts ?? new Date().toISOString());

    return { userID, event, sessionID, rawTimeMs, penalty, scramble, note, tags, createdAt };
  }

  // Older positional use during transition:
  const sessionID = String(a1 ?? "main");
  const event = String(a2 || "").toUpperCase();
  if (!event) throw new Error("addSolve: event required");

  const rawTimeMs = Number(a3);
  if (!Number.isFinite(rawTimeMs) || rawTimeMs < 0) {
    throw new Error("addSolve: invalid rawTimeMs");
  }

  const scramble = a4 ?? "";
  const penalty = a5 ?? null;
  const note = a6 ?? "";
  const tags = a7 ?? {};
  const createdAt = new Date().toISOString();

  return { userID, event, sessionID, rawTimeMs, penalty, scramble, note, tags, createdAt };
}

export const addSolve = async (userID, a1, a2, a3, a4, a5, a6, a7) => {
  const payload = normalizeArgs(userID, a1, a2, a3, a4, a5, a6, a7);
  return apiPost("/api/solve", payload);
};