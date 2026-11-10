import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_EVENTS } from "../../defaultEvents";
import { currentEventToString } from "../scrambleUtils";
import { normalizeEventCode } from "./solveBulkUtils";
import "./MoveSolvesDialog.css";

// Event + session picker used by the solve and average detail pop-ups.
export default function MoveSolvesDialog({
  isOpen,
  count = 1,
  sessionsList = [],
  initialEvent = "333",
  initialSession = "main",
  busy = false,
  error = "",
  onCancel,
  onConfirm,
}) {
  const [event, setEvent] = useState(() => normalizeEventCode(initialEvent) || "333");
  const [session, setSession] = useState(() => String(initialSession || "main"));

  useEffect(() => {
    if (!isOpen) return;
    setEvent(normalizeEventCode(initialEvent) || "333");
    setSession(String(initialSession || "main"));
  }, [isOpen, initialEvent, initialSession]);

  const sessionsForEvent = useMemo(
    () => (sessionsList || []).filter((s) => normalizeEventCode(s?.Event) === event),
    [sessionsList, event]
  );

  const eventOptions = useMemo(() => {
    const ids = [];
    const seen = new Set();
    const add = (ev) => {
      const id = normalizeEventCode(ev);
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    DEFAULT_EVENTS.forEach(add);
    (sessionsList || []).forEach((s) => add(s?.Event));
    add(initialEvent);
    return ids.map((id) => ({ id, name: currentEventToString(id) || id }));
  }, [sessionsList, initialEvent]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCancel?.();
    };
    // Capture phase so the detail pop-up underneath doesn't close on the same Escape.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen, onCancel]);

  if (!isOpen || typeof document === "undefined") return null;

  const sameAsSource =
    event === (normalizeEventCode(initialEvent) || "333") &&
    String(session || "main") === String(initialSession || "main");

  const sessionName = (id) => {
    const match = sessionsForEvent.find((s) => String(s.SessionID) === String(id));
    return match?.SessionName || (String(id) === "main" ? "Main" : String(id));
  };

  return createPortal(
    <div
      className="moveSolvesBackdrop"
      data-bulk-modal
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="moveSolvesCard" role="dialog" aria-modal="true" aria-label="Move solves">
        <div className="moveSolvesTitle">
          {count === 1 ? "Move solve" : `Move ${count} solves`}
        </div>

        <div className="moveSolvesGrid">
          <label className="moveSolvesField">
            <span>Event</span>
            <select
              value={event}
              disabled={busy}
              onChange={(e) => {
                const next = normalizeEventCode(e.target.value);
                setEvent(next);
                const options = (sessionsList || []).filter(
                  (s) => normalizeEventCode(s?.Event) === next
                );
                if (!options.some((s) => String(s.SessionID) === String(session))) {
                  setSession(String(options[0]?.SessionID || "main"));
                }
              }}
            >
              {eventOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>

          <label className="moveSolvesField">
            <span>Session</span>
            {sessionsForEvent.length > 0 ? (
              <select value={session} disabled={busy} onChange={(e) => setSession(e.target.value)}>
                {sessionsForEvent.some((s) => String(s.SessionID) === "main") ? null : (
                  <option value="main">Main</option>
                )}
                {sessionsForEvent.map((s) => (
                  <option key={`${s.SessionID}-${s.SessionName || ""}`} value={s.SessionID}>
                    {s.SessionName || s.SessionID}
                  </option>
                ))}
              </select>
            ) : (
              <select value="main" disabled={busy} onChange={() => setSession("main")}>
                <option value="main">Main</option>
              </select>
            )}
          </label>
        </div>

        {error ? <div className="moveSolvesError">{error}</div> : null}

        <div className="moveSolvesActions">
          <button type="button" onClick={() => onCancel?.()} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={busy || sameAsSource}
            title={sameAsSource ? "Already in this session" : undefined}
            onClick={() =>
              onConfirm?.({
                event,
                sessionID: String(session || "main"),
                sessionName: sessionName(session),
              })
            }
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
