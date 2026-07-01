import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  getDefaultHomeStatsSlots,
  normalizeHomeStatsSlots,
  normalizeHomeStatsSolveLimit,
} from "../components/HomeStats/homeStatsConfig";
import { darkenHex, hexToRgbString } from "../utils/colorUtils";
import {
  defaultEventBindings,
  defaultPageBindings,
  defaultSolveBindings,
  defaultUiBindings,
} from "../utils/keybindings";
import { SHARED_TAG_FIELDS } from "../components/TagBar/tagUtils";

const SettingsContext = createContext(null);

export const useSettings = () => useContext(SettingsContext);

function normalizeScrambleMode(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();

  if (raw === "legacy") return "legacy";
  return "random-state";
}

function normalizeNavigationArrowStyle(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();

  if (raw === "classic") return "classic";
  return "scramble";
}

function normalizeTimeListColumns(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  if (raw === "5" || raw === "12") return raw;
  return "auto";
}

function normalizeNonRollingMaxRows(rawValue) {
  const value = Number(rawValue);
  if (value === 1 || value === 2 || value === 3) return value;
  return 3;
}

function normalizeStatsSummaryLayout() {
  return "row";
}

function normalizeDetailViewSurfaceMode(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  return raw === "legacy" ? "legacy" : "themed";
}

function normalizePlayerBarTagFields(rawValue) {
  const incoming = Array.isArray(rawValue) ? rawValue : [];
  const allowed = new Set(SHARED_TAG_FIELDS);
  const normalized = Array.from(
    new Set(
      incoming
        .map((field) => String(field || "").trim())
        .filter((field) => allowed.has(field))
    )
  );
  return normalized.length ? normalized : ["CubeModel"];
}

export const defaultSettings = {
  primaryColor: "#0E171D",
  secondaryColor: "#ffffff",
  timerInput: "Keyboard",

  horizontalTimeList: true,
  horizontalTimeListScroll: false,
  horizontalTimeListCols: "auto",
  nonRollingTimeListCols: "auto",
  nonRollingTimeListMaxRows: 3,

  disableKeypad: false,
  timeColorMode: "index",
  sharedTimeColorMode: "profile",
  showStrictAverages: false,
  whitePuzzleSVGs: false,

  eventKeyBindings: defaultEventBindings,
  pageKeyBindings: defaultPageBindings,
  uiKeyBindings: defaultUiBindings,
  solveKeyBindings: defaultSolveBindings,

  inspectionEnabled: false,
  inspectionCountDirection: "up",
  inspectionBeeps: true,
  inspectionFullscreen: true,

  relayMode: "total",

  cubeAutoStart: true,
  cubeAutoStop: true,
  cubeStopIdleMs: 5000,

  showPlayerBar: true,
  lastEvent: "333",
  lastSessionByEvent: {},
  homeStatsSolveLimit: 50,
  homeStatsSlots: getDefaultHomeStatsSlots(),

  wcaImportSessionByEvent: {},
  wcaImportSolveSource: "WCA",
  wcaImportLastSyncAt: "",

  smartCubeProvider: "gan",
  navigationArrowStyle: "scramble",
  showAddSolveButton: true,
  hideAutomaticHomeTags: false,
  playerBarTagFields: ["CubeModel"],
  statsSummaryLayout: "row",
  detailViewSurfaceMode: "themed",

  // random-state = cubing.js default
  // legacy = old generateScramble behavior
  scrambleMode: "random-state",
};

function normalizeSmartCubeProvider(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();

  if (raw === "moyu-gan") return "moyu-wcu";

  if (
    raw === "gan" ||
    raw === "gan-gen2-compatible" ||
    raw === "moyu-wcu" ||
    raw === "auto"
  ) {
    return raw;
  }

  return defaultSettings.smartCubeProvider;
}

