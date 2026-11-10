// Query building for GET /api/solvesScoped: solves across any set of events
// and sessions, newest first. Pure, so the route only runs the loop.
const { normalizeEvent, normalizeSessionID } = require("./ptsCore");

// "333,444" or "all" -> { all, events }
function parseScopedEvents(raw) {
  const text = String(raw || "").trim();
  if (!text || text.toLowerCase() === "all") return { all: true, events: [] };
  const events = [...new Set(text.split(",").map(normalizeEvent).filter(Boolean))];
  return { all: events.length === 0, events };
}

// "333:main,444:abc" -> Map(event -> [sessionIDs]). Splits on the first colon
// so session IDs may contain one.
function parseScopedPairs(raw) {
  const pairs = new Map();
  const text = String(raw || "").trim();
  if (!text) return pairs;
  for (const part of text.split(",")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const ev = normalizeEvent(part.slice(0, idx));
    const sid = normalizeSessionID(part.slice(idx + 1));
    if (!ev) continue;
    const list = pairs.get(ev) || [];
    if (!list.includes(sid)) list.push(sid);
    pairs.set(ev, list);
  }
  return pairs;
}

// Returns the per-event session restriction: Map(event -> [sids]) for events
// limited to some sessions. Events missing from it accept any session. With
// mainOnly every chosen event (or all of them, as "*") is limited to main.
function resolveSessionScope({ all, events, pairs, mainOnly }) {
  if (mainOnly) {
    if (all) return { anyEventMain: true, scope: new Map() };
    return { anyEventMain: false, scope: new Map(events.map((ev) => [ev, ["main"]])) };
  }
  const scope = new Map();
  for (const [ev, sids] of pairs || []) {
    if (all || events.includes(ev)) scope.set(ev, sids);
  }
  return { anyEventMain: false, scope };
}

function addRangeCondition(keyCondition, skName, prefix, startIso, endExclusiveIso, values) {
  if (startIso && endExclusiveIso) {
    values[":startSk"] = `${prefix}${startIso}`;
    values[":endSk"] = `${prefix}${endExclusiveIso}`;
    return `${keyCondition} AND ${skName} BETWEEN :startSk AND :endSk`;
  }
  if (startIso) {
    values[":startSk"] = `${prefix}${startIso}`;
    // An open-ended range on the main table must still stay inside SOLVE#.
    if (prefix) {
      values[":endSk"] = `${prefix}￿`;
      return `${keyCondition} AND ${skName} BETWEEN :startSk AND :endSk`;
    }
    return `${keyCondition} AND ${skName} >= :startSk`;
  }
  if (endExclusiveIso) {
    values[":endSk"] = `${prefix}${endExclusiveIso}`;
    if (prefix) {
      values[":startSk"] = prefix;
      return `${keyCondition} AND ${skName} BETWEEN :startSk AND :endSk`;
    }
    return `${keyCondition} AND ${skName} <= :endSk`;
  }
  if (prefix) {
    values[":skPrefix"] = prefix;
    return `${keyCondition} AND begins_with(${skName}, :skPrefix)`;
  }
  return keyCondition;
}

function inList(attr, list, valuePrefix, values) {
  const keys = list.map((v, i) => {
    const key = `:${valuePrefix}${i}`;
    values[key] = v;
    return key;
  });
  return keys.length === 1 ? `${attr} = ${keys[0]}` : `${attr} IN (${keys.join(", ")})`;
}

/**
 * Build the DynamoDB query for a scoped solves read.
 * Returns { indexName, keyConditionExpression, filterExpression, names, values }
 * where indexName is null for the main table. Results are newest first.
 */
function buildScopedSolvesQuery({
  userID,
  events = "all",
  pairs = "",
  sessions = "",
  startIso = "",
  endExclusiveIso = "",
} = {}) {
  const uid = String(userID || "").trim();
  if (!uid) throw new Error("userID required");

  const parsedEvents = parseScopedEvents(events);
  const mainOnly = String(sessions || "").trim().toLowerCase() === "main";
  const { anyEventMain, scope } = resolveSessionScope({
    ...parsedEvents,
    pairs: parseScopedPairs(pairs),
    mainOnly,
  });

  const names = {};
  const values = {};

  // One event: its own partition on GSI1 (one session) or GSI2 (any/several).
  if (!parsedEvents.all && parsedEvents.events.length === 1) {
    const ev = parsedEvents.events[0];
    const sids = scope.get(ev) || null;

    if (sids && sids.length === 1) {
      values[":pk"] = `SESSION#${uid}#${ev}#${sids[0]}`;
      return {
        indexName: "GSI1",
        keyConditionExpression: addRangeCondition("GSI1PK = :pk", "GSI1SK", "", startIso, endExclusiveIso, values),
        filterExpression: null,
        names,
        values,
      };
    }

    values[":pk"] = `EVENT#${uid}#${ev}`;
    const keyConditionExpression = addRangeCondition("GSI2PK = :pk", "GSI2SK", "", startIso, endExclusiveIso, values);
    let filterExpression = null;
    if (sids && sids.length) {
      filterExpression = inList("#sid", sids, "sid", values);
    }
    return withNames({ indexName: "GSI2", keyConditionExpression, filterExpression, names, values });
  }

  // Several events or all: the user's partition, SK = SOLVE#<iso>#<id>.
  values[":pk"] = `USER#${uid}`;
  const keyConditionExpression = addRangeCondition("PK = :pk", "SK", "SOLVE#", startIso, endExclusiveIso, values);

  let filterExpression = null;
  if (anyEventMain) {
    values[":mainSid"] = "main";
    filterExpression = "#sid = :mainSid";
  } else {
    const clauses = [];
    const restricted = [...scope.keys()];
    const unrestricted = parsedEvents.all
      ? null
      : parsedEvents.events.filter((ev) => !scope.has(ev));

    if (parsedEvents.all) {
      // Any event not limited by a pair passes as is.
      if (restricted.length) {
        clauses.push(`NOT (${inList("#ev", restricted, "rev", values)})`);
      }
    } else if (unrestricted.length) {
      clauses.push(inList("#ev", unrestricted, "ev", values));
    }

    restricted.forEach((ev, i) => {
      values[`:pev${i}`] = ev;
      clauses.push(`(#ev = :pev${i} AND ${inList("#sid", scope.get(ev), `psid${i}_`, values)})`);
    });

    if (clauses.length) filterExpression = clauses.join(" OR ");
  }

  return withNames({ indexName: null, keyConditionExpression, filterExpression, names, values });
}

// Attribute names go through placeholders; only the ones the filter uses.
function withNames(query) {
  const names = {};
  const filter = query.filterExpression || "";
  if (filter.includes("#ev")) names["#ev"] = "Event";
  if (filter.includes("#sid")) names["#sid"] = "SessionID";
  return { ...query, names };
}

// Key to resume a query right after `item` (used when a page is cut short).
function buildResumeKey(item, indexName) {
  if (!item) return null;
  const key = { PK: item.PK, SK: item.SK };
  if (indexName) {
    key[`${indexName}PK`] = item[`${indexName}PK`];
    key[`${indexName}SK`] = item[`${indexName}SK`];
  }
  return key;
}

module.exports = {
  parseScopedEvents,
  parseScopedPairs,
  buildScopedSolvesQuery,
  buildResumeKey,
};
