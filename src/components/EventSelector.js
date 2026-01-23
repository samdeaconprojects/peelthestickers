import React, { useState, useRef, useEffect, useCallback } from "react";
import "./EventSelector.css";
import { createSession } from "../services/createSession";
import { createCustomEvent } from "../services/createCustomEvent";
import { getSessions } from "../services/getSessions";
import { getCustomEvents } from "../services/getCustomEvents";

function EventSelector({
  currentEvent,
  handleEventChange,
  currentSession,
  setCurrentSession,
  userID,
  onSessionChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [targetEvent, setTargetEvent] = useState(null);

  const modalRef = useRef(null);

  // -----------------------------
  // Event definitions
  // -----------------------------
  const wcaEvents = [
    { id: "222", name: "2x2" },
    { id: "333", name: "3x3" },
    { id: "444", name: "4x4" },
    { id: "555", name: "5x5" },
    { id: "666", name: "6x6" },
    { id: "777", name: "7x7" },
    { id: "333OH", name: "3x3 OH" },
    { id: "PYRAMINX", name: "Pyraminx" },
    { id: "SKEWB", name: "Skewb" },
    { id: "SQ1", name: "Square-1" },
    { id: "MEGAMINX", name: "Megaminx" },
    { id: "CLOCK", name: "Clock" },
    { id: "333BLD", name: "3x3 BLD" },
    { id: "444BLD", name: "4x4 BLD" },
    { id: "555BLD", name: "5x5 BLD" },
    { id: "333MULTIBLD", name: "3x3 Multi-BLD" },
    { id: "333FEW", name: "3x3 Fewest Moves" },
  ];

  const relayEvents = [
    { id: "2x2-4x4", name: "2x2–4x4 Relay" },
    { id: "2x2-7x7", name: "2x2–7x7 Relay" },
    { id: "mini-guildford", name: "Mini Guildford Relay" },
  ];

  // -----------------------------
  // Fetch sessions & custom events
  // -----------------------------
  useEffect(() => {
    if (!userID) {
      setSessions([]);
      setCustomEvents([]);
      return;
    }

    const fetchData = async () => {
      try {
        setSessions(await getSessions(userID));
        setCustomEvents(await getCustomEvents(userID));
      } catch (err) {
        console.error("❌ Error fetching sessions/events:", err);
      }
    };

    fetchData();
  }, [userID]);

  const allEvents = [
    { label: "WCA Events", events: wcaEvents },
    { label: "Relay Events", events: relayEvents },
    userID && customEvents.length > 0 && {
      label: "Custom Events",
      events: customEvents,
    },
  ].filter(Boolean);

  // -----------------------------
  // Normal sessions
  // -----------------------------
  const normalSessionsForEvent = sessions
    .filter(
      (s) =>
        s.Event === currentEvent &&
        !s.SessionID.startsWith("shared_") &&
        !s.SessionID.startsWith("SHARED#")
    )
    .map((s) => ({
      id: s.SessionID,
      name: s.SessionName,
    }));

  // -----------------------------
  // Shared session grouping
  // -----------------------------
  const sharedGroups = {};

  sessions.forEach((s) => {
    if (s.Event !== currentEvent) return;
    if (
      !s.SessionID.startsWith("shared_") &&
      !s.SessionID.startsWith("SHARED#")
    )
      return;

    const raw = s.SessionID
      .replace("SHARED#", "")
      .replace("shared_", "");

    const users = raw.split("_")[0].split("#").sort();
    const key = users.join("#");

    if (!sharedGroups[key]) {
      sharedGroups[key] = { users, sessions: [] };
    }

    sharedGroups[key].sessions.push({
      id: s.SessionID,
      name: s.SessionName || "Shared Session",
    });
  });

  const activeSharedLabel =
    Object.values(sharedGroups)
      .find((g) => g.sessions.some((s) => s.id === currentSession))
      ?.users.join(" ↔ ") || null;

  // -----------------------------
  // Handlers
  // -----------------------------
  const handleSelectEvent = (eventId) => {
    handleEventChange({ target: { value: eventId } });
    setCurrentSession("main");
    setIsOpen(false);
  };

  const handleSelectSession = (sessionId) => {
  setCurrentSession(sessionId);
  onSessionChange?.();
  setIsOpen(false);
};


  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!isOpen) return;
      if (e.target.classList?.contains("detailPopup")) close();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen, close]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    if (isOpen) document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true });
  }, [isOpen, close]);

  const eventName =
    wcaEvents.find((e) => e.id === currentEvent)?.name ||
    relayEvents.find((e) => e.id === currentEvent)?.name ||
    customEvents.find((e) => e.id === currentEvent)?.name ||
    "Select Event";

  const sessionLabel =
    activeSharedLabel ||
    normalSessionsForEvent.find((s) => s.id === currentSession)?.name ||
    currentSession;

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <>
      {/* Trigger */}
      <div className="event-selector-trigger" onClick={() => setIsOpen(true)}>
        <div className="event-selector-box">
          <div className="event-selector-text">
            <div className="event-selector-event">{eventName}</div>
            {currentSession !== "main" && (
              <div className="event-selector-session">{sessionLabel}</div>
            )}
          </div>
          <span className="dropdown-arrow">▼</span>
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="detailPopup" role="dialog" aria-modal="true">
          <div className="detailPopupContent eventSelectorContent" ref={modalRef}>
            <span className="closePopup" onClick={close}>x</span>

            <div className="event-groups-wrapper">
              {allEvents.map((group) => (
                <div key={group.label} className="event-group">
                  <h4>{group.label}</h4>
                  <div className="event-list">
                    {group.events.map((event) => (
                      <div
                        key={event.id}
                        className={`event-item ${
                          currentEvent === event.id ? "active" : ""
                        }`}
                        onClick={() => handleSelectEvent(event.id)}
                      >
                        {event.name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {userID && (
                <div className="event-group">
                  <h4>Sessions</h4>

                  <div className="event-list">
                    {normalSessionsForEvent.map((s) => (
                      <div
                        key={s.id}
                        className={`event-item ${
                          currentSession === s.id ? "active" : ""
                        }`}
                        onClick={() => handleSelectSession(s.id)}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>

                  {Object.keys(sharedGroups).length > 0 && (
                    <>
                      <h4 style={{ marginTop: 10 }}>Shared</h4>
                      {Object.entries(sharedGroups).map(([key, group]) => (
                        <div key={key} style={{ marginBottom: 8 }}>
                          <div className="event-item shared-group-label">
                            {group.users.join(" ↔ ")}
                          </div>
                          <div className="event-list" style={{ marginLeft: 12 }}>
                            {group.sessions.map((s) => (
                              <div
                                key={s.id}
                                className={`event-item ${
                                  currentSession === s.id ? "active" : ""
                                }`}
                                onClick={() => handleSelectSession(s.id)}
                              >
                                {s.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  <button
                    className="add-session-btn"
                    onClick={() => {
                      setTargetEvent(currentEvent);
                      setShowAddSession(true);
                    }}
                  >
                    + Add Session
                  </button>
                </div>
              )}
            </div>

            {userID && (
              <div className="add-event-footer">
                <button
                  className="add-event-btn"
                  onClick={() => setShowAddEvent(true)}
                >
                  + Add Custom Event
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;
