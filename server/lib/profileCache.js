// Short-lived, in-process cache of USER#<id>/PROFILE items for read-only
// paths (visibility checks, author lookups, the feed). One page load used to
// read the viewer's own profile once per friend, with consistent reads, and a
// popular user's profile carries their whole follower list.
//
// Any Put/Update/Delete of a PROFILE item that goes through this process
// invalidates the entry (see profileIDFromWrite, hooked into ddb.send), so the
// TTL only bounds staleness for writes made by another process or script.
// Read-modify-write paths must keep using a fresh consistent read.

function createProfileCache({ ttlMs = 5000, maxEntries = 20000, now = Date.now } = {}) {
  const entries = new Map(); // id -> { value, expiresAt }
  const inflight = new Map(); // id -> { promise, generation }
  const generations = new Map(); // id -> number, bumped on invalidate

  function generationOf(id) {
    return generations.get(id) || 0;
  }

  function clone(value) {
    return value == null ? value : structuredClone(value);
  }

  function evictIfFull() {
    if (entries.size < maxEntries) return;
    // Map keeps insertion order, so the first keys are the oldest.
    const drop = Math.ceil(maxEntries / 10);
    let i = 0;
    for (const key of entries.keys()) {
      entries.delete(key);
      if (++i >= drop) break;
    }
  }

  async function get(id, loader) {
    const key = String(id || "").trim();
    if (!key) return null;

    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) return clone(hit.value);
    if (hit) entries.delete(key);

    const pending = inflight.get(key);
    if (pending && pending.generation === generationOf(key)) {
      return clone(await pending.promise);
    }

    const generation = generationOf(key);
    const promise = Promise.resolve().then(() => loader(key));
    inflight.set(key, { promise, generation });
    try {
      const value = await promise;
      // A write that landed while we were reading makes this value suspect.
      if (generation === generationOf(key)) {
        evictIfFull();
        entries.set(key, { value: value ?? null, expiresAt: now() + ttlMs });
      }
      return clone(value ?? null);
    } finally {
      if (inflight.get(key)?.promise === promise) inflight.delete(key);
    }
  }

  function invalidate(id) {
    const key = String(id || "").trim();
    if (!key) return;
    entries.delete(key);
    inflight.delete(key);
    generations.set(key, generationOf(key) + 1);
  }

  function clear() {
    for (const key of entries.keys()) generations.set(key, generationOf(key) + 1);
    entries.clear();
    inflight.clear();
  }

  return { get, invalidate, clear, size: () => entries.size };
}

function userIDFromProfileKey(key) {
  if (!key || String(key.SK || "") !== "PROFILE") return "";
  const pk = String(key.PK || "");
  return pk.startsWith("USER#") ? pk.slice(5) : "";
}

// userIDs whose PROFILE item a write command touches.
function profileIDsFromWrite(commandName, input = {}) {
  const ids = [];
  if (!input || typeof input !== "object") return ids;

  if (commandName === "Put") ids.push(userIDFromProfileKey(input.Item));
  if (commandName === "Update" || commandName === "Delete") ids.push(userIDFromProfileKey(input.Key));

  if (commandName === "BatchWrite") {
    for (const requests of Object.values(input.RequestItems || {})) {
      for (const request of requests || []) {
        ids.push(userIDFromProfileKey(request?.PutRequest?.Item));
        ids.push(userIDFromProfileKey(request?.DeleteRequest?.Key));
      }
    }
  }

  if (commandName === "TransactWrite") {
    for (const item of input.TransactItems || []) {
      ids.push(userIDFromProfileKey(item?.Put?.Item));
      ids.push(userIDFromProfileKey(item?.Update?.Key));
      ids.push(userIDFromProfileKey(item?.Delete?.Key));
    }
  }

  return ids.filter(Boolean);
}

module.exports = { createProfileCache, profileIDsFromWrite };
