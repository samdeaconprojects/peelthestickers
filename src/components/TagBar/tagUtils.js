const OLL_CASE_OPTIONS = [
  "Skip",
  ...Array.from({ length: 57 }, (_, index) => `OLL #${index + 1}`),
];

const PLL_CASE_OPTIONS = [
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
];

export const DEFAULT_TAG_CONFIG = {
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
      options: OLL_CASE_OPTIONS,
    },
    Alg_PLL: {
      label: "PLL",
      options: PLL_CASE_OPTIONS,
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
  "Method",
  "Alg_PLL",
  "Alg_OLL",
  "Alg_CMLL",
  "Alg_CLL",
  "TimerInput",
  "SolveSource",
  "Custom1",
  "Custom2",
  "Custom3",
  "Custom4",
  "Custom5",
];

const METHOD_SCOPED_TAG_RULES = {
  Alg_PLL: { methods: ["CFOP"], eventScopes: ["333"] },
  Alg_OLL: { methods: ["CFOP"], eventScopes: ["333"] },
  Alg_CMLL: { methods: ["Roux"], eventScopes: ["333"] },
  Alg_CLL: { methods: [], eventScopes: ["222"] },
};

const PLL_CASE_ALIASES = Object.fromEntries(
  PLL_CASE_OPTIONS.flatMap((label) => {
    if (label === "Skip") return [["skip", "Skip"]];
    const base = label.replace(/\s+perm$/i, "");
    const normalizedBase = base.toLowerCase();
    return [
      [normalizedBase, label],
      [`${normalizedBase}perm`, label],
      [`${normalizedBase} permutation`, label],
      [`${normalizedBase} pll`, label],
      [`${normalizedBase}permpll`, label],
    ];
  })
);

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

export function getEventScopedAlgorithmFields(eventKey) {
  const scopeEvent = getTagScopeEventKey(eventKey);
  return Object.entries(METHOD_SCOPED_TAG_RULES)
    .filter(([, rule]) =>
      !Array.isArray(rule?.eventScopes) || rule.eventScopes.length === 0
        ? true
        : rule.eventScopes.includes(scopeEvent)
    )
    .map(([field]) => field);
}

export function normalizeAlgorithmTagValue(field, value) {
  const key = String(field || "").trim();
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^skip$/i.test(raw)) return "Skip";

  if (key === "Alg_OLL") {
    const match = raw.match(/^oll\s*#?\s*(\d{1,2})$/i);
    if (match) {
      const num = Number(match[1]);
      if (Number.isInteger(num) && num >= 1 && num <= 57) return `OLL #${num}`;
    }
  }

  if (key === "Alg_PLL") {
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
    return PLL_CASE_ALIASES[normalized] || raw;
  }

  return raw;
}

