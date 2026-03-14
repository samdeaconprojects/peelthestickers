const SLOT_META = {
  left: {
    label: "Left of Average Detail",
    defaultWidth: 320,
    defaultHeight: 240,
    defaultOpacity: 0.92,
  },
  right: {
    label: "Right of Average Detail",
    defaultWidth: 320,
    defaultHeight: 240,
    defaultOpacity: 0.92,
  },
  background: {
    label: "Behind Main Timer",
    defaultWidth: 860,
    defaultHeight: 360,
    defaultOpacity: 0.05,
  },
};

export const HOME_STAT_SLOT_ORDER = ["left", "right", "background"];
export const HOME_STAT_SLOT_META = SLOT_META;

export const HOME_STAT_CHART_TYPE_OPTIONS = [
  { value: "line", label: "Line Chart" },
  { value: "bar", label: "Bar Chart" },
  { value: "percent", label: "Percent Bar" },
  { value: "pie", label: "Pie Chart" },
];

export const HOME_STAT_COLOR_SCHEME_OPTIONS = [
  { value: "default", label: "Default Gradient" },
  { value: "profile", label: "Profile Color" },
];

export const HOME_STAT_LINE_METRIC_OPTIONS = [
  { value: "single", label: "Single Times" },
  { value: "ao5", label: "Ao5 Trend" },
  { value: "ao12", label: "Ao12 Trend" },
];

export const HOME_STAT_LINE_GROUP_OPTIONS = [
  { value: "solve", label: "By Solve" },
  { value: "day", label: "By Day" },
  { value: "week", label: "By Week" },
  { value: "month", label: "By Month" },
  { value: "year", label: "By Year" },
];

export const HOME_STAT_PIE_BREAKDOWN_OPTIONS = [
  { value: "penalty", label: "Penalty" },
  { value: "solveSource", label: "Solve Source" },
  { value: "cubeModel", label: "Cube Model" },
  { value: "crossColor", label: "Cross Color" },
  { value: "timerInput", label: "Timer Input" },
];

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeHomeStatsSolveLimit(value, fallback = 50) {
  return clampNumber(value, fallback, 0, 10000);
}

function defaultSlotConfig(slotKey) {
  const meta = SLOT_META[slotKey] || SLOT_META.left;
  if (slotKey === "background") {
    return {
      enabled: false,
      chartType: "line",
      colorScheme: "default",
      lineMetric: "single",
      lineGroupBy: "solve",
      pieBreakdown: "penalty",
      percentThresholdSeconds: 10,
      width: meta.defaultWidth,
      height: meta.defaultHeight,
      opacity: meta.defaultOpacity,
    };
  }

  if (slotKey === "right") {
    return {
      enabled: false,
      chartType: "bar",
      colorScheme: "default",
      lineMetric: "single",
      lineGroupBy: "solve",
      pieBreakdown: "penalty",
      percentThresholdSeconds: 10,
      width: meta.defaultWidth,
      height: meta.defaultHeight,
      opacity: meta.defaultOpacity,
    };
  }

  if (slotKey === "left") {
    return {
      enabled: false,
      chartType: "pie",
      colorScheme: "default",
      lineMetric: "single",
      lineGroupBy: "solve",
      pieBreakdown: "cubeModel",
      percentThresholdSeconds: 10,
      width: meta.defaultWidth,
      height: meta.defaultHeight,
      opacity: meta.defaultOpacity,
    };
  }

  return {
    enabled: false,
    chartType: "line",
    colorScheme: "default",
    lineMetric: "single",
    lineGroupBy: "solve",
    pieBreakdown: "penalty",
    percentThresholdSeconds: 10,
    width: meta.defaultWidth,
    height: meta.defaultHeight,
    opacity: meta.defaultOpacity,
  };
}

export function getDefaultHomeStatsSlots() {
  return HOME_STAT_SLOT_ORDER.reduce((acc, slotKey) => {
    acc[slotKey] = defaultSlotConfig(slotKey);
    return acc;
  }, {});
}

export function getHomeStatMetricOptions(chartType) {
  if (chartType === "line") return HOME_STAT_LINE_METRIC_OPTIONS;
  if (chartType === "pie") return HOME_STAT_PIE_BREAKDOWN_OPTIONS;
  return [];
}

export function normalizeHomeStatsSlots(input) {
  const source = input && typeof input === "object" ? input : {};

  return HOME_STAT_SLOT_ORDER.reduce((acc, slotKey) => {
    const fallback = defaultSlotConfig(slotKey);
    const raw = source[slotKey] && typeof source[slotKey] === "object" ? source[slotKey] : {};
    const chartType = HOME_STAT_CHART_TYPE_OPTIONS.some((opt) => opt.value === raw.chartType)
      ? raw.chartType
      : fallback.chartType;
    const colorScheme = HOME_STAT_COLOR_SCHEME_OPTIONS.some((opt) => opt.value === raw.colorScheme)
      ? raw.colorScheme
      : fallback.colorScheme;
    const lineMetric = HOME_STAT_LINE_METRIC_OPTIONS.some((opt) => opt.value === raw.lineMetric)
      ? raw.lineMetric
      : fallback.lineMetric;
    const lineGroupBy = HOME_STAT_LINE_GROUP_OPTIONS.some((opt) => opt.value === raw.lineGroupBy)
      ? raw.lineGroupBy
      : fallback.lineGroupBy;
    const pieBreakdown = HOME_STAT_PIE_BREAKDOWN_OPTIONS.some(
      (opt) => opt.value === raw.pieBreakdown
    )
      ? raw.pieBreakdown
      : fallback.pieBreakdown;

    acc[slotKey] = {
      enabled: !!raw.enabled,
      chartType,
      colorScheme,
      lineMetric,
      lineGroupBy,
      pieBreakdown,
      percentThresholdSeconds: clampNumber(raw.percentThresholdSeconds, fallback.percentThresholdSeconds, 1, 300),
      width: clampNumber(raw.width, fallback.width, 120, 1200),
      height: clampNumber(raw.height, fallback.height, 90, 700),
      opacity: clampNumber(raw.opacity, fallback.opacity, 0.05, 1),
    };
    return acc;
  }, {});
}
