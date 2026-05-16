// src/components/EventSelector.js
import React, {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
} from "react";
import "./EventSelector.css";
import { useDbStatus } from "../contexts/DbStatusContext";
import { createSession } from "../services/createSession";
import { createCustomEvent } from "../services/createCustomEvent";
import { deleteSession } from "../services/deleteSession";
import { getSessions } from "../services/getSessions";
import { getCustomEvents } from "../services/getCustomEvents";
import PuzzleSVG from "./PuzzleSVGs/PuzzleSVG";
import {
  DEFAULT_EVENTS,
  RELAY_EVENT_DEFINITIONS,
  getRelayEventDefinition,
  getRelaySessionOptions,
  isRelayEventId,
} from "../defaultEvents";

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");

const normalizeEventId = (id) => String(id || "").toUpperCase();

const getPuzzleIconEvent = (eventId) => {
  const ev = normalizeEventId(eventId);
  if (isRelayEventId(ev)) return "RELAY";
  if (["333OH", "333BLD", "333MULTIBLD", "333FEW"].includes(ev)) return "333";
  if (ev === "444BLD") return "444";
  if (ev === "555BLD") return "555";
  return ev;
};

const getEventAccent = (eventId) => {
  const ev = normalizeEventId(eventId);

  if (isRelayEventId(ev)) return "#9be15d";

  if (["222", "333", "444", "555", "666", "777", "333OH", "333BLD", "444BLD", "555BLD", "333MULTIBLD", "333FEW"].includes(ev)) {
    return "#6ee7d8";
  }
  if (ev === "PYRAMINX") return "#f6c453";
  if (ev === "SKEWB") return "#7ab8ff";
  if (ev === "SQ1") return "#ff8e72";
  if (ev === "MEGAMINX") return "#ff6b9c";
  if (ev === "CLOCK") return "#b59cff";
  return "#9fb0c7";
};

const getEventBadge = (eventId) => {
  const ev = normalizeEventId(eventId);
  const badges = {
    "333OH": "OH",
    "333BLD": "BLD",
    "444BLD": "BLD",
    "555BLD": "BLD",
    "333MULTIBLD": "MBLD",
    "333FEW": "FMC",
  };
  if (isRelayEventId(ev)) return "RELAY";
  return badges[ev] || "";
};

const getEventIconClassKey = (eventId) => {
  const ev = normalizeEventId(eventId);
  if (isRelayEventId(ev)) return "relay";
  if (ev === "PYRAMINX") return "pyraminx";
  if (ev === "SKEWB") return "skewb";
  if (ev === "SQ1") return "sq1";
  if (ev === "MEGAMINX") return "megaminx";
  if (ev === "CLOCK") return "clock";
  return String(getPuzzleIconEvent(ev) || ev)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
};

function EventOptionVisual({ eventId, eventName }) {
  const iconEvent = getPuzzleIconEvent(eventId);
  const visualEvent = normalizeEventId(eventId) === "333OH" ? "333OH" : iconEvent;
  const canRenderPuzzle = !["RELAY"].includes(visualEvent) && !!visualEvent;
  const iconClass = `event-chip-icon event-chip-icon--${getEventIconClassKey(eventId)}`;

  return (
    <>
      <div
        className={iconClass}
        aria-hidden="true"
        style={{ "--event-accent": getEventAccent(eventId) }}
      >
        {canRenderPuzzle ? (
          <div className="event-chip-puzzle-scale">
            <PuzzleSVG event={visualEvent} scramble="" isNameTagCube={true} />
          </div>
        ) : (
          <div className="event-chip-fallback-mark">
            {getEventBadge(eventId) || String(eventName || "?").slice(0, 2)}
          </div>
        )}
      </div>
      <div className="event-card-copy">
        <span className="event-card-title">{eventName}</span>
      </div>
    </>
  );
}

