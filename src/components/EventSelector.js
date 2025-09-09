import React, { useState, useRef, useEffect, useCallback } from "react";
import "./EventSelector.css";
import { createSession } from "../services/createSession";
import { createCustomEvent } from "../services/createCustomEvent";
import { getSessions } from "../services/getSessions";
import { getCustomEvents } from "../services/getCustomEvents";

function EventSelector({ currentEvent, handleEventChange, userID }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [targetEvent, setTargetEvent] = useState(null);

  const modalRef = useRef(null);

  // Default events
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
    { id: "333FEW", name: "3x3 Fewest Moves" }
  ];

  const relayEvents = [
    { id: "2x2-4x4", name: "2x2-4x4 Relay" },
    { id: "2x2-7x7", name: "2x2-7x7 Relay" },
    { id: "mini-guildford", name: "Mini Guildford Relay" }
  ];

  // Fetch sessions + custom events when modal opens
  useEffect(() => {
    if (!isOpen || !userID) return;

    const fetchData = async () => {
      try {
        const sessionItems = await getSessions(userID);
        setSessions(sessionItems);

        const eventItems = await getCustomEvents(userID);
        setCustomEvents(eventItems);
      } catch (err) {
        console.error("❌ Error fetching sessions/events:", err);
      }
    };

    fetchData();
  }, [isOpen, userID]);

  const allEvents = [
    { label: "WCA Events", events: wcaEvents },
    { label: "Relay Events", events: relayEvents },
    customEvents.length > 0 && {
      label: "Custom Events",
      events: customEvents
    },
    sessions.length > 0 && {
      label: "Custom Sessions",
      events: sessions.map(s => ({
        id: s.SessionID,
        name: s.SessionName
      }))
    }
  ].filter(Boolean);

  const handleSelect = (eventId) => {
    handleEventChange({ target: { value: eventId } });
    setIsOpen(false);
  };

  const close = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!isOpen) return;
      if (e.target.classList?.contains("detailPopup")) close();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen, close]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    if (isOpen) document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [isOpen, close]);

  return (
    <>
      {/* Trigger */}
      <div className="event-selector-trigger" onClick={() => setIsOpen(true)}>
        <div className="event-selector-box">
          {wcaEvents.find(e => e.id === currentEvent)?.name ||
            relayEvents.find(e => e.id === currentEvent)?.name ||
            customEvents.find(e => e.id === currentEvent)?.name ||
            sessions.find(s => s.SessionID === currentEvent)?.SessionName ||
            "Select an Event"}
          <span className="dropdown-arrow" style={{ marginLeft: 8 }}>▼</span>
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
                    {group.events.map(event => (
                      <div
                        key={event.id}
                        className={`event-item ${currentEvent === event.id ? "active" : ""}`}
                        onClick={() => handleSelect(event.id)}
                      >
                        {event.name}
                      </div>
                    ))}
                  </div>
                  {/* Add Session button for WCA/Relay groups only */}
                  {group.label === "WCA Events" || group.label === "Relay Events" ? (
                    <button
                      className="add-session-btn"
                      onClick={() => {
                        setTargetEvent(group.events[0].id);
                        setShowAddSession(true);
                      }}
                    >
                      + Add Session
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Add Custom Event button */}
            <div className="add-event-footer">
              <button
                className="add-event-btn"
                onClick={() => setShowAddEvent(true)}
              >
                + Add Custom Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: Add Session */}
      {showAddSession && (
        <div className="detailPopup" role="dialog" aria-modal="true">
          <div className="detailPopupContent">
            <h3>Add New Session</h3>
            <input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Enter session name"
            />
            <div className="button-row">
              <button
                onClick={async () => {
                  if (!newSessionName.trim()) return;
                  await createSession(userID, targetEvent, newSessionName);
                  const updated = await getSessions(userID);
                  setSessions(updated);
                  setShowAddSession(false);
                  setNewSessionName("");
                }}
              >
                Save
              </button>
              <button onClick={() => setShowAddSession(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup: Add Custom Event */}
      {showAddEvent && (
        <div className="detailPopup" role="dialog" aria-modal="true">
          <div className="detailPopupContent">
            <h3>Add Custom Event</h3>
            <input
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Enter event name"
            />
            <div className="button-row">
              <button
                onClick={async () => {
                  if (!newEventName.trim()) return;
                  await createCustomEvent(userID, newEventName);
                  const updated = await getCustomEvents(userID);
                  setCustomEvents(updated);
                  setShowAddEvent(false);
                  setNewEventName("");
                }}
              >
                Save
              </button>
              <button onClick={() => setShowAddEvent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;
