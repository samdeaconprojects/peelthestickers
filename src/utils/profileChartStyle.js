function normalizeHex(value, fallback = "#50B6FF") {
  let hex = String(value || "").trim().replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((char) => `${char}${char}`).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex.toUpperCase()}`;
}

function mixHex(a, b, ratio) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const start = normalizeHex(a).replace("#", "");
  const end = normalizeHex(b).replace("#", "");

  const parts = [0, 2, 4].map((offset) => {
    const av = parseInt(start.slice(offset, offset + 2), 16);
    const bv = parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(av + (bv - av) * safeRatio)
      .toString(16)
      .padStart(2, "0");
  });

  return `#${parts.join("")}`;
}

export function resolvePaletteColor(style, ratio, fallback = "#50B6FF") {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (!style) return fallback;

  if (style.mode === "gradient" && Array.isArray(style.stops) && style.stops.length >= 3) {
    if (safeRatio <= 0.5) {
      return mixHex(style.stops[0], style.stops[1], safeRatio / 0.5);
    }
    return mixHex(style.stops[1], style.stops[2], (safeRatio - 0.5) / 0.5);
  }

  return style.primary || fallback;
}

export function getProfileChartStyle(profile) {
  const base = normalizeHex(profile?.Color || profile?.color || "#50B6FF", "#50B6FF");
  const dark = mixHex(base, "#08131A", 0.42);
  const mid = mixHex(base, "#FFFFFF", 0.18);
  const light = mixHex(base, "#FFFFFF", 0.42);

  return {
    label: "Profile",
    mode: "gradient",
    stops: [dark, mid, light],
    primary: base,
    accent: light,
  };
}

export function getProfileChartPalette(profile, count = 6) {
  const style = getProfileChartStyle(profile);
  const total = Math.max(1, Number(count) || 1);

  return Array.from({ length: total }, (_, index) => {
    const ratio = total === 1 ? 0.5 : index / (total - 1);
    return resolvePaletteColor(style, ratio, style.primary);
  });
}
