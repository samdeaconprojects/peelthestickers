import React, { useCallback, useEffect, useMemo, useState } from "react";
import PieChartBuilder from "./PieChartBuilder";
import "./Stats.css";

const DEFAULT_BOLD_PIE_PALETTE = [
  "#50B6FF",
  "#FB596D",
  "#FFB044",
  "#2EC4B6",
  "#FFE863",
  "#8B7DFF",
];

function normalizeHex(value) {
  let hex = String(value || "").trim().replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((char) => `${char}${char}`).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "";
  return `#${hex.toUpperCase()}`;
}

function buildPiePalette(profileColor) {
  const normalizedProfileColor = normalizeHex(profileColor);
  if (!normalizedProfileColor) return DEFAULT_BOLD_PIE_PALETTE;

  return [
    normalizedProfileColor,
    ...DEFAULT_BOLD_PIE_PALETTE.filter((color) => color !== normalizedProfileColor),
  ];
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHex(hex).replace("#", "");
  if (normalized.length !== 6) return `rgba(46, 196, 182, ${alpha})`;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if (![r, g, b].every(Number.isFinite)) return `rgba(46, 196, 182, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function assignStableColorIndices(entries) {
  const sortedEntries = [...entries].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return String(a.label).localeCompare(String(b.label));
  });
  const colorIndexByLabel = new Map(
    sortedEntries.map((entry, index) => [entry.label, index])
  );

  return entries.map((entry) => ({
    ...entry,
    colorIndex: colorIndexByLabel.get(entry.label) ?? 0,
  }));
}

function PieChart({ solves, data: dataProp, title, profileColor, centerFillColor }) {
  const [hiddenLabels, setHiddenLabels] = useState([]);
  const data = useMemo(() => {
    let entries;

    if (Array.isArray(dataProp) && dataProp.length > 0) {
      entries = dataProp
        .filter((entry) => Number(entry?.value) > 0)
        .map((entry) => ({
          label: String(entry?.label || "Unknown"),
          value: Number(entry?.value || 0),
          solves: Array.isArray(entry?.solves) ? entry.solves : [],
        }));
      return assignStableColorIndices(entries);
    }

    const grouped = new Map();

    for (const solve of Array.isArray(solves) ? solves : []) {
      const event = String(solve?.event || solve?.Event || "").trim() || "Unknown";
      if (!grouped.has(event)) grouped.set(event, []);
      grouped.get(event).push(solve);
    }

    entries = Array.from(grouped.entries()).map(([label, eventSolves]) => ({
      label,
      value: eventSolves.length,
      solves: eventSolves,
    }));
    return assignStableColorIndices(entries);
  }, [dataProp, solves]);

  const visibleData = useMemo(() => {
    if (!hiddenLabels.length) return data;
    const hiddenSet = new Set(hiddenLabels);
    return data.filter((entry) => !hiddenSet.has(entry.label));
  }, [data, hiddenLabels]);

  const colorPalette = useMemo(() => buildPiePalette(profileColor), [profileColor]);
  const controlAccentColor = useMemo(
    () => normalizeHex(profileColor) || colorPalette[0] || "#2EC4B6",
    [colorPalette, profileColor]
  );
  const canReset = hiddenLabels.length > 0;

  const handleSliceClick = useCallback((_, entry) => {
    const label = String(entry?.label || "").trim();
    if (!label) return;

    setHiddenLabels((current) => {
      const hiddenSet = new Set(current);
      if (hiddenSet.has(label)) return current;

      const remainingCount = data.reduce(
        (count, item) => (hiddenSet.has(item.label) ? count : count + 1),
        0
      );
      if (remainingCount <= 1) return current;

      return [...current, label];
    });
  }, [data]);

  const handleReset = useCallback(() => {
    setHiddenLabels([]);
  }, []);

  useEffect(() => {
    const labelSet = new Set(data.map((entry) => entry.label));
    setHiddenLabels((current) => current.filter((label) => labelSet.has(label)));
  }, [data]);

  return (
    <div
      className={`pieChartPanel ${canReset ? "pieChartPanel--withControl" : ""}`}
      style={{
        "--line-chart-accent": controlAccentColor,
        "--line-chart-accent-soft": hexToRgba(controlAccentColor, 0.18),
        "--line-chart-accent-strong": hexToRgba(controlAccentColor, 0.55),
      }}
    >
      {/*<ChartTitle text={title} />*/}
      {canReset ? (
        <div className="pieChartPanelHeader">
          <button
            type="button"
            className="statsToggleBtn barChartToggleBtn pieChartResetButton"
            onClick={handleReset}
          >
            Reset chart
          </button>
        </div>
      ) : null}

      <PieChartBuilder
        width="100%"
        height="100%"
        data={visibleData}
        onSliceClick={handleSliceClick}
        legendValueMode="count-percent"
        interactive={true}
        colorPalette={colorPalette}
        maxLegendItems={5}
        promoteHoveredOverflowItem
        centerFillColor={normalizeHex(centerFillColor) || centerFillColor}
      />
    </div>
  );
}

export default React.memo(PieChart);
