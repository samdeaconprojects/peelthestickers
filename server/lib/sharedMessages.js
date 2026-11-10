// Helpers for shared-session ("shared average") messages and the records they
// update. Kept free of DynamoDB so they can be unit tested.

// [sharedUpdate]<sharedID>|<solveIndex>|<time>|<userID>
// [sharedJoin]<sharedID>|<userID>
// Returns the userID named inside the text, or null for any other message.
function getSharedMessageActorID(text) {
  const raw = String(text || "");
  if (raw.startsWith("[sharedUpdate]")) {
    const fields = raw.slice("[sharedUpdate]".length).split("|");
    return String(fields[3] ?? "").trim() || null;
  }
  if (raw.startsWith("[sharedJoin]")) {
    const fields = raw.slice("[sharedJoin]".length).split("|");
    return String(fields[1] ?? "").trim() || null;
  }
  return null;
}

function isConditionalCheckFailed(err) {
  return (
    err?.name === "ConditionalCheckFailedException" ||
    err?.code === "ConditionalCheckFailedException" ||
    err?.__type?.endsWith?.("ConditionalCheckFailedException")
  );
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `attempt(i)` until it stops throwing ConditionalCheckFailedException.
// Used for optimistic-lock writes: each attempt re-reads, recomputes, and
// writes with a condition on the version it read. Jittered backoff spreads out
// writers that all hit the same item at once.
async function retryOnConditionalFailure(
  attempt,
  { attempts = 30, baseDelayMs = 5, maxDelayMs = 80, sleep = defaultSleep, random = Math.random } = {}
) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await attempt(i);
    } catch (err) {
      if (!isConditionalCheckFailed(err) || i === attempts - 1) throw err;
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(i, 6));
      await sleep(Math.round(random() * cap));
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Shared-run storage (format 2).
//
// A run is one small SHAREDRUN#<sid> item (settings, scrambles, Format: 2) plus
// two kinds of small items next to it in the conversation's partition:
//   SHAREDRUN#<sid>#CELL#<idx>#<uid>  one result: Time, Event. The record of what
//                                     each player posted.
//   SHAREDRUN#<sid>#ROUND#<idx>       one attribute per player, "T#<uid>" = time.
//                                     A single UpdateItem changes one player's time
//                                     and returns the round as it was just before,
//                                     so each change knows exactly what it changed
//                                     (who gained a solve, whose win moved) without
//                                     a lock. That change is added to the
//                                     conversation's SharedStats with atomic
//                                     arithmetic, so it is counted exactly once.
// Older runs kept every result in a RoundResults map on the run item; they are
// migrated to this layout the first time they get a new result.

const SHARED_RUN_FORMAT = 2;
const ROUND_TIME_PREFIX = "T#";

function padSolveIndex(solveIndex) {
  return String(Math.max(0, Math.trunc(Number(solveIndex) || 0))).padStart(6, "0");
}

function sharedRunKey(sharedID) {
  return `SHAREDRUN#${String(sharedID || "").trim()}`;
}

function sharedCellPrefix(sharedID) {
  return `${sharedRunKey(sharedID)}#CELL#`;
}

function sharedCellKey(sharedID, solveIndex, userID) {
  return `${sharedCellPrefix(sharedID)}${padSolveIndex(solveIndex)}#${String(userID || "").trim()}`;
}

function sharedRoundKey(sharedID, solveIndex) {
  return `${sharedRunKey(sharedID)}#ROUND#${padSolveIndex(solveIndex)}`;
}

function roundTimeAttribute(userID) {
  return `${ROUND_TIME_PREFIX}${String(userID || "").trim()}`;
}

// { uid: time } from a ROUND item (or the ALL_OLD image of one).
function roundTimesFromItem(item) {
  const times = {};
  Object.entries(item || {}).forEach(([key, value]) => {
    if (!key.startsWith(ROUND_TIME_PREFIX)) return;
    const uid = key.slice(ROUND_TIME_PREFIX.length);
    const time = Number(value);
    if (uid && Number.isFinite(time)) times[uid] = time;
  });
  return times;
}

