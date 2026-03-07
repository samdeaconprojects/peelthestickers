export function normalizeEventCode(ev) {
  return String(ev || "").trim().toUpperCase();
}

export function safeMergeTags(existing, patch, mode = "merge") {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const p = patch && typeof patch === "object" ? patch : {};

  if (mode === "replace") {
    return { ...p };
  }

  const next = { ...base };

  if (p.Custom && typeof p.Custom === "object" && !Array.isArray(p.Custom)) {
    const baseCustom =
      base.Custom && typeof base.Custom === "object" && !Array.isArray(base.Custom)
        ? { ...base.Custom }
        : {};
    next.Custom = { ...baseCustom, ...p.Custom };
    const { Custom, ...rest } = p;
    Object.assign(next, rest);
    return next;
  }

  Object.assign(next, p);
  return next;
}

export function parseCustomLines(linesText) {
  const out = {};
  const raw = String(linesText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of raw) {
    const idx = line.indexOf("=");
    if (idx === -1) {
      out[line] = "true";
      continue;
    }
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v || "true";
  }

  return out;
}

export function buildGsi1pk(userID, ev, sessionID) {
  const E = normalizeEventCode(ev);
  const S = String(sessionID || "main").trim() || "main";
  return `SESSION#${userID}#${E}#${S}`;
}