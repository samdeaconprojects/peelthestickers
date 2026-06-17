import React, { useEffect, useMemo, useState } from "react";
import "./Settings.css";
import { useSettings } from "../../contexts/SettingsContext";
import { useDbStatus } from "../../contexts/DbStatusContext";
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
  HOME_STAT_SUMMARY_LAYOUT_OPTIONS,
  HOME_STAT_SUMMARY_SURFACE_OPTIONS,
  normalizeHomeStatsSlots,
} from "../HomeStats/homeStatsConfig";
import {
  getTagColorMapForEvent,
  getSharedTagFieldMeta,
  normalizeTagColorCatalog,
  SHARED_TAG_FIELDS,
} from "../TagBar/tagUtils";
import {
  EVENT_KEYBINDING_LABELS,
  PAGE_KEYBINDING_LABELS,
  SOLVE_KEYBINDING_LABELS,
  UI_KEYBINDING_LABELS,
  formatShortcutForDisplay,
  getPrimaryModifierLabel,
} from "../../utils/keybindings";

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

const SMART_CUBE_PROVIDER_OPTIONS = [
  { value: "gan", label: "GAN / GAN-Protocol" },
  { value: "gan-gen2-compatible", label: "GAN Gen2 Compatible" },
  { value: "moyu-wcu", label: "MoYu WCU" },
  { value: "auto", label: "Auto (future)" },
];

const SCRAMBLE_MODE_OPTIONS = [
  { value: "random-state", label: "Random State (default)" },
  { value: "legacy", label: "Legacy" },
];

const NAVIGATION_ARROW_STYLE_OPTIONS = [
  { value: "scramble", label: "Scramble arrows" },
  { value: "classic", label: "Classic triangles" },
];