// A round has a winner once two or more people have a time and exactly one of
// them has the fastest.
function roundWinner(times) {
  const entries = Object.entries(times || {}).filter(([, t]) => Number.isFinite(Number(t)));
  if (entries.length < 2) return null;
  let best = Infinity;
  entries.forEach(([, t]) => {
    if (Number(t) < best) best = Number(t);
  });
  const leaders = entries.filter(([, t]) => Number(t) === best);
  return leaders.length === 1 ? leaders[0][0] : null;
}

function createEmptyStatsDelta() {
  return { TotalSolves: 0, TotalWins: 0, TotalSessions: 0, ByEvent: {}, ByUser: {} };
}

function bumpDelta(delta, userID, eventKey, field, amount) {
  if (!amount) return;
  const uid = String(userID || "").trim();
  if (!uid) return;
  const ev = String(eventKey || "333");
  if (field === "Solves") delta.TotalSolves += amount;
  if (field === "Wins") delta.TotalWins += amount;
  if (field === "Sessions") delta.TotalSessions += amount;

  delta.ByUser[uid] = delta.ByUser[uid] || {};
  delta.ByUser[uid][field] = Number(delta.ByUser[uid][field] || 0) + amount;

  delta.ByEvent[ev] = delta.ByEvent[ev] || { ByUser: {} };
  delta.ByEvent[ev][field] = Number(delta.ByEvent[ev][field] || 0) + amount;
  delta.ByEvent[ev].ByUser[uid] = delta.ByEvent[ev].ByUser[uid] || {};
  delta.ByEvent[ev].ByUser[uid][field] = Number(delta.ByEvent[ev].ByUser[uid][field] || 0) + amount;
}

// What one player's new time in one round changes in the stats.
// `before` is { uid: time } as the round was just before the write;
// `eventFor(uid)` names the (normalized) event that player solved this round.
function buildRoundTransitionDelta({ before, userID, time, eventFor }) {
  const prev = { ...(before || {}) };
  const next = { ...prev, [userID]: Number(time) };
  const delta = createEmptyStatsDelta();
  const ev = (uid) => (typeof eventFor === "function" ? eventFor(uid) : "333");

  if (!Number.isFinite(Number(prev[userID]))) bumpDelta(delta, userID, ev(userID), "Solves", 1);

  const prevWinner = roundWinner(prev);
  const nextWinner = roundWinner(next);
  if (prevWinner !== nextWinner) {
    if (prevWinner) bumpDelta(delta, prevWinner, ev(prevWinner), "Wins", -1);
    if (nextWinner) bumpDelta(delta, nextWinner, ev(nextWinner), "Wins", 1);
  }
  return delta;
}

// Stats for a whole run, from its results ({ [idx]: { uid: time } }). Used to
// check stored stats and to rebuild them; the live path never needs it.
function summarizeRoundTimes(roundsByIndex, eventFor) {
  const delta = createEmptyStatsDelta();
  const ev = (uid, idx) => (typeof eventFor === "function" ? eventFor(uid, idx) : "333");
  Object.entries(roundsByIndex || {}).forEach(([idx, times]) => {
    Object.entries(times || {}).forEach(([uid, t]) => {
      if (Number.isFinite(Number(t))) bumpDelta(delta, uid, ev(uid, idx), "Solves", 1);
    });
    const winner = roundWinner(times);
    if (winner) bumpDelta(delta, winner, ev(winner, idx), "Wins", 1);
  });
  return delta;
}

function isStatsDeltaEmpty(delta) {
  return !Object.keys(delta?.ByUser || {}).length && !Object.keys(delta?.ByEvent || {}).length &&
    !Number(delta?.TotalSolves || 0) && !Number(delta?.TotalWins || 0) && !Number(delta?.TotalSessions || 0);
}

const THROTTLE_ERRORS = new Set([
  "ProvisionedThroughputExceededException",
  "ThrottlingException",
  "RequestLimitExceeded",
]);

function isThrottlingError(err) {
  const name = String(err?.name || err?.code || err?.__type || "").split("#").pop();
  return THROTTLE_ERRORS.has(name);
}

