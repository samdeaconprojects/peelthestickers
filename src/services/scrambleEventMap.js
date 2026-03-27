const PTS_TO_CUBING_EVENT = {
  "222": "222",
  "333": "333",
  "444": "444",
  "555": "555",
  "666": "666",
  "777": "777",

  "333OH": "333oh",
  "333BLD": "333bf",
  "333FM": "333fm",
  "333FT": "333ft",
  "444BLD": "444bf",
  "555BLD": "555bf",
  "333MBLD": "333mbf",

  PYRAMINX: "pyram",
  SKEWB: "skewb",
  SQ1: "sq1",
  CLOCK: "clock",
  MEGAMINX: "minx",

  RELAY: null,
};

export function normalizePTSEventKey(event) {
  return String(event || "").trim().toUpperCase();
}

export function getCubingEventId(event) {
  const normalized = normalizePTSEventKey(event);
  return Object.prototype.hasOwnProperty.call(PTS_TO_CUBING_EVENT, normalized)
    ? PTS_TO_CUBING_EVENT[normalized]
    : null;
}

export function isCubingJsSupportedEvent(event) {
  return !!getCubingEventId(event);
}

export { PTS_TO_CUBING_EVENT };