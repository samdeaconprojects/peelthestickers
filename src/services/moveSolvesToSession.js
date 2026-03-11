import { apiPost } from "./api";

/**
 * Move a batch of solves to another event/session through the canonical server path.
 *
 * @param {string} userID
 * @param {Array<object>} solves - UI solves with `solveRef`
 * @param {object} opts
 * @param {string} opts.event - source event
 * @param {string} opts.toEvent - destination event
 * @param {string} opts.toSessionID - destination sessionID
 * @param {string} [opts.fromSessionID="main"]
 */
export async function moveSolvesToSession(userID, solves = [], opts = {}) {
  const fromEvent = String(opts.event || "").toUpperCase();
  const toEvent = String(opts.toEvent || fromEvent).toUpperCase();
  const toSessionID = String(opts.toSessionID || "main");
  const fromSessionID = String(opts.fromSessionID || "main");

  if (!userID) throw new Error("moveSolvesToSession: userID required");
  if (!fromEvent) throw new Error("moveSolvesToSession: opts.event required");

  const solveRefs = (Array.isArray(solves) ? solves : [])
    .map((s) => String(s?.solveRef || s?.SK || "").trim())
    .filter(Boolean);

  if (solveRefs.length === 0) return { ok: true, moved: 0 };

  return apiPost("/api/solves/move-session", {
    userID,
    solveRefs,
    fromEvent,
    fromSessionID,
    toEvent,
    toSessionID,
  });
}