export function getAlgorithmTagDisplayValue(field, value) {
  const key = String(field || "").trim();
  const canonical = normalizeAlgorithmTagValue(key, value);
  if (!canonical) return "";

  if (key === "Alg_PLL") {
    if (canonical === "Skip") return canonical;
    return canonical.replace(/\s+Perm$/i, "");
  }

  if (key === "Alg_OLL") {
    if (canonical === "Skip") return canonical;
    const match = canonical.match(/^OLL\s+#(\d{1,2})$/i);
    if (match) return match[1];
  }

  return canonical;
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

export function getCubeModelOptionsForEvent(tagConfig, eventKey) {
  const cfg = normalizeTagConfig(tagConfig);
  const scopedKeys = getTagScopeEventCandidates(eventKey);
  const byEvent =
    cfg?.Fixed?.CubeModel?.optionsByEvent &&
    typeof cfg.Fixed.CubeModel.optionsByEvent === "object"
      ? cfg.Fixed.CubeModel.optionsByEvent
      : null;

  if (!byEvent) {
    return Array.isArray(cfg?.Fixed?.CubeModel?.options)
      ? cfg.Fixed.CubeModel.options
      : [];
  }

  const scopedOptions = Array.from(
    new Set(
      scopedKeys.flatMap((key) =>
        Array.isArray(byEvent?.[key]) ? byEvent[key] : []
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  if (scopedOptions.length > 0) return scopedOptions;

  return Array.isArray(cfg?.Fixed?.CubeModel?.options)
    ? cfg.Fixed.CubeModel.options
    : [];
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
        optionsByEvent:
          fixed?.CubeModel?.optionsByEvent &&
          typeof fixed.CubeModel.optionsByEvent === "object"
            ? Object.fromEntries(
                Object.entries(fixed.CubeModel.optionsByEvent).map(([eventKey, values]) => [
                  String(eventKey || "").trim().toUpperCase(),
                  Array.from(
                    new Set(
                      (Array.isArray(values) ? values : [])
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                    )
                  ).sort((a, b) => a.localeCompare(b)),
                ])
              )
            : {},
      },
      CrossColor: {
        label: fixed?.CrossColor?.label || "Start Color",
        options: Array.isArray(fixed?.CrossColor?.options)
          ? fixed.CrossColor.options
          : DEFAULT_TAG_CONFIG.Fixed.CrossColor.options,
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
    Method: "",
    Alg_OLL: "",
    Alg_PLL: "",
    Alg_CMLL: "",
    Alg_CLL: "",
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
  return normalizeAlgorithmTagValue(field, String(tags?.[field] || "").trim());
}

export function solveMatchesTagSelection(solve, selection) {
  const safeSelection = sanitizeTagSelection(selection);
  return SHARED_TAG_FIELDS.every((field) => {
    const expected = normalizeAlgorithmTagValue(field, safeSelection[field]);
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
    CrossColor: cfg.Fixed.CrossColor.label || "Start Color",
    Method: cfg.Fixed.Method.label || "Method",
    Alg_OLL: cfg.Fixed.Alg_OLL.label || "OLL",
    Alg_PLL: cfg.Fixed.Alg_PLL.label || "PLL",
    Alg_CMLL: cfg.Fixed.Alg_CMLL.label || "CMLL",
    Alg_CLL: cfg.Fixed.Alg_CLL.label || "CLL",
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
      label: cfg.Fixed.CrossColor.label || "Start Color",
      options: cfg.Fixed.CrossColor.options || [],
    },
    {
      field: "Method",
      label: cfg.Fixed.Method.label || "Method",
      options: cfg.Fixed.Method.options || [],
    },
    {
      field: "Alg_PLL",
      label: cfg.Fixed.Alg_PLL.label || "PLL",
      options: cfg.Fixed.Alg_PLL.options || [],
    },
    {
      field: "Alg_OLL",
      label: cfg.Fixed.Alg_OLL.label || "OLL",
      options: cfg.Fixed.Alg_OLL.options || [],
    },
    {
      field: "Alg_CMLL",
      label: cfg.Fixed.Alg_CMLL.label || "CMLL",
      options: cfg.Fixed.Alg_CMLL.options || [],
    },
    {
      field: "Alg_CLL",
      label: cfg.Fixed.Alg_CLL.label || "CLL",
      options: cfg.Fixed.Alg_CLL.options || [],
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

export function isMethodScopedTagFieldVisible(field, selection = {}, eventKey = "") {
  const key = String(field || "").trim();
  const rule = METHOD_SCOPED_TAG_RULES[key];
  if (!rule) return true;

  const method = String(selection?.Method || "").trim();
  const scopeEvent = getTagScopeEventKey(eventKey);

  const methodMatches =
    !Array.isArray(rule.methods) || rule.methods.length === 0
      ? true
      : rule.methods.includes(method);
  const eventMatches =
    !Array.isArray(rule.eventScopes) || rule.eventScopes.length === 0
      ? true
      : rule.eventScopes.includes(scopeEvent);

  return methodMatches && eventMatches;
}

export function getVisibleSharedTagFields(selection = {}, eventKey = "") {
  return SHARED_TAG_FIELDS.filter((field) => {
    const currentValue = String(selection?.[field] || "").trim();
    if (currentValue) return true;
    return isMethodScopedTagFieldVisible(field, selection, eventKey);
  });
}

export function pruneHiddenMethodScopedTags(
  selection = {},
  eventKey = "",
  { keepEventScopedAlgorithms = false } = {}
) {
  const safe = sanitizeTagSelection(selection);
  const next = { ...safe };
  const allowedEventScopedAlgorithms = keepEventScopedAlgorithms
    ? new Set(getEventScopedAlgorithmFields(eventKey))
    : new Set();

  for (const field of SHARED_TAG_FIELDS) {
    if (allowedEventScopedAlgorithms.has(field)) continue;
    if (!isMethodScopedTagFieldVisible(field, safe, eventKey)) {
      next[field] = "";
    }
  }

  return next;
}

export function resolveTagChipTone(field, value, tagColors = {}, profileColor = "#2EC4B6") {
  const normalizedField = String(field || "").trim();
  const normalizedValue = String(value || "").trim();
  const colorMap =
    tagColors?.[normalizedField] && typeof tagColors[normalizedField] === "object"
      ? tagColors[normalizedField]
      : {};

  if (normalizedValue && /^#[0-9a-fA-F]{6}$/.test(String(colorMap[normalizedValue] || "").trim())) {
    return String(colorMap[normalizedValue]).trim();
  }

  if (normalizedField === "CrossColor") {
    const lowerValue = normalizedValue.toLowerCase();
    if (lowerValue === "white") return "#f4f1e8";
    if (lowerValue === "yellow") return "#f2c94c";
    if (lowerValue === "red") return "#eb5757";
    if (lowerValue === "orange") return "#f2994a";
    if (lowerValue === "blue") return "#4a90e2";
    if (lowerValue === "green") return "#27ae60";
  }

  return profileColor;
}

export function getTagChipStyle(field, value, tagColors = {}, profileColor = "#2EC4B6") {
  const tone = resolveTagChipTone(field, value, tagColors, profileColor);
  return {
    "--tag-chip-color": tone,
    "--tag-chip-border": tone,
    "--tag-chip-bg": `${tone}22`,
  };
}

export function collectTagSelectionOptions(solves, tagConfig, cubeModelOptions = []) {
  const cfg = normalizeTagConfig(tagConfig);
  const valuesByField = {
    CubeModel: new Set([
      ...cfg.Fixed.CubeModel.options,
      ...(Array.isArray(cubeModelOptions) ? cubeModelOptions : []),
    ]),
    CrossColor: new Set(cfg.Fixed.CrossColor.options || []),
    Method: new Set(cfg.Fixed.Method.options || []),
    Alg_OLL: new Set(cfg.Fixed.Alg_OLL.options || []),
    Alg_PLL: new Set(cfg.Fixed.Alg_PLL.options || []),
    Alg_CMLL: new Set(cfg.Fixed.Alg_CMLL.options || []),
    Alg_CLL: new Set(cfg.Fixed.Alg_CLL.options || []),
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
