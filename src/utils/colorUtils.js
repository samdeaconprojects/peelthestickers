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

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbTupleToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function darkenHex(hex, amount = 0.12, fallback = "#181F23") {
  const safeAmount = Math.max(0, Math.min(1, Number(amount) || 0));
  const fallbackTuple = hexToRgbTuple(fallback, [24, 31, 35]);
  const [r, g, b] = hexToRgbTuple(hex, fallbackTuple);

  return rgbTupleToHex([
    r * (1 - safeAmount),
    g * (1 - safeAmount),
    b * (1 - safeAmount),
  ]);
}
