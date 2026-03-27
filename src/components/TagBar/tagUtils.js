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

export const SHARED_TAG_FIELDS = [
  "CubeModel",
  "CrossColor",
  "TimerInput",
  "SolveSource",
  "Custom1",
  "Custom2",
  "Custom3",
  "Custom4",
  "Custom5",
];

const TAG_SCOPE_EVENT_ALIASES = {
  "333OH": "333",
  "333BLD": "333",
  "333FM": "333",
  "333FT": "333",
  "333MBLD": "333",
  "MBLD": "333",
  "444BLD": "444",
  "555BLD": "555",
};

function normalizeEventKey(eventKey) {
  return String(eventKey || "").trim().toUpperCase();
}

export function getTagScopeEventKey(eventKey) {
  const normalized = normalizeEventKey(eventKey);
  return TAG_SCOPE_EVENT_ALIASES[normalized] || normalized;
}

function getTagScopeEventCandidates(eventKey) {
  const normalized = normalizeEventKey(eventKey);
  const shared = getTagScopeEventKey(normalized);
  if (!normalized) return [shared].filter(Boolean);
  if (shared === normalized) return [normalized];
  return [shared, normalized];
}

export function makeEmptyTagOptionsByField() {
  return Object.fromEntries(SHARED_TAG_FIELDS.map((field) => [field, []]));
}

export function normalizeTagCatalog(input) {
  const raw = input && typeof input === "object" ? input : {};
  const globalRaw = raw.Global && typeof raw.Global === "object" ? raw.Global : {};
  const byEventRaw = raw.ByEvent && typeof raw.ByEvent === "object" ? raw.ByEvent : {};

  const normalizeFieldMap = (fieldMap) =>
    Object.fromEntries(
      SHARED_TAG_FIELDS.map((field) => [
        field,
        Array.from(
          new Set(
            (Array.isArray(fieldMap?.[field]) ? fieldMap[field] : [])
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b)),
      ])
    );

  return {
    Global: normalizeFieldMap(globalRaw),
    ByEvent: Object.fromEntries(
      Object.entries(byEventRaw).map(([eventKey, fieldMap]) => [
        String(eventKey || "").trim().toUpperCase(),
        normalizeFieldMap(fieldMap),
      ])
    ),
  };
}

export function getTagCatalogOptionsForEvent(tagCatalog, eventKey) {
  const safe = normalizeTagCatalog(tagCatalog);
  const scopedKeys = getTagScopeEventCandidates(eventKey);

  return Object.fromEntries(
    SHARED_TAG_FIELDS.map((field) => [
      field,
      Array.from(
        new Set([
          ...(Array.isArray(safe.Global?.[field]) ? safe.Global[field] : []),
          ...scopedKeys.flatMap((key) =>
            Array.isArray(safe.ByEvent?.[key]?.[field]) ? safe.ByEvent[key][field] : []
          ),
        ])
      ).sort((a, b) => a.localeCompare(b)),
    ])
  );
}

export function addTagCatalogValue(tagCatalog, eventKey, field, value) {
  const ev = getTagScopeEventKey(eventKey);
  const key = String(field || "").trim();
  const nextValue = String(value || "").trim();
  const safe = normalizeTagCatalog(tagCatalog);

  if (!ev || !SHARED_TAG_FIELDS.includes(key) || !nextValue) return safe;

  const nextEventMap = {
    ...(safe.ByEvent?.[ev] || makeEmptyTagOptionsByField()),
    [key]: Array.from(
      new Set([...(safe.ByEvent?.[ev]?.[key] || []), nextValue])
    ).sort((a, b) => a.localeCompare(b)),
  };

  return {
    Global: safe.Global,
    ByEvent: {
      ...safe.ByEvent,
      [ev]: nextEventMap,
    },
  };
}

export function makeEmptyTagColorMapByField() {
  return Object.fromEntries(SHARED_TAG_FIELDS.map((field) => [field, {}]));
}

export function normalizeTagColorCatalog(input) {
  const raw = input && typeof input === "object" ? input : {};
  const globalRaw = raw.Global && typeof raw.Global === "object" ? raw.Global : {};
  const byEventRaw = raw.ByEvent && typeof raw.ByEvent === "object" ? raw.ByEvent : {};

  const normalizeFieldMap = (fieldMap) =>
    Object.fromEntries(
      SHARED_TAG_FIELDS.map((field) => {
        const rawValueMap =
          fieldMap?.[field] && typeof fieldMap[field] === "object" ? fieldMap[field] : {};
        const normalizedEntries = Object.entries(rawValueMap)
          .map(([value, color]) => [String(value || "").trim(), String(color || "").trim()])
          .filter(
            ([value, color]) => value && /^#[0-9a-fA-F]{6}$/.test(color)
          )
          .sort((a, b) => a[0].localeCompare(b[0]));

        return [field, Object.fromEntries(normalizedEntries)];
      })
    );

  return {
    Global: normalizeFieldMap(globalRaw),
    ByEvent: Object.fromEntries(
      Object.entries(byEventRaw).map(([eventKey, fieldMap]) => [
        String(eventKey || "").trim().toUpperCase(),
        normalizeFieldMap(fieldMap),
      ])
    ),
  };
}

export function getTagColorMapForEvent(tagColorCatalog, eventKey) {
  const safe = normalizeTagColorCatalog(tagColorCatalog);
  const scopedKeys = getTagScopeEventCandidates(eventKey);

  return Object.fromEntries(
    SHARED_TAG_FIELDS.map((field) => [
      field,
      scopedKeys.reduce(
        (acc, key) => ({
          ...acc,
          ...((safe.ByEvent?.[key] || makeEmptyTagColorMapByField())?.[field] || {}),
        }),
        { ...(safe.Global?.[field] || {}) }
      ),
    ])
  );
}

export function setTagColorCatalogValue(tagColorCatalog, eventKey, field, value, color) {
  const ev = getTagScopeEventKey(eventKey);
  const key = String(field || "").trim();
  const tagValue = String(value || "").trim();
  const nextColor = String(color || "").trim();
  const safe = normalizeTagColorCatalog(tagColorCatalog);

  if (!ev || !SHARED_TAG_FIELDS.includes(key) || !tagValue || !/^#[0-9a-fA-F]{6}$/.test(nextColor)) {
    return safe;
  }

  const nextFieldMap = {
    ...((safe.ByEvent?.[ev] || makeEmptyTagColorMapByField())?.[key] || {}),
    [tagValue]: nextColor,
  };

  return {
    Global: safe.Global,
    ByEvent: {
      ...safe.ByEvent,
      [ev]: {
        ...(safe.ByEvent?.[ev] || makeEmptyTagColorMapByField()),
        [key]: nextFieldMap,
      },
    },
  };
}

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
    TimerInput: "",
    SolveSource: "",
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
    TimerInput: cfg.Fixed.TimerInput.label || "Timer Input",
    SolveSource: cfg.Fixed.SolveSource.label || "Solve Source",
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
    {
      field: "TimerInput",
      label: cfg.Fixed.TimerInput.label || "Timer Input",
      options: cfg.Fixed.TimerInput.options || [],
    },
    {
      field: "SolveSource",
      label: cfg.Fixed.SolveSource.label || "Solve Source",
      options: cfg.Fixed.SolveSource.options || [],
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
    TimerInput: new Set(cfg.Fixed.TimerInput.options || []),
    SolveSource: new Set(cfg.Fixed.SolveSource.options || []),
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
