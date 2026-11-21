// src/utils/cubeColors.js
//
// The user's sticker colours, shared by everything that draws a cube: the 3D
// cube (live smart-cube view, reconstruction replay), the scramble images and
// the reconstruction's colour dots. Colours are keyed by name ("white", ...);
// the plastic is the cube body behind the stickers.
//
// SettingsContext pushes the saved scheme in with setCubeColors(); components
// read it with useCubeColors() and re-render when it changes.

import { useSyncExternalStore } from "react";

export const CUBE_COLOR_KEYS = ["white", "yellow", "green", "blue", "red", "orange"];

export const CUBE_COLOR_LABELS = {
  white: "White",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  red: "Red",
  orange: "Orange",
  plastic: "Plastic",
};

export const CUBE_COLOR_PRESETS = {
  bright: {
    label: "PTS bright",
    colors: {
      white: "#FFFFFF",
      yellow: "#FFFF00",
      green: "#12EA68",
      blue: "#50B6FF",
      red: "#F64258",
      orange: "#FF8F0C",
      plastic: "#111111",
    },
  },
  classic: {
    label: "Classic",
    colors: {
      white: "#F5F5F5",
      yellow: "#FFD500",
      green: "#009B48",
      blue: "#0046AD",
      red: "#B71234",
      orange: "#FF5800",
      plastic: "#111111",
    },
  },
  pastel: {
    label: "Pastel",
    colors: {
      white: "#FAFAF7",
      yellow: "#FFE98A",
      green: "#8EE0A8",
      blue: "#8EC5FF",
      red: "#FF9AA8",
      orange: "#FFC38A",
      plastic: "#2A2A2E",
    },
  },
  stickerless: {
    label: "Stickerless",
    colors: {
      white: "#FFFFFF",
      yellow: "#FFEE00",
      green: "#00D35F",
      blue: "#1E7BFF",
      red: "#FF2D3D",
      orange: "#FF8A00",
      plastic: "#1A1A1A",
    },
  },
};

export const DEFAULT_CUBE_COLORS = CUBE_COLOR_PRESETS.bright.colors;

// Standard (Western) scheme: which colour sits on which face when solved.
export const FACE_COLOR_NAME = {
  U: "white",
  D: "yellow",
  F: "green",
  B: "blue",
  R: "red",
  L: "orange",
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function normalizeCubeColors(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of [...CUBE_COLOR_KEYS, "plastic"]) {
    const v = String(src[key] || "").trim();
    out[key] = HEX_RE.test(v) ? v.toUpperCase() : DEFAULT_CUBE_COLORS[key];
  }
  return out;
}

/** The preset these colours match exactly, or null when customised. */
export function matchingPreset(colors) {
  const c = normalizeCubeColors(colors);
  for (const [id, p] of Object.entries(CUBE_COLOR_PRESETS)) {
    if (Object.keys(p.colors).every((k) => p.colors[k].toUpperCase() === c[k])) return id;
  }
  return null;
}

/** Hex for a face letter (U R F D L B) under the standard scheme. */
export function faceHex(colors, face) {
  const name = FACE_COLOR_NAME[face];
  return (colors && colors[name]) || DEFAULT_CUBE_COLORS[name] || "#888888";
}

let current = DEFAULT_CUBE_COLORS;
const listeners = new Set();

export function setCubeColors(next) {
  const n = normalizeCubeColors(next);
  const same = Object.keys(n).every((k) => n[k] === current[k]);
  if (same) return;
  current = n;
  for (const l of listeners) l();
}

export const getCubeColors = () => current;

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useCubeColors() {
  return useSyncExternalStore(subscribe, getCubeColors, getCubeColors);
}
