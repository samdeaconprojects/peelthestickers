import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TagBar.css";
import tagBadge from "../../assets/Tag.svg";
import {
  DEFAULT_TAG_CONFIG,
  getTagChipStyle,
  getSharedTagFieldMeta,
  makeEmptyTagSelection,
  normalizeTagConfig,
  sanitizeTagSelection,
} from "./tagUtils";

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

  return (
    <div className={`tagEditorField ${isActive ? "is-active" : ""}`}>
      <button type="button" className="tagEditorFieldBtn" onClick={onActivate}>
        <span className="tagEditorFieldLabel">{label}</span>
        <span className={`tagEditorFieldValue ${value ? "is-set" : ""}`}>
          {value || `+ ${label}`}
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
                  <span className="tagHomeChipValue">{option}</span>
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
                  <option key={`${listId}-${option}`} value={option} />
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
  fields = null,
  cubeModelOptions = [],
  discoveredOptions = {},
  profileColor = "#2EC4B6",
  tagColors = {},
  onTagColorsChange = null,
  variant = "compact",
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
    if (!Array.isArray(fields) || fields.length === 0) return allFields;
    const allowed = new Set(fields.map((field) => String(field || "").trim()).filter(Boolean));
    return allFields.filter((item) => allowed.has(item.field));
  }, [cfg, fields]);

  const [uncontrolledActiveField, setUncontrolledActiveField] = useState("CubeModel");
  const [homeEditorOpen, setHomeEditorOpen] = useState(false);

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
    onChange?.({
      ...safeTags,
      [field]: String(value || "").trim(),
    });
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
    if (item.field === "CubeModel" || item.field === "CrossColor") return true;
    return !!String(safeTags[item.field] || "").trim();
  });

  const isAutomaticHomeField = (field) => field === "SolveSource" || field === "TimerInput";

  const getHomeChipStyle = (field, value) => {
    if (isAutomaticHomeField(field)) return null;
    return getTagChipStyle(field, value, safeTagColors, profileColor);
  };

  const renderEditor = () => (
    <div className={`tagEditor tagEditor--${variant === "home" ? "home" : "stats"}`}>
      {fieldMeta.map((item) => (
        <EditorField
          key={item.field}
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
      ))}
    </div>
  );

  if (variant === "home") {
    return (
      <div className="tagHomeWrap" ref={wrapRef}>
        <div className="tagHomeSummary">
          {visibleHomeFields.map((item) => {
            const value = safeTags[item.field] || "";
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
                    setActiveField(item.field);
                    setHomeEditorOpen(true);
                  }}
                >
                  <span className="tagHomeChipIconWrap" aria-hidden="true">
                    <img src={tagBadge} alt="" className="tagHomeChipIcon" />
                  </span>
                  <span className="tagHomeChipText">
                    <span className="tagHomeChipValue">{value || `+ ${item.label}`}</span>
                  </span>
                </button>
              </div>
            );
          })}

          {visibleHomeFields.length < fieldMeta.length && (
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
