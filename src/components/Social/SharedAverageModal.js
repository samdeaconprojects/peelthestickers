// src/components/Social/SharedAverageModal.js
import React, { useEffect, useState } from "react";
import "./SharedAverageModal.css";

const EVENT_OPTIONS = [
  { value: "222", label: "2x2" },
  { value: "333", label: "3x3" },
  { value: "444", label: "4x4" },
  { value: "555", label: "5x5" },
  { value: "666", label: "6x6" },
  { value: "777", label: "7x7" },
  { value: "333OH", label: "3x3 One-Handed" },
  { value: "333BLD", label: "3x3 Blindfolded" },
  { value: "SKEWB", label: "Skewb" },
  { value: "PYRAMINX", label: "Pyraminx" },
  { value: "MEGAMINX", label: "Megaminx" },
  { value: "CLOCK", label: "Clock" },
  { value: "SQ1", label: "Square-1" },
];

const COUNT_OPTIONS = [1, 2, 3, 5, 12, 50, 100];

const createEventRow = (event = "333") => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  event,
  count: 1,
});

function EventSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {EVENT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EventRows({ label, rows, onChange, onAdd, onRemove }) {
  return (
    <div className="sharedAveragePlan">
      <div className="sharedAveragePlanHeader">
        <span>{label}</span>
        <button type="button" className="sharedAverageAddRow" onClick={onAdd}>
          Add Event
        </button>
      </div>

      <div className="sharedAveragePlanRows">
        {rows.map((row, index) => (
          <div key={row.id} className="sharedAveragePlanRow">
            <EventSelect
              value={row.event}
              onChange={(nextEvent) =>
                onChange(row.id, {
                  ...row,
                  event: nextEvent,
                })
              }
            />

            <select
              value={row.count}
              onChange={(e) =>
                onChange(row.id, {
                  ...row,
                  count: Number(e.target.value),
                })
              }
            >
              {COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}x
                </option>
              ))}
            </select>

            <button
              type="button"
              className="sharedAverageRemoveRow"
              onClick={() => onRemove(row.id)}
              disabled={rows.length === 1 && index === 0}
              aria-label={`Remove ${label} event`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SharedAverageModal({
  isOpen,
  onClose,
  onConfirm,
  defaultEvent = "333",
  yourDefaultEvent = "333",
  theirDefaultEvent = "333",
  isTwoPerson = false,
  yourLabel = "You",
  theirLabel = "Them",
}) {
  const [mode, setMode] = useState("shared");
  const [sharedEvent, setSharedEvent] = useState(defaultEvent);
  const [count, setCount] = useState(5);
  const [yourRows, setYourRows] = useState([createEventRow(yourDefaultEvent)]);
  const [theirRows, setTheirRows] = useState([createEventRow(theirDefaultEvent)]);

  useEffect(() => {
    if (!isOpen) return;
    setMode("shared");
    setSharedEvent(defaultEvent || "333");
    setCount(5);
    setYourRows([createEventRow(yourDefaultEvent || defaultEvent || "333")]);
    setTheirRows([createEventRow(theirDefaultEvent || defaultEvent || "333")]);
  }, [defaultEvent, isOpen, theirDefaultEvent, yourDefaultEvent]);

  if (!isOpen) return null;

  const updateRowSet = (setter) => (rowID, nextRow) => {
    setter((prev) => prev.map((row) => (row.id === rowID ? nextRow : row)));
  };

  const removeRow = (setter) => (rowID) => {
    setter((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== rowID) : prev));
  };

  const addRow = (setter, fallbackEvent) => () => {
    setter((prev) => [...prev, createEventRow(fallbackEvent || "333")]);
  };

  const handleConfirm = () => {
    if (mode === "separate" && isTwoPerson) {
      onConfirm({
        mode,
        creatorPlan: yourRows.map((row) => ({
          event: row.event,
          count: Number(row.count) || 1,
        })),
        opponentPlan: theirRows.map((row) => ({
          event: row.event,
          count: Number(row.count) || 1,
        })),
      });
      onClose();
      return;
    }

    onConfirm({
      mode: "shared",
      count,
      creatorEvent: sharedEvent,
      opponentEvent: sharedEvent,
    });
    onClose();
  };

  return (
    <div className="sharedAverageOverlay">
      <div className="sharedAverageModal">
        <h2>Start Shared Average</h2>

        {isTwoPerson && (
          <div className="sharedAverageModeToggle" role="tablist" aria-label="Average mode">
            <button
              type="button"
              className={mode === "shared" ? "isActive" : ""}
              onClick={() => setMode("shared")}
            >
              Same Event
            </button>
            <button
              type="button"
              className={mode === "separate" ? "isActive" : ""}
              onClick={() => setMode("separate")}
            >
              Separate Events
            </button>
          </div>
        )}

        {mode === "separate" && isTwoPerson ? (
          <div className="sharedAverageSplitGrid">
            <EventRows
              label={yourLabel}
              rows={yourRows}
              onChange={updateRowSet(setYourRows)}
              onAdd={addRow(setYourRows, yourDefaultEvent || defaultEvent)}
              onRemove={removeRow(setYourRows)}
            />
            <EventRows
              label={theirLabel}
              rows={theirRows}
              onChange={updateRowSet(setTheirRows)}
              onAdd={addRow(setTheirRows, theirDefaultEvent || defaultEvent)}
              onRemove={removeRow(setTheirRows)}
            />
          </div>
        ) : (
          <>
            <label>
              Event
              <EventSelect value={sharedEvent} onChange={setSharedEvent} />
            </label>

            <label>
              Count
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={12}>12</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </>
        )}

        <div className="sharedAverageButtons">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={handleConfirm}>Start</button>
        </div>
      </div>
    </div>
  );
}

export default SharedAverageModal;
