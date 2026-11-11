import {
  getAlgorithmTagDisplayValue,
  getSharedTagLabels,
  getSolveTagValue,
} from "../components/TagBar/tagUtils";

// Tag chips on the tall saved solve/average tile. Each tile has up to 3 slots; a slot is
// "" (auto: next tag from TILE_TAG_DEFAULT_ORDER), "__none", or a key below.
export const TILE_TAG_MAX = 3;
export const TILE_TAG_AUTO = "";
export const TILE_TAG_NONE = "__none";
const ALG_KEY = "__Alg";
const ALG_FIELDS = ["Alg_PLL", "Alg_OLL", "Alg_CMLL", "Alg_CLL"];
const ALG_LABEL = { Alg_OLL: "OLL", Alg_PLL: "PLL", Alg_CMLL: "CMLL", Alg_CLL: "CLL" };
const FLAG_LABEL = {
  Parity_OLL: "OLL Parity",
  Parity_PLL: "PLL Parity",
  Parity_Edge: "Edge Parity",
};
const CUSTOM_FIELDS = ["Custom1", "Custom2", "Custom3", "Custom4", "Custom5"];

export const TILE_TAG_DEFAULT_ORDER = [
  "CubeModel",
  "CrossColor",
  ALG_KEY,
  "Method",
  "Parity_OLL",
  "Parity_PLL",
  "Parity_Edge",
  ...CUSTOM_FIELDS,
];

export function getTileTagSlotOptions(tagConfig) {
  const labels = getSharedTagLabels(tagConfig);
  return TILE_TAG_DEFAULT_ORDER.map((key) => ({
    key,
    label: key === ALG_KEY ? "Algorithm (PLL/OLL…)" : labels[key] || key,
  }));
}

export function normalizeTileTagSlots(slots) {
  const list = Array.isArray(slots) ? slots : [];
  return Array.from({ length: TILE_TAG_MAX }, (_, i) => String(list[i] || TILE_TAG_AUTO));
}

// Value every solve shares for a field ("" when missing or mixed).
function sharedValue(solveList, field) {
  const values = solveList.map((solve) => getSolveTagValue(solve, field));
  const value = values[0];
  return value && values.every((v) => v === value) ? value : "";
}

function resolveChip(solveList, key) {
  if (key === ALG_KEY) {
    for (const field of ALG_FIELDS) {
      const chip = resolveChip(solveList, field);
      if (chip) return { ...chip, key };
    }
    return null;
  }
  const value = sharedValue(solveList, key);
  if (!value) return null;
  let label = getAlgorithmTagDisplayValue(key, value) || value;
  if (FLAG_LABEL[key]) label = FLAG_LABEL[key];
  else if (ALG_LABEL[key]) label = `${ALG_LABEL[key]} - ${label}`;
  return { key, field: key, value, label };
}

// For averages only tags shared by every solve count.
export function getTileTagChips(solveList = [], slots) {
  if (!solveList.length) return [];
  const normalized = normalizeTileTagSlots(slots);
  const explicit = new Set(
    normalized.filter((key) => key !== TILE_TAG_AUTO && key !== TILE_TAG_NONE)
  );
  const autoQueue = TILE_TAG_DEFAULT_ORDER.filter((key) => !explicit.has(key));
  const used = new Set();

  return normalized
    .map((slot) => {
      if (slot === TILE_TAG_NONE) return null;
      if (slot !== TILE_TAG_AUTO) {
        if (used.has(slot)) return null;
        used.add(slot);
        return resolveChip(solveList, slot);
      }
      while (autoQueue.length) {
        const key = autoQueue.shift();
        const chip = resolveChip(solveList, key);
        if (chip) {
          used.add(key);
          return chip;
        }
      }
      return null;
    })
    .filter(Boolean);
}
