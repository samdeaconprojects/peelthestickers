import React, { useEffect, useMemo, useState } from "react";
import "./Settings.css";
import { useSettings } from "../../contexts/SettingsContext";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";
import { getSessions } from "../../services/getSessions";
import { syncWcaImport } from "../../services/syncWcaImport";
import { recomputeSessionStats } from "../../services/recomputeSessionStats";
import { recomputeEventStats } from "../../services/recomputeEventStats";
import { recomputeTagStats } from "../../services/recomputeTagStats";
import {
  HOME_STAT_COLOR_SCHEME_OPTIONS,
  getHomeStatMetricOptions,
  HOME_STAT_CHART_TYPE_OPTIONS,
  HOME_STAT_LINE_GROUP_OPTIONS,
  HOME_STAT_SLOT_META,
  HOME_STAT_SLOT_ORDER,
  normalizeHomeStatsSlots,
} from "../HomeStats/homeStatsConfig";

const WCA_IMPORT_EVENT_OPTIONS = [
  { code: "222", label: "2x2" },
  { code: "333", label: "3x3" },
  { code: "444", label: "4x4" },
  { code: "555", label: "5x5" },
  { code: "666", label: "6x6" },
  { code: "777", label: "7x7" },
  { code: "333OH", label: "3x3 OH" },
  { code: "333BLD", label: "3x3 BLD" },
  { code: "444BLD", label: "4x4 BLD" },
  { code: "555BLD", label: "5x5 BLD" },
  { code: "CLOCK", label: "Clock" },
  { code: "MEGAMINX", label: "Megaminx" },
  { code: "PYRAMINX", label: "Pyraminx" },
  { code: "SKEWB", label: "Skewb" },
  { code: "SQ1", label: "Square-1" },
];

const DEFAULT_TAG_CONFIG = {
  Fixed: {
    CubeModel: { label: "Cube Model", options: [] },
    CrossColor: {
      label: "Cross Color",
      options: ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
    },
    TimerInput: {
      label: "Timer Input",
      options: ["Keyboard", "Type", "Stackmat", "GAN Bluetooth", "GAN Cube"],
    },
    SolveSource: {
      label: "Solve Source",
      options: ["Standard", "Practice", "Shared", "Relay", "Import", "SmartCube", "WCA"],
    },
  },
  CustomSlots: [
    { slot: "Custom1", label: "", options: [] },
    { slot: "Custom2", label: "", options: [] },
    { slot: "Custom3", label: "", options: [] },
    { slot: "Custom4", label: "", options: [] },
    { slot: "Custom5", label: "", options: [] },
  ],
};

const RECOMPUTE_SCOPE_OPTIONS = [
  { value: "session", label: "Session" },
  { value: "event", label: "All Sessions In Event" },
  { value: "tag", label: "Tag Scope" },
];

const TAG_KEY_OPTIONS = [
  { value: "SolveSource", label: "Solve Source" },
  { value: "CubeModel", label: "Cube Model" },
  { value: "CrossColor", label: "Cross Color" },
  { value: "TimerInput", label: "Timer Input" },
  { value: "Custom1", label: "Custom 1" },
  { value: "Custom2", label: "Custom 2" },
  { value: "Custom3", label: "Custom 3" },
  { value: "Custom4", label: "Custom 4" },
  { value: "Custom5", label: "Custom 5" },
];