// The SDK already retries a throttled call a few times; this adds a longer,
// jittered tail for one hot item (a 100-person group finishing a round
// together writes the same SharedStats item ~100 times in a second or two).
async function retryOnThrottle(
  attempt,
  { attempts = 6, baseDelayMs = 50, maxDelayMs = 1500, sleep = defaultSleep, random = Math.random } = {}
) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await attempt(i);
    } catch (err) {
      if (!isThrottlingError(err) || i === attempts - 1) throw err;
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** i);
      await sleep(Math.round(cap / 2 + random() * (cap / 2)));
    }
  }
  return undefined;
}

function isInvalidDocumentPath(err) {
  return (
    (err?.name === "ValidationException" || err?.__type?.endsWith?.("ValidationException")) &&
    /document path provided in the update expression is invalid/i.test(String(err?.message || ""))
  );
}

// DynamoDB caps an expression at 4 KB; stay well under it.
const MAX_EXPRESSION_CHARS = 3000;

// Turns a list of SET clauses into UpdateItem parameter sets, each small enough
// to send. `clauses` are { expr, names, values } with already-unique placeholders.
function chunkSetClauses(clauses) {
  const chunks = [];
  let current = null;
  clauses.forEach((clause) => {
    if (!current || current.length + clause.expr.length + 2 > MAX_EXPRESSION_CHARS) {
      current = { parts: [], names: {}, values: {}, length: 4 };
      chunks.push(current);
    }
    current.parts.push(clause.expr);
    current.length += clause.expr.length + 2;
    Object.assign(current.names, clause.names);
    Object.assign(current.values, clause.values);
  });
  // DynamoDB rejects placeholders the expression doesn't use, so keep only
  // the ones that appear in this chunk.
  return chunks.map((chunk) => {
    const expression = `SET ${chunk.parts.join(", ")}`;
    const used = new Set(expression.match(/[#:][A-Za-z0-9_]+/g) || []);
    const pick = (map) => Object.fromEntries(Object.entries(map).filter(([key]) => used.has(key)));
    const values = pick(chunk.values);
    return {
      UpdateExpression: expression,
      ExpressionAttributeNames: pick(chunk.names),
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
    };
  });
}

// UpdateItem parameter sets that add `delta` to SharedStats with
// `path = if_not_exists(path, 0) + n`, so concurrent writers never overwrite
// each other. Every map the paths go through must already exist (see
// buildStatsEnsureSteps); DynamoDB rejects the write otherwise and nothing is
// applied.
function buildStatsDeltaUpdates(delta, { timestamp = null } = {}) {
  const names = { "#ss": "SharedStats", "#bu": "ByUser", "#be": "ByEvent" };
  const fieldNames = { Solves: "#fs", Wins: "#fw", Sessions: "#fn", TotalSolves: "#ts", TotalWins: "#tw", TotalSessions: "#tn" };
  const clauses = [];
  let n = 0;
  const add = (pathParts, amount, extraNames) => {
    const value = Number(amount || 0);
    if (!value) return;
    const path = pathParts.join(".");
    const vKey = `:v${n}`;
    n += 1;
    clauses.push({
      expr: `${path} = if_not_exists(${path}, :zero) + ${vKey}`,
      names: { ...names, ...extraNames },
      values: { ":zero": 0, [vKey]: value },
    });
  };

  ["TotalSolves", "TotalWins", "TotalSessions"].forEach((field) =>
    add(["#ss", fieldNames[field]], delta?.[field], { [fieldNames[field]]: field })
  );

  const userIDs = Object.keys(delta?.ByUser || {});
  const eventKeys = Object.keys(delta?.ByEvent || {});
  const allUserIDs = [...new Set([...userIDs, ...eventKeys.flatMap((ev) => Object.keys(delta.ByEvent[ev]?.ByUser || {}))])];
  const uName = (uid) => `#u${allUserIDs.indexOf(uid)}`;

  userIDs.forEach((uid) => {
    ["Solves", "Wins", "Sessions"].forEach((field) =>
      add(["#ss", "#bu", uName(uid), fieldNames[field]], delta.ByUser[uid]?.[field], {
        [uName(uid)]: uid,
        [fieldNames[field]]: field,
      })
    );
  });
  eventKeys.forEach((ev, ei) => {
    const eName = `#e${ei}`;
    const eventDelta = delta.ByEvent[ev] || {};
    ["Solves", "Wins", "Sessions"].forEach((field) =>
      add(["#ss", "#be", eName, fieldNames[field]], eventDelta[field], { [eName]: ev, [fieldNames[field]]: field })
    );
    Object.entries(eventDelta.ByUser || {}).forEach(([uid, values]) => {
      ["Solves", "Wins", "Sessions"].forEach((field) =>
        add(["#ss", "#be", eName, "#bu", uName(uid), fieldNames[field]], values?.[field], {
          [eName]: ev,
          [uName(uid)]: uid,
          [fieldNames[field]]: field,
        })
      );
    });
  });

  if (timestamp && clauses.length) {
    clauses.unshift({
      expr: "#ss.#last = :last",
      names: { "#ss": "SharedStats", "#last": "LastSharedAt" },
      values: { ":last": String(timestamp) },
    });
  }
  return chunkSetClauses(clauses);
}

// Creates, without overwriting anything, every map that a delta for these users
// and events writes into. Steps must run in order: each level needs the one above.
function buildStatsEnsureSteps(userIDs, eventKeys) {
  const users = [...new Set((userIDs || []).map((u) => String(u || "").trim()).filter(Boolean))];
  const events = [...new Set((eventKeys || []).map((e) => String(e || "").trim()).filter(Boolean))];
  const base = { "#ss": "SharedStats", "#bu": "ByUser", "#be": "ByEvent" };
  const ensure = (path, valueKey, names, value) => ({
    expr: `${path} = if_not_exists(${path}, ${valueKey})`,
    names: { ...base, ...names },
    values: { [valueKey]: value },
  });
  const zeroUser = { Solves: 0, Wins: 0, Sessions: 0 };
  const steps = [];
  steps.push(
    chunkSetClauses([
      ensure("#ss", ":emptyStats", {}, {
        TotalSolves: 0, TotalWins: 0, TotalSessions: 0, LastSharedAt: null, ByEvent: {}, ByUser: {},
      }),
    ])
  );
  steps.push(
    chunkSetClauses([ensure("#ss.#bu", ":emptyMap", {}, {}), ensure("#ss.#be", ":emptyMap", {}, {})])
  );
  steps.push(
    chunkSetClauses([
      ...users.map((uid, i) => ensure(`#ss.#bu.#u${i}`, ":zeroUser", { [`#u${i}`]: uid }, zeroUser)),
      ...events.map((ev, i) =>
        ensure(`#ss.#be.#e${i}`, ":zeroEvent", { [`#e${i}`]: ev }, { ...zeroUser, ByUser: {} })
      ),
    ])
  );
  if (events.length) {
    steps.push(
      chunkSetClauses(events.map((ev, i) => ensure(`#ss.#be.#e${i}.#bu`, ":emptyMap", { [`#e${i}`]: ev }, {})))
    );
    if (users.length) {
      steps.push(
        chunkSetClauses(
          events.flatMap((ev, ei) =>
            users.map((uid, ui) =>
              ensure(`#ss.#be.#e${ei}.#bu.#u${ui}`, ":zeroUser", { [`#e${ei}`]: ev, [`#u${ui}`]: uid }, zeroUser)
            )
          )
        )
      );
    }
  }
  return steps;
}

module.exports = {
  getSharedMessageActorID,
  isConditionalCheckFailed,
  retryOnConditionalFailure,
  SHARED_RUN_FORMAT,
  ROUND_TIME_PREFIX,
  sharedRunKey,
  sharedCellPrefix,
  sharedCellKey,
  sharedRoundKey,
  roundTimeAttribute,
  roundTimesFromItem,
  roundWinner,
  createEmptyStatsDelta,
  buildRoundTransitionDelta,
  summarizeRoundTimes,
  isStatsDeltaEmpty,
  isInvalidDocumentPath,
  isThrottlingError,
  retryOnThrottle,
  buildStatsDeltaUpdates,
  buildStatsEnsureSteps,
};
