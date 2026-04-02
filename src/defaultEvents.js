export const RELAY_EVENT_DEFINITIONS = [
  {
    id: "RELAY_2X2-4X4_222_333_444",
    name: "2x2-4x4 Relay",
    legs: ["222", "333", "444"],
  },
  {
    id: "RELAY_2X2-7X7_222_333_444_555_666_777",
    name: "2x2-7x7 Relay",
    legs: ["222", "333", "444", "555", "666", "777"],
  },
  {
    id: "RELAY_MINIGUILDFORD_222_333_333OH_444_555_SKEWB_PYRAMINX_SQ1_CLOCK_MEGAMINX",
    name: "Mini Guildford",
    legs: ["222", "333", "333OH", "444", "555", "SKEWB", "PYRAMINX", "SQ1", "CLOCK", "MEGAMINX"],
  },
];

export const RELAY_EVENT_IDS = RELAY_EVENT_DEFINITIONS.map((event) => event.id);

export function isRelayEventId(event) {
  const normalized = String(event || "").trim().toUpperCase();
  return normalized === "RELAY" || RELAY_EVENT_IDS.includes(normalized);
}

export function getRelayEventDefinition(event) {
  const normalized = String(event || "").trim().toUpperCase();
  return RELAY_EVENT_DEFINITIONS.find((item) => item.id === normalized) || null;
}

export function getRelayEventName(event) {
  if (String(event || "").trim().toUpperCase() === "RELAY") return "Relay";
  return getRelayEventDefinition(event)?.name || "";
}

export function getRelaySessionOptions(event) {
  const definition = getRelayEventDefinition(event);
  if (!definition?.legs?.length) return {};

  return {
    sessionType: "RELAY",
    relayLegs: definition.legs,
  };
}

export const DEFAULT_EVENTS = [
  "222",
  "333",
  "444",
  "555",
  "666",
  "777",
  "333OH",
  "333BLD",
  "444BLD",
  "555BLD",
  "MBLD",
  "CLOCK",
  "MEGAMINX",
  "PYRAMINX",
  "SKEWB",
  "SQ1",
  "FMC",
  ...RELAY_EVENT_IDS,
];
