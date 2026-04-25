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

function normalizeStatsSummaryLayout(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  return raw === "row" ? "row" : "tile";
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
  statsSummaryLayout: "tile",

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
  }, [settings.primaryColor, settings.secondaryColor]);

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