function mergeSettings(input) {
  const safe = input && typeof input === "object" ? input : {};
  const normalizedHomeStatsSlots = normalizeHomeStatsSlots(safe.homeStatsSlots);

  const legacyLineSolveLimits = Object.values(normalizedHomeStatsSlots)
    .map((slot) => Number(slot?.lineSolveLimit))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const fallbackHomeStatsSolveLimit =
    legacyLineSolveLimits.find((value) => value > 0) ??
    legacyLineSolveLimits[0] ??
    defaultSettings.homeStatsSolveLimit;

  const smartCubeProvider = normalizeSmartCubeProvider(safe.smartCubeProvider);
  const scrambleMode = normalizeScrambleMode(safe.scrambleMode);
  const navigationArrowStyle = normalizeNavigationArrowStyle(safe.navigationArrowStyle);
  const horizontalTimeListCols = normalizeTimeListColumns(safe.horizontalTimeListCols);
  const nonRollingTimeListCols = normalizeTimeListColumns(safe.nonRollingTimeListCols);
  const nonRollingTimeListMaxRows = normalizeNonRollingMaxRows(
    safe.nonRollingTimeListMaxRows
  );
  const statsSummaryLayout = normalizeStatsSummaryLayout(safe.statsSummaryLayout);
  const detailViewSurfaceMode = normalizeDetailViewSurfaceMode(
    safe.detailViewSurfaceMode
  );
  const playerBarTagFields = normalizePlayerBarTagFields(safe.playerBarTagFields);

  return {
    ...defaultSettings,
    ...safe,
    smartCubeProvider,
    navigationArrowStyle,
    scrambleMode,
    horizontalTimeListCols,
    nonRollingTimeListCols,
    nonRollingTimeListMaxRows,
    statsSummaryLayout,
    detailViewSurfaceMode,
    playerBarTagFields,
    eventKeyBindings: {
      ...defaultEventBindings,
      ...(safe.eventKeyBindings || {}),
    },
    pageKeyBindings: {
      ...defaultPageBindings,
      ...(safe.pageKeyBindings || {}),
    },
    uiKeyBindings: {
      ...defaultUiBindings,
      ...(safe.uiKeyBindings || {}),
    },
    solveKeyBindings: {
      ...defaultSolveBindings,
      ...(safe.solveKeyBindings || {}),
    },
    lastSessionByEvent:
      safe.lastSessionByEvent && typeof safe.lastSessionByEvent === "object"
        ? safe.lastSessionByEvent
        : {},
    homeStatsSolveLimit: normalizeHomeStatsSolveLimit(
      safe.homeStatsSolveLimit,
      fallbackHomeStatsSolveLimit
    ),
    homeStatsSlots: normalizedHomeStatsSlots,
    wcaImportSessionByEvent:
      safe.wcaImportSessionByEvent &&
      typeof safe.wcaImportSessionByEvent === "object"
        ? safe.wcaImportSessionByEvent
        : {},
    wcaImportSolveSource:
      typeof safe.wcaImportSolveSource === "string" &&
      safe.wcaImportSolveSource.trim()
        ? safe.wcaImportSolveSource.trim()
        : "WCA",
    wcaImportLastSyncAt:
      typeof safe.wcaImportLastSyncAt === "string"
        ? safe.wcaImportLastSyncAt
        : "",
  };
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const primaryColor = settings.primaryColor || defaultSettings.primaryColor;
    const playerBarColor = darkenHex(primaryColor, 0.19, "#181F23");
    const themedDetailColor = darkenHex(playerBarColor, 0.12, "#14191d");
    const detailViewSurfaceMode = normalizeDetailViewSurfaceMode(
      settings.detailViewSurfaceMode
    );
    const detailSurfaceStrong =
      detailViewSurfaceMode === "legacy"
        ? "rgba(29, 29, 29, 0.97)"
        : `rgba(${hexToRgbString(themedDetailColor, "20, 25, 29")}, 0.97)`;
    const detailSurfaceSoft =
      detailViewSurfaceMode === "legacy"
        ? "rgba(61, 61, 61, 0.8)"
        : `rgba(${hexToRgbString(themedDetailColor, "20, 25, 29")}, 0.88)`;

    document.documentElement.style.setProperty(
      "--primary-color",
      primaryColor
    );
    document.documentElement.style.setProperty(
      "--secondary-color",
      settings.secondaryColor || defaultSettings.secondaryColor
    );
    document.documentElement.style.setProperty("--player-bar-bg", playerBarColor);
    document.documentElement.style.setProperty(
      "--player-bar-bg-rgb",
      hexToRgbString(playerBarColor, "24, 31, 35")
    );
    document.documentElement.style.setProperty(
      "--detail-surface-strong",
      detailSurfaceStrong
    );
    document.documentElement.style.setProperty(
      "--detail-surface-soft",
      detailSurfaceSoft
    );
  }, [settings.primaryColor, settings.secondaryColor, settings.detailViewSurfaceMode]);

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => mergeSettings({ ...prev, ...(newSettings || {}) }));
  }, []);

  const setAllSettings = useCallback((nextSettings) => {
    setSettings(mergeSettings(nextSettings));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      setAllSettings,
      resetSettings,
      defaultSettings,
    }),
    [settings, updateSettings, setAllSettings, resetSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
