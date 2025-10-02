// src/services/addSolve.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import { getSessionStats } from "./getSessionStats.js";

// Keep rolling windows for fast best AoN updates
const WINDOW_SIZES = [5, 12, 50, 100, 1000];

// ---------- helpers ----------
function computeWcaAverage(timesMs) {
  const values = [];
  let dnfCount = 0;

  for (const s of timesMs) {
    if (s?.penalty === "DNF") { dnfCount++; continue; }
    let t = s.ms;
    if (s?.penalty === "+2") t += 2000;
    values.push(t);
  }
  if (dnfCount > 0) return { ms: null, dnf: true };
  if (values.length < 3) return { ms: null, dnf: true };

  values.sort((a,b)=>a-b);
  values.shift(); // drop best
  values.pop();   // drop worst
  const sum = values.reduce((a,b)=>a+b, 0);
  return { ms: Math.round(sum / values.length), dnf: false };
}

function updateRollingAverages(statsObj, newEntry) {
  statsObj.buffers = statsObj.buffers || {};
  for (const N of WINDOW_SIZES) {
    const key = String(N);
    const buf = statsObj.buffers[key] || [];
    buf.push(newEntry);
    if (buf.length > N) buf.shift();
    statsObj.buffers[key] = buf;

    if (buf.length === N) {
      const { ms, dnf } = computeWcaAverage(buf);
      const field = `bestAo${N}`;
      if (!dnf && (statsObj[field] == null || ms < statsObj[field])) {
        statsObj[field] = ms;
      }
    }
  }
}

/**
 * Normalize arguments to support BOTH signatures:
 *
 * NEW:
 *   addSolve(userID, { event, sessionID, ms, penalty, scramble, note, ts, tags })
 *   or addSolve(userID, { time, datetime, ... }, { event, sessionID })
 *
 * OLD (your current App.js):
 *   addSolve(userID, sessionID, event, timeMs, scramble, penalty, note, tags)
 */
function normalizeArgs(userID, a1, a2, a3, a4, a5, a6, a7) {
  if (!userID) throw new Error("addSolve: userID is required");

  // NEW style: object as 2nd arg
  if (a1 && typeof a1 === "object" && !Array.isArray(a1)) {
    const solve = a1 || {};
    const opts = a2 || {};

    const rawEvent = solve.event ?? solve.Event ?? opts.event;
    if (!rawEvent) throw new Error("addSolve: 'event' is required (pass in solve.event or opts.event)");
    const event = String(rawEvent).toUpperCase();

    const sessionID = (solve.sessionID ?? opts.sessionID ?? "main").toString();

    // Support both ms and time fields
    const msRaw = solve.ms ?? solve.time;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms < 0) throw new Error("addSolve: 'ms' (milliseconds) must be a non-negative number");

    const penalty = solve.penalty ?? null;
    const scramble = solve.scramble ?? null;
    const note = solve.note ?? null;
    const tags = solve.tags ?? {};
    const ts = solve.ts ?? solve.datetime ?? new Date().toISOString();

    return { userID, event, sessionID, ms, penalty, scramble, note, tags, ts };
  }

  // OLD style: positional args
  const sessionID = (a1 ?? "main").toString();
  const rawEvent = a2;
  if (!rawEvent) throw new Error("addSolve: 'event' is required (third arg in old signature)");
  const event = String(rawEvent).toUpperCase();

  const ms = Number(a3);
  if (!Number.isFinite(ms) || ms < 0) throw new Error("addSolve: time (fourth arg) must be a non-negative number");

  const scramble = a4 ?? null;
  const penalty = a5 ?? null;
  const note = a6 ?? null;
  const tags = a7 ?? {};
  const ts = new Date().toISOString();

  return { userID, event, sessionID, ms, penalty, scramble, note, tags, ts };
}

// ---------- main ----------
export const addSolve = async (userID, a1, a2, a3, a4, a5, a6, a7) => {
  // Normalize inputs for either signature
  const { event, sessionID, ms, penalty, scramble, note, tags, ts } =
    normalizeArgs(userID, a1, a2, a3, a4, a5, a6, a7);

  // 1) Put the solve item (write fields for both new & legacy readers)
  const solveItem = {
    PK: `USER#${userID}`,
    SK: `SOLVE#${ts}`,
    GSI1PK: `SESSION#${userID}#${event}#${sessionID}`,
    GSI1SK: ts,

    // canonical fields
    Event: event,
    SessionID: sessionID,
    TimeMs: ms,
    Penalty: penalty,
    Scramble: scramble,
    Note: note,
    CreatedAt: ts,
    Tags: tags,

    // legacy-friendly fields for your current UI normalizer
    Time: ms,
    DateTime: ts,
  };

  await dynamoDB.put({ TableName: "PTS", Item: solveItem }).promise();

  // 2) Update SessionStats incrementally (optimistic concurrency)
  const statsKey = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${event}#${sessionID}`,
  };

  const existing = await getSessionStats(userID, event, sessionID);
  const stats = existing ? { ...existing } : {
    ...statsKey,
    solveCount: 0,
    sumMs: 0,
    bestSingleMs: null,
    worstSingleMs: null,
    bestAo5: null,
    bestAo12: null,
    bestAo50: null,
    bestAo100: null,
    bestAo1000: null,
    buffers: {},
    version: 0,
    stale: false,
  };

  stats.solveCount += 1;
  if (penalty !== "DNF") {
    stats.sumMs += ms;
    if (stats.bestSingleMs == null || ms < stats.bestSingleMs) stats.bestSingleMs = ms;
    if (stats.worstSingleMs == null || ms > stats.worstSingleMs) stats.worstSingleMs = ms;
  }
  stats.lastSolveTS = ts;
  updateRollingAverages(stats, { ms, penalty });

  const newVersion = (existing?.version ?? 0) + 1;

  const params = {
    TableName: "PTS",
    Key: statsKey,
    UpdateExpression: `
      SET solveCount = :c,
          sumMs = :s,
          bestSingleMs = :b,
          worstSingleMs = :w,
          bestAo5 = :a5,
          bestAo12 = :a12,
          bestAo50 = :a50,
          bestAo100 = :a100,
          bestAo1000 = :a1000,
          buffers = :buf,
          lastSolveTS = :ts,
          version = :v,
          stale = :st
    `,
    ConditionExpression: "attribute_not_exists(version) OR version = :prevV",
    ExpressionAttributeValues: {
      ":c": stats.solveCount,
      ":s": stats.sumMs,
      ":b": stats.bestSingleMs,
      ":w": stats.worstSingleMs,
      ":a5": stats.bestAo5,
      ":a12": stats.bestAo12,
      ":a50": stats.bestAo50,
      ":a100": stats.bestAo100,
      ":a1000": stats.bestAo1000,
      ":buf": stats.buffers,
      ":ts": stats.lastSolveTS,
      ":v": newVersion,
      ":prevV": existing?.version ?? 0,
      ":st": !!stats.stale,
    },
  };

  try {
    await dynamoDB.update(params).promise();
  } catch (e) {
    if (e.code === "ConditionalCheckFailedException") {
      // If two solves post at exactly the same time, caller can retry once.
      throw new Error("AddSolve conflict: please retry once.");
    }
    throw e;
  }

  // Optionally return the created item metadata so the caller can reconcile if needed
  return { ts, event, sessionID, ms, penalty, scramble, note, tags };
};
