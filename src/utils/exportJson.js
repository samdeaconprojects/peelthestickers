// Builds a data export a piece at a time. A huge export doesn't fit in one
// JavaScript string, so it can't go through a single JSON.stringify.

// One page of solves as comma-separated JSON. Pages arrive newest first and the
// export stores oldest first, so the page is reversed here.
export function serializeSolvesPage(items, mapItem = (item) => item) {
  const out = [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    out.push(JSON.stringify(mapItem(items[i])));
  }
  return out.join(",");
}

// Parts for new Blob(parts). payload is everything except data; sessions is
// [{ session, solveParts }] with solveParts in the order the pages arrived.
export function buildExportJsonParts(payload, sessions) {
  const parts = [`${JSON.stringify(payload).slice(0, -1)},"data":{"sessions":[`];
  sessions.forEach(({ session, solveParts }, sessionIndex) => {
    parts.push(`${sessionIndex ? "," : ""}{"session":${JSON.stringify(session)},"solves":[`);
    for (let i = solveParts.length - 1; i >= 0; i -= 1) {
      parts.push(solveParts[i]);
      if (i > 0) parts.push(",");
    }
    parts.push("]}");
  });
  parts.push("]}}");
  return parts;
}
