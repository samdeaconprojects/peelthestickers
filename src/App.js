// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import AveragesDisplay from "./components/AveragesDisplay/AveragesDisplay";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import Navigation from "./components/Navigation/Navigation";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import EventSelector from "./components/EventSelector";
import Scramble from "./components/Scramble/Scramble";
import PuzzleSVG from "./components/PuzzleSVGs/PuzzleSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import NameTag from "./components/Profile/NameTag";
import Detail from "./components/Detail/Detail";
import { useSettings } from "./contexts/SettingsContext";
import { generateScramble } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { getUser } from "./services/getUser";
import { getSessions } from "./services/getSessions";
import { getLastNSolvesBySession } from "./services/getSolvesBySession";
import { getCustomEvents } from "./services/getCustomEvents";
import { addSolve as addSolveToDB } from "./services/addSolve";
import { deleteSolve } from "./services/deleteSolve";
import { getPosts } from "./services/getPosts";
import { createPost } from "./services/createPost";
import { deletePost as deletePostFromDB } from "./services/deletePost";
import { updatePostComments } from "./services/updatePostComments";
import { createSession } from "./services/createSession";
import { createUser } from "./services/createUser";
import { updateSolve } from "./services/updateSolve";
import { updateUser } from "./services/updateUser";
import { sendMessage } from "./services/sendMessage";

import { DEFAULT_EVENTS } from "./defaultEvents";
import {
  calculateBestAverageOfFive,
  calculateAverage,
} from "./components/TimeList/TimeUtils";

