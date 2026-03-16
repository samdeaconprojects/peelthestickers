import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TagBar.css";
import tagBadge from "../../assets/Tag.svg";
import {
  DEFAULT_TAG_CONFIG,
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
}) {
  const [draftValue, setDraftValue] = useState(value || "");
  const listId = useMemo(() => `tagbar-list-${field}-${Math.random().toString(36).slice(2)}`, [field]);

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
        <span className={`tagEditorFieldValue ${value ? "is-set" : ""}`}>{value || "Any"}</span>
      </button>

      {isActive && (
        <div className="tagEditorPanel">
          <div className="tagEditorOptions">
            <button
              type="button"
              className={`tagEditorOption ${!value ? "is-active" : ""}`}
              onClick={() => onSelectValue("")}
            >
              Any
            </button>
            {options.map((option) => (
              <button
                key={`${field}-${option}`}
                type="button"
                className={`tagEditorOption ${value === option ? "is-active" : ""}`}
                onClick={() => onSelectValue(option)}
              >
                {option}
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
        </div>
      )}
    </div>
  );
}

export default function TagBar({
  tags,
  onChange,
  tagConfig,
  cubeModelOptions = [],
  discoveredOptions = {},
  variant = "compact",
  allowAdditions = false,
}) {
  const wrapRef = useRef(null);
  const safeTags = useMemo(() => sanitizeTagSelection(tags || makeEmptyTagSelection()), [tags]);
  const cfg = useMemo(() => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG), [tagConfig]);
  const fieldMeta = useMemo(() => getSharedTagFieldMeta(cfg), [cfg]);
  const [activeField, setActiveField] = useState("CubeModel");
  const [homeEditorOpen, setHomeEditorOpen] = useState(false);

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
      const discovered = Array.isArray(discoveredOptions?.[item.field]) ? discoveredOptions[item.field] : [];
      const fromCubeHistory =
        item.field === "CubeModel" && Array.isArray(cubeModelOptions) ? cubeModelOptions : [];
      acc[item.field] = Array.from(
        new Set([...(item.options || []), ...discovered, ...fromCubeHistory, safeTags[item.field] || ""].filter(Boolean))
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

  const visibleHomeFields = fieldMeta.filter((item) => {
    if (item.field === "CubeModel" || item.field === "CrossColor") return true;
    return !!String(safeTags[item.field] || "").trim();
  });

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
              <button
                key={item.field}
                type="button"
                className={`tagHomeChip ${value ? "is-set" : ""}`}
                onClick={() => {
                  setActiveField(item.field);
                  setHomeEditorOpen(true);
                }}
              >
                <span className="tagHomeChipIconWrap" aria-hidden="true">
                  <img src={tagBadge} alt="" className="tagHomeChipIcon" />
                </span>
                <span className="tagHomeChipText">
                  <span className="tagHomeChipLabel">{item.label}</span>
                  <span className="tagHomeChipValue">{value || "Any"}</span>
                </span>
              </button>
            );
          })}

          {visibleHomeFields.length < fieldMeta.length && (
            <button
              type="button"
              className="tagHomeChip tagHomeChip--add"
              onClick={() => {
                const nextField = fieldMeta.find((item) => !String(safeTags[item.field] || "").trim());
                setActiveField(nextField?.field || "CubeModel");
                setHomeEditorOpen(true);
              }}
            >
              <span className="tagHomeChipPlus" aria-hidden="true">
                +
              </span>
              <span className="tagHomeChipText">
                <span className="tagHomeChipLabel">Tag</span>
                <span className="tagHomeChipValue">Add tag</span>
              </span>
            </button>
          )}
        </div>

        {homeEditorOpen && (
          <div className="tagHomePopover">
            <div className="tagHomePopoverHeader">
              <span>Tags</span>
              <button type="button" className="tagHomeClose" onClick={() => setHomeEditorOpen(false)}>
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
