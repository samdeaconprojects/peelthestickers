import React, { useEffect, useMemo, useState } from "react";
import "./ExportDataModal.css";

function normalizeSessionLabel(sessionID, sessionName) {
  const sid = String(sessionID || "").trim() || "main";
  const label = String(sessionName || "").trim();
  if (sid === "main" && (!label || label === "Main Session")) return "Main";
  return label || sid;
}

function buildInitialSelection(groupedEvents, defaultEvent, defaultSessionID) {
  const ev = String(defaultEvent || "").toUpperCase();
  const sid = String(defaultSessionID || "main");
  const selection = {};

  for (const group of groupedEvents) {
    selection[group.event] = {
      includeAll: false,
      sessionIDs: {},
    };

    for (const session of group.sessions) {
      selection[group.event].sessionIDs[session.SessionID] = false;
    }
  }

  if (selection[ev]) {
    if (selection[ev].sessionIDs[sid] != null) {
      selection[ev].sessionIDs[sid] = true;
    } else if (selection[ev].sessionIDs.main != null) {
      selection[ev].sessionIDs.main = true;
    }
  }

  return selection;
}

function summarizeSelection(groupedEvents, selection) {
  let eventCount = 0;
  let sessionCount = 0;

  for (const group of groupedEvents) {
    const state = selection?.[group.event];
    if (!state) continue;

    if (state.includeAll) {
      eventCount += 1;
      sessionCount += group.sessions.length;
      continue;
    }

    const chosen = group.sessions.filter((session) => state.sessionIDs?.[session.SessionID]);
    if (chosen.length > 0) {
      eventCount += 1;
      sessionCount += chosen.length;
    }
  }

  return { eventCount, sessionCount };
}

