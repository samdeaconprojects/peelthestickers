// src/components/EventSelector.js
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./EventSelector.css";
import { createSession } from "../services/createSession";
import { createCustomEvent } from "../services/createCustomEvent";
import { getSessions } from "../services/getSessions";
import { getCustomEvents } from "../services/getCustomEvents";

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

const normalizeEventId = (id) => String(id || "").toUpperCase();

function EventSelector({
  currentEvent,
  handleEventChange,
  currentSession,
  setCurrentSession,
  userID,
  onSessionChange,
  onSelectSessionObj, // lets App start relay mode using full session data
}) {
  const [isOpen, setIsOpen] = useState(false);

  // fetched data
  const [sessions, setSessions] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);

  // add session + add event UIs
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [targetEvent, setTargetEvent] = useState(null);

  // relay builder UI
  const [relayLegsText, setRelayLegsText] = useState("222,333,444,555,666,777");

  const modalRef = useRef(null);

  // -----------------------------
  // Event definitions
  // -----------------------------
  const wcaEvents = useMemo(
    () => [
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
    ],
    []
  );

  // Relays are sessions under the RELAY "event"
  const relayEvents = useMemo(() => [{ id: "RELAY", name: "Relays" }], []);

  const relayPresets = useMemo(
    () => [
      {
        name: "2x2–7x7 Relay",
        legs: ["222", "333", "444", "555", "666", "777"],
      },
      {
        name: "2x2–4x4 Relay",
        legs: ["222", "333", "444"],
      },
      {
        name: "Mini Guildford Relay",
        legs: ["333", "222", "333OH", "333BLD"], // tweak however you want
      },
    ],
    []
  );

  // -----------------------------
  // Fetch sessions & custom events
  // -----------------------------
  const refreshData = useCallback(async () => {
    if (!userID) return;
    try {
      const [sess, cust] = await Promise.all([
        getSessions(userID),
        getCustomEvents(userID),
      ]);
      setSessions(sess || []);
      setCustomEvents(cust || []);
    } catch (err) {
      console.error("❌ Error fetching sessions/events:", err);
    }
  }, [userID]);

  useEffect(() => {
    if (!userID) {
      setSessions([]);
      setCustomEvents([]);
      return;
    }
    refreshData();
  }, [userID, refreshData]);

  const allEvents = useMemo(() => {
    return [
      { label: "WCA Events", events: wcaEvents },
      { label: "Relay Events", events: relayEvents },
      userID && customEvents.length > 0 && {
        label: "Custom Events",
        events: customEvents.map((e) => ({
          id: e.EventID || e.id,
          name: e.EventName || e.name || e.EventID || e.id,
        })),
      },
    ].filter(Boolean);
  }, [wcaEvents, relayEvents, customEvents, userID]);

  // -----------------------------
  // Sessions for selected event
  // -----------------------------
  const normalSessionsForEvent = useMemo(() => {
    const ev = normalizeEventId(currentEvent);
    return (sessions || [])
      .filter((s) => {
        if (normalizeEventId(s.Event) !== ev) return false;
        const sid = String(s.SessionID || "");
        if (sid.startsWith("shared_") || sid.startsWith("SHARED#")) return false;
        return true;
      })
      .map((s) => ({
        id: s.SessionID,
        name: s.SessionName,
        raw: s,
      }));
  }, [sessions, currentEvent]);

  // -----------------------------
  // Shared session grouping
  // -----------------------------
  const sharedGroups = useMemo(() => {
    const ev = normalizeEventId(currentEvent);
    const groups = {};

    (sessions || []).forEach((s) => {
      if (normalizeEventId(s.Event) !== ev) return;

      const sid = String(s.SessionID || "");
      if (!sid.startsWith("shared_") && !sid.startsWith("SHARED#")) return;

      const raw = sid.replace("SHARED#", "").replace("shared_", "");
      const users = raw.split("_")[0].split("#").sort();
      const key = users.join("#");

      if (!groups[key]) groups[key] = { users, sessions: [] };
      groups[key].sessions.push({
        id: s.SessionID,
        name: s.SessionName || "Shared Session",
        raw: s,
      });
    });

    return groups;
  }, [sessions, currentEvent]);

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
    onSelectSessionObj?.(null);
    setIsOpen(false);
  };

  const handleSelectSession = (sessionId) => {
    setCurrentSession(sessionId);
    onSessionChange?.();

    // pass back full session object so App can detect relay mode
    const ev = normalizeEventId(currentEvent);
    const sessionObj = (sessions || []).find(
      (s) => String(s.SessionID) === String(sessionId) && normalizeEventId(s.Event) === ev
    );
    onSelectSessionObj?.(sessionObj || null);

    setIsOpen(false);
  };

  const close = useCallback(() => {
    setIsOpen(false);
    setShowAddSession(false);
    setShowAddEvent(false);
    setNewSessionName("");
    setNewEventName("");
    setTargetEvent(null);
  }, []);

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
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [isOpen, close]);

  const eventName =
    wcaEvents.find((e) => e.id === currentEvent)?.name ||
    relayEvents.find((e) => e.id === currentEvent)?.name ||
    (customEvents || []).find((e) => (e.EventID || e.id) === currentEvent)?.EventName ||
    "Select Event";

  const sessionLabel =
    activeSharedLabel ||
    normalSessionsForEvent.find((s) => s.id === currentSession)?.name ||
    currentSession;

  // -----------------------------
  // Create session / relay session
  // -----------------------------
  const parseRelayLegs = (txt) => {
    const parts = String(txt || "")
      .split(/[,\s|]+/)
      .map((x) => normalizeEventId(x))
      .filter(Boolean);

    // allow repeats, but remove empties
    return parts;
  };

  const createNormalSession = async () => {
    if (!userID) return;
    const ev = normalizeEventId(targetEvent || currentEvent);
    const name = String(newSessionName || "").trim();
    if (!name) return;

    try {
      await createSession(userID, ev, name); // old signature supported
      await refreshData();
      setShowAddSession(false);
      setNewSessionName("");
    } catch (err) {
      console.error("❌ Failed to create session:", err);
      alert("Failed to create session.");
    }
  };

  const createRelaySessionFromNameAndLegs = async (name, legs) => {
    if (!userID) return;
    const ev = "RELAY";
    const cleanName = String(name || "").trim();
    if (!cleanName) return;

    const sessionID = slugify(cleanName);
    const relayLegs = Array.isArray(legs) ? legs : [];

    try {
      await createSession(userID, ev, sessionID, cleanName, {
        sessionType: "RELAY",
        relayLegs,
      });
      await refreshData();
      setShowAddSession(false);
      setNewSessionName("");
    } catch (err) {
      console.error("❌ Failed to create relay session:", err);
      alert("Failed to create relay session.");
    }
  };

  const createRelayFromBuilder = async () => {
    const name = String(newSessionName || "").trim();
    const legs = parseRelayLegs(relayLegsText);
    if (!name) return alert("Name your relay session first.");
    if (!legs.length) return alert("Add at least 1 relay leg (e.g. 222,333,444).");
    await createRelaySessionFromNameAndLegs(name, legs);
  };

  // -----------------------------
  // Create custom event
  // -----------------------------
  const createNewCustomEvent = async () => {
    if (!userID) return;
    const name = String(newEventName || "").trim();
    if (!name) return;

    try {
      await createCustomEvent(userID, name);
      await refreshData();
      setShowAddEvent(false);
      setNewEventName("");
    } catch (err) {
      console.error("❌ Failed to create custom event:", err);
      alert("Failed to create custom event.");
    }
  };

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
            <span className="closePopup" onClick={close}>
              x
            </span>

            {/* MAIN LIST VIEW */}
            {!showAddSession && !showAddEvent && (
              <div className="event-groups-wrapper">
                {allEvents.map((group) => (
                  <div key={group.label} className="event-group">
                    <h4>{group.label}</h4>
                    <div className="event-list">
                      {group.events.map((event) => (
                        <div
                          key={event.id}
                          className={`event-item ${currentEvent === event.id ? "active" : ""}`}
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
                          className={`event-item ${currentSession === s.id ? "active" : ""}`}
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
                                  className={`event-item ${currentSession === s.id ? "active" : ""}`}
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
                        setNewSessionName("");
                        if (normalizeEventId(currentEvent) === "RELAY") {
                          setRelayLegsText("222,333,444,555,666,777");
                        }
                      }}
                    >
                      + Add Session
                    </button>
                  </div>
                )}

                {userID && (
                  <div className="add-event-footer">
                    <button className="add-event-btn" onClick={() => setShowAddEvent(true)}>
                      + Add Custom Event
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ADD SESSION VIEW */}
            {showAddSession && (
              <div style={{ padding: 12 }}>
                <h3 style={{ margin: 0, marginBottom: 10 }}>
                  {normalizeEventId(targetEvent || currentEvent) === "RELAY"
                    ? "Create Relay Session"
                    : "Create Session"}
                </h3>

                {/* Name */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="Session name"
                    style={{
                      flex: 1,
                      fontSize: 14,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #B4B4B4",
                      background: "transparent",
                      color: "white",
                      outline: "none",
                    }}
                  />
                  <button
                    className="add-session-btn"
                    onClick={async () => {
                      const ev = normalizeEventId(targetEvent || currentEvent);
                      if (ev === "RELAY") {
                        await createRelayFromBuilder();
                      } else {
                        await createNormalSession();
                      }
                    }}
                  >
                    Save
                  </button>
                </div>

                {/* Relay-only builder */}
                {normalizeEventId(targetEvent || currentEvent) === "RELAY" && (
                  <>
                    <div style={{ marginTop: 12, opacity: 0.9, textAlign: "left" }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        Relay legs (comma/space separated, repeats allowed)
                      </div>
                      <input
                        value={relayLegsText}
                        onChange={(e) => setRelayLegsText(e.target.value)}
                        placeholder="222,333,444,555,666,777"
                        style={{
                          width: "100%",
                          fontSize: 14,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #B4B4B4",
                          background: "transparent",
                          color: "white",
                          outline: "none",
                        }}
                      />
                      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                        Example: <span style={{ opacity: 1 }}>222 333 333OH 444</span>
                      </div>
                    </div>

                    {/* Presets */}
                    <div style={{ marginTop: 12, textAlign: "left" }}>
                      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.9 }}>
                        Presets
                      </div>
                      <div className="event-list" style={{ gap: 8 }}>
                        {relayPresets.map((p) => (
                          <div
                            key={p.name}
                            className="event-item"
                            onClick={async () => {
                              const name = p.name;
                              setNewSessionName(name);
                              setRelayLegsText(p.legs.join(","));
                              // create immediately for convenience
                              await createRelaySessionFromNameAndLegs(name, p.legs);
                            }}
                            title={p.legs.join(" → ")}
                          >
                            {p.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div style={{ marginTop: 12 }}>
                  <button
                    className="add-event-btn"
                    onClick={() => {
                      setShowAddSession(false);
                      setNewSessionName("");
                      setTargetEvent(null);
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* ADD CUSTOM EVENT VIEW */}
            {showAddEvent && (
              <div style={{ padding: 12 }}>
                <h3 style={{ margin: 0, marginBottom: 10 }}>Create Custom Event</h3>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    placeholder="Event name (e.g. My Practice)"
                    style={{
                      flex: 1,
                      fontSize: 14,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #B4B4B4",
                      background: "transparent",
                      color: "white",
                      outline: "none",
                    }}
                  />
                  <button className="add-event-btn" onClick={createNewCustomEvent}>
                    Save
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    className="add-event-btn"
                    onClick={() => {
                      setShowAddEvent(false);
                      setNewEventName("");
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;
