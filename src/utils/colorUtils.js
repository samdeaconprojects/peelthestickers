// src/utils/colorUtils.js

export function hexToRgbTuple(hex, fallback = [33, 33, 33]) {
  try {
    let h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return fallback;

    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);

    if (![r, g, b].every((n) => Number.isFinite(n))) return fallback;
    return [r, g, b];
  } catch {
    return fallback;
  }
}

export function hexToRgbString(hex, fallback = "33, 33, 33") {
  const [r, g, b] = hexToRgbTuple(hex, [33, 33, 33]);
  return `${r}, ${g}, ${b}`;
}
