import React, { useEffect, useMemo, useState } from "react";
import "./Settings.css";
import { useSettings } from "../../contexts/SettingsContext";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";

const DEFAULT_TAG_CONFIG = {
  Fixed: {
    CubeModel: { label: "Cube Model", options: [] },
    CrossColor: {
      label: "Cross Color",
      options: ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
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

function Settings({ userID, onClose, onProfileUpdate }) {
  const { settings, updateSettings, setAllSettings } = useSettings();
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  const saveAllChanges = async () => {
    if (!userID || isSaving) return;

    try {
      setIsSaving(true);

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

  return (
    <div
      className="settingsPopup"
      onClick={(e) => e.target.className === "settingsPopup" && onClose()}
    >
      <div className="settingsPopupContent">
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

        <button className="save-button" onClick={saveAllChanges} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save All"}
        </button>
      </div>

      {statusMessage && <div className="status-message">{statusMessage}</div>}
    </div>
  );
}

export default Settings;