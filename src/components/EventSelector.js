import React, { useState, useRef, useEffect, useCallback } from "react";
import "./EventSelector.css";

function EventSelector({ currentEvent, handleEventChange, customSessions = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef(null);

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

  const allEvents = [
    { label: "WCA Events", events: wcaEvents },
    { label: "Relay Events", events: relayEvents },
    customSessions.length > 0 && {
      label: "Custom Sessions",
      events: customSessions.map(s => ({ id: s, name: s }))
    }
  ].filter(Boolean);

  const handleSelect = (eventId) => {
    handleEventChange({ target: { value: eventId } });
    setIsOpen(false);
  };

  const close = useCallback(() => setIsOpen(false), []);

  // Close on outside click (overlay)
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
      {/* The trigger button that sits on the page */}
      <div className="event-selector-trigger" onClick={() => setIsOpen(true)}>
        <div className="event-selector-box">
          {wcaEvents.find(e => e.id === currentEvent)?.name ||
            relayEvents.find(e => e.id === currentEvent)?.name ||
            customSessions.find(s => s === currentEvent) ||
            "Select an Event"}
          <span className="dropdown-arrow" style={{ marginLeft: 8 }}>▼</span>
        </div>
      </div>

      {/* Centered modal like Detail */}
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
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;
