// src/components/Offline/OfflineSolvesModal.js
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import useOfflineQueue from "../../hooks/useOfflineQueue";
import { removeOfflineSolve, updateOfflineSolve } from "../../services/offlineQueue";
import { addSolve } from "../../services/addSolve";
import { formatTime } from "../TimeList/TimeUtils";
import { currentEventToString } from "../scrambleUtils";
import { DEFAULT_EVENTS } from "../../defaultEvents";
import Detail from "../Detail/Detail";
import "../TimeList/TimeItem.css";
import "./OfflineSolvesModal.css";

const normalizeEventId = (id) => String(id || "").toUpperCase();
const normalizeSessionId = (id) => String(id || "main").trim() || "main";

// Queue entry -> the solve shape TimeList/Detail work with. `__readOnly`
// keeps Detail from trying to persist edits for a solve the server has
// never seen.
function toDisplaySolve(entry) {
  return {
    solveRef: entry.localId,
    time: entry.rawTimeMs,
    rawTimeMs: entry.rawTimeMs,
    penalty: entry.penalty ?? null,
    isDNF: entry.penalty === "DNF",
    scramble: entry.scramble || "",
    event: entry.event,
    sessionID: entry.sessionID,
    sessionName: entry.sessionName || "",
    createdAt: entry.createdAt,
    datetime: entry.createdAt,
    note: entry.note || "",
    tags: entry.tags || {},
    __readOnly: true,
  };
}

/**
 * Home-screen popup listing solves that were timed while offline and never
 * reached the server. Each one is a normal clickable time item; nothing is
 * pushed until the user adds it, and before adding they can drop a solve or
 * point it (or its whole group) at a different event/session.
 */
