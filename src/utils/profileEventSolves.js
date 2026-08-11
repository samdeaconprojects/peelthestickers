export function normalizeProfileEventKey(event) {
  return String(event || "").trim().toUpperCase();
}

function normalizeProfileEventEntry(entry, fallbackEvent = "") {
  if (!entry || typeof entry !== "object") return null;

  const event = normalizeProfileEventKey(entry.event || entry.Event || fallbackEvent);
  if (!event) return null;

  const scramble = String(entry.scramble || entry.Scramble || "").trim();
  const solve = entry.solve && typeof entry.solve === "object" ? entry.solve : null;
  const solves = Array.isArray(entry.solves) ? entry.solves.filter(Boolean) : [];

  return {
    ...entry,
    event,
    scramble,
    solve,
    solves,
  };
}

export function normalizeProfileEventSolvesMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([event, entry]) => {
        const normalizedEvent = normalizeProfileEventKey(event);
        const normalizedEntry = normalizeProfileEventEntry(entry, normalizedEvent);
        return normalizedEntry ? [normalizedEvent, normalizedEntry] : null;
      })
      .filter(Boolean)
  );
}

function getVisibleStatsEventScramble(profile, eventKey) {
  const items = Array.isArray(profile?.VisibleStats) ? profile.VisibleStats : [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const itemEvent = normalizeProfileEventKey(item.event || item.Event);
    if (itemEvent !== eventKey) continue;

    const directScramble = String(item?.scramble || item?.Scramble || "").trim();
    if (directScramble) return directScramble;

    const solveScramble = String(item?.solve?.scramble || item?.solve?.Scramble || "").trim();
    if (solveScramble) return solveScramble;

    const averageScramble = String(item?.solves?.[0]?.scramble || item?.solves?.[0]?.Scramble || "").trim();
    if (averageScramble) return averageScramble;
  }

  return "";
}

export function getProfileEventScramble(profile, event, fallback = "") {
  const eventKey = normalizeProfileEventKey(event);
  if (!eventKey) return fallback;

  const map = normalizeProfileEventSolvesMap(
    profile?.ProfileSolvesByEvent || profile?.profileSolvesByEvent
  );
  const saved = map[eventKey];
  if (saved?.scramble) return saved.scramble;

  const visibleStatsScramble = getVisibleStatsEventScramble(profile, eventKey);
  if (visibleStatsScramble) return visibleStatsScramble;

  return fallback;
}