export default function ExportDataModal({
  sessionsList = [],
  defaultEvent = "",
  defaultSessionID = "main",
  busy = false,
  exportProgress = null,
  onClose,
  onExport,
}) {
  const groupedEvents = useMemo(() => {
    const groups = new Map();

    for (const session of sessionsList || []) {
      const event = String(session?.Event || "").toUpperCase();
      const sessionID = String(session?.SessionID || "main");
      if (!event) continue;

      if (!groups.has(event)) groups.set(event, []);
      groups.get(event).push({
        ...session,
        Event: event,
        SessionID: sessionID,
        SessionName: normalizeSessionLabel(sessionID, session?.SessionName || session?.Name),
      });
    }

    return Array.from(groups.entries())
      .map(([event, sessions]) => ({
        event,
        sessions: [...sessions].sort((a, b) => {
          if (a.SessionID === "main") return -1;
          if (b.SessionID === "main") return 1;
          return String(a.SessionName || "").localeCompare(String(b.SessionName || ""));
        }),
      }))
      .sort((a, b) => a.event.localeCompare(b.event));
  }, [sessionsList]);

  const [mode, setMode] = useState("whole-user");
  const [selection, setSelection] = useState(() =>
    buildInitialSelection(groupedEvents, defaultEvent, defaultSessionID)
  );
  const [confirmReady, setConfirmReady] = useState(false);

  useEffect(() => {
    setSelection(buildInitialSelection(groupedEvents, defaultEvent, defaultSessionID));
  }, [groupedEvents, defaultEvent, defaultSessionID]);

  useEffect(() => {
    setConfirmReady(false);
  }, [mode, selection]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (e.target?.className === "exportDataPopup") onClose?.();
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  const selectionSummary = useMemo(
    () => summarizeSelection(groupedEvents, selection),
    [groupedEvents, selection]
  );

  const canExportSelected =
    selectionSummary.eventCount > 0 && selectionSummary.sessionCount > 0;
  const allEventsCount = groupedEvents.length;
  const allSessionsCount = groupedEvents.reduce((total, group) => total + group.sessions.length, 0);

  const handleToggleWholeEvent = (event) => {
    setSelection((prev) => {
      const next = { ...(prev || {}) };
      const current = next[event] || { includeAll: false, sessionIDs: {} };
      next[event] = {
        ...current,
        includeAll: !current.includeAll,
      };
      return next;
    });
  };

  const handleToggleSession = (event, sessionID) => {
    setSelection((prev) => {
      const next = { ...(prev || {}) };
      const current = next[event] || { includeAll: false, sessionIDs: {} };
      next[event] = {
        ...current,
        includeAll: false,
        sessionIDs: {
          ...(current.sessionIDs || {}),
          [sessionID]: !current.sessionIDs?.[sessionID],
        },
      };
      return next;
    });
  };

  const handleExport = async () => {
    if (busy) return;

    if (!confirmReady) {
      setConfirmReady(true);
      return;
    }

    if (mode === "whole-user") {
      await onExport?.({ mode: "whole-user" });
      return;
    }

    const selectedEvents = groupedEvents
      .map((group) => {
        const state = selection?.[group.event];
        if (!state) return null;
        if (state.includeAll) {
          return {
            event: group.event,
            includeAllSessions: true,
            sessionIDs: group.sessions.map((session) => session.SessionID),
          };
        }

        const sessionIDs = group.sessions
          .map((session) => session.SessionID)
          .filter((sessionID) => state.sessionIDs?.[sessionID]);

        if (sessionIDs.length === 0) return null;
        return {
          event: group.event,
          includeAllSessions: false,
          sessionIDs,
        };
      })
      .filter(Boolean);

    if (selectedEvents.length === 0) return;

    await onExport?.({
      mode: "selected",
      selectedEvents,
    });
  };

  return (
    <div className="exportDataPopup">
      <div className="exportDataPopupContent">
        <button className="exportDataCloseButton" onClick={onClose} aria-label="Close export modal">
          x
        </button>

        <div className="exportDataHeader">
          <div className="exportDataTitle">Export Data</div>
          <div className="exportDataSubtitle">
            Export events, sessions, and solves. Posts stay out of this file.
          </div>
        </div>

        <div className="exportDataModeList">
          <label className={`exportDataModeCard ${mode === "whole-user" ? "is-active" : ""}`}>
            <input
              type="radio"
              name="export-mode"
              checked={mode === "whole-user"}
              onChange={() => setMode("whole-user")}
            />
            <span>
              <strong>Whole user</strong>
              <small>All events, all sessions, all solves, plus profile/settings data.</small>
            </span>
          </label>

          <label className={`exportDataModeCard ${mode === "selected" ? "is-active" : ""}`}>
            <input
              type="radio"
              name="export-mode"
              checked={mode === "selected"}
              onChange={() => setMode("selected")}
            />
            <span>
              <strong>Selected events or sessions</strong>
              <small>Choose full events or just specific sessions.</small>
            </span>
          </label>
        </div>

        {mode === "selected" ? (
          <div className="exportDataSelectionPanel">
            <div className="exportDataSelectionSummary">
              {selectionSummary.sessionCount > 0
                ? `Selected ${selectionSummary.eventCount} event${
                    selectionSummary.eventCount === 1 ? "" : "s"
                  } and ${selectionSummary.sessionCount} session${
                    selectionSummary.sessionCount === 1 ? "" : "s"
                  }.`
                : "Choose at least one event or session."}
            </div>

            <div className="exportDataEventList">
              {groupedEvents.map((group) => {
                const state = selection?.[group.event] || { includeAll: false, sessionIDs: {} };
                return (
                  <div key={group.event} className="exportDataEventCard">
                    <label className="exportDataEventToggle">
                      <input
                        type="checkbox"
                        checked={!!state.includeAll}
                        onChange={() => handleToggleWholeEvent(group.event)}
                      />
                      <span>
                        <strong>{group.event}</strong>
                        <small>Export every session in this event.</small>
                      </span>
                    </label>

                    <div className="exportDataSessionList">
                      {group.sessions.map((session) => (
                        <label key={`${group.event}-${session.SessionID}`} className="exportDataSessionToggle">
                          <input
                            type="checkbox"
                            checked={!!state.sessionIDs?.[session.SessionID]}
                            disabled={!!state.includeAll}
                            onChange={() => handleToggleSession(group.event, session.SessionID)}
                          />
                          <span>{session.SessionName || session.SessionID}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {confirmReady ? (
          <div className="exportDataConfirmBox">
            <div className="exportDataConfirmTitle">Confirm Export</div>
            <div className="exportDataConfirmText">
              {mode === "whole-user"
                ? `This will export ${allEventsCount} events and ${allSessionsCount} sessions for this user.`
                : `This will export ${selectionSummary.eventCount} events and ${selectionSummary.sessionCount} sessions from your current selection.`}
            </div>
            <div className="exportDataConfirmText">
              The download is a JSON backup file with events, sessions, solves, and settings. Posts are not included.
            </div>
          </div>
        ) : null}

        {busy && exportProgress ? (
          <div className="exportDataProgressWrap">
            <div className="exportDataProgressLabel">
              {exportProgress.label ||
                `Exporting ${exportProgress.sessionsCompleted || 0}/${exportProgress.totalSessions || 0} sessions`}
            </div>
            {exportProgress.currentSessionLabel ? (
              <div className="exportDataProgressMeta">
                Current: {exportProgress.currentSessionLabel}
              </div>
            ) : null}
            <div className="exportDataProgressMeta">
              Sessions: {exportProgress.sessionsCompleted || 0}/{exportProgress.totalSessions || 0}
            </div>
            <div className="exportDataProgressMeta">
              Solves collected: {exportProgress.solvesExported || 0}
            </div>
            <div className="exportDataProgressTrack">
              <div
                className="exportDataProgressFill"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((Number(exportProgress.completed) || 0) /
                        Math.max(1, Number(exportProgress.total) || 1)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="exportDataActions">
          <button type="button" className="exportDataSecondaryButton" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {confirmReady ? (
            <button
              type="button"
              className="exportDataSecondaryButton"
              onClick={() => setConfirmReady(false)}
              disabled={busy}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="exportDataPrimaryButton"
            onClick={handleExport}
            disabled={busy || (mode === "selected" && !canExportSelected)}
          >
            {busy ? "Exporting..." : confirmReady ? "Confirm Export" : "Review Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
