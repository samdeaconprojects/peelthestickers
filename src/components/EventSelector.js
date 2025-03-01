import React, { useState, useRef, useEffect } from "react";
import "./EventSelector.css";

function EventSelector({ currentEvent, handleEventChange, customSessions = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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
    { id: "333BLD", name: "3x3 Blindfolded" },
    { id: "444BLD", name: "4x4 Blindfolded" },
    { id: "555BLD", name: "5x5 Blindfolded" },
    { id: "333MULTIBLD", name: "3x3 Multi-Blind" },
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
    customSessions.length > 0 && { label: "Custom Sessions", events: customSessions.map(s => ({ id: s, name: s })) }
  ].filter(Boolean);

  const handleSelect = (eventId) => {
    handleEventChange({ target: { value: eventId } });
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="event-selector-container" ref={dropdownRef}>
      <div className="event-selector-box" onClick={() => setIsOpen(!isOpen)}>
        {wcaEvents.find(e => e.id === currentEvent)?.name ||
          relayEvents.find(e => e.id === currentEvent)?.name ||
          customSessions.find(s => s === currentEvent) ||
          "Select an Event"}
        <span className="dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div className="event-dropdown">
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
      )}
    </div>
  );
}

export default EventSelector;