const DEFAULT_TAG_CONFIG = {
  Fixed: {
    CubeModel: { label: "Cube Model", options: [] },
    CrossColor: {
      label: "Start Color",
      options: ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
    },
    Method: {
      label: "Method",
      options: ["CFOP", "Roux", "ZZ", "Petrus", "LBL", "Other"],
    },
    Alg_OLL: {
      label: "OLL",
      options: ["Skip", ...Array.from({ length: 57 }, (_, index) => `OLL #${index + 1}`)],
    },
    Alg_PLL: {
      label: "PLL",
      options: [
        "Skip",
        "Aa Perm",
        "Ab Perm",
        "E Perm",
        "H Perm",
        "Ua Perm",
        "Ub Perm",
        "Z Perm",
        "F Perm",
        "Ga Perm",
        "Gb Perm",
        "Gc Perm",
        "Gd Perm",
        "Ja Perm",
        "Jb Perm",
        "Na Perm",
        "Nb Perm",
        "Ra Perm",
        "Rb Perm",
        "T Perm",
        "V Perm",
        "Y Perm",
      ],
    },
    Alg_CMLL: {
      label: "CMLL",
      options: ["Skip"],
    },
    Alg_CLL: {
      label: "CLL",
      options: ["Skip"],
    },
    TimerInput: {
      label: "Timer Input",
      options: ["Keyboard", "Type", "Stackmat", "GAN Timer", "Smart Cube"],
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
  { value: "CrossColor", label: "Start Color" },
  { value: "Method", label: "Method" },
  { value: "Alg_OLL", label: "OLL" },
  { value: "Alg_PLL", label: "PLL" },
  { value: "Alg_CMLL", label: "CMLL" },
  { value: "Alg_CLL", label: "CLL" },
  { value: "TimerInput", label: "Timer Input" },
  { value: "Custom1", label: "Custom 1" },
  { value: "Custom2", label: "Custom 2" },
  { value: "Custom3", label: "Custom 3" },
  { value: "Custom4", label: "Custom 4" },
  { value: "Custom5", label: "Custom 5" },
];

const CUBE_MODEL_GROUPS = [
  { key: "222", label: "2x2", aliases: ["222"], color: "#ff8c69" },
  {
    key: "333",
    label: "3x3 Family",
    aliases: ["333", "333OH", "333BLD", "333FM", "333FT", "MBLD", "333MBLD"],
    color: "#2EC4B6",
  },
  { key: "444", label: "4x4 Family", aliases: ["444", "444BLD"], color: "#50B6FF" },
  { key: "555", label: "5x5 Family", aliases: ["555", "555BLD"], color: "#f2c94c" },
  { key: "666", label: "6x6", aliases: ["666"], color: "#f2994a" },
  { key: "777", label: "7x7", aliases: ["777"], color: "#c084fc" },
  { key: "CLOCK", label: "Clock", aliases: ["CLOCK"], color: "#7c8cff" },
  { key: "MEGAMINX", label: "Megaminx", aliases: ["MEGAMINX"], color: "#6ee7b7" },
  { key: "PYRAMINX", label: "Pyraminx", aliases: ["PYRAMINX"], color: "#fb7185" },
  { key: "SKEWB", label: "Skewb", aliases: ["SKEWB"], color: "#22d3ee" },
  { key: "SQ1", label: "Square-1", aliases: ["SQ1"], color: "#a3e635" },
  { key: "FMC", label: "Fewest Moves", aliases: ["FMC"], color: "#ffd166" },
  { key: "OTHER", label: "Other / Shared", aliases: [], color: "#9ca3af" },
];

function normalizeCrossColorLabel(label) {
  const value = String(label || "").trim();
  if (!value || value === "Cross Color") return "Start Color";
  return value;
}

function cleanArrayInput(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCubeModelGroupOptions(tagConfig, groupKey) {
  const byEvent = tagConfig?.Fixed?.CubeModel?.optionsByEvent || {};
  return Array.isArray(byEvent?.[groupKey]) ? byEvent[groupKey] : [];
}

function CubeCollectionCardEditor({
  title,
  meta,
  options = [],
  tagColors = {},
  onAddOption,
  onRemoveOption,
}) {
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    const values = cleanArrayInput(draft);
    if (!values.length) return;
    values.forEach((value) => onAddOption?.(value));
    setDraft("");
  };

  return (
    <div className="settingsCubeCollectionCard">
      <div className="settingsCubeCollectionTitleRow">
        <div className="settingsCubeCollectionTitleBlock">
          <div className="settingsCubeCollectionTitle">{title}</div>
          <div className="settingsCubeCollectionMeta">{meta}</div>
        </div>
      </div>

      <div className="settingsCubeCollectionPills">
        {options.length ? (
          options.map((option) => (
            <button
              key={`${title}-${option}`}
              type="button"
              className="settingsCubeCollectionPill"
              style={
                tagColors?.[option]
                  ? {
                      "--cube-model-pill-color": tagColors[option],
                      "--cube-model-pill-bg": `${tagColors[option]}22`,
                    }
                  : undefined
              }
              onClick={() => onRemoveOption?.(option)}
              title={`Remove ${option}`}
            >
              <span className="settingsCubeCollectionPillText">{option}</span>
              <span className="settingsCubeCollectionPillRemove" aria-hidden="true">
                x
              </span>
            </button>
          ))
        ) : (
          <div className="settingsCubeCollectionEmpty">No models added yet</div>
        )}
      </div>

      <div className="settingsCubeCollectionInputRow">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add model names"
        />
        <button
          type="button"
          className="settingsCubeCollectionAddBtn"
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
    </div>
  );
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
        optionsByEvent:
          fixed?.CubeModel?.optionsByEvent && typeof fixed.CubeModel.optionsByEvent === "object"
            ? Object.fromEntries(
                CUBE_MODEL_GROUPS.map((group) => [
                  group.key,
                  Array.isArray(fixed.CubeModel.optionsByEvent?.[group.key])
                    ? fixed.CubeModel.optionsByEvent[group.key]
                    : [],
                ])
              )
            : Object.fromEntries(CUBE_MODEL_GROUPS.map((group) => [group.key, []])),
      },
      CrossColor: {
        label: normalizeCrossColorLabel(fixed?.CrossColor?.label),
        options: Array.isArray(fixed?.CrossColor?.options)
          ? fixed.CrossColor.options
          : ["White", "Yellow", "Red", "Orange", "Blue", "Green"],
      },
      Method: {
        label: fixed?.Method?.label || "Method",
        options: Array.isArray(fixed?.Method?.options)
          ? fixed.Method.options
          : DEFAULT_TAG_CONFIG.Fixed.Method.options,
      },
      Alg_OLL: {
        label: fixed?.Alg_OLL?.label || "OLL",
        options: Array.isArray(fixed?.Alg_OLL?.options)
          ? fixed.Alg_OLL.options
          : DEFAULT_TAG_CONFIG.Fixed.Alg_OLL.options,
      },
      Alg_PLL: {
        label: fixed?.Alg_PLL?.label || "PLL",
        options: Array.isArray(fixed?.Alg_PLL?.options)
          ? fixed.Alg_PLL.options
          : DEFAULT_TAG_CONFIG.Fixed.Alg_PLL.options,
      },
      Alg_CMLL: {
        label: fixed?.Alg_CMLL?.label || "CMLL",
        options: Array.isArray(fixed?.Alg_CMLL?.options)
          ? fixed.Alg_CMLL.options
          : DEFAULT_TAG_CONFIG.Fixed.Alg_CMLL.options,
      },
      Alg_CLL: {
        label: fixed?.Alg_CLL?.label || "CLL",
        options: Array.isArray(fixed?.Alg_CLL?.options)
          ? fixed.Alg_CLL.options
          : DEFAULT_TAG_CONFIG.Fixed.Alg_CLL.options,
      },
      TimerInput: {
        label: fixed?.TimerInput?.label || "Timer Input",
        options: Array.isArray(fixed?.TimerInput?.options)
          ? fixed.TimerInput.options
          : ["Keyboard", "Type", "Stackmat", "GAN Timer", "Smart Cube"],
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

function mergeCubeModelCatalogIntoTagConfig(tagConfig, tagCatalog) {
  const normalized = normalizeTagConfig(tagConfig);
  const safeCatalog = tagCatalog && typeof tagCatalog === "object" ? tagCatalog : {};
  const byEvent = safeCatalog.ByEvent && typeof safeCatalog.ByEvent === "object" ? safeCatalog.ByEvent : {};
  const globalCubeModels = Array.isArray(safeCatalog?.Global?.CubeModel)
    ? safeCatalog.Global.CubeModel.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  const nextOptionsByEvent = Object.fromEntries(
    CUBE_MODEL_GROUPS.map((group) => {
      const scopedKeys = Array.from(new Set([group.key, ...(group.aliases || [])]));
      const merged = Array.from(
        new Set(
          [
            ...(normalized?.Fixed?.CubeModel?.optionsByEvent?.[group.key] || []),
            ...(group.key === "OTHER" ? globalCubeModels : []),
            ...scopedKeys.flatMap((eventKey) =>
              Array.isArray(byEvent?.[eventKey]?.CubeModel)
                ? byEvent[eventKey].CubeModel.map((value) => String(value || "").trim()).filter(Boolean)
                : []
            ),
          ].filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      return [group.key, merged];
    })
  );

  return {
    ...normalized,
    Fixed: {
      ...normalized.Fixed,
      CubeModel: {
        ...normalized.Fixed.CubeModel,
        options: Array.from(
          new Set(CUBE_MODEL_GROUPS.flatMap((group) => nextOptionsByEvent[group.key] || []))
        ).sort((a, b) => a.localeCompare(b)),
        optionsByEvent: nextOptionsByEvent,
      },
    },
  };
}

function normalizeSmartCubeProviderForUi(rawValue) {
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

  return "gan";
}

function normalizeScrambleModeForUi(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  return raw === "legacy" ? "legacy" : "random-state";
}

function normalizeNavigationArrowStyleForUi(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  return raw === "classic" ? "classic" : "scramble";
}

function normalizeStatsSummaryLayoutForUi(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  return raw === "row" ? "row" : "tile";
}

function normalizePlayerBarTagFieldsForUi(rawValue) {
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

function Settings({
  userID,
  onClose,
  onProfileUpdate,
  onSignOut,
  statsContext = null,
  onStatsRecompute,
  onStatsImport,
  onStatsExport,
  onSessionsRefresh,
}) {
  const { settings, updateSettings, setAllSettings } = useSettings();
  const { runDb } = useDbStatus();
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
  const [tagColorCatalog, setTagColorCatalog] = useState({ Global: {}, ByEvent: {} });
  const playerBarTagFieldMeta = useMemo(
    () => getSharedTagFieldMeta(tagConfig),
    [tagConfig]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      if (!userID) return;

      try {
        const user = await getUser(userID);
        if (cancelled || !user) return;

        if (user?.Settings && typeof user.Settings === "object") {
          const normalizedSettings = {
            ...user.Settings,
            smartCubeProvider: normalizeSmartCubeProviderForUi(
              user.Settings.smartCubeProvider
            ),
            scrambleMode: normalizeScrambleModeForUi(user.Settings.scrambleMode),
            navigationArrowStyle: normalizeNavigationArrowStyleForUi(
              user.Settings.navigationArrowStyle
            ),
            statsSummaryLayout: normalizeStatsSummaryLayoutForUi(
              user.Settings.statsSummaryLayout
            ),
            playerBarTagFields: normalizePlayerBarTagFieldsForUi(
              user.Settings.playerBarTagFields
            ),
          };
          setAllSettings(normalizedSettings);
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

        setTagConfig(mergeCubeModelCatalogIntoTagConfig(user?.TagConfig, user?.TagCatalog));
        setTagColorCatalog(normalizeTagColorCatalog(user?.TagColorCatalog));
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

  const addCubeModelToGroup = (groupKey, value) => {
    const nextValue = String(value || "").trim();
    if (!nextValue) return;

    setTagConfig((prev) => {
      const currentByGroup = Object.fromEntries(
        CUBE_MODEL_GROUPS.map((group) => [
          group.key,
          Array.isArray(prev?.Fixed?.CubeModel?.optionsByEvent?.[group.key])
            ? prev.Fixed.CubeModel.optionsByEvent[group.key]
            : [],
        ])
      );

      const nextGroupValues = Array.from(
        new Set([...(currentByGroup[groupKey] || []), nextValue])
      ).sort((a, b) => a.localeCompare(b));

      return {
        ...prev,
        Fixed: {
          ...prev.Fixed,
          CubeModel: {
            ...(prev.Fixed?.CubeModel || {}),
            options: Array.from(
              new Set(
                CUBE_MODEL_GROUPS.flatMap((group) =>
                  group.key === groupKey ? nextGroupValues : currentByGroup[group.key] || []
                )
              )
            ).sort((a, b) => a.localeCompare(b)),
            optionsByEvent: {
              ...(prev.Fixed?.CubeModel?.optionsByEvent || {}),
              [groupKey]: nextGroupValues,
            },
          },
        },
      };
    });
  };

  const removeCubeModelFromGroup = (groupKey, value) => {
    const target = String(value || "").trim();
    if (!target) return;

    setTagConfig((prev) => {
      const currentByGroup = Object.fromEntries(
        CUBE_MODEL_GROUPS.map((group) => [
          group.key,
          Array.isArray(prev?.Fixed?.CubeModel?.optionsByEvent?.[group.key])
            ? prev.Fixed.CubeModel.optionsByEvent[group.key]
            : [],
        ])
      );

      const nextGroupValues = (currentByGroup[groupKey] || []).filter((item) => item !== target);

      return {
        ...prev,
        Fixed: {
          ...prev.Fixed,
          CubeModel: {
            ...(prev.Fixed?.CubeModel || {}),
            options: Array.from(
              new Set(
                CUBE_MODEL_GROUPS.flatMap((group) =>
                  group.key === groupKey ? nextGroupValues : currentByGroup[group.key] || []
                )
              )
            ).sort((a, b) => a.localeCompare(b)),
            optionsByEvent: {
              ...(prev.Fixed?.CubeModel?.optionsByEvent || {}),
              [groupKey]: nextGroupValues,
            },
          },
        },
      };
    });
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

  const handlePlayerBarTagFieldToggle = (field, checked) => {
    const safeField = String(field || "").trim();
    if (!safeField) return;

    const current = Array.isArray(settings?.playerBarTagFields)
      ? settings.playerBarTagFields
      : ["CubeModel"];
    const next = checked
      ? Array.from(new Set([...current, safeField]))
      : current.filter((item) => item !== safeField);

    updateSettings({
      playerBarTagFields: next.length ? next : ["CubeModel"],
    });
  };

  const persistCurrentSettings = async (options = {}) => {
    const normalizedTagConfig = normalizeTagConfig(tagConfig);
    const normalizedSettingsToSave = {
      ...settings,
      smartCubeProvider: normalizeSmartCubeProviderForUi(settings.smartCubeProvider),
      scrambleMode: normalizeScrambleModeForUi(settings.scrambleMode),
      navigationArrowStyle: normalizeNavigationArrowStyleForUi(
        settings.navigationArrowStyle
      ),
      playerBarTagFields: normalizePlayerBarTagFieldsForUi(
        settings.playerBarTagFields
      ),
    };

    const updates = {
      ...profileData,
      Settings: normalizedSettingsToSave,
      TagConfig: normalizedTagConfig,
    };

    const fresh = await runDb("Saving settings", () => updateUser(userID, updates), options);

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
      const normalizedFreshSettings = {
        ...fresh.Settings,
        smartCubeProvider: normalizeSmartCubeProviderForUi(
          fresh.Settings.smartCubeProvider
        ),
        scrambleMode: normalizeScrambleModeForUi(fresh.Settings.scrambleMode),
        navigationArrowStyle: normalizeNavigationArrowStyleForUi(
          fresh.Settings.navigationArrowStyle
        ),
        playerBarTagFields: normalizePlayerBarTagFieldsForUi(
          fresh.Settings.playerBarTagFields
        ),
      };
      setAllSettings(normalizedFreshSettings);
    }

    setTagConfig(mergeCubeModelCatalogIntoTagConfig(fresh?.TagConfig, fresh?.TagCatalog));
    setTagColorCatalog(normalizeTagColorCatalog(fresh?.TagColorCatalog));
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
  const isSmartCube = settings.timerInput === "GAN Cube";
  const smartCubeProvider = normalizeSmartCubeProviderForUi(
    settings.smartCubeProvider || "gan"
  );
  const isGanCube = isSmartCube;
  const scrambleMode = normalizeScrambleModeForUi(settings.scrambleMode);
  const navigationArrowStyle = normalizeNavigationArrowStyleForUi(
    settings.navigationArrowStyle
  );

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
  const primaryModifierLabel = getPrimaryModifierLabel();

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

      await persistCurrentSettings({ showStatus: false });

      const result = await runDb("Syncing WCA import", () =>
        syncWcaImport(userID, {
          wcaID: profileData.WCAID,
          settings: {
            ...settings,
            wcaImportSolveSource: defaultWcaSolveSource,
            wcaImportSessionByEvent: settings?.wcaImportSessionByEvent || {},
          },
        })
      );

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
        await runDb("Recomputing stats", () =>
          recomputeSessionStats(userID, recomputeEvent, recomputeSessionID)
        );
      } else if (recomputeScope === "event") {
        await runDb("Recomputing stats", () =>
          recomputeEventStats(userID, recomputeEvent)
        );
      } else {
        await runDb("Recomputing stats", () =>
          recomputeTagStats(userID, {
            event: recomputeEvent,
            sessionID: recomputeSessionID,
            tagKey: recomputeTagKey,
            tagValue: recomputeTagValue,
          })
        );
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
              <option value="GAN Bluetooth">GAN Timer</option>
              <option value="GAN Cube">Smart Cube</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Scramble Type:</label>
            <select
              value={scrambleMode}
              onChange={(e) =>
                updateSettings({
                  scrambleMode: normalizeScrambleModeForUi(e.target.value),
                })
              }
            >
              {SCRAMBLE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>Navigation Arrows:</label>
            <select
              value={navigationArrowStyle}
              onChange={(e) =>
                updateSettings({
                  navigationArrowStyle: normalizeNavigationArrowStyleForUi(
                    e.target.value
                  ),
                })
              }
            >
              {NAVIGATION_ARROW_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settingsHintText settingsHintText--tight">
            Random State uses cubing.js for supported WCA events. Legacy uses your
            previous scramble generator behavior.
          </div>

          {isSmartCube && (
            <div className="setting-item">
              <label>Smart Cube Provider:</label>
              <select
                value={smartCubeProvider}
                onChange={(e) =>
                  updateSettings({
                    smartCubeProvider: normalizeSmartCubeProviderForUi(e.target.value),
                  })
                }
              >
                {SMART_CUBE_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isSmartCube && smartCubeProvider === "moyu-wcu" ? (
            <div className="settingsHintText">
              MoYu WCU uses the non-GAN Bluetooth path. If your cube still does not appear,
              save settings first, then reconnect from the timer so PTS uses the MoYu backend.
            </div>
          ) : null}

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
            <label>Show Add Solve Button</label>
            <input
              type="checkbox"
              checked={settings.showAddSolveButton !== false}
              onChange={(e) => updateSettings({ showAddSolveButton: e.target.checked })}
            />
          </div>

          <div className="setting-item">
            <label>Hide Timer Input + Solve Source On Home</label>
            <input
              type="checkbox"
              checked={!!settings.hideAutomaticHomeTags}
              onChange={(e) =>
                updateSettings({ hideAutomaticHomeTags: e.target.checked })
              }
            />
          </div>

          <div className="setting-item setting-item--stacked">
            <label>Player Bar Tags</label>
            <div className="settingsCheckboxGrid" role="group" aria-label="Player bar tags">
              {playerBarTagFieldMeta.map((item) => {
                const isChecked = (settings?.playerBarTagFields || ["CubeModel"]).includes(
                  item.field
                );
                return (
                  <label
                    key={item.field}
                    className={`settingsCheckboxChip ${isChecked ? "is-checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        handlePlayerBarTagFieldToggle(item.field, e.target.checked)
                      }
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
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
            <label>Shared Time Color Mode</label>
            <select
              value={settings.sharedTimeColorMode || "profile"}
              onChange={(e) => updateSettings({ sharedTimeColorMode: e.target.value })}
            >
              <option value="profile">Profile color (default)</option>
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
            <label>Stats Summary Layout</label>
            <select
              value={settings.statsSummaryLayout || "row"}
              onChange={(e) => updateSettings({ statsSummaryLayout: e.target.value })}
            >
              <option value="row">Row view</option>
              <option value="tile">Tile view</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Show Strict Averages</label>
            <input
              type="checkbox"
              checked={settings.showStrictAverages !== false}
              onChange={(e) => updateSettings({ showStrictAverages: e.target.checked })}
            />
          </div>

          <div className="settingsHintText settingsHintText--tight">
            Controls the Strict column on the home page averages table and the Strict values in
            overall stats summaries.
          </div>

          <div className="setting-item">
            <label>Non-Rolling Time List</label>
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
            <label>Non-Rolling Columns</label>
            <select
              value={settings.nonRollingTimeListCols || "auto"}
              onChange={(e) => updateSettings({ nonRollingTimeListCols: e.target.value })}
              disabled={!!settings.horizontalTimeList}
            >
              <option value="auto">Auto (12 desktop, 5 small)</option>
              <option value="12">Always 12</option>
              <option value="5">Always 5</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Non-Rolling Max Rows</label>
            <select
              value={String(settings.nonRollingTimeListMaxRows || 3)}
              onChange={(e) =>
                updateSettings({ nonRollingTimeListMaxRows: Number(e.target.value) })
              }
              disabled={!!settings.horizontalTimeList}
            >
              <option value="3">3 rows</option>
              <option value="2">2 rows</option>
              <option value="1">1 row</option>
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
                    onChange={(e) =>
                      updateHomeStatSlot(slotKey, {
                        chartType: e.target.value,
                        ...(e.target.value === "summary" ? { summaryColorCustomized: false } : {}),
                      })
                    }
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
                    onChange={(e) =>
                      updateHomeStatSlot(slotKey, {
                        colorScheme: e.target.value,
                        ...(slot.chartType === "summary" ? { summaryColorCustomized: true } : {}),
                      })
                    }
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

                {slot.chartType === "summary" && (
                  <>
                    <div className="setting-item">
                      <label>Summary Layout</label>
                      <select
                        value={slot.summaryLayout || "tile"}
                        onChange={(e) =>
                          updateHomeStatSlot(slotKey, { summaryLayout: e.target.value })
                        }
                      >
                        {HOME_STAT_SUMMARY_LAYOUT_OPTIONS.map((option) => (
                          <option key={`${slotKey}-summary-layout-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="setting-item">
                      <label>Show Summary Meta</label>
                      <input
                        type="checkbox"
                        checked={!!slot.summaryShowMeta}
                        onChange={(e) =>
                          updateHomeStatSlot(slotKey, { summaryShowMeta: e.target.checked })
                        }
                      />
                    </div>

                    <div className="setting-item">
                      <label>Surface Style</label>
                      <select
                        value={slot.summarySurface || "flat"}
                        onChange={(e) =>
                          updateHomeStatSlot(slotKey, { summarySurface: e.target.value })
                        }
                      >
                        {HOME_STAT_SUMMARY_SURFACE_OPTIONS.map((option) => (
                          <option key={`${slotKey}-summary-surface-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
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
            <div className="setting-item">
              <label>Primary Modifier</label>
              <div>{primaryModifierLabel} on this device</div>
            </div>
            <div className="setting-item">
              <label>Shortcut Rule</label>
              <div>
                Navigation uses <strong>{primaryModifierLabel}</strong>. Solve edits use
                <strong> Ctrl+Shift</strong>. Scramble navigation defaults to
                <strong> Option+Left/Right</strong>.
              </div>
            </div>

            {Object.entries(settings.eventKeyBindings || {}).map(([event, combo]) => (
              <div className="setting-item" key={`event-${event}`}>
                <label>{EVENT_KEYBINDING_LABELS[event] || event}</label>
                <input
                  value={combo}
                  placeholder={formatShortcutForDisplay(combo)}
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

            {Object.entries(settings.pageKeyBindings || {}).map(([page, combo]) => (
              <div className="setting-item" key={`page-${page}`}>
                <label>{PAGE_KEYBINDING_LABELS[page] || page}</label>
                <input
                  value={combo}
                  placeholder={formatShortcutForDisplay(combo)}
                  onChange={(e) =>
                    updateSettings({
                      pageKeyBindings: {
                        ...(settings.pageKeyBindings || {}),
                        [page]: e.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}

            {Object.entries(settings.uiKeyBindings || {}).map(([action, combo]) => (
              <div className="setting-item" key={`ui-${action}`}>
                <label>{UI_KEYBINDING_LABELS[action] || action}</label>
                <input
                  value={combo}
                  placeholder={formatShortcutForDisplay(combo)}
                  onChange={(e) =>
                    updateSettings({
                      uiKeyBindings: {
                        ...(settings.uiKeyBindings || {}),
                        [action]: e.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}

            {Object.entries(settings.solveKeyBindings || {}).map(([action, combo]) => (
              <div className="setting-item" key={`solve-${action}`}>
                <label>{SOLVE_KEYBINDING_LABELS[action] || action}</label>
                <input
                  value={combo}
                  placeholder={formatShortcutForDisplay(combo)}
                  onChange={(e) =>
                    updateSettings({
                      solveKeyBindings: {
                        ...(settings.solveKeyBindings || {}),
                        [action]: e.target.value,
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

        <h2>Cube Collection</h2>
        <div className="settings-container">
          <div className="settingsHintText settingsHintText--sectionStart">
            Add cube models by puzzle type. Families like `3x3`, `3x3 OH`, and `3x3 BLD` share the same model list.
          </div>

          <div className="settingsCubeCollectionGrid">
            {CUBE_MODEL_GROUPS.map((group) => (
              <CubeCollectionCardEditor
                key={group.key}
                title={group.label}
                meta={
                  group.aliases.length > 0 ? `Used by: ${group.aliases.join(", ")}` : "Shared list"
                }
                options={getCubeModelGroupOptions(tagConfig, group.key)}
                tagColors={getTagColorMapForEvent(tagColorCatalog, group.key)?.CubeModel || {}}
                onAddOption={(value) => addCubeModelToGroup(group.key, value)}
                onRemoveOption={(value) => removeCubeModelFromGroup(group.key, value)}
              />
            ))}
          </div>
        </div>

        <h2>Tag Configuration</h2>
        <div className="settings-container">

          <div className="setting-item">
            <label>{tagConfig?.Fixed?.CrossColor?.label || "Start Color"} Options:</label>
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

                  {onStatsExport ? (
                    <button
                      type="button"
                      className="settingsActionButton settingsActionButtonSecondary"
                      onClick={onStatsExport}
                      disabled={!statsContext?.canExport || !!statsContext?.exportBusy}
                    >
                      {statsContext?.exportBusy ? "Exporting..." : "Open Export"}
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
