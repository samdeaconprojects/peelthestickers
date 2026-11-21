// src/components/Settings/CubeColorSettings.js
// Sticker + plastic colours for every cube the app draws, with a live 3D
// preview (drag it to see the other side).

import React, { useMemo } from "react";
import Cube3D from "../Cube3D/Cube3D";
import { applyAlg, SOLVED } from "../../smart/recon/cube3";
import {
  CUBE_COLOR_KEYS,
  CUBE_COLOR_LABELS,
  CUBE_COLOR_PRESETS,
  DEFAULT_CUBE_COLORS,
  matchingPreset,
  normalizeCubeColors,
} from "../../utils/cubeColors";
import "./CubeColorSettings.css";

// A few pieces out of place so every colour shows on the visible faces.
const PREVIEW_STATE = applyAlg(SOLVED, "R U R' U' F2 D' L2");

export default function CubeColorSettings({ value, onChange, Choice = null }) {
  const colors = useMemo(() => normalizeCubeColors(value), [value]);
  const preset = matchingPreset(colors) || "custom";

  const set = (key, hex) => onChange({ ...colors, [key]: hex.toUpperCase() });

  return (
    <div className="cubeColors">
      <div className="cubeColors__preview">
        <Cube3D state={PREVIEW_STATE} colors={colors} size={150} draggable />
      </div>
      <div className="cubeColors__controls">
        <div className="setting-item">
          <label>Preset</label>
          {Choice ? (
            <Choice
              value={preset}
              onChange={(e) => {
                const p = CUBE_COLOR_PRESETS[e.target.value];
                if (p) onChange({ ...p.colors });
              }}
            >
              {Object.entries(CUBE_COLOR_PRESETS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
              {preset === "custom" ? <option value="custom">Custom</option> : null}
            </Choice>
          ) : null}
        </div>
        <div className="cubeColors__grid">
          {[...CUBE_COLOR_KEYS, "plastic"].map((key) => (
            <label key={key} className="cubeColors__swatch">
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => set(key, e.target.value)}
                aria-label={`${CUBE_COLOR_LABELS[key]} colour`}
              />
              <span>{CUBE_COLOR_LABELS[key]}</span>
            </label>
          ))}
        </div>
        {preset !== "bright" ? (
          <button
            type="button"
            className="cubeColors__reset"
            onClick={() => onChange({ ...DEFAULT_CUBE_COLORS })}
          >
            Reset to default
          </button>
        ) : null}
      </div>
    </div>
  );
}
