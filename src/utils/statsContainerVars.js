const STATS_CONTAINER_GRAY_BORDER = "rgba(200, 200, 200, 0.2)";
const STATS_CONTAINER_GRAY_BORDER_HOVER = "rgba(200, 200, 200, 0.6)";

// Percent (0-100) -> two-digit hex alpha suffix.
function alphaHex(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.round((clamped / 100) * 255).toString(16).padStart(2, "0");
}

// Card container tint: profile color (default), neutral gray, or a custom color.
// The -force vars also override cards that carry their own per-series color.
// Shared by the Stats page and stat posts on profiles/feeds so cards match.
export function getStatsContainerVars(settings, profilePrimary = "#2EC4B6") {
  const mode = settings?.statsContainerColorMode || "profile";
  const custom = settings?.statsContainerCustomColor || "#2EC4B6";
  // Background strength setting (default 13% ~ the original 0x22 tint).
  const bgPercent = settings?.statsContainerBackgroundOpacity ?? 13;
  const bgAlpha = alphaHex(bgPercent);
  // Gray keeps its original 0.1 alpha at the default strength.
  const grayBg = `rgba(100, 100, 100, ${((bgPercent / 13) * 0.1).toFixed(3)})`;
  const vars =
    mode === "gray"
      ? {
          "--stats-container-bg": grayBg,
          "--stats-container-border": STATS_CONTAINER_GRAY_BORDER,
          "--stats-container-force-bg": grayBg,
          "--stats-container-force-border": STATS_CONTAINER_GRAY_BORDER,
          "--stats-container-border-hover": STATS_CONTAINER_GRAY_BORDER_HOVER,
          "--stats-container-force-border-hover": STATS_CONTAINER_GRAY_BORDER_HOVER,
        }
      : mode === "custom"
        ? {
            "--stats-container-bg": `${custom}${bgAlpha}`,
            "--stats-container-border": `${custom}4d`,
            "--stats-container-force-bg": `${custom}${bgAlpha}`,
            "--stats-container-force-border": `${custom}4d`,
            "--stats-container-border-hover": `${custom}a6`,
            "--stats-container-force-border-hover": `${custom}a6`,
          }
        : {
            "--stats-container-bg": `${profilePrimary}${bgAlpha}`,
            "--stats-container-border": `${profilePrimary}4d`,
            "--stats-container-border-hover": `${profilePrimary}a6`,
          };
  // Fill off: cards keep their border but drop the tinted background.
  if (settings?.statsContainerBackground !== true) {
    vars["--stats-container-bg"] = "transparent";
    vars["--stats-container-force-bg"] = "transparent";
  }
  return vars;
}