export default function OfflineSolvesModal({
  userID,
  isOnline,
  sessionsList = [],
  customEvents = [],
  profileColor = "#2EC4B6",
  onClose,
  onSolveSynced,
  onSolveRemoved,
}) {
  const { groups, items, count } = useOfflineQueue(userID);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [progress, setProgress] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const selectedEntry = useMemo(
    () => items.find((item) => item.localId === selectedId) || null,
    [items, selectedId]
  );

  // Nothing left to review - the popup has no reason to stay open.
  useEffect(() => {
    if (!count && !syncing) onClose?.();
  }, [count, syncing, onClose]);

  // Keep Escape / Space from reaching the timer underneath.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (selectedId) setSelectedId(null);
        else if (!syncing) onClose?.();
        return;
      }
      const tag = String(event.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.code === "Space") event.stopPropagation();
    };
    const onKeyUp = (event) => {
      if (event.code === "Space") event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [selectedId, syncing, onClose]);

  const eventOptions = useMemo(() => {
    const names = new Map();
    DEFAULT_EVENTS.forEach((ev) => names.set(normalizeEventId(ev), null));
    (customEvents || []).forEach((ev) => {
      const id = normalizeEventId(ev?.EventID || ev?.id);
      if (id) names.set(id, ev?.EventName || ev?.name || null);
    });
    (sessionsList || []).forEach((s) => {
      const id = normalizeEventId(s?.Event);
      if (id && !names.has(id)) names.set(id, null);
    });
    items.forEach((item) => {
      const id = normalizeEventId(item.event);
      if (id && !names.has(id)) names.set(id, null);
    });
    return Array.from(names.entries()).map(([id, name]) => ({
      id,
      name: name || currentEventToString(id) || id,
    }));
  }, [customEvents, sessionsList, items]);

  const sessionOptionsFor = (event, currentSessionID, currentSessionName) => {
    const ev = normalizeEventId(event);
    const options = [{ id: "main", name: "Main" }];
    (sessionsList || []).forEach((s) => {
      if (normalizeEventId(s?.Event) !== ev) return;
      const id = normalizeSessionId(s?.SessionID);
      if (options.some((opt) => opt.id === id)) return;
      options.push({ id, name: s?.SessionName || id });
    });
    const current = normalizeSessionId(currentSessionID);
    if (!options.some((opt) => opt.id === current)) {
      options.push({ id: current, name: currentSessionName || current });
    }
    return options;
  };

  const sessionNameFor = (event, sessionID) => {
    const sid = normalizeSessionId(sessionID);
    if (sid === "main") return null;
    const ev = normalizeEventId(event);
    const match = (sessionsList || []).find(
      (s) => normalizeEventId(s?.Event) === ev && normalizeSessionId(s?.SessionID) === sid
    );
    return match?.SessionName || null;
  };

  const retarget = (entries, event, sessionID) => {
    const ev = normalizeEventId(event);
    const sid = normalizeSessionId(sessionID);
    const sessionName = sessionNameFor(ev, sid);
    entries.forEach((entry) =>
      updateOfflineSolve(userID, entry.localId, { event: ev, sessionID: sid, sessionName })
    );
  };

  // Switching event lands on that event's Main session - the old session id
  // belongs to the previous event.
  const changeEvent = (entries, event) => retarget(entries, event, "main");

  // Offline solves only exist in the local queue, so removing one is final.
  const removeEntries = (entries) => {
    if (!entries.length) return;
    const label =
      entries.length === 1 ? "this offline solve" : `these ${entries.length} offline solves`;
    if (!window.confirm(`Remove ${label}? This can't be undone.`)) return;
    entries.forEach((entry) => {
      onSolveRemoved?.(entry);
      removeOfflineSolve(userID, entry.localId);
    });
  };

  const syncEntries = async (entries) => {
    if (syncing || !isOnline || !entries.length) return;
    setSyncing(true);
    setSyncError("");

    let synced = 0;
    let failed = 0;

    for (const entry of entries) {
      setProgress({ done: synced + failed, total: entries.length });
      try {
        const res = await addSolve(userID, {
          event: entry.event,
          sessionID: entry.sessionID,
          rawTimeMs: entry.rawTimeMs,
          penalty: entry.penalty,
          scramble: entry.scramble,
          note: entry.note,
          createdAt: entry.createdAt,
          tags: entry.tags,
        });
        onSolveSynced?.(entry, res);
        removeOfflineSolve(userID, entry.localId);
        synced += 1;
      } catch (err) {
        console.error("Failed to sync offline solve:", err);
        failed += 1;
      }
    }

    setProgress(null);
    setSyncing(false);

    if (failed > 0) {
      setSyncError(
        `Added ${synced} of ${entries.length} solves. ${failed} failed and stayed queued — try again once you're reliably online.`
      );
    }
  };

  const renderDestination = (entries, event, sessionID, sessionName, idPrefix) => (
    <div className="offline-modal__destination">
      <select
        aria-label="Event"
        id={`${idPrefix}-event`}
        value={normalizeEventId(event)}
        disabled={syncing}
        onChange={(e) => changeEvent(entries, e.target.value)}
      >
        {eventOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Session"
        id={`${idPrefix}-session`}
        value={normalizeSessionId(sessionID)}
        disabled={syncing}
        onChange={(e) => retarget(entries, event, e.target.value)}
      >
        {sessionOptionsFor(event, sessionID, sessionName).map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (!count && !syncing) return null;

  const addLabel = (idle) =>
    syncing
      ? progress
        ? `Adding ${progress.done}/${progress.total}…`
        : "Adding…"
      : isOnline
      ? idle
      : "Offline";

  const modal = (
    <div
      className="offline-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget && !syncing) onClose?.();
      }}
    >
      <div className="offline-modal__content">
        <div className="offline-modal__header">
          <div>
            <h3 className="offline-modal__title">Offline solves</h3>
            <p className="offline-modal__subtitle">
              {count} solve{count === 1 ? "" : "s"} timed while offline, not yet saved. Click a
              time for details, or change where a group goes before adding it.
            </p>
          </div>
          <button
            type="button"
            className="offline-modal__close"
            onClick={onClose}
            disabled={syncing}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {syncError && <div className="offline-modal__error">{syncError}</div>}

        <div className="offline-modal__groups">
          {groups.flatMap((g) =>
            g.sessions.map((sess) => (
              <div key={`${g.event}::${sess.sessionID}`} className="offline-modal__group">
                <div className="offline-modal__group-header">
                  <span className="offline-modal__group-count">
                    {sess.solves.length} solve{sess.solves.length === 1 ? "" : "s"} →
                  </span>
                  {renderDestination(
                    sess.solves,
                    g.event,
                    sess.sessionID,
                    sess.sessionName,
                    `offline-group-${g.event}-${sess.sessionID}`
                  )}
                  <div className="offline-modal__group-actions">
                    <button
                      type="button"
                      className="offline-modal__btn offline-modal__btn--danger"
                      onClick={() => removeEntries(sess.solves)}
                      disabled={syncing}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="offline-modal__btn"
                      onClick={() => syncEntries(sess.solves)}
                      disabled={syncing || !isOnline}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="offline-modal__times">
                  {sess.solves.map((solve) => (
                    <div
                      key={solve.localId}
                      className="TimeItem current-five offline-modal__time"
                      onClick={() => setSelectedId(solve.localId)}
                    >
                      {formatTime(solve.rawTimeMs, false, solve.penalty)}
                      <span
                        className="delete-icon"
                        title="Remove this solve"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!syncing) removeEntries([solve]);
                        }}
                      >
                        x
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="offline-modal__footer">
          <button
            type="button"
            className="offline-modal__btn offline-modal__btn--danger"
            onClick={() => removeEntries(items)}
            disabled={syncing}
          >
            Remove all
          </button>
          <button
            type="button"
            className="offline-modal__btn offline-modal__btn--primary"
            onClick={() => syncEntries(items)}
            disabled={syncing || !isOnline}
            title={!isOnline ? "Reconnect to add solves" : undefined}
          >
            {addLabel("Add all")}
          </button>
        </div>
      </div>

      {selectedEntry && (
        <div
          className="offline-modal__detail"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className="offline-modal__detail-content">
            <Detail
              solve={toDisplaySolve(selectedEntry)}
              userID={userID}
              profileColor={profileColor}
              onClose={() => setSelectedId(null)}
              sessionsList={sessionsList}
              embedded
              showActions={false}
            />
            <div className="offline-modal__detail-actions">
              <span className="offline-modal__group-count">Add to</span>
              {renderDestination(
                [selectedEntry],
                selectedEntry.event,
                selectedEntry.sessionID,
                selectedEntry.sessionName,
                "offline-detail"
              )}
              <div className="offline-modal__group-actions">
                <button
                  type="button"
                  className="offline-modal__btn offline-modal__btn--danger"
                  onClick={() => removeEntries([selectedEntry])}
                  disabled={syncing}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="offline-modal__btn offline-modal__btn--primary"
                  onClick={() => syncEntries([selectedEntry])}
                  disabled={syncing || !isOnline}
                >
                  {addLabel("Add")}
                </button>
                <button
                  type="button"
                  className="offline-modal__btn"
                  onClick={() => setSelectedId(null)}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
