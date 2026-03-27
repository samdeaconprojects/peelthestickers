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

const SettingsContext = createContext(null);

export const useSettings = () => useContext(SettingsContext);

const defaultEventBindings = {
  "222": "Alt+2",
  "333": "Alt+3",
  "444": "Alt+4",
  "555": "Alt+5",
  "666": "Alt+6",
  "777": "Alt+7",
  SQ1: "Alt+Q",
  SKEWB: "Alt+S",
  CLOCK: "Alt+C",
  "333OH": "Alt+O",
  MEGAMINX: "Alt+M",
  PYRAMINX: "Alt+P",
  "333BLD": "Alt+B",
};

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

export const defaultSettings = {
  primaryColor: "#0E171D",
  secondaryColor: "#ffffff",
  timerInput: "Keyboard",

  horizontalTimeList: true,
  horizontalTimeListScroll: false,
  horizontalTimeListCols: "auto",

  disableKeypad: false,
  timeColorMode: "index",
  sharedTimeColorMode: "profile",

  eventKeyBindings: defaultEventBindings,

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

  return {
    ...defaultSettings,
    ...safe,
    smartCubeProvider,
    navigationArrowStyle,
    scrambleMode,
    eventKeyBindings: {
      ...defaultEventBindings,
      ...(safe.eventKeyBindings || {}),
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
    document.documentElement.style.setProperty(
      "--primary-color",
      settings.primaryColor || defaultSettings.primaryColor
    );
    document.documentElement.style.setProperty(
      "--secondary-color",
      settings.secondaryColor || defaultSettings.secondaryColor
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
