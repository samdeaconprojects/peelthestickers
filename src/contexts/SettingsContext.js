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

export const defaultSettings = {
  primaryColor: "#0E171D",
  secondaryColor: "#ffffff",
  timerInput: "Keyboard",

  horizontalTimeList: true,
  horizontalTimeListScroll: false,
  horizontalTimeListCols: "auto",

  disableKeypad: false,
  timeColorMode: "index",

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
};

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

  return {
    ...defaultSettings,
    ...safe,
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
      safe.wcaImportSessionByEvent && typeof safe.wcaImportSessionByEvent === "object"
        ? safe.wcaImportSessionByEvent
        : {},
    wcaImportSolveSource:
      typeof safe.wcaImportSolveSource === "string" && safe.wcaImportSolveSource.trim()
        ? safe.wcaImportSolveSource.trim()
        : "WCA",
    wcaImportLastSyncAt:
      typeof safe.wcaImportLastSyncAt === "string" ? safe.wcaImportLastSyncAt : "",
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

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};
