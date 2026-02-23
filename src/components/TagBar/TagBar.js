import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TagBar.css";

/**
 * TagBar
 * - Lives under the EventSelector (Timer page)
 * - Edits "current tags" that will be attached to NEW solves
 * - Keeps it lightweight: tags are just stored on solves (no extra queries)
 *
 * tags shape:
 * {
 *   CubeModel: "Gan V100",
 *   Lighting: "White Light",
 *   CrossColor: "Yellow Cross",
 *   Custom: { key1: "value1", ... }
 * }
 */
export default function TagBar({ tags, onChange }) {
  const safeTags = tags || {};
  const custom = safeTags.Custom || {};

  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [editingField, setEditingField] = useState(null); // "CubeModel" | "Lighting" | "CrossColor" | null

  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) {
        setAdding(false);
        setEditingField(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const setField = (field, value) => {
    const next = { ...(safeTags || {}) };
    if (!value) delete next[field];
    else next[field] = value;
    onChange?.(next);
  };

  const removeCustom = (k) => {
    const next = { ...(safeTags || {}) };
    const c = { ...(next.Custom || {}) };
    delete c[k];
    if (Object.keys(c).length === 0) delete next.Custom;
    else next.Custom = c;
    onChange?.(next);
  };

  const addCustom = () => {
    const k = String(newKey || "").trim();
    const v = String(newVal || "").trim();
    if (!k) return;

    const next = { ...(safeTags || {}) };
    const c = { ...(next.Custom || {}) };
    c[k] = v || "true";
    next.Custom = c;

    onChange?.(next);
    setNewKey("");
    setNewVal("");
    setAdding(false);
  };

  const pill = (label, field) => {
    const value = safeTags?.[field] || "";
    const text = value ? value : label;

    return (
      <div className="tagPillWrap" key={field}>
        {editingField === field ? (
          <input
            className="tagPillInput"
            autoFocus
            value={value}
            onChange={(e) => setField(field, e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingField(null);
              if (e.key === "Escape") setEditingField(null);
            }}
            placeholder={label}
          />
        ) : (
          <button
            type="button"
            className={`tagPill ${value ? "tagPill--set" : ""}`}
            onClick={() => setEditingField(field)}
            title="Click to edit"
          >
            {text}
          </button>
        )}
      </div>
    );
  };

  const customPills = useMemo(() => {
    return Object.entries(custom).map(([k, v]) => (
      <div className="tagPillWrap" key={`custom-${k}`}>
        <div className="tagPill tagPill--custom" title={`${k}=${v}`}>
          <span className="tagPillText">
            {k}{v && v !== "true" ? `: ${v}` : ""}
          </span>
          <button
            type="button"
            className="tagPillX"
            onClick={() => removeCustom(k)}
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>
    ));
  }, [custom, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tagBarWrap" ref={wrapRef}>
      {pill("Cube", "CubeModel")}
      {pill("Light", "Lighting")}
      {pill("Cross", "CrossColor")}

      {customPills}

      {adding ? (
        <div className="tagAddRow">
          <input
            className="tagAddInput"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="tag"
          />
          <input
            className="tagAddInput"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="value"
          />
          <button type="button" className="tagAddBtn" onClick={addCustom}>
            Add
          </button>
          <button
            type="button"
            className="tagAddBtn tagAddBtn--ghost"
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="tagPill tagPill--add" onClick={() => setAdding(true)}>
          + Tag
        </button>
      )}
    </div>
  );
}