function cleanArrayInput(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTagConfig(input) {
  const cfg = input && typeof input === "object" ? input : {};
  const fixed = cfg.Fixed || {};
  const customSlots = Array.isArray(cfg.CustomSlots) ? cfg.CustomSlots : [];

  return {
    Fixed: {
      CubeModel: {
        label: fixed?.CubeModel?.label || "Cube Model",
        options: Array.isArray(fixed?.CubeModel?.options) ? fixed.CubeModel.options : [],
      },
      CrossColor: {
        label: fixed?.CrossColor?.label || "Cross Color",
        options: Array.isArray(fixed?.CrossColor?.options)
          ? fixed.CrossColor.options
          : ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
      },
      TimerInput: {
        label: fixed?.TimerInput?.label || "Timer Input",
        options: Array.isArray(fixed?.TimerInput?.options)
          ? fixed.TimerInput.options
          : ["Keyboard", "Type", "Stackmat", "GAN Bluetooth", "GAN Cube"],
      },
      SolveSource: {
        label: fixed?.SolveSource?.label || "Solve Source",
        options: Array.isArray(fixed?.SolveSource?.options)
          ? fixed.SolveSource.options
          : ["Standard", "Practice", "Shared", "Relay", "Import", "SmartCube", "WCA"],
      },
    },
    CustomSlots: Array.from({ length: 5 }, (_, i) => {
      const existing = customSlots[i] || {};
      return {
        slot: `Custom${i + 1}`,
        label: existing?.label || "",
        options: Array.isArray(existing?.options) ? existing.options : [],
      };
    }),
  };
}

function Settings({
  userID,
  onClose,
  onProfileUpdate,
  onSignOut,
  statsContext = null,
  onStatsRecompute,
  onStatsImport,
  onSessionsRefresh,
}) {
  const { settings, updateSettings, setAllSettings } = useSettings();
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingWca, setIsSyncingWca] = useState(false);
  const [wcaSyncSummary, setWcaSyncSummary] = useState("");
  const [sessionItems, setSessionItems] = useState([]);
  const [recomputeScope, setRecomputeScope] = useState("session");
  const [recomputeEvent, setRecomputeEvent] = useState("");
  const [recomputeSessionID, setRecomputeSessionID] = useState("main");
  const [recomputeTagKey, setRecomputeTagKey] = useState("SolveSource");
  const [recomputeTagValue, setRecomputeTagValue] = useState("WCA");
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState("");

  const [profileData, setProfileData] = useState({
    Name: "",
    Color: "#0E171D",
    ProfileEvent: "",
    ProfileScramble: "",
    ChosenStats: [],
    DateFounded: "",
    CubeCollection: [],
    WCAID: "",
  });

  const [tagConfig, setTagConfig] = useState(DEFAULT_TAG_CONFIG);

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      if (!userID) return;

      try {
        const user = await getUser(userID);
        if (cancelled || !user) return;

        if (user?.Settings && typeof user.Settings === "object") {
          setAllSettings(user.Settings);
        }

        const sessions = await getSessions(userID);
        if (!cancelled) setSessionItems(Array.isArray(sessions) ? sessions : []);

        setProfileData({
          Name: user?.Name || "",
          Color: user?.Color || "#0E171D",
          ProfileEvent: user?.ProfileEvent || "",
          ProfileScramble: user?.ProfileScramble || "",
          ChosenStats: Array.isArray(user?.ChosenStats) ? user.ChosenStats : [],
          DateFounded: user?.DateFounded || "",
          CubeCollection: Array.isArray(user?.CubeCollection) ? user.CubeCollection : [],
          WCAID: user?.WCAID || "",
        });

        setTagConfig(normalizeTagConfig(user?.TagConfig));
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [userID, setAllSettings]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleProfileChange = (key, value) => {
    setProfileData((prev) => ({ ...prev, [key]: value }));
  };

  const handleCommaListChange = (key, value) => {
    handleProfileChange(key, cleanArrayInput(value));
  };

  const handleFixedOptionsChange = (field, value) => {
    const arr = cleanArrayInput(value);

    setTagConfig((prev) => ({
      ...prev,
      Fixed: {
        ...prev.Fixed,
        [field]: {
          ...(prev.Fixed?.[field] || {}),
          options: arr,
        },
      },
    }));
  };

  const handleCustomSlotChange = (index, patch) => {
    setTagConfig((prev) => {
      const nextSlots = Array.isArray(prev.CustomSlots) ? [...prev.CustomSlots] : [];
      const current = nextSlots[index] || {
        slot: `Custom${index + 1}`,
        label: "",
        options: [],
      };

      nextSlots[index] = {
        ...current,
        ...patch,
        slot: `Custom${index + 1}`,
      };

      return {
        ...prev,
        CustomSlots: nextSlots,
      };
    });
  };

  const handleWcaSessionChange = (eventCode, sessionID) => {
    updateSettings({
      wcaImportSessionByEvent: {
        ...(settings?.wcaImportSessionByEvent || {}),
        [eventCode]: String(sessionID || "main"),
      },
    });
  };

  const persistCurrentSettings = async () => {
    const normalizedTagConfig = normalizeTagConfig(tagConfig);
    const updates = {
      ...profileData,
      Settings: { ...settings },
      TagConfig: normalizedTagConfig,
    };
    const fresh = await updateUser(userID, updates);

    setProfileData({
      Name: fresh?.Name || "",
      Color: fresh?.Color || "#0E171D",
      ProfileEvent: fresh?.ProfileEvent || "",
      ProfileScramble: fresh?.ProfileScramble || "",
      ChosenStats: Array.isArray(fresh?.ChosenStats) ? fresh.ChosenStats : [],
      DateFounded: fresh?.DateFounded || "",
      CubeCollection: Array.isArray(fresh?.CubeCollection) ? fresh.CubeCollection : [],
      WCAID: fresh?.WCAID || "",
    });

    if (fresh?.Settings && typeof fresh.Settings === "object") {
      setAllSettings(fresh.Settings);
    }

    setTagConfig(normalizeTagConfig(fresh?.TagConfig));
    onProfileUpdate?.(fresh);

    return fresh;
  };

  const saveAllChanges = async () => {
    if (!userID || isSaving) return;

    try {
      setIsSaving(true);
      await persistCurrentSettings();

      setStatusMessage("✅ Settings saved.");
      setTimeout(() => setStatusMessage(""), 2200);
    } catch (err) {
      console.error("❌ Error updating settings/profile:", err);
      setStatusMessage("❌ Failed to save settings.");
      setTimeout(() => setStatusMessage(""), 2200);
    } finally {
      setIsSaving(false);
    }
  };

  const isGanTimer = settings.timerInput === "GAN Bluetooth";
  const isGanCube = settings.timerInput === "GAN Cube";

  const customSlots = useMemo(
    () => (Array.isArray(tagConfig?.CustomSlots) ? tagConfig.CustomSlots : []),
    [tagConfig]
  );
  const homeStatSlots = useMemo(
    () => normalizeHomeStatsSlots(settings?.homeStatsSlots),
    [settings?.homeStatsSlots]
  );
  const homeStatsSolveLimit = Number(settings?.homeStatsSolveLimit ?? 50);
  const canShowStatsSection = !!statsContext?.isStatsRouteActive;
  const wcaLastSyncText = settings?.wcaImportLastSyncAt
    ? new Date(settings.wcaImportLastSyncAt).toLocaleString()
    : "Never";
  const wcaButtonLabel = settings?.wcaImportLastSyncAt ? "Refresh WCA Import" : "Connect WCA";
  const defaultWcaSolveSource = String(settings?.wcaImportSolveSource || "WCA").trim() || "WCA";

  const sessionOptionsByEvent = useMemo(() => {
    const grouped = {};

    for (const { code } of WCA_IMPORT_EVENT_OPTIONS) {
      const relevant = (sessionItems || []).filter(
        (item) => String(item?.Event || "").toUpperCase() === code
      );
      const unique = new Map();
      unique.set("main", { id: "main", label: "Main" });

      for (const item of relevant) {
        const id = String(item?.SessionID || "main");
        if (!id || unique.has(id)) continue;
        unique.set(id, {
          id,
          label: String(item?.SessionName || id),
        });
      }

      grouped[code] = Array.from(unique.values());
    }

    return grouped;
  }, [sessionItems]);

  const recomputeEventOptions = useMemo(() => {
    const labels = new Map(WCA_IMPORT_EVENT_OPTIONS.map((item) => [item.code, item.label]));
    const uniqueEvents = Array.from(
      new Set((sessionItems || []).map((item) => String(item?.Event || "").toUpperCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    return uniqueEvents.map((eventCode) => ({
      value: eventCode,
      label: labels.get(eventCode) || eventCode,
    }));
  }, [sessionItems]);

  const recomputeSessionOptions = useMemo(() => {
    if (!recomputeEvent) return [{ value: "main", label: "Main" }];
    return (sessionOptionsByEvent?.[recomputeEvent] || [{ id: "main", label: "Main" }]).map((option) => ({
      value: option.id,
      label: option.label,
    }));
  }, [recomputeEvent, sessionOptionsByEvent]);

  const recomputeTagValueOptions = useMemo(() => {
    if (recomputeTagKey === "SolveSource") {
      return tagConfig?.Fixed?.SolveSource?.options || DEFAULT_TAG_CONFIG.Fixed.SolveSource.options;
    }
    if (recomputeTagKey === "CubeModel") return tagConfig?.Fixed?.CubeModel?.options || [];
    if (recomputeTagKey === "CrossColor") {
      return tagConfig?.Fixed?.CrossColor?.options || DEFAULT_TAG_CONFIG.Fixed.CrossColor.options;
    }
    if (recomputeTagKey === "TimerInput") {
      return tagConfig?.Fixed?.TimerInput?.options || DEFAULT_TAG_CONFIG.Fixed.TimerInput.options;
    }

    const customSlot = customSlots.find((slot) => slot?.slot === recomputeTagKey);
    return Array.isArray(customSlot?.options) ? customSlot.options : [];
  }, [customSlots, recomputeTagKey, tagConfig]);

  useEffect(() => {
    if (recomputeEvent) return;
    const preferredEvent = String(statsContext?.eventCode || statsContext?.eventLabel || "").toUpperCase();
    if (preferredEvent && recomputeEventOptions.some((option) => option.value === preferredEvent)) {
      setRecomputeEvent(preferredEvent);
      return;
    }
    if (recomputeEventOptions[0]?.value) {
      setRecomputeEvent(recomputeEventOptions[0].value);
    }
  }, [recomputeEvent, recomputeEventOptions, statsContext?.eventCode, statsContext?.eventLabel]);

  useEffect(() => {
    if (!recomputeSessionOptions.some((option) => option.value === recomputeSessionID)) {
      setRecomputeSessionID(recomputeSessionOptions[0]?.value || "main");
    }
  }, [recomputeSessionID, recomputeSessionOptions]);

  useEffect(() => {
    if (!recomputeTagValueOptions.length) return;
    if (!recomputeTagValueOptions.includes(recomputeTagValue)) {
      setRecomputeTagValue(recomputeTagValueOptions[0]);
    }
  }, [recomputeTagValue, recomputeTagValueOptions]);

  const handleWcaSync = async () => {
    if (!userID || isSyncingWca) return;
    if (!String(profileData.WCAID || "").trim()) {
      setStatusMessage("❌ Add your WCA ID first.");
      setTimeout(() => setStatusMessage(""), 2200);
      return;
    }

    try {
      setIsSyncingWca(true);
      setWcaSyncSummary("");

      await persistCurrentSettings();

      const result = await syncWcaImport(userID, {
        wcaID: profileData.WCAID,
        settings: {
          ...settings,
          wcaImportSolveSource: defaultWcaSolveSource,
          wcaImportSessionByEvent: settings?.wcaImportSessionByEvent || {},
        },
      });

      if (result?.user) {
        onProfileUpdate?.(result.user);
      }

      const refreshedSessions = await getSessions(userID);
      setSessionItems(Array.isArray(refreshedSessions) ? refreshedSessions : []);
      onSessionsRefresh?.(refreshedSessions);

      const importedCount = Number(result?.importedSolveCount || 0);
      const importedEventCount = Number(result?.importedEventCount || 0);
      const skippedText = Array.isArray(result?.skippedEvents) && result.skippedEvents.length
        ? ` Skipped: ${result.skippedEvents.join(", ")}.`
        : "";

      setWcaSyncSummary(
        `Imported ${importedCount} solves across ${importedEventCount} events.${skippedText}`
      );
      setStatusMessage("✅ WCA import finished.");
      setTimeout(() => setStatusMessage(""), 2200);
    } catch (err) {
      console.error("❌ Error syncing WCA import:", err);
      setWcaSyncSummary("");
      const rawMessage = String(err?.message || "WCA import failed.");
      const friendlyMessage = rawMessage.includes("Cannot POST /api/wca/import")
        ? "Backend is missing /api/wca/import. Restart or redeploy the server."
        : rawMessage;
      setStatusMessage(`❌ ${friendlyMessage}`);
      setTimeout(() => setStatusMessage(""), 3200);
    } finally {
      setIsSyncingWca(false);
    }
  };

  const updateHomeStatSlot = (slotKey, patch) => {
    const nextSlots = {
      ...homeStatSlots,
      [slotKey]: {
        ...homeStatSlots[slotKey],
        ...patch,
      },
    };
    updateSettings({ homeStatsSlots: nextSlots });
  };

  const handleManualRecompute = async () => {
    if (!userID || !recomputeEvent || recomputeBusy) return;

    const selectedSessionLabel =
      recomputeSessionOptions.find((option) => option.value === recomputeSessionID)?.label || recomputeSessionID;
    const scopeDescription =
      recomputeScope === "session"
        ? `${recomputeEvent} · ${selectedSessionLabel}`
        : recomputeScope === "event"
        ? `${recomputeEvent} · all sessions`
        : `${recomputeEvent} · ${selectedSessionLabel} · ${recomputeTagKey}: ${recomputeTagValue}`;

    try {
      setRecomputeBusy(true);
      setRecomputeMessage(`Recomputing ${scopeDescription}...`);

      if (recomputeScope === "session") {
        await recomputeSessionStats(userID, recomputeEvent, recomputeSessionID);
      } else if (recomputeScope === "event") {
        await recomputeEventStats(userID, recomputeEvent);
      } else {
        await recomputeTagStats(userID, {
          event: recomputeEvent,
          sessionID: recomputeSessionID,
          tagKey: recomputeTagKey,
          tagValue: recomputeTagValue,
        });
      }

      setRecomputeMessage(`Recomputed ${scopeDescription}.`);
    } catch (err) {
      console.error("Manual recompute failed:", err);
      setRecomputeMessage(String(err?.message || "Recompute failed."));
    } finally {
      setRecomputeBusy(false);
    }
  };

  return (
    <div
      className="settingsPopup"
      onClick={(e) => e.target.className === "settingsPopup" && onClose()}
    >
      <div className="settingsPopupContent">
        {userID && (
          <button className="signOutButton" onClick={onSignOut}>
            Sign Out
          </button>
        )}

        <button className="closeButton" onClick={onClose}>
          ×
        </button>

        <h2>Customize Theme</h2>
        <div className="settings-container">
          <div className="setting-item">
            <label>Primary Color:</label>
            <select
              onChange={(e) => updateSettings({ primaryColor: e.target.value })}
              value={settings.primaryColor}
            >
              <option value="#0E171D">Default</option>
              <option value="#0c2b40">Medium Blue</option>
              <option value="#140D21">Purple</option>
              <option value="#000000">Black</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Secondary Color:</label>
            <select
              onChange={(e) => updateSettings({ secondaryColor: e.target.value })}
              value={settings.secondaryColor}
            >
              <option value="#ffffff">White</option>
              <option value="#000000">Black</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Timer Input:</label>
            <select
              onChange={(e) => updateSettings({ timerInput: e.target.value })}
              value={settings.timerInput}
            >
              <option value="Keyboard">Keyboard</option>
              <option value="Type">Type</option>
              <option value="Stackmat">Stackmat</option>
              <option value="GAN Bluetooth">GAN Bluetooth</option>
              <option value="GAN Cube">GAN Cube</option>
            </select>
          </div>

          {isGanCube && (
            <>
              <div className="setting-item">
                <label>Cube Auto Start</label>
                <input
                  type="checkbox"
                  checked={!!settings.cubeAutoStart}
                  onChange={(e) => updateSettings({ cubeAutoStart: e.target.checked })}
                />
              </div>

              <div className="setting-item">
                <label>Cube Auto Stop</label>
                <input
                  type="checkbox"
                  checked={!!settings.cubeAutoStop}
                  onChange={(e) => updateSettings({ cubeAutoStop: e.target.checked })}
                />
              </div>

              <div className="setting-item">
                <label>Auto Stop Idle (ms)</label>
                <input
                  value={settings.cubeStopIdleMs ?? 1200}
                  onChange={(e) =>
                    updateSettings({ cubeStopIdleMs: Number(e.target.value) || 1200 })
                  }
                />
              </div>
            </>
          )}

          <div className="setting-item">
            <label>Disable On-Screen Keypad</label>
            <input
              type="checkbox"
              checked={!!settings.disableKeypad}
              onChange={(e) => updateSettings({ disableKeypad: e.target.checked })}
            />
          </div>

          <div className="setting-item">
            <label>Time Color Mode</label>
            <select
              value={settings.timeColorMode || "binary"}
              onChange={(e) => updateSettings({ timeColorMode: e.target.value })}
            >
              <option value="binary">Binary (only best/worst)</option>
              <option value="continuous">True spectrum (by time)</option>
              <option value="bucket">Bucket spectrum (5 bands)</option>
              <option value="index">Index spectrum (evenly distributed)</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Relay Timing Mode</label>
            <select
              value={settings.relayMode || "total"}
              onChange={(e) => updateSettings({ relayMode: e.target.value })}
            >
              <option value="total">Single total time (default)</option>
              <option value="legs">Per-leg times (auto-advance)</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Strict Timer Mode</label>
            <input
              type="checkbox"
              checked={!settings.horizontalTimeList}
              onChange={(e) => updateSettings({ horizontalTimeList: !e.target.checked })}
            />
          </div>

          <div className="setting-item">
            <label>Enable Horizontal TimeList Scrolling</label>
            <input
              type="checkbox"
              checked={!!settings.horizontalTimeListScroll}
              onChange={(e) =>
                updateSettings({ horizontalTimeListScroll: e.target.checked })
              }
              disabled={!settings.horizontalTimeList}
            />
          </div>

          <div className="setting-item">
            <label>Horizontal TimeList Columns</label>
            <select
              value={settings.horizontalTimeListCols || "auto"}
              onChange={(e) => updateSettings({ horizontalTimeListCols: e.target.value })}
              disabled={!settings.horizontalTimeList}
            >
              <option value="auto">Auto (12 desktop, 5 small)</option>
              <option value="12">Force 12</option>
              <option value="5">Force 5</option>
            </select>
          </div>

          <div className="setting-item">
            <label>WCA Inspection</label>
            <input
              type="checkbox"
              checked={!!settings.inspectionEnabled}
              onChange={(e) => updateSettings({ inspectionEnabled: e.target.checked })}
              disabled={isGanTimer || isGanCube}
            />
          </div>

          <div className="setting-item">
            <label>Inspection Beeps</label>
            <input
              type="checkbox"
              checked={!!settings.inspectionBeeps}
              onChange={(e) => updateSettings({ inspectionBeeps: e.target.checked })}
              disabled={!settings.inspectionEnabled || isGanTimer || isGanCube}
            />
          </div>

          <div className="setting-item">
            <label>Fullscreen Inspection</label>
            <input
              type="checkbox"
              checked={!!settings.inspectionFullscreen}
              onChange={(e) => updateSettings({ inspectionFullscreen: e.target.checked })}
              disabled={!settings.inspectionEnabled || isGanTimer || isGanCube}
            />
          </div>

          <div className="setting-item">
            <label>Inspection Style</label>
            <select
              value={settings.inspectionCountDirection || "down"}
              onChange={(e) =>
                updateSettings({ inspectionCountDirection: e.target.value })
              }
              disabled={!settings.inspectionEnabled || isGanTimer || isGanCube}
            >
              <option value="down">Countdown (15 → 0)</option>
              <option value="up">Count up (0 → 15)</option>
            </select>
          </div>

          <h2>Home Stat Overlays</h2>
          <div className="settingsHintText settingsHintText--tight">
            These charts float on top of the home page without changing the timer or averages
            layout underneath.
          </div>

          <div className="setting-item">
            <label>Home Graph Recent Solves (0 = all)</label>
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={Number.isFinite(homeStatsSolveLimit) ? homeStatsSolveLimit : 50}
              onChange={(e) =>
                updateSettings({
                  homeStatsSolveLimit: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>

          {HOME_STAT_SLOT_ORDER.map((slotKey) => {
            const slot = homeStatSlots[slotKey];
            const meta = HOME_STAT_SLOT_META[slotKey];
            const metricOptions = getHomeStatMetricOptions(slot.chartType);

            return (
              <div className="settingsSubsection" key={slotKey}>
                <div className="settingsSubsectionTitle">{meta.label}</div>

                <div className="setting-item">
                  <label>Enabled</label>
                  <input
                    type="checkbox"
                    checked={!!slot.enabled}
                    onChange={(e) => updateHomeStatSlot(slotKey, { enabled: e.target.checked })}
                  />
                </div>

                <div className="setting-item">
                  <label>Chart Type</label>
                  <select
                    value={slot.chartType}
                    onChange={(e) => updateHomeStatSlot(slotKey, { chartType: e.target.value })}
                  >
                    {HOME_STAT_CHART_TYPE_OPTIONS.map((option) => (
                      <option key={`${slotKey}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <label>Color Scheme</label>
                  <select
                    value={slot.colorScheme || "default"}
                    onChange={(e) => updateHomeStatSlot(slotKey, { colorScheme: e.target.value })}
                  >
                    {HOME_STAT_COLOR_SCHEME_OPTIONS.map((option) => (
                      <option key={`${slotKey}-color-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {metricOptions.length > 0 && (
                  <div className="setting-item">
                    <label>{slot.chartType === "pie" ? "Breakdown" : "Metric"}</label>
                    <select
                      value={slot.chartType === "pie" ? slot.pieBreakdown : slot.lineMetric}
                      onChange={(e) =>
                        updateHomeStatSlot(
                          slotKey,
                          slot.chartType === "pie"
                            ? { pieBreakdown: e.target.value }
                            : { lineMetric: e.target.value }
                        )
                      }
                    >
                      {metricOptions.map((option) => (
                        <option key={`${slotKey}-metric-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {slot.chartType === "line" && (
                  <div className="setting-item">
                    <label>Group By</label>
                    <select
                      value={slot.lineGroupBy}
                      onChange={(e) => updateHomeStatSlot(slotKey, { lineGroupBy: e.target.value })}
                    >
                      {HOME_STAT_LINE_GROUP_OPTIONS.map((option) => (
                        <option key={`${slotKey}-group-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {slot.chartType === "percent" && (
                  <div className="setting-item">
                    <label>Threshold (s)</label>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={slot.percentThresholdSeconds}
                      onChange={(e) =>
                        updateHomeStatSlot(slotKey, {
                          percentThresholdSeconds: Number(e.target.value) || 10,
                        })
                      }
                    />
                  </div>
                )}

                <div className="setting-item">
                  <label>Width (px)</label>
                  <input
                    type="number"
                    min="120"
                    max="1200"
                    step="10"
                    value={slot.width}
                    onChange={(e) =>
                      updateHomeStatSlot(slotKey, { width: Number(e.target.value) || slot.width })
                    }
                  />
                </div>

                <div className="setting-item">
                  <label>Height (px)</label>
                  <input
                    type="number"
                    min="90"
                    max="700"
                    step="10"
                    value={slot.height}
                    onChange={(e) =>
                      updateHomeStatSlot(slotKey, { height: Number(e.target.value) || slot.height })
                    }
                  />
                </div>

                <div className="setting-item">
                  <label>Opacity</label>
                  <input
                    type="number"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={slot.opacity}
                    onChange={(e) =>
                      updateHomeStatSlot(slotKey, {
                        opacity: Math.max(0.05, Math.min(1, Number(e.target.value) || slot.opacity)),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}

          <h2>Key Bindings</h2>
          <div className="settings-container">
            {Object.entries(settings.eventKeyBindings || {}).map(([event, combo]) => (
              <div className="setting-item" key={event}>
                <label>{event}:</label>
                <input
                  value={combo}
                  onChange={(e) =>
                    updateSettings({
                      eventKeyBindings: {
                        ...(settings.eventKeyBindings || {}),
                        [event]: e.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <h2>Profile Settings</h2>
        <div className="settings-container">
          <div className="setting-item">
            <label>Name:</label>
            <input
              value={profileData.Name}
              onChange={(e) => handleProfileChange("Name", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Color:</label>
            <input
              type="color"
              value={profileData.Color}
              onChange={(e) => handleProfileChange("Color", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Profile Event:</label>
            <input
              value={profileData.ProfileEvent}
              onChange={(e) => handleProfileChange("ProfileEvent", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Profile Scramble:</label>
            <input
              value={profileData.ProfileScramble}
              onChange={(e) => handleProfileChange("ProfileScramble", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Chosen Stats:</label>
            <input
              value={profileData.ChosenStats.join(", ")}
              onChange={(e) => handleCommaListChange("ChosenStats", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Date Founded:</label>
            <input
              value={profileData.DateFounded}
              onChange={(e) => handleProfileChange("DateFounded", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>Cube Collection:</label>
            <input
              value={profileData.CubeCollection.join(", ")}
              onChange={(e) => handleCommaListChange("CubeCollection", e.target.value)}
            />
          </div>

          <div className="setting-item">
            <label>WCA ID:</label>
            <input
              value={profileData.WCAID}
              onChange={(e) => handleProfileChange("WCAID", e.target.value)}
            />
          </div>
        </div>

        <h2>WCA Import</h2>
        <div className="settings-container">
          <div className="setting-item">
            <label>Sync:</label>
            <button
              type="button"
              className="settingsActionButton"
              onClick={handleWcaSync}
              disabled={!userID || isSaving || isSyncingWca || !String(profileData.WCAID || "").trim()}
            >
              {isSyncingWca ? "Importing..." : wcaButtonLabel}
            </button>
          </div>

          <div className="setting-item">
            <label>Last Sync:</label>
            <div className="settingsStaticValue">{wcaLastSyncText}</div>
          </div>

          <div className="setting-item">
            <label>Solve Source:</label>
            <input
              type="text"
              value={defaultWcaSolveSource}
              onChange={(e) => updateSettings({ wcaImportSolveSource: e.target.value })}
              placeholder="WCA"
            />
          </div>

          {WCA_IMPORT_EVENT_OPTIONS.map(({ code, label }) => (
            <div className="setting-item" key={code}>
              <label>{label} Session:</label>
              <select
                value={settings?.wcaImportSessionByEvent?.[code] || "main"}
                onChange={(e) => handleWcaSessionChange(code, e.target.value)}
              >
                {(sessionOptionsByEvent?.[code] || [{ id: "main", label: "Main" }]).map(
                  (option) => (
                    <option key={`${code}-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </div>
          ))}

          <div className="settingsHintText">
            WCA imports use the selected session for each event and tag imported solves with
            the fixed `Solve Source` tag so you can filter them later.
          </div>

          {wcaSyncSummary ? <div className="settingsHintText">{wcaSyncSummary}</div> : null}
        </div>

        <h2>Tag Configuration</h2>
        <div className="settings-container">
          <div className="setting-item">
            <label>{tagConfig?.Fixed?.CubeModel?.label || "Cube Model"} Options:</label>
            <input
              value={(tagConfig?.Fixed?.CubeModel?.options || []).join(", ")}
              onChange={(e) => handleFixedOptionsChange("CubeModel", e.target.value)}
              placeholder="GAN 12, RS3M V5, WRM V9"
            />
          </div>

          <div className="setting-item">
            <label>{tagConfig?.Fixed?.CrossColor?.label || "Cross Color"} Options:</label>
            <input
              value={(tagConfig?.Fixed?.CrossColor?.options || []).join(", ")}
              onChange={(e) => handleFixedOptionsChange("CrossColor", e.target.value)}
              placeholder="White, Yellow, Red, Orange, Blue, Green"
            />
          </div>

          {customSlots.map((slot, index) => (
            <React.Fragment key={slot.slot}>
              <div className="setting-item">
                <label>{slot.slot} Label:</label>
                <input
                  value={slot.label || ""}
                  onChange={(e) =>
                    handleCustomSlotChange(index, { label: e.target.value })
                  }
                  placeholder={`Custom tag ${index + 1}`}
                />
              </div>

              <div className="setting-item">
                <label>{slot.slot} Options:</label>
                <input
                  value={(slot.options || []).join(", ")}
                  onChange={(e) =>
                    handleCustomSlotChange(index, {
                      options: cleanArrayInput(e.target.value),
                    })
                  }
                  placeholder="Home, Away, Comp"
                />
              </div>
            </React.Fragment>
          ))}
        </div>

        {userID && (
          <>
            <h2>Stats Recompute</h2>
            <div className="settings-container">
              <div className="setting-item">
                <label>Scope:</label>
                <select
                  value={recomputeScope}
                  onChange={(e) => setRecomputeScope(e.target.value)}
                >
                  {RECOMPUTE_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-item">
                <label>Event:</label>
                <select
                  value={recomputeEvent}
                  onChange={(e) => setRecomputeEvent(e.target.value)}
                >
                  {recomputeEventOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-item">
                <label>{recomputeScope === "event" ? "Scope View:" : "Session:"}</label>
                <select
                  value={recomputeSessionID}
                  onChange={(e) => setRecomputeSessionID(e.target.value)}
                  disabled={recomputeScope === "event"}
                >
                  {recomputeSessionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {recomputeScope === "tag" && (
                <>
                  <div className="setting-item">
                    <label>Tag Key:</label>
                    <select
                      value={recomputeTagKey}
                      onChange={(e) => setRecomputeTagKey(e.target.value)}
                    >
                      {TAG_KEY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {recomputeTagValueOptions.length > 0 ? (
                    <div className="setting-item">
                      <label>Tag Value:</label>
                      <select
                        value={recomputeTagValue}
                        onChange={(e) => setRecomputeTagValue(e.target.value)}
                      >
                        {recomputeTagValueOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="setting-item">
                      <label>Tag Value:</label>
                      <input
                        type="text"
                        value={recomputeTagValue}
                        onChange={(e) => setRecomputeTagValue(e.target.value)}
                        placeholder="WCA"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="setting-item settingsActionsRow">
                <label>Run:</label>
                <div className="settingsActionGroup">
                  <button
                    type="button"
                    className="settingsActionButton"
                    onClick={handleManualRecompute}
                    disabled={
                      !recomputeEvent ||
                      recomputeBusy ||
                      (recomputeScope === "tag" && !String(recomputeTagValue || "").trim())
                    }
                  >
                    {recomputeBusy ? "Recomputing..." : "Recompute Selected Scope"}
                  </button>

                  {canShowStatsSection ? (
                    <button
                      type="button"
                      className="settingsActionButton settingsActionButtonSecondary"
                      onClick={onStatsRecompute}
                      disabled={!statsContext?.canRecomputeOverall || statsContext?.loadingOverallStats}
                    >
                      {statsContext?.loadingOverallStats ? "Recomputing..." : "Use Current Stats Scope"}
                    </button>
                  ) : null}

                  {onStatsImport ? (
                    <button
                      type="button"
                      className="settingsActionButton settingsActionButtonSecondary"
                      onClick={onStatsImport}
                      disabled={!!statsContext?.importBusy}
                    >
                      {statsContext?.importBusy ? "Importing..." : "Open Import"}
                    </button>
                  ) : null}

                  {recomputeMessage ? (
                    <div className="settingsHelpText">{recomputeMessage}</div>
                  ) : statsContext?.recomputeStatusText ? (
                    <div className="settingsHelpText">{statsContext.recomputeStatusText}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}

        <button className="save-button" onClick={saveAllChanges} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save All"}
        </button>
      </div>

      {statusMessage && <div className="status-message">{statusMessage}</div>}
    </div>
  );
}

export default Settings;
