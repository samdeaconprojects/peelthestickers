export const DEFAULT_TAG_CONFIG = {
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

export const SHARED_TAG_FIELDS = ["CubeModel", "CrossColor", "Custom1", "Custom2", "Custom3", "Custom4", "Custom5"];

export function normalizeTagConfig(input) {
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
          : DEFAULT_TAG_CONFIG.Fixed.CrossColor.options,
      },
      TimerInput: {
        label: fixed?.TimerInput?.label || "Timer Input",
        options: Array.isArray(fixed?.TimerInput?.options)
          ? fixed.TimerInput.options
          : DEFAULT_TAG_CONFIG.Fixed.TimerInput.options,
      },
      SolveSource: {
        label: fixed?.SolveSource?.label || "Solve Source",
        options: Array.isArray(fixed?.SolveSource?.options)
          ? fixed.SolveSource.options
          : DEFAULT_TAG_CONFIG.Fixed.SolveSource.options,
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

export function makeEmptyTagSelection() {
  return {
    CubeModel: "",
    CrossColor: "",
    Custom1: "",
    Custom2: "",
    Custom3: "",
    Custom4: "",
    Custom5: "",
  };
}

export function sanitizeTagSelection(selection) {
  const next = makeEmptyTagSelection();
  for (const field of SHARED_TAG_FIELDS) {
    next[field] = String(selection?.[field] || "").trim();
  }
  return next;
}

export function hasActiveTagSelection(selection) {
  return SHARED_TAG_FIELDS.some((field) => !!String(selection?.[field] || "").trim());
}

export function getSolveTagValue(solve, field) {
  const tags = solve?.tags || solve?.Tags || {};
  return String(tags?.[field] || "").trim();
}

export function solveMatchesTagSelection(solve, selection) {
  const safeSelection = sanitizeTagSelection(selection);
  return SHARED_TAG_FIELDS.every((field) => {
    const expected = safeSelection[field];
    if (!expected) return true;
    return getSolveTagValue(solve, field) === expected;
  });
}

export function summarizeTagSelection(selection, tagConfig) {
  const safeSelection = sanitizeTagSelection(selection);
  const labelByField = getSharedTagLabels(tagConfig);

  const parts = SHARED_TAG_FIELDS
    .map((field) => {
      const value = safeSelection[field];
      if (!value) return "";
      return `${labelByField[field] || field}: ${value}`;
    })
    .filter(Boolean);

  return parts.length ? parts.join(" • ") : "All shared tags";
}

export function getSharedTagLabels(tagConfig) {
  const cfg = normalizeTagConfig(tagConfig);
  const labelByField = {
    CubeModel: cfg.Fixed.CubeModel.label || "Cube Model",
    CrossColor: cfg.Fixed.CrossColor.label || "Cross Color",
  };

  for (const slot of cfg.CustomSlots || []) {
    labelByField[slot.slot] = slot.label || slot.slot;
  }

  return labelByField;
}

export function getSharedTagFieldMeta(tagConfig) {
  const cfg = normalizeTagConfig(tagConfig);
  return [
    {
      field: "CubeModel",
      label: cfg.Fixed.CubeModel.label || "Cube Model",
      options: cfg.Fixed.CubeModel.options || [],
    },
    {
      field: "CrossColor",
      label: cfg.Fixed.CrossColor.label || "Cross Color",
      options: cfg.Fixed.CrossColor.options || [],
    },
    ...(cfg.CustomSlots || []).map((slot, index) => ({
      field: slot.slot,
      label: slot.label || `Custom ${index + 1}`,
      options: slot.options || [],
    })),
  ];
}

export function collectTagSelectionOptions(solves, tagConfig, cubeModelOptions = []) {
  const cfg = normalizeTagConfig(tagConfig);
  const valuesByField = {
    CubeModel: new Set([
      ...cfg.Fixed.CubeModel.options,
      ...(Array.isArray(cubeModelOptions) ? cubeModelOptions : []),
    ]),
    CrossColor: new Set(cfg.Fixed.CrossColor.options || []),
    Custom1: new Set(cfg.CustomSlots?.[0]?.options || []),
    Custom2: new Set(cfg.CustomSlots?.[1]?.options || []),
    Custom3: new Set(cfg.CustomSlots?.[2]?.options || []),
    Custom4: new Set(cfg.CustomSlots?.[3]?.options || []),
    Custom5: new Set(cfg.CustomSlots?.[4]?.options || []),
  };

  for (const solve of Array.isArray(solves) ? solves : []) {
    for (const field of SHARED_TAG_FIELDS) {
      const value = getSolveTagValue(solve, field);
      if (value) valuesByField[field].add(value);
    }
  }

  return Object.fromEntries(
    Object.entries(valuesByField).map(([field, values]) => [
      field,
      Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    ])
  );
}