const EventSelector = forwardRef(function EventSelector(
  {
    currentEvent,
    handleEventChange,
    currentSession,
    setCurrentSession,
    sessions: providedSessions,
    customEvents: providedCustomEvents,
    userID,
    onSessionChange,
    onSelectSessionObj, // lets App start relay mode using full session data
    compact = false,
  },
  ref
) {
  const { runDb } = useDbStatus();
  const [isOpen, setIsOpen] = useState(false);

  const [sessionsState, setSessionsState] = useState(null);
  const [customEventsState, setCustomEventsState] = useState(null);

  const sessions = useMemo(
    () =>
      Array.isArray(sessionsState)
        ? sessionsState
        : Array.isArray(providedSessions)
        ? providedSessions
        : [],
    [providedSessions, sessionsState]
  );
  const customEvents = useMemo(
    () =>
      Array.isArray(customEventsState)
        ? customEventsState
        : Array.isArray(providedCustomEvents)
        ? providedCustomEvents
        : [],
    [providedCustomEvents, customEventsState]
  );

  // add session + add event UIs
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [relayBuilderLegs, setRelayBuilderLegs] = useState([]);
  const [targetEvent, setTargetEvent] = useState(null);
  const [draftEvent, setDraftEvent] = useState(currentEvent);
  const [draftSession, setDraftSession] = useState(currentSession || "main");

  const modalRef = useRef(null);
  const open = useCallback(() => {
    setDraftEvent(currentEvent);
    setDraftSession(currentSession || "main");
    setIsOpen(true);
  }, [currentEvent, currentSession]);

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
      { id: "333OH", name: "OH" },
      { id: "PYRAMINX", name: "Pyraminx" },
      { id: "SKEWB", name: "Skewb" },
      { id: "SQ1", name: "Square-1" },
      { id: "MEGAMINX", name: "Megaminx" },
      { id: "CLOCK", name: "Clock" },
      { id: "333BLD", name: "3BLD" },
      { id: "444BLD", name: "4BLD" },
      { id: "555BLD", name: "5BLD" },
      { id: "333MULTIBLD", name: "MBLD" },
      { id: "333FEW", name: "Fewest" },
    ],
    []
  );

  const relayEvents = useMemo(() => {
    const hasLegacyRelaySessions = (sessions || []).some(
      (session) => normalizeEventId(session.Event) === "RELAY"
    );
    const customRelayEvents = (customEvents || [])
      .filter((event) => event?.isRelayEvent)
      .map((event) => ({
        id: event.EventID || event.id,
        name: event.EventName || event.name || event.EventID || event.id,
        legs: Array.isArray(event.relayLegs) ? event.relayLegs : [],
        isCustom: true,
      }));

    return [
      ...RELAY_EVENT_DEFINITIONS,
      ...customRelayEvents,
      ...(hasLegacyRelaySessions ? [{ id: "RELAY", name: "Legacy Relay", legs: [] }] : []),
    ];
  }, [customEvents, sessions]);

  const customEventIds = useMemo(
    () =>
      new Set(
        (customEvents || [])
          .map((event) => normalizeEventId(event.EventID || event.id))
          .filter(Boolean)
      ),
    [customEvents]
  );

  // -----------------------------
  // Fetch sessions & custom events
  // -----------------------------
  const refreshData = useCallback(async ({ includeSessions = true, includeCustomEvents = true } = {}) => {
    if (!userID) return;
    try {
      let sess = Array.isArray(sessions) ? sessions : [];
      let cust = Array.isArray(customEvents) ? customEvents : [];

      if (includeSessions && includeCustomEvents) {
        [sess, cust] = await Promise.all([
          getSessions(userID),
          getCustomEvents(userID),
        ]);
      } else if (includeSessions) {
        sess = await getSessions(userID);
      } else if (includeCustomEvents) {
        cust = await getCustomEvents(userID);
      }

      const missingEvents = DEFAULT_EVENTS.filter(
        (eventId) =>
          !(sess || []).some(
            (session) =>
              normalizeEventId(session.Event) === normalizeEventId(eventId) &&
              String(session.SessionID || "").trim() === "main"
          )
      );

      const relayEventsNeedingRepair = DEFAULT_EVENTS.filter((eventId) => {
        const relayOpts = getRelaySessionOptions(eventId);
        if (relayOpts.sessionType !== "RELAY") return false;

        const session = (sess || []).find(
          (item) =>
            normalizeEventId(item.Event) === normalizeEventId(eventId) &&
            String(item.SessionID || "").trim() === "main"
        );
        if (!session) return true;

        const currentLegs = Array.isArray(session.RelayLegs) ? session.RelayLegs : [];
        return session.SessionType !== "RELAY" || currentLegs.join("|") !== relayOpts.relayLegs.join("|");
      });

      if (missingEvents.length > 0 || relayEventsNeedingRepair.length > 0) {
        await runDb("Creating sessions", async () => {
          await Promise.all(
            Array.from(new Set([...missingEvents, ...relayEventsNeedingRepair])).map((eventId) =>
              createSession(
                userID,
                eventId,
                "main",
                "Main",
                getRelaySessionOptions(eventId)
              )
            )
          );
        });

        sess = await getSessions(userID);
      }

      if (includeSessions || missingEvents.length > 0 || relayEventsNeedingRepair.length > 0) {
        setSessionsState(sess || []);
      }
      if (includeCustomEvents) {
        setCustomEventsState(cust || []);
      }
      return { sessions: sess || [], customEvents: cust || [] };
    } catch (err) {
      console.error("❌ Error fetching sessions/events:", err);
      return { sessions: [], customEvents: [] };
    }
  }, [customEvents, runDb, sessions, userID]);

  useEffect(() => {
    if (!userID) {
      setSessionsState(null);
      setCustomEventsState(null);
      return;
    }
  }, [userID]);

  useEffect(() => {
    if (!isOpen || !userID) return;

    const shouldFetchSessions = sessions.length === 0;
    const shouldFetchCustomEvents =
      customEventsState == null && (!Array.isArray(providedCustomEvents) || providedCustomEvents.length === 0);

    if (!shouldFetchSessions && !shouldFetchCustomEvents) return;

    refreshData({
      includeSessions: shouldFetchSessions,
      includeCustomEvents: shouldFetchCustomEvents,
    });
  }, [
    customEventsState,
    isOpen,
    providedCustomEvents,
    refreshData,
    sessions.length,
    userID,
  ]);

  useEffect(() => {
    if (!userID) return;

    const ev = normalizeEventId(currentEvent);
    if (!ev || DEFAULT_EVENTS.includes(ev) || isRelayEventId(ev)) return;
    if (customEvents.some((event) => normalizeEventId(event?.EventID || event?.id) === ev)) return;

    refreshData({ includeSessions: false, includeCustomEvents: true });
  }, [currentEvent, customEvents, refreshData, userID]);

  const eventLookup = useMemo(() => {
    const lookup = new Map();
    [...wcaEvents, ...relayEvents].forEach((event) => {
      lookup.set(event.id, event);
    });
    (customEvents || []).forEach((e) => {
      const id = e.EventID || e.id;
      lookup.set(id, {
        id,
        name: e.EventName || e.name || id,
        legs: Array.isArray(e.relayLegs) ? e.relayLegs : [],
        isRelayEvent: e.isRelayEvent === true,
      });
    });
    return lookup;
  }, [wcaEvents, relayEvents, customEvents]);

  const curatedEventSections = useMemo(() => {
    const getEvent = (id) => eventLookup.get(id);
    return [
      {
        label: "WCA",
        rows: [
          {
            key: "nxn",
            className: "event-gallery--six",
            events: ["222", "333", "444", "555", "666", "777"].map(getEvent).filter(Boolean),
          },
          {
            key: "variants",
            className: "event-gallery--six",
            events: ["333OH", "333FEW", "333BLD", "444BLD", "555BLD", "333MULTIBLD"]
              .map(getEvent)
              .filter(Boolean),
          },
          {
            key: "other",
            className: "event-gallery--five",
            events: ["PYRAMINX", "SKEWB", "SQ1", "MEGAMINX", "CLOCK"].map(getEvent).filter(Boolean),
          },
        ],
      },
      {
        label: "Relays",
        rows: [
          {
            key: "relays",
            className: "event-gallery--relay",
            events: relayEvents.filter(Boolean),
          },
        ],
      },
      userID &&
        customEvents.some((event) => !event?.isRelayEvent) && {
          label: "Custom Events",
          rows: [
            {
              key: "custom",
              className: "event-gallery--auto",
              events: customEvents
                .filter((event) => !event?.isRelayEvent)
                .map((e) => ({
                  id: e.EventID || e.id,
                  name: e.EventName || e.name || e.EventID || e.id,
                }))
                .filter(Boolean),
            },
          ],
        },
    ].filter(Boolean);
  }, [eventLookup, customEvents, relayEvents, userID]);

  // -----------------------------
  // Sessions for selected event
  // -----------------------------
  const activeEvent = isOpen ? draftEvent : currentEvent;
  const activeSession = isOpen ? draftSession : currentSession;

  const normalSessionsForEvent = useMemo(() => {
    const ev = normalizeEventId(activeEvent);
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
  }, [sessions, activeEvent]);

  // ✅ NEW: group "import" sessions separately so they don't clutter
  const [importSessionsForEvent, regularSessionsForEvent] = useMemo(() => {
    const imports = [];
    const regular = [];

    (normalSessionsForEvent || []).forEach((s) => {
      const sid = String(s.id || "");
      const st = String(s.raw?.SessionType || s.raw?.sessionType || "").toUpperCase();
      const nm = String(s.name || "").toLowerCase();

      const isImport =
        st === "IMPORT" ||
        sid.startsWith("import_") ||
        sid.startsWith("import-") ||
        nm.startsWith("import");

      (isImport ? imports : regular).push(s);
    });

    return [imports, regular];
  }, [normalSessionsForEvent]);

  // -----------------------------
  // Shared session grouping
  // -----------------------------
  const sharedGroups = useMemo(() => {
    const ev = normalizeEventId(activeEvent);
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
  }, [sessions, activeEvent]);

  const activeSharedLabel =
    Object.values(sharedGroups)
      .find((g) => g.sessions.some((s) => s.id === activeSession))
      ?.users.join(" ↔ ") || null;
  const activeSessionObj = useMemo(
    () =>
      (sessions || []).find(
        (session) =>
          normalizeEventId(session.Event) === normalizeEventId(activeEvent) &&
          String(session.SessionID || "main") === String(activeSession || "main")
      ) || null,
    [activeEvent, activeSession, sessions]
  );
  const activeEventIsCustom = customEventIds.has(normalizeEventId(activeEvent));
  const canDeleteActiveSession =
    !!activeSessionObj &&
    (String(activeSessionObj.SessionID || "main") !== "main" || activeEventIsCustom);
  const deletingMainDeletesEvent =
    !!activeSessionObj &&
    String(activeSessionObj.SessionID || "main") === "main" &&
    activeEventIsCustom;

  // -----------------------------
  // Handlers
  // -----------------------------
  const handleSelectEvent = (eventId) => {
    setDraftEvent(eventId);
    setDraftSession("main");
  };

  const commitSelection = useCallback(
    (eventId, sessionId) => {
      const normalizedEvent = normalizeEventId(eventId || currentEvent);
      const normalizedSession = String(sessionId || "main").trim() || "main";
      const eventChanged = normalizeEventId(currentEvent) !== normalizedEvent;
      const sessionChanged = String(currentSession || "main") !== normalizedSession;

      if (eventChanged) {
        handleEventChange({ target: { value: normalizedEvent } });
      }

      if (eventChanged || sessionChanged) {
        setCurrentSession(normalizedSession);
        onSessionChange?.();
      }

      const sessionObj = (sessions || []).find(
        (s) =>
          String(s.SessionID || "main") === normalizedSession &&
          normalizeEventId(s.Event) === normalizedEvent
      );
      onSelectSessionObj?.(sessionObj || null);
      setIsOpen(false);
    },
    [
      currentEvent,
      currentSession,
      handleEventChange,
      onSelectSessionObj,
      onSessionChange,
      sessions,
      setCurrentSession,
    ]
  );

  const handleSelectSession = (sessionId) => {
    const nextSession = String(sessionId || "main").trim() || "main";
    setDraftSession(nextSession);
    commitSelection(draftEvent || currentEvent, nextSession);
  };

  const handleDeleteActiveSession = useCallback(async () => {
    if (!userID || !activeSessionObj) return;

    const eventId = normalizeEventId(activeSessionObj.Event || activeEvent);
    const sessionId = String(activeSessionObj.SessionID || "main").trim() || "main";
    const sessionName = String(activeSessionObj.SessionName || sessionId).trim() || sessionId;
    const eventDisplayName = eventLookup.get(eventId)?.name || eventId;
    const solveCount = Number(
      activeSessionObj?.Stats?.SolveCountTotal ??
        activeSessionObj?.Stats?.solveCountTotal ??
        activeSessionObj?.Stats?.SolveCount ??
        activeSessionObj?.Stats?.solveCount ??
        0
    );
    const isCustomEvent = customEventIds.has(eventId);
    const willDeleteWholeEvent = sessionId === "main" && isCustomEvent;

    if (sessionId === "main" && !isCustomEvent) {
      alert("Core events always keep their Main session. You can delete added sessions, but not the built-in main one.");
      return;
    }

    const targetLabel = willDeleteWholeEvent ? eventDisplayName : sessionName;
    const solveLabel = `${solveCount} solve${solveCount === 1 ? "" : "s"}`;

    const firstConfirm = window.confirm(
      willDeleteWholeEvent
        ? `Delete the entire "${targetLabel}" event?\n\nThis will remove the Main session, every added session under this event, and ${solveLabel}. This cannot be undone.`
        : `Delete the "${targetLabel}" session?\n\nThis will permanently remove ${solveLabel} from this session. This cannot be undone.`
    );
    if (!firstConfirm) return;

    const confirmationPhrase = willDeleteWholeEvent ? `DELETE EVENT ${eventId}` : `DELETE SESSION ${sessionId}`;
    const typed = window.prompt(
      willDeleteWholeEvent
        ? `Final warning: this removes the whole event.\n\nType "${confirmationPhrase}" to continue.`
        : `Final warning: this permanently removes the session and its solves.\n\nType "${confirmationPhrase}" to continue.`,
      ""
    );
    if (typed !== confirmationPhrase) return;

    const secondConfirm = window.confirm(
      willDeleteWholeEvent
        ? "Last check: delete this custom event now? There is no recovery button."
        : "Last check: delete this session now? There is no recovery button."
    );
    if (!secondConfirm) return;

    try {
      await runDb(willDeleteWholeEvent ? "Deleting event" : "Deleting session", () =>
        deleteSession(userID, eventId, sessionId)
      );

      const refreshed = await refreshData();
      const nextEvent =
        willDeleteWholeEvent
          ? DEFAULT_EVENTS.find((id) =>
              (refreshed?.sessions || []).some(
                (session) =>
                  normalizeEventId(session.Event) === normalizeEventId(id) &&
                  String(session.SessionID || "main") === "main"
              )
            ) || currentEvent
          : eventId;
      const nextSession = "main";
      const nextSessionObj =
        (refreshed?.sessions || []).find(
          (session) =>
            normalizeEventId(session.Event) === normalizeEventId(nextEvent) &&
            String(session.SessionID || "main") === nextSession
        ) || null;

      if (normalizeEventId(currentEvent) !== normalizeEventId(nextEvent)) {
        handleEventChange({ target: { value: nextEvent } });
      }

      setCurrentSession(nextSession);
      onSessionChange?.();
      onSelectSessionObj?.(nextSessionObj);
      setDraftEvent(nextEvent);
      setDraftSession(nextSession);
    } catch (err) {
      console.error("❌ Failed to delete session/event:", err);
      alert(err?.message || "Failed to delete session.");
    }
  }, [
    activeEvent,
    activeSessionObj,
    currentEvent,
    customEventIds,
    eventLookup,
    handleEventChange,
    onSelectSessionObj,
    onSessionChange,
    refreshData,
    runDb,
    setCurrentSession,
    userID,
  ]);

  const close = useCallback(() => {
    setIsOpen(false);
    setShowAddSession(false);
    setShowAddEvent(false);
    setNewSessionName("");
    setNewEventName("");
    setRelayBuilderLegs([]);
    setTargetEvent(null);
    setDraftEvent(currentEvent);
    setDraftSession(currentSession || "main");
  }, [currentEvent, currentSession]);

  const commitDraftSelection = useCallback(() => {
    commitSelection(draftEvent || currentEvent, draftSession || "main");
  }, [commitSelection, currentEvent, draftEvent, draftSession]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftEvent(currentEvent);
    setDraftSession(currentSession || "main");
  }, [isOpen, currentEvent, currentSession]);

  useEffect(() => {
    if (!isOpen) return;
    const ev = normalizeEventId(draftEvent);
    const sid = String(draftSession || "main").trim() || "main";
    const hasSession = (sessions || []).some(
      (session) =>
        normalizeEventId(session.Event) === ev &&
        String(session.SessionID || "main").trim() === sid
    );
    if (!hasSession) {
      setDraftSession("main");
    }
  }, [draftEvent, draftSession, isOpen, sessions]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!isOpen) return;
      if (e.target.classList?.contains("detailPopup")) {
        commitDraftSelection();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen, commitDraftSelection]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    if (isOpen) document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [isOpen, close]);

  const eventName =
    eventLookup.get(activeEvent)?.name ||
    (customEvents || []).find((e) => (e.EventID || e.id) === activeEvent)?.EventName ||
    "Select Event";

  const sessionLabel =
    activeSharedLabel ||
    normalSessionsForEvent.find((s) => s.id === activeSession)?.name ||
    activeSession;

  // -----------------------------
  // Create session / relay session
  // -----------------------------
  const createNormalSession = async () => {
    if (!userID) return;
    const ev = normalizeEventId(targetEvent || activeEvent);
    const name = String(newSessionName || "").trim();
    if (!name) return;

    try {
      await runDb("Creating session", () => createSession(userID, ev, name)); // old signature supported
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
    const ev = normalizeEventId(targetEvent || activeEvent);
    const cleanName = String(name || "").trim();
    if (!cleanName) return;

    const sessionID = slugify(cleanName);
    const relayLegs = Array.isArray(legs) ? legs : [];

    try {
      await runDb("Creating relay session", () =>
        createSession(userID, ev, sessionID, cleanName, {
          sessionType: "RELAY",
          relayLegs,
        })
      );
      await refreshData();
      setShowAddSession(false);
      setNewSessionName("");
    } catch (err) {
      console.error("❌ Failed to create relay session:", err);
      alert("Failed to create relay session.");
    }
  };

  const createRelaySessionForSelectedEvent = async () => {
    const relayDef = eventLookup.get(normalizeEventId(targetEvent || activeEvent));
    const name = String(newSessionName || "").trim();
    if (!name) return alert("Name your relay session first.");
    if (normalizeEventId(targetEvent || activeEvent) === "RELAY") {
      return alert("Legacy relay sessions can't be created here. Use one of the relay events above.");
    }
    if (!relayDef?.legs?.length) return alert("This relay event is missing its default legs.");
    await createRelaySessionFromNameAndLegs(name, relayDef.legs);
  };

  // -----------------------------
  // Create custom event
  // -----------------------------
  const createNewCustomEvent = async () => {
    if (!userID) return;
    const name = String(newEventName || "").trim();
    if (!name) return;

    try {
      await runDb("Creating custom event", () => createCustomEvent(userID, name));
      await refreshData();
      setShowAddEvent(false);
      setNewEventName("");
    } catch (err) {
      console.error("❌ Failed to create custom event:", err);
      alert("Failed to create custom event.");
    }
  };

  const createNewRelayEvent = async () => {
    if (!userID) return;
    const name = String(newEventName || "").trim();
    const relayLegs = Array.isArray(relayBuilderLegs) ? relayBuilderLegs.filter(Boolean) : [];
    if (!name) return alert("Name your relay first.");
    if (!relayLegs.length) return alert("Add at least one event to the relay.");

    try {
      const created = await runDb("Creating relay", () =>
        createCustomEvent(userID, name, {
          isRelayEvent: true,
          relayLegs,
        })
      );

      const eventId = created?.EventID || created?.item?.EventID || String(name).toUpperCase().replace(/\s+/g, "_");

      await runDb("Creating relay session", () =>
        createSession(userID, eventId, "main", "Main", {
          sessionType: "RELAY",
          relayLegs,
        })
      );

      await refreshData();
      setDraftEvent(eventId);
      setDraftSession("main");
      setShowAddEvent(false);
      setNewEventName("");
      setRelayBuilderLegs([]);
    } catch (err) {
      console.error("❌ Failed to create relay:", err);
      alert("Failed to create relay.");
    }
  };

  const isRelayContext = isRelayEventId(activeEvent);

  useImperativeHandle(
    ref,
    () => ({
      open,
      close,
    }),
    [open, close]
  );

  const relayLegOptionPool = useMemo(
    () => wcaEvents.map((event) => ({ id: event.id, name: event.name })),
    [wcaEvents]
  );

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <>
      {/* Trigger */}
      <div
        className={`event-selector-trigger ${compact ? "event-selector-trigger--compact" : ""}`}
        onClick={open}
      >
        <div className="event-selector-box">
          <div className="event-selector-text">
            <div className="event-selector-event">{eventName}</div>
            {activeSession !== "main" && (
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
                <div className="event-selector-hero">
                  <div>
                    <div className="event-selector-eyebrow">Choose your puzzle</div>
                    <h3 className="event-selector-title">Event Selector</h3>
                  </div>

                  {userID && (
                    <div className="event-selector-actions">
                      {canDeleteActiveSession && (
                        <button
                          type="button"
                          className="event-selector-danger-btn"
                          onClick={handleDeleteActiveSession}
                        >
                          {deletingMainDeletesEvent ? "Delete Event" : "Delete Session"}
                        </button>
                      )}

                      <button
                        className="add-session-btn"
                        onClick={() => {
                          setTargetEvent(activeEvent);
                          setShowAddSession(true);
                          setNewSessionName("");
                        }}
                      >
                        + Add Session
                      </button>

                      <button
                        className="add-event-btn"
                        onClick={() => {
                          setShowAddEvent(true);
                          setNewEventName("");
                          setRelayBuilderLegs([]);
                        }}
                      >
                        {isRelayContext ? "+ Create Custom Relay Event" : "+ Add Custom Event"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="event-selector-layout">
                  <div className="event-selector-main">
                    {curatedEventSections.map((group) => (
                      <div key={group.label} className="event-group">
                        <h4>{group.label}</h4>
                        {group.rows.map((row) => (
                          <div
                            key={row.key}
                            className={`event-gallery ${row.className} event-gallery-row`}
                          >
                            {row.events.map((event) => (
                              <button
                                key={event.id}
                                type="button"
                                className={`event-card ${activeEvent === event.id ? "active" : ""}`}
                                onClick={() => handleSelectEvent(event.id)}
                                style={{ "--event-accent": getEventAccent(event.id) }}
                              >
                                <EventOptionVisual eventId={event.id} eventName={event.name} />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {userID && (
                    <aside className="event-group event-group--sessions">
                      <div className="event-group--sessions-scroll">
                        {importSessionsForEvent.length > 0 && (
                          <>
                            <h4>Imports</h4>
                            <div className="event-list event-list--stacked">
                              {importSessionsForEvent.map((s) => (
                                <div
                                  key={s.id}
                                  className={`event-item ${activeSession === s.id ? "active" : ""}`}
                                  onClick={() => handleSelectSession(s.id)}
                                >
                                  {s.name}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <h4 style={{ marginTop: importSessionsForEvent.length > 0 ? 10 : 0 }}>
                          Sessions
                        </h4>

                        <div className="event-list event-list--stacked">
                          {regularSessionsForEvent.map((s) => (
                            <div
                              key={s.id}
                              className={`event-item ${activeSession === s.id ? "active" : ""}`}
                              onClick={() => handleSelectSession(s.id)}
                            >
                              {s.name}
                            </div>
                          ))}
                        </div>

                        {regularSessionsForEvent.length === 0 && importSessionsForEvent.length === 0 && (
                          <div className="event-selector-empty-state">
                            No local sessions yet for {eventName}. Start with one clean practice session.
                          </div>
                        )}
                      </div>
                    </aside>
                  )}
                </div>
              </div>
            )}

            {/* ADD SESSION VIEW */}
            {showAddSession && (
              <div style={{ padding: 12 }}>
                <h3 style={{ margin: 0, marginBottom: 10 }}>
                  {isRelayEventId(targetEvent || activeEvent)
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
                      const ev = normalizeEventId(targetEvent || activeEvent);
                      if (isRelayEventId(ev)) {
                        await createRelaySessionForSelectedEvent();
                      } else {
                        await createNormalSession();
                      }
                    }}
                  >
                    Save
                  </button>
                </div>

                {/* Relay-only builder */}
                {isRelayEventId(targetEvent || activeEvent) && (
                  <>
                    <div style={{ marginTop: 12, opacity: 0.9, textAlign: "left" }}>
                      {normalizeEventId(targetEvent || activeEvent) === "RELAY" ? (
                        <div style={{ fontSize: 13, opacity: 0.85 }}>
                          Legacy relay sessions are still playable, but new relay sessions now belong under the
                          preset relay events in the Relay section.
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 13, marginBottom: 6 }}>Relay legs</div>
                          <div style={{ fontSize: 13, opacity: 0.85 }}>
                            {(getRelayEventDefinition(targetEvent || activeEvent)?.legs || []).join(" -> ")}
                          </div>
                        </>
                      )}
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
                <h3 style={{ margin: 0, marginBottom: 10 }}>
                  {isRelayContext ? "Create Custom Relay Event" : "Create Custom Event"}
                </h3>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    placeholder={isRelayContext ? "Relay event name" : "Event name (e.g. My Practice)"}
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
                    className="add-event-btn"
                    onClick={isRelayContext ? createNewRelayEvent : createNewCustomEvent}
                  >
                    Save
                  </button>
                </div>

                {isRelayContext && (
                  <>
                    <div style={{ marginTop: 12, textAlign: "left" }}>
                      <div className="event-selector-inline-note" style={{ marginTop: 0, marginBottom: 12 }}>
                        This creates a saved relay event with its own Main session. Use "+ Add Session" above if you only want another session inside an existing relay.
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.9 }}>
                        Add relay legs
                      </div>
                      <div className="event-gallery event-gallery--six event-gallery-row">
                        {relayLegOptionPool.map((event) => (
                          <button
                            key={`relay-builder-${event.id}`}
                            type="button"
                            className="event-card"
                            onClick={() =>
                              setRelayBuilderLegs((prev) => [...prev, event.id])
                            }
                            style={{ "--event-accent": getEventAccent(event.id) }}
                          >
                            <EventOptionVisual eventId={event.id} eventName={event.name} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, textAlign: "left" }}>
                      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.9 }}>
                        Relay order
                      </div>
                      <div className="event-list" style={{ gap: 8 }}>
                        {relayBuilderLegs.map((eventId, index) => (
                          <div
                            key={`${eventId}-${index}`}
                            className="event-item"
                            onClick={() =>
                              setRelayBuilderLegs((prev) => prev.filter((_, idx) => idx !== index))
                            }
                            title="Click to remove"
                          >
                            {eventLookup.get(eventId)?.name || eventId} #{index + 1}
                          </div>
                        ))}
                        {relayBuilderLegs.length === 0 && (
                          <div className="event-selector-empty-state" style={{ marginTop: 0 }}>
                            Tap events above to build the relay. Repeats are allowed.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div style={{ marginTop: 12 }}>
                  <button
                    className="add-event-btn"
                    onClick={() => {
                      setShowAddEvent(false);
                      setNewEventName("");
                      setRelayBuilderLegs([]);
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
});

export default EventSelector;
