import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TagBar.css";
import tagBadge from "../../assets/Tag.svg";
import {
  DEFAULT_TAG_CONFIG,
  getEventScopedAlgorithmFields,
  getAlgorithmTagDisplayValue,
  getTagChipStyle,
  getSharedTagFieldMeta,
  getVisibleSharedTagFields,
  makeEmptyTagSelection,
  normalizeAlgorithmTagValue,
  normalizeTagConfig,
  pruneHiddenMethodScopedTags,
  sanitizeTagSelection,
} from "./tagUtils";

const ALG_TAG_FIELDS = new Set(["Alg_OLL", "Alg_PLL", "Alg_CMLL", "Alg_CLL"]);
const ALG_TAG_FIELD_ORDER = ["Alg_PLL", "Alg_OLL", "Alg_CMLL", "Alg_CLL"];

function EditorField({
  field,
  label,
  value,
  options,
  isActive,
  onActivate,
  onSelectValue,
  allowAdditions,
  getChipStyle,
  getColorValue,
  onColorChange,
}) {
  const [draftValue, setDraftValue] = useState(value || "");
  const listId = useMemo(
    () => `tagbar-list-${field}-${Math.random().toString(36).slice(2)}`,
    [field]
  );

  useEffect(() => {
    setDraftValue(value || "");
  }, [value]);

  const handleAdd = () => {
    const next = String(draftValue || "").trim();
    if (!next) return;
    onSelectValue(next);
  };
  const displayValue =
    ALG_TAG_FIELDS.has(String(field || "").trim()) && value
      ? getAlgorithmTagDisplayValue(field, value)
      : value;

  return (
    <div className={`tagEditorField ${isActive ? "is-active" : ""}`}>
      <button type="button" className="tagEditorFieldBtn" onClick={onActivate}>
        <span className="tagEditorFieldLabel">{label}</span>
        <span className={`tagEditorFieldValue ${value ? "is-set" : ""}`}>
          {displayValue || `+ ${label}`}
        </span>
      </button>

      {isActive && (
        <div className="tagEditorPanel">
          <div className="tagEditorOptions">
            <button
              type="button"
              className={`tagEditorOption tagEditorOption--any ${!value ? "is-active" : ""}`}
              onClick={() => onSelectValue("")}
            >
              <span className="tagHomeChipIconWrap" aria-hidden="true">
                <img src={tagBadge} alt="" className="tagHomeChipIcon" />
              </span>
              <span className="tagHomeChipText">
                <span className="tagHomeChipValue">Any</span>
              </span>
            </button>

            {options.map((option) => (
              <button
                key={`${field}-${option}`}
                type="button"
                className={`tagEditorOption ${value === option ? "is-active" : ""}`}
                style={getChipStyle(field, option)}
                onClick={() => onSelectValue(option)}
              >
                <span className="tagHomeChipIconWrap" aria-hidden="true">
                  <img src={tagBadge} alt="" className="tagHomeChipIcon" />
                </span>
                <span className="tagHomeChipText">
                  <span className="tagHomeChipValue">
                    {ALG_TAG_FIELDS.has(String(field || "").trim())
                      ? getAlgorithmTagDisplayValue(field, option)
                      : option}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="tagEditorInputRow">
            <input
              className="tagEditorInput"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder={`Set ${label}`}
              list={options.length ? listId : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />

            {options.length > 0 && (
              <datalist id={listId}>
                {options.map((option) => (
                  <option
                    key={`${listId}-${option}`}
                    value={ALG_TAG_FIELDS.has(String(field || "").trim()) ? getAlgorithmTagDisplayValue(field, option) : option}
                  />
                ))}
              </datalist>
            )}

            {allowAdditions && (
              <button type="button" className="tagEditorAddBtn" onClick={handleAdd}>
                Apply
              </button>
            )}
          </div>

          {typeof onColorChange === "function" && !!String(value || "").trim() && (
            <label className="tagEditorColorRow">
              <span className="tagEditorColorLabel">Color</span>
              <input
                type="color"
                className="tagEditorColorInput"
                value={getColorValue(value) || "#2ec4b6"}
                onChange={(e) => onColorChange(value, e.target.value)}
                aria-label={`${label} ${value} color`}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default function TagBar({
  tags,
  onChange,
  tagConfig,
  eventKey = "",
  fields = null,
  cubeModelOptions = [],
  discoveredOptions = {},
  profileColor = "#2EC4B6",
  tagColors = {},
  onTagColorsChange = null,
  variant = "compact",
  algorithmGrouping = "method",
  showEventScopedAlgorithmFields = false,
  expandMethodAlgorithms = false,
  allowAdditions = false,
  activeField: controlledActiveField = null,
  onActiveFieldChange = null,
}) {
  const wrapRef = useRef(null);
  const safeTags = useMemo(
    () => sanitizeTagSelection(tags || makeEmptyTagSelection()),
    [tags]
  );
  const safeTagColors = useMemo(() => {
    const next = {};
    Object.keys(tagColors || {}).forEach((field) => {
      const valueMap = tagColors?.[field] && typeof tagColors[field] === "object" ? tagColors[field] : {};
      next[field] = Object.fromEntries(
        Object.entries(valueMap)
          .map(([value, color]) => [String(value || "").trim(), String(color || "").trim()])
          .filter(([value, color]) => value && /^#[0-9a-fA-F]{6}$/.test(color))
      );
    });
    return next;
  }, [tagColors]);
  const cfg = useMemo(
    () => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG),
    [tagConfig]
  );
  const fieldMeta = useMemo(() => {
    const allFields = getSharedTagFieldMeta(cfg);
    const visibleFields = new Set(getVisibleSharedTagFields(safeTags, eventKey));
    if (showEventScopedAlgorithmFields) {
      getEventScopedAlgorithmFields(eventKey).forEach((field) => visibleFields.add(field));
    }
    const filtered = allFields.filter((item) => visibleFields.has(item.field));
    if (!Array.isArray(fields) || fields.length === 0) return filtered;
    const allowed = new Set(fields.map((field) => String(field || "").trim()).filter(Boolean));
    return filtered.filter((item) => allowed.has(item.field));
  }, [cfg, eventKey, fields, safeTags, showEventScopedAlgorithmFields]);

  const [uncontrolledActiveField, setUncontrolledActiveField] = useState("CubeModel");
  const [homeEditorOpen, setHomeEditorOpen] = useState(false);
  const rootFieldMeta = useMemo(
    () => fieldMeta.filter((item) => !ALG_TAG_FIELDS.has(item.field)),
    [fieldMeta]
  );
  const methodScopedFieldMeta = useMemo(
    () =>
      [...fieldMeta.filter((item) => ALG_TAG_FIELDS.has(item.field))].sort(
        (a, b) => ALG_TAG_FIELD_ORDER.indexOf(a.field) - ALG_TAG_FIELD_ORDER.indexOf(b.field)
      ),
    [fieldMeta]
  );

  const activeField = controlledActiveField || uncontrolledActiveField;

  const setActiveField = (field) => {
    if (typeof onActiveFieldChange === "function") {
      onActiveFieldChange(field);
      return;
    }
    setUncontrolledActiveField(field);
  };

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current || wrapRef.current.contains(e.target)) return;
      setHomeEditorOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!fieldMeta.some((item) => item.field === activeField)) {
      setActiveField(fieldMeta[0]?.field || "CubeModel");
    }
  }, [activeField, fieldMeta]);

  const optionsByField = useMemo(() => {
    return fieldMeta.reduce((acc, item) => {
      const discovered = Array.isArray(discoveredOptions?.[item.field])
        ? discoveredOptions[item.field]
        : [];
      const fromCubeHistory =
        item.field === "CubeModel" && Array.isArray(cubeModelOptions)
          ? cubeModelOptions
          : [];

      acc[item.field] = Array.from(
        new Set(
          [
            ...(item.options || []),
            ...discovered,
            ...fromCubeHistory,
            safeTags[item.field] || "",
          ].filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      return acc;
    }, {});
  }, [cubeModelOptions, discoveredOptions, fieldMeta, safeTags]);

  const setField = (field, value) => {
    const normalizedValue = ALG_TAG_FIELDS.has(String(field || "").trim())
      ? normalizeAlgorithmTagValue(field, value)
      : String(value || "").trim();
    onChange?.(pruneHiddenMethodScopedTags({
      ...safeTags,
      [field]: normalizedValue,
    }, eventKey, {
      keepEventScopedAlgorithms: showEventScopedAlgorithmFields,
    }));
  };

  const setFieldColor = (field, tagValue, color) => {
    if (typeof onTagColorsChange !== "function") return;
    const nextValue = String(tagValue || "").trim();
    const nextColor = String(color || "").trim();
    if (!nextValue || !/^#[0-9a-fA-F]{6}$/.test(nextColor)) return;
    onTagColorsChange({
      ...safeTagColors,
      [field]: {
        ...(safeTagColors[field] || {}),
        [nextValue]: nextColor,
      },
    });
  };

  const visibleHomeFields = fieldMeta.filter((item) => {
    if (
      item.field === "CubeModel" ||
      item.field === "CrossColor" ||
      item.field === "Method"
    ) {
      return true;
    }
    const value = String(safeTags[item.field] || "").trim();
    if (String(item.field || "").startsWith("Alg_")) return !!value;
    return !!value;
  });
  const activeAlgorithmSummary = useMemo(() => {
    const parts = methodScopedFieldMeta
      .map((item) => {
        const value = String(safeTags[item.field] || "").trim();
        if (!value) return "";
        const displayValue = getAlgorithmTagDisplayValue(item.field, value);
        if (!displayValue) return "";
        return `${item.label} - ${displayValue}`;
      })
      .filter(Boolean);

    return parts.length
      ? {
          field: "__Algorithms",
          label: "Algorithms",
          value: parts.join(", "),
        }
      : null;
  }, [methodScopedFieldMeta, safeTags]);
  const homeSummaryItems = useMemo(() => {
    const nonAlgorithmFields = visibleHomeFields.filter(
      (item) => !ALG_TAG_FIELDS.has(String(item.field || "").trim())
    );

    if (!activeAlgorithmSummary) return nonAlgorithmFields;

    const methodIndex = nonAlgorithmFields.findIndex((item) => item.field === "Method");
    const next = [...nonAlgorithmFields];
    next.splice(methodIndex >= 0 ? methodIndex + 1 : next.length, 0, activeAlgorithmSummary);
    return next;
  }, [activeAlgorithmSummary, visibleHomeFields]);

  const isAutomaticHomeField = (field) => field === "SolveSource" || field === "TimerInput";

  const getHomeChipStyle = (field, value) => {
    if (isAutomaticHomeField(field)) return null;
    return getTagChipStyle(field, value, safeTagColors, profileColor);
  };

  const renderEditor = () => (
    <div className={`tagEditor tagEditor--${variant === "home" ? "home" : "stats"}`}>
      {rootFieldMeta.map((item) => (
        <React.Fragment key={item.field}>
          <EditorField
            field={item.field}
            label={item.label}
            value={safeTags[item.field] || ""}
            options={optionsByField[item.field] || []}
            isActive={activeField === item.field}
            onActivate={() => setActiveField(item.field)}
            onSelectValue={(value) => setField(item.field, value)}
            allowAdditions={allowAdditions}
            getChipStyle={getHomeChipStyle}
            getColorValue={(option) => safeTagColors?.[item.field]?.[String(option || "").trim()] || ""}
            onColorChange={(option, color) => setFieldColor(item.field, option, color)}
          />

          {item.field === "Method" &&
            algorithmGrouping === "method" &&
            methodScopedFieldMeta.length > 0 && (
            <div className="tagEditorSubgroup">
              {methodScopedFieldMeta.map((subItem) => (
                <EditorField
                  key={subItem.field}
                  field={subItem.field}
                  label={subItem.label}
                  value={safeTags[subItem.field] || ""}
                  options={optionsByField[subItem.field] || []}
                  isActive={
                    activeField === subItem.field ||
                    (expandMethodAlgorithms && activeField === "Method")
                  }
                  onActivate={() => setActiveField(expandMethodAlgorithms ? "Method" : subItem.field)}
                  onSelectValue={(value) => setField(subItem.field, value)}
                  allowAdditions={allowAdditions}
                  getChipStyle={getHomeChipStyle}
                  getColorValue={(option) =>
                    safeTagColors?.[subItem.field]?.[String(option || "").trim()] || ""
                  }
                  onColorChange={(option, color) => setFieldColor(subItem.field, option, color)}
                />
              ))}
            </div>
          )}
        </React.Fragment>
      ))}

      {algorithmGrouping === "section" && methodScopedFieldMeta.length > 0 && (
        <div className="tagEditorSubgroup tagEditorSubgroup--section">
          <div className="tagEditorSubgroupLabel">Algorithms</div>
          {methodScopedFieldMeta.map((subItem) => (
            <EditorField
              key={subItem.field}
              field={subItem.field}
              label={subItem.label}
              value={safeTags[subItem.field] || ""}
              options={optionsByField[subItem.field] || []}
              isActive={activeField === subItem.field}
              onActivate={() => setActiveField(subItem.field)}
              onSelectValue={(value) => setField(subItem.field, value)}
              allowAdditions={allowAdditions}
              getChipStyle={getHomeChipStyle}
              getColorValue={(option) =>
                safeTagColors?.[subItem.field]?.[String(option || "").trim()] || ""
              }
              onColorChange={(option, color) => setFieldColor(subItem.field, option, color)}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (variant === "home") {
    return (
      <div className="tagHomeWrap" ref={wrapRef}>
        <div className="tagHomeSummary">
          {homeSummaryItems.map((item) => {
            const isAlgorithmSummary = item.field === "__Algorithms";
            const value = isAlgorithmSummary ? item.value : safeTags[item.field] || "";
            const displayValue =
              isAlgorithmSummary
                ? value
                : ALG_TAG_FIELDS.has(String(item.field || "").trim()) && value
                ? getAlgorithmTagDisplayValue(item.field, value)
                : value;
            return (
              <div
                key={item.field}
                className={`tagHomeItem ${isAutomaticHomeField(item.field) ? "is-automatic" : ""}`}
              >
                <span className="tagHomeItemLabel">{item.label}</span>
                <button
                  type="button"
                  className={`tagHomeChip ${value ? "is-set" : ""}`}
                  style={getHomeChipStyle(item.field, value)}
                  onClick={() => {
                    setActiveField(isAlgorithmSummary ? methodScopedFieldMeta[0]?.field || "Method" : item.field);
                    setHomeEditorOpen(true);
                  }}
                >
                  <span className="tagHomeChipIconWrap" aria-hidden="true">
                    <img src={tagBadge} alt="" className="tagHomeChipIcon" />
                  </span>
                  <span className="tagHomeChipText">
                    <span className="tagHomeChipValue">{displayValue || `+ ${item.label}`}</span>
                  </span>
                </button>
              </div>
            );
          })}

          {homeSummaryItems.length < fieldMeta.length && (
            <div className="tagHomeItem tagHomeItem--add is-automatic">
              <button
                type="button"
                className="tagHomeAddButton"
                onClick={() => {
                  const nextField = fieldMeta.find(
                    (item) => !String(safeTags[item.field] || "").trim()
                  );
                  setActiveField(nextField?.field || "CubeModel");
                  setHomeEditorOpen(true);
                }}
                aria-label="Add tag"
              >
                <span className="tagHomeAddButtonPlus" aria-hidden="true">
                  +
                </span>
              </button>
            </div>
          )}
        </div>

        {homeEditorOpen && (
          <div className="tagHomePopover">
            <div className="tagHomePopoverHeader">
              <span>Tags</span>
              <button
                type="button"
                className="tagHomeClose"
                onClick={() => setHomeEditorOpen(false)}
              >
                x
              </button>
            </div>
            {renderEditor()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`tagSelectorShell tagSelectorShell--${variant}`} ref={wrapRef}>
      {renderEditor()}
    </div>
  );
}
