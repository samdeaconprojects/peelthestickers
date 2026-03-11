import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TagBar.css";

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
      options: ["Normal", "Practice", "Shared", "Relay", "Import", "SmartCube"],
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
          : ["Normal", "Practice", "Shared", "Relay", "Import", "SmartCube"],
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

export default function TagBar({ tags, onChange, tagConfig }) {
  const wrapRef = useRef(null);
  const safeTags = tags || {};
  const cfg = useMemo(() => normalizeTagConfig(tagConfig || DEFAULT_TAG_CONFIG), [tagConfig]);

  const [editingField, setEditingField] = useState(null);

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) {
        setEditingField(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const setField = (field, value) => {
    const v = String(value || "").trim();
    const next = { ...(safeTags || {}) };
    if (!v) delete next[field];
    else next[field] = v;
    onChange?.(next);
  };

  const pill = (label, field, options = []) => {
    const value = safeTags?.[field] || "";
    const text = value || label;
    const hasOptions = Array.isArray(options) && options.length > 0;

    return (
      <div className="tagPillWrap" key={field}>
        {editingField === field ? (
          hasOptions ? (
            <select
              className="tagPillInput"
              autoFocus
              value={value}
              onChange={(e) => setField(field, e.target.value)}
              onBlur={() => setEditingField(null)}
            >
              <option value="">{label}</option>
              {options.map((opt) => (
                <option key={`${field}-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
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
          )
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

  return (
    <div className="tagBarWrap" ref={wrapRef}>
      {pill(cfg.Fixed.CubeModel.label, "CubeModel", cfg.Fixed.CubeModel.options)}
      {pill(cfg.Fixed.CrossColor.label, "CrossColor", cfg.Fixed.CrossColor.options)}
      {pill(cfg.Fixed.TimerInput.label, "TimerInput", cfg.Fixed.TimerInput.options)}
      {pill(cfg.Fixed.SolveSource.label, "SolveSource", cfg.Fixed.SolveSource.options)}

      {cfg.CustomSlots.map((slot) =>
        pill(slot.label || slot.slot, slot.slot, Array.isArray(slot.options) ? slot.options : [])
      )}
    </div>
  );
}