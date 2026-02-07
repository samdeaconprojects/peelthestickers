// src/components/TimeList/TimeItem.js
import React, { useMemo } from "react";
import "./TimeItem.css";
import { useSettings } from "../../contexts/SettingsContext";
import { formatTime } from "./TimeUtils";

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function TimeItem({
  // NEW preferred: ms number (milliseconds)
  ms,

  // OPTIONAL: penalty for formatting (if you want TimeItem to reflect +2/DNF text)
  penalty,

  // OLD: keep working if someone passes a pre-formatted string
  time,

  // NEW: range for color scaling
  rangeMin,
  rangeMax,

  // allow caller to add extra classes if needed
  className = "",
}) {
  const { settings } = useSettings();
  const mode = settings?.timeColorMode || "binary";

  const display = useMemo(() => {
    if (typeof time === "string") return time;
    if (typeof ms === "number" && isFinite(ms)) return formatTime(ms, false, penalty);
    return "–";
  }, [time, ms, penalty]);

  const speedClass = useMemo(() => {
    // If we don't have a usable numeric time or range, don't apply performance color.
    if (!(typeof ms === "number" && isFinite(ms))) return "";
    if (!(typeof rangeMin === "number" && isFinite(rangeMin))) return "";
    if (!(typeof rangeMax === "number" && isFinite(rangeMax))) return "";
    if (rangeMax <= rangeMin) return "";

    // Normalize: 0 = fastest, 1 = slowest
    const t = clamp01((ms - rangeMin) / (rangeMax - rangeMin));

    if (mode === "spectrum") {
      // 5 bands: green → yellow-green → yellow → orange → red
      if (t <= 0.20) return "fastest";
      if (t <= 0.40) return "faster";
      if (t <= 0.60) return "middle-fast";
      if (t <= 0.80) return "slower";
      return "slowest";
    }

    // "binary" mode: simple split around midpoint (keep your dashed extremes elsewhere)
    return t <= 0.5 ? "faster" : "slower";
  }, [ms, rangeMin, rangeMax, mode]);

  return (
    <li className={`time-item ${speedClass} ${className}`.trim()}>
      {display}
    </li>
  );
}

export default TimeItem;