function App() {
  const [sessionsList, setSessionsList] = useState([]); // all sessions for user
  const [customEvents, setCustomEvents] = useState([]); // all custom events for user
  const [currentSession, setCurrentSession] = useState("main"); // selected session
  const [currentEvent, setCurrentEvent] = useState("333");
  const [sessionStats, setSessionStats] = useState({}); // overall stats per session

  const [scrambles, setScrambles] = useState({});
  const [sessions, setSessions] = useState({
    "222": [],
    "333": [],
    "444": [],
    "555": [],
    "666": [],
    "777": [],
    "333OH": [],
    "333BLD": [],
    "RELAY": [],
  });
  const [showPlayerBar, setShowPlayerBar] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState([]);
  const [selectedAverageIndex, setSelectedAverageIndex] = useState(0);
  const [sharedSession, setSharedSession] = useState(null);
  const [sharedIndex, setSharedIndex] = useState(0);

  // Relay session support
  const [activeSessionObj, setActiveSessionObj] = useState(null);
  const [relayLegIndex, setRelayLegIndex] = useState(0);
  const [relayLegTimes, setRelayLegTimes] = useState([]);
  const [relayScrambles, setRelayScrambles] = useState([]);
  const [relayLegs, setRelayLegs] = useState([]);

  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const { settings } = useSettings();

  // Normalize only for relay so we always read/write solves under sessions["RELAY"]
  const eventKey =
    String(currentEvent || "").toUpperCase() === "RELAY" ? "RELAY" : currentEvent;

  useEffect(() => {
    if (!scrambles[currentEvent]) {
      preloadScrambles(currentEvent);
    }
  }, [currentEvent]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.altKey) return;

      const key = e.key.toUpperCase();
      const bindings = settings.eventKeyBindings;

      for (const [eventCode, combo] of Object.entries(bindings)) {
        const [modifier, boundKey] = combo.split("+");
        if (modifier === "Alt" && boundKey.toUpperCase() === key) {
          setCurrentEvent(eventCode);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.eventKeyBindings]);

  // Refetch solves whenever event or session changes
  useEffect(() => {
    if (!isSignedIn || !user?.UserID) return;

    const loadSolvesForCurrent = async () => {
      try {
        const normalizedEvent = eventKey.toUpperCase();
        const sessionId = currentSession || "main";

        // Only fetch the latest 200 solves by default (tune N as you like)
        const solves = await getLastNSolvesBySession(
          user.UserID,
          normalizedEvent,
          sessionId,
          200
        );
        const normalizedSolves = solves.map(normalizeSolve);

        setSessions((prev) => ({
          ...prev,
          [eventKey]: normalizedSolves,
        }));
      } catch (err) {
        console.error("Error loading solves for current event/session:", err);
      }
    };

    loadSolvesForCurrent();
  }, [isSignedIn, user?.UserID, eventKey, currentSession]);

  useEffect(() => {
    if (!sharedSession) return;

    const { event, sessionID } = sharedSession;

    setCurrentEvent(event);
    setCurrentSession(sessionID);
    setSharedIndex(0);

    console.log("Loaded Shared Session:", sessionID);
  }, [sharedSession]);

  // When a relay session is selected, prep relay legs + scrambles
  useEffect(() => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (!isRelay) return;

    const legs = Array.isArray(activeSessionObj?.RelayLegs)
      ? activeSessionObj.RelayLegs
      : [];

    setRelayLegs(legs);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles(legs.map((ev) => generateScramble(ev)));
  }, [currentEvent, currentSession, activeSessionObj]);

  const preloadScrambles = (event) => {
    const newScrambles = Array.from({ length: 10 }, () => generateScramble(event));
    setScrambles((prevScrambles) => ({
      ...prevScrambles,
      [event]: newScrambles,
    }));
  };

  const getNextScramble = () => {
    const eventScrambles = scrambles[currentEvent] || [];
    const nextScramble = eventScrambles[0] || generateScramble(currentEvent);

    setScrambles((prevScrambles) => {
      const updatedScrambles = { ...prevScrambles };
      updatedScrambles[currentEvent] = eventScrambles.slice(1);

      if (updatedScrambles[currentEvent].length < 5) {
        setTimeout(() => {
          updatedScrambles[currentEvent] = [
            ...updatedScrambles[currentEvent],
            ...Array.from({ length: 10 }, () => generateScramble(currentEvent)),
          ];
          setScrambles(updatedScrambles);
        }, 0);
      }

      return updatedScrambles;
    });

    return nextScramble;
  };

  const skipToNextScramble = () => {
    const eventScrambles = scrambles[currentEvent] || [];
    setScrambles((prevScrambles) => {
      const updatedScrambles = { ...prevScrambles };
      updatedScrambles[currentEvent] = [
        ...eventScrambles.slice(1),
        generateScramble(currentEvent),
      ];
      return updatedScrambles;
    });
  };

  // New relay set: regenerate scrambles + clear leg progress
  const resetRelaySet = () => {
    const legs = Array.isArray(relayLegs) ? relayLegs : [];
    if (!legs.length) return;

    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles(legs.map((ev) => generateScramble(ev)));
  };

  // Next Scramble (works for normal + shared + relay)
  const goForwardScramble = () => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.min(i + 1, sharedSession.scrambles.length - 1));
    } else {
      skipToNextScramble();
    }
  };

  // Previous Scramble (works for normal + shared + relay)
  const goBackwardScramble = () => {
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY";

    if (isRelay) {
      resetRelaySet();
      return;
    }

    if (sharedSession) {
      setSharedIndex((i) => Math.max(i - 1, 0));
    } else {
      // normal scrambles: prepend a fresh scramble and stay stable
      setScrambles((prev) => {
        const arr = prev[currentEvent] || [];
        return {
          ...prev,
          [currentEvent]: [generateScramble(currentEvent), ...arr],
        };
      });
    }
  };

  const normalizeSolve = (item) => {
    const baseTags = item.Tags || {};

    const relayLegsLocal = item.RelayLegs || baseTags.RelayLegs || null;
    const relayScramblesLocal = item.RelayScrambles || baseTags.RelayScrambles || null;
    const relayLegTimesLocal = item.RelayLegTimes || baseTags.RelayLegTimes || null;

    const mergedTags =
      relayLegsLocal || relayScramblesLocal || relayLegTimesLocal
        ? {
            ...baseTags,
            IsRelay: baseTags.IsRelay ?? true,
            RelayLegs: relayLegsLocal ?? baseTags.RelayLegs,
            RelayScrambles: relayScramblesLocal ?? baseTags.RelayScrambles,
            RelayLegTimes: relayLegTimesLocal ?? baseTags.RelayLegTimes,
          }
        : baseTags;

    return {
      time: item.Time,
      scramble: item.Scramble,
      event: item.Event,
      penalty: item.Penalty,
      note: item.Note || "",
      datetime: item.DateTime,
      tags: mergedTags,

      // relay extras (for later UI/detail)
      relayLegs: relayLegsLocal,
      relayScrambles: relayScramblesLocal,
      relayLegTimes: relayLegTimesLocal,
    };
  };

  const mergeSharedSession = (session) => {
    // merge into whatever session the user has selected
    // e.g., push solves into DynamoDB and local state
    console.log("Merging shared session:", session);
  };

  const handleSignUp = async (username, password) => {
    try {
      await createUser({
        userID: username,
        name: username,
        username: username,
        color: "#0E171D",
        profileEvent: "333",
        profileScramble: generateScramble("333"),
        chosenStats: [],
        headerStats: [],
        wcaid: null,
        cubeCollection: [],
        settings: {
          primaryColor: "#0E171D",
          secondaryColor: "#ffffff",
          timerInput: "Keyboard",
        },
        Friends: [],
      });

      const createSessionPromises = DEFAULT_EVENTS.map((event) =>
        createSession(username, event, "main", "Main Session")
      );
      await Promise.all(createSessionPromises);

      alert("User created successfully!");

      const profile = await getUser(username);
      setUser(profile);
      setIsSignedIn(true);
      setShowSignInPopup(false);
    } catch (error) {
      console.error("Error signing up:", error);
      alert("An error occurred during sign-up.");
    }
  };

  const handleSignIn = async (username, password) => {
    try {
      const profile = await getUser(username);
      if (!profile) return alert("Invalid credentials!");

      const userID = profile.PK?.split("#")[1] || username;

      const posts = await getPosts(userID);
      const userWithData = {
        ...profile,
        UserID: userID,
        Posts: posts,
        Friends: profile.Friends || [],
      };

      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);

      let sessionItems = await getSessions(userID);
      const eventItems = await getCustomEvents(userID);

      setSessionsList(sessionItems);
      setCustomEvents(eventItems);

      const missingEvents = DEFAULT_EVENTS.filter(
        (event) =>
          !sessionItems.find((s) => s.Event === event && s.SessionID === "main")
      );

      if (missingEvents.length > 0) {
        const createMissing = missingEvents.map((event) =>
          createSession(userID, event, "main", "Main Session")
        );
        await Promise.all(createMissing);
        sessionItems = await getSessions(userID);
        setSessionsList(sessionItems); // refresh
      }

      const statsByEvent = {};
      for (const event of DEFAULT_EVENTS) {
        statsByEvent[event] = {};
      }

      for (const session of sessionItems) {
        const ev = (session.Event || "").toUpperCase();
        const sid = session.SessionID || "main";

        if (!statsByEvent[ev]) statsByEvent[ev] = {};
        statsByEvent[ev][sid] = session.Stats || null;
      }

      setSessionStats(statsByEvent);
      //  Do not setSessions(...) here – solves will load on demand
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };

  const addSolve = async (newTime) => {
    // Relay mode
    const isRelay =
      String(currentEvent || "").toUpperCase() === "RELAY" &&
      activeSessionObj?.SessionType === "RELAY" &&
      Array.isArray(relayLegs) &&
      relayLegs.length > 0;

    if (isRelay) {
      // Relay mode
const isRelay =
  String(currentEvent || "").toUpperCase() === "RELAY" &&
  activeSessionObj?.SessionType === "RELAY" &&
  Array.isArray(relayLegs) &&
  relayLegs.length > 0;

if (isRelay) {
  const timestamp = new Date().toISOString();

  const relayTags = {
    IsRelay: true,
    RelayLegs: relayLegs,
    RelayScrambles: relayScrambles,
  };

  // If user wants per-leg timing, keep current behavior
  if ((settings?.relayMode || "total") === "legs") {
    const legIdx = relayLegIndex;

    const nextLegTimes = [...relayLegTimes, newTime];
    setRelayLegTimes(nextLegTimes);

    const isLastLeg = legIdx >= relayLegs.length - 1;

    // still in-progress -> advance to next leg
    if (!isLastLeg) {
      setRelayLegIndex(legIdx + 1);
      return;
    }

    // completed legs -> save ONE solve with total + leg breakdown
    const totalMs = nextLegTimes.reduce((a, b) => a + b, 0);

    const fullRelayTags = {
      ...relayTags,
      RelayLegTimes: nextLegTimes,
    };

    const newSolve = {
      time: totalMs,
      scramble: "Relay",
      event: "RELAY",
      penalty: null,
      note: "",
      datetime: timestamp,
      tags: fullRelayTags,
    };

    // update local UI immediately (store under sessions["RELAY"])
    setSessions((prev) => ({
      ...prev,
      RELAY: [...(prev.RELAY || []), newSolve],
    }));

    if (isSignedIn && user) {
      try {
        await addSolveToDB(
          user.UserID,
          currentSession,
          "RELAY",
          totalMs,
          "Relay",
          null,
          "",
          fullRelayTags
        );
      } catch (err) {
        console.error("Error adding relay solve:", err);
      }
    }

    resetRelaySet();
    return;
  }

  // Default: total-time relay (normal start/stop saves immediately)
  const totalMs = newTime;

  const newSolve = {
    time: totalMs,
    scramble: "Relay",
    event: "RELAY",
    penalty: null,
    note: "",
    datetime: timestamp,
    tags: relayTags,
  };

  setSessions((prev) => ({
    ...prev,
    RELAY: [...(prev.RELAY || []), newSolve],
  }));

  if (isSignedIn && user) {
    try {
      await addSolveToDB(
        user.UserID,
        currentSession,
        "RELAY",
        totalMs,
        "Relay",
        null,
        "",
        relayTags
      );
    } catch (err) {
      console.error("Error adding relay solve:", err);
    }
  }

  resetRelaySet();
  return;
}

    }

    let scramble;

    // -----------------------
    // SHARED SESSION MODE
    // -----------------------
    let activeSharedID = null;
    let solveIndexForBroadcast = null;

    if (sharedSession) {
      scramble = sharedSession.scrambles[sharedIndex];

      // save index BEFORE advancing
      solveIndexForBroadcast = sharedIndex;
      activeSharedID = sharedSession.sharedID;

      const nextIndex = sharedIndex + 1;
      setSharedIndex(nextIndex);

      if (nextIndex >= sharedSession.scrambles.length) {
        console.log("Shared session completed");
        setSharedSession(null);
      }
      setScrambles((prev) => ({
        ...prev,
        [currentEvent]: [...prev[currentEvent]],
      }));
    } else {
      // -----------------------
      // NORMAL MODE
      // -----------------------
      scramble = getNextScramble();
    }

    const timestamp = new Date().toISOString();

    console.log("Adding solve:", {
      event: currentEvent,
      sessionID: currentSession,
      time: newTime,
      scramble,
    });

    const newSolve = {
      time: newTime,
      scramble,
      event: currentEvent,
      penalty: null,
      note: "",
      datetime: timestamp,
      tags: sharedSession
        ? {
            IsShared: true,
            SharedID: sharedSession.sharedID,
            SharedIndex: sharedIndex,
          }
        : {},
    };

    // update local UI immediately
    const updatedSessions = {
      ...sessions,
      [currentEvent]: [...(sessions[currentEvent] || []), newSolve],
    };
    setSessions(updatedSessions);

    // -----------------------------
    // SAVE TO DATABASE
    // -----------------------------
    if (isSignedIn && user) {
      try {
        await addSolveToDB(
          user.UserID,
          currentSession,
          currentEvent,
          newTime,
          scramble,
          null,
          "",
          newSolve.tags
        );

        // BROADCAST BACK TO CHAT (so scoreboard updates)
        if (activeSharedID) {
          const messageText = `[sharedUpdate]${activeSharedID}|${solveIndexForBroadcast}|${newTime}|${user.UserID}`;

          const conversationID = activeSharedID
            .replace("SHARED#", "")
            .split("#")
            .slice(0, 2)
            .sort()
            .join("#");

          await sendMessage(conversationID, user.UserID, messageText);
        }

        if (activeSharedID) {
          const messageText = `[sharedUpdate]${activeSharedID}|${solveIndexForBroadcast}|${newTime}|${user.UserID}`;

          const conversationID = activeSharedID
            .replace("SHARED#", "")
            .split("#")
            .slice(0, 2)
            .sort()
            .join("#");

          await sendMessage(conversationID, user.UserID, messageText);
        }
      } catch (err) {
        console.error("Error adding solve:", err);
      }
    }
  };

  const applyPenalty = async (timestamp, penalty, updatedTime) => {
    const updatedSessions = { ...sessions };
    const eventSolves = updatedSessions[eventKey] || [];

    const updatedSolves = eventSolves.map((solve) => {
      if (solve.datetime === timestamp) {
        return {
          ...solve,
          penalty,
          time: updatedTime,
          originalTime: solve.originalTime ?? solve.time,
        };
      }
      return solve;
    });

    updatedSessions[eventKey] = updatedSolves;
    setSessions(updatedSessions);

    if (isSignedIn && user?.UserID) {
      try {
        await updateSolve(user.UserID, timestamp, {
          Penalty: penalty,
          Time: updatedTime,
          OriginalTime: updatedSolves.find((s) => s.datetime === timestamp)
            ?.originalTime,
        });
      } catch (err) {
        console.error("Failed to update DynamoDB penalty:", err);
      }
    }
  };

  const deleteTime = async (eventKeyParam, index) => {
    const originalSessions = { ...sessions };
    const solve = sessions[eventKeyParam][index];
    const updated = sessions[eventKeyParam].filter((_, idx) => idx !== index);
    setSessions({ ...sessions, [eventKeyParam]: updated });

    if (isSignedIn && user) {
      try {
        await deleteSolve(user.UserID, solve.datetime);
      } catch (err) {
        alert("Failed to delete solve");
        console.error(err);
        setSessions(originalSessions);
      }
    }
  };

  const addPost = async ({ note, event, solveList = [], comments = [] }) => {
    if (!user) return;

    try {
      await createPost(user.UserID, note, event, solveList, comments);
      const posts = await getPosts(user.UserID);
      setUser((prev) => ({
        ...prev,
        Posts: posts,
      }));
    } catch (err) {
      console.error("Error adding post:", err);
    }
  };

  const deletePost = async (timestamp) => {
    if (!user) return;

    try {
      await deletePostFromDB(user.UserID, timestamp);
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  const handleUpdateComments = async (timestamp, comments) => {
    if (!user) return;
    try {
      await updatePostComments(user.UserID, timestamp, comments);
      const fresh = await getPosts(user.UserID);
      setUser((prev) => ({ ...prev, Posts: fresh }));
    } catch (err) {
      console.error("Error updating comments:", err);
    }
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    setCurrentSession("main");
    setSharedSession(null);
    setSharedIndex(0);

    // reset relay state when switching events
    setActiveSessionObj(null);
    setRelayLegIndex(0);
    setRelayLegTimes([]);
    setRelayScrambles([]);
    setRelayLegs([]);
  };

  const onScrambleClick = () => {
    const scrambleText = scrambles[currentEvent]?.[0] || "";
    if (scrambleText) {
      navigator.clipboard
        .writeText(scrambleText)
        .then(() => {
          alert("Scramble copied to clipboard!");
        })
        .catch((error) => {
          console.error("Failed to copy scramble: ", error);
          alert("Failed to copy scramble.");
        });
    } else {
      alert("No scramble available to copy.");
    }
  };

  const handleShowSignInPopup = () => setShowSignInPopup(true);
  const handleCloseSignInPopup = () => setShowSignInPopup(false);

  const openEventSelector = () => {
    const el = document.querySelector(".event-selector-trigger");
    if (el) {
      try {
        el.click();
      } catch (_) {}
    }
  };

  const currentSolves = sessions[eventKey] || [];
  const avgOfFive = calculateAverage(
    currentSolves.slice(-5).map((s) => s.time),
    true
  ).average;
  const avgOfTwelve =
    calculateAverage(
      currentSolves.slice(-12).map((s) => s.time),
      true
    ).average || "N/A";
  const bestAvgOfFive = calculateBestAverageOfFive(
    currentSolves.map((s) => s.time)
  );
  const bestAvgOfTwelve =
    currentSolves.length >= 12
      ? Math.min(
          ...currentSolves.map((_, i) =>
            i + 12 <= currentSolves.length
              ? calculateAverage(
                  currentSolves.slice(i, i + 12).map((s) => s.time),
                  true
                ).average
              : Infinity
          )
        )
      : "N/A";

  // figure out what scramble + svg should show
  const isRelayActive =
    String(currentEvent || "").toUpperCase() === "RELAY" &&
    activeSessionObj?.SessionType === "RELAY" &&
    relayLegs.length > 0;

  const relayCurrentEvent = isRelayActive ? relayLegs[relayLegIndex] : null;
  const relayCurrentScramble = isRelayActive
    ? relayScrambles[relayLegIndex] || ""
    : "";

  const displayedScramble = sharedSession
    ? sharedSession.scrambles[sharedIndex] || ""
    : isRelayActive
    ? relayCurrentScramble
    : scrambles[currentEvent]?.[0] || "";

  const displayedSvgEvent = isRelayActive ? relayCurrentEvent : currentEvent;

  return (
    <div className={`App ${!isHomePage ? "music-player-mode" : ""}`}>
      <div
        className={`navAndPage ${
          isHomePage || !showPlayerBar ? "fullHeight" : "reducedHeight"
        }`}
      >
        <Navigation
          handleSignIn={handleShowSignInPopup}
          isSignedIn={isSignedIn}
          handleSettingsClick={() => setShowSettingsPopup(true)}
          name={user?.Name || ""}
        />

        <div className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="scramble-select-container">
                    <div className="left-slot-auth">
                      <NameTag
                        isSignedIn={isSignedIn}
                        user={user}
                        handleSignIn={handleShowSignInPopup}
                      />
                    </div>

                    <div className="scrambleRelayContainer">
                      <Scramble
                        scramble={displayedScramble}
                        currentEvent={displayedSvgEvent}
                        onScrambleClick={onScrambleClick}
                        onForwardScramble={goForwardScramble}
                        onBackwardScramble={goBackwardScramble}
                      />

                      {/*  Relay leg buttons (under the scramble) */}
                      {isRelayActive && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          {relayLegs.map((ev, idx) => {
                            const done = idx < relayLegTimes.length;
                            const active = idx === relayLegIndex;
                            return (
                              <button
                                key={`${ev}-${idx}`}
                                type="button"
                                onClick={() => setRelayLegIndex(idx)}
                                style={{
                                  background: active ? "#2EC4B6" : "#3D3D3D",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "6px 10px",
                                  cursor: "pointer",
                                  opacity: done ? 1 : 0.85,
                                  fontWeight: done ? 700 : 500,
                                }}
                              >
                                {ev}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="cube-and-event">
                      <div
                        className="puzzle-hud"
                        onClick={openEventSelector}
                        style={{ cursor: "pointer" }}
                      >
                        <PuzzleSVG
                          event={displayedSvgEvent}
                          scramble={displayedScramble}
                          isMusicPlayer={!isHomePage}
                          isTimerCube={true}
                        />
                      </div>

                      <div className="event-hud">
                        <EventSelector
                          currentEvent={currentEvent}
                          handleEventChange={handleEventChange}
                          currentSession={currentSession}
                          setCurrentSession={setCurrentSession}
                          sessions={sessionsList}
                          customEvents={customEvents}
                          userID={user?.UserID}
                          onSessionChange={() => {
                            setSharedSession(null);
                            setSharedIndex(0);

                            // reset relay progress when changing sessions
                            setRelayLegIndex(0);
                            setRelayLegTimes([]);
                            setRelayScrambles([]);
                            setRelayLegs([]);
                          }}
                          onSelectSessionObj={(sessionObj) => {
                            setActiveSessionObj(sessionObj);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <Timer addTime={addSolve} />

                  <AveragesDisplay
                    currentSolves={currentSolves}
                    setSelectedAverageSolves={setSelectedAverageSolves}
                  />

                  <TimeList
                    user={user}
                    applyPenalty={applyPenalty}
                    solves={currentSolves}
                    deleteTime={(index) => deleteTime(eventKey, index)}
                    addPost={addPost}
                    rowsToShow={3}
                    onAverageClick={(solveArray) => {
                      setSelectedAverageSolves(solveArray);
                      setSelectedAverageIndex(0);
                    }}
                  />

                  {selectedAverageSolves.length > 0 && (
                    <Detail
                      solve={selectedAverageSolves[selectedAverageIndex]}
                      onClose={() => {
                        setSelectedAverageSolves([]);
                        setSelectedAverageIndex(0);
                      }}
                      deleteTime={() =>
                        deleteTime(
                          eventKey,
                          sessions[eventKey].indexOf(
                            selectedAverageSolves[selectedAverageIndex]
                          )
                        )
                      }
                      addPost={addPost}
                      showNavButtons={true}
                      onPrev={() => setSelectedAverageIndex((i) => Math.max(0, i - 1))}
                      onNext={() =>
                        setSelectedAverageIndex((i) =>
                          Math.min(selectedAverageSolves.length - 1, i + 1)
                        )
                      }
                      applyPenalty={applyPenalty}
                      userID={user?.UserID}
                    />
                  )}
                </>
              }
            />

            <Route
              path="/profile"
              element={
                <Profile
                  user={user}
                  setUser={setUser}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  sessions={sessions}
                />
              }
            />

            <Route
              path="/profile/:userID"
              element={
                <Profile
                  user={user}
                  setUser={setUser}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  sessions={sessions}
                />
              }
            />

            <Route
              path="/stats"
              element={
                <Stats
                  sessions={sessions}
                  sessionStats={sessionStats}
                  setSessions={setSessions}
                  currentEvent={currentEvent}
                  currentSession={currentSession}
                  user={user}
                  deleteTime={(eventKeyParam, index) => deleteTime(eventKeyParam, index)}
                  addPost={addPost}
                />
              }
            />

            <Route
              path="/social"
              element={
                <Social
                  user={user}
                  addPost={addPost}
                  deletePost={deletePost}
                  updateComments={handleUpdateComments}
                  setSharedSession={setSharedSession}
                  mergeSharedSession={mergeSharedSession}
                />
              }
            />
          </Routes>
        </div>
      </div>

      {!isHomePage && showPlayerBar && (
        <PlayerBar
          sessions={sessions}
          currentEvent={currentEvent}
          currentSession={currentSession}
          setCurrentSession={setCurrentSession}
          sharedSession={sharedSession}
          clearSharedSession={() => setSharedSession(null)}
          sessionsList={sessionsList}
          customEvents={customEvents}
          handleEventChange={handleEventChange}
          deleteTime={deleteTime}
          addTime={addSolve}
          scramble={displayedScramble}
          onScrambleClick={onScrambleClick}
          goForwardScramble={goForwardScramble}
          goBackwardScramble={goBackwardScramble}
          addPost={addPost}
          user={user}
          applyPenalty={applyPenalty}
        />
      )}

      {!isHomePage && (
        <div className="toggle-bar">
          {showPlayerBar ? (
            <button className="toggle-button" onClick={() => setShowPlayerBar(false)}>
              &#x25BC;
            </button>
          ) : (
            <button className="toggle-button" onClick={() => setShowPlayerBar(true)}>
              &#x25B2;
            </button>
          )}
        </div>
      )}

      {showSignInPopup && (
        <SignInPopup
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onClose={handleCloseSignInPopup}
        />
      )}

      {showSettingsPopup && (
        <Settings
          userID={user?.UserID}
          onClose={() => setShowSettingsPopup(false)}
          onProfileUpdate={(fresh) => setUser((prev) => ({ ...prev, ...fresh }))}
        />
      )}
    </div>
  );
}

export default App;
