const DEFAULT_CACHE_MS = 1500;

export function createCachedRequestLoader(load, options = {}) {
  const cacheMs = Math.max(0, Number(options.cacheMs ?? DEFAULT_CACHE_MS));
  const entries = new Map();

  function getEntry(key) {
    const entry = entries.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (!entry.promise && now - Number(entry.resolvedAt || 0) > cacheMs) {
      entries.delete(key);
      return null;
    }

    return entry;
  }

  async function run(key, loaderOptions = {}) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return load(undefined, loaderOptions);
    }

    if (loaderOptions?.force === true) {
      entries.delete(normalizedKey);
    } else {
      const existing = getEntry(normalizedKey);
      if (existing?.promise) return existing.promise;
      if (existing && Object.prototype.hasOwnProperty.call(existing, "value")) {
        return existing.value;
      }
    }

    const promise = Promise.resolve()
      .then(() => load(loaderOptions?.loadArg, loaderOptions))
      .then((value) => {
        entries.set(normalizedKey, {
          value,
          resolvedAt: Date.now(),
        });
        return value;
      })
      .catch((error) => {
        entries.delete(normalizedKey);
        throw error;
      });

    entries.set(normalizedKey, { promise, resolvedAt: 0 });
    return promise;
  }

  function invalidate(match) {
    if (typeof match === "undefined") {
      entries.clear();
      return;
    }

    const prefix = String(match || "").trim();
    for (const key of Array.from(entries.keys())) {
      if (!prefix || key === prefix || key.startsWith(`${prefix}::`)) {
        entries.delete(key);
      }
    }
  }

  return {
    run,
    invalidate,
  };
}
