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
import NameTag from"./components/Profile/NameTag";
import Detail from "./components/Detail/Detail";
import { useSettings } from "./contexts/SettingsContext";
import { generateScramble } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { getUser } from "./services/getUser";
import { getSessions } from "./services/getSessions";
import { getSolvesBySession } from "./services/getSolvesBySession";
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
import { DEFAULT_EVENTS } from "./defaultEvents";


import { calculateBestAverageOfFive, calculateAverage } from "./components/TimeList/TimeUtils";

function App() {
  const [currentEvent, setCurrentEvent] = useState("333");
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
  });
  const [showPlayerBar, setShowPlayerBar] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [selectedAverageSolves, setSelectedAverageSolves] = useState([]);
  const [selectedAverageIndex, setSelectedAverageIndex] = useState(0);
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const { settings } = useSettings();

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
      updatedScrambles[currentEvent] = [...eventScrambles.slice(1), generateScramble(currentEvent)];
      return updatedScrambles;
    });
  };

  const normalizeSolve = (item) => ({
    time: item.Time,
    scramble: item.Scramble,
    event: item.Event,
    penalty: item.Penalty,
    note: item.Note || "",
    datetime: item.DateTime,
    tags: item.Tags || {}
  });

  const handleSignUp = async (username, password) => {
    try {
      // Create the user profile
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
        Friends: []
      });
  
      // Create a default "main" session for every default event
      const createSessionPromises = DEFAULT_EVENTS.map(event =>
        createSession(username, event, "main", "Main Session")
      );
      await Promise.all(createSessionPromises);
  
      alert("User created successfully!");
  
      // Fetch user profile and sign them in immediately
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
  
      // Load posts and user data
      const posts = await getPosts(userID);
      const userWithData = {
        ...profile,
        UserID: userID,
        Posts: posts,
        Friends: profile.Friends || []
      };
  
      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);
  
      // Fetch sessions for this user
      let sessionItems = await getSessions(userID);
  
      // Backfill missing sessions BEFORE fetching solves
      const missingEvents = DEFAULT_EVENTS.filter(event =>
        !sessionItems.find(s => s.Event === event && s.SessionID === "main")
      );
  
      if (missingEvents.length > 0) {
        const createMissing = missingEvents.map(event =>
          createSession(userID, event, "main", "Main Session")
        );
        await Promise.all(createMissing);
  
        // Fetch again after creating missing ones
        sessionItems = await getSessions(userID);
      }
  
      // Build sessions state
      const sessionsByEvent = {};
  
      // Initialize all default events first
      for (const event of DEFAULT_EVENTS) {
        sessionsByEvent[event] = [];
      }
  
      // Populate solves for all sessions we fetched
      for (const session of sessionItems) {
        const normalizedEvent = session.Event.toUpperCase();
        const solves = await getSolvesBySession(userID, normalizedEvent, session.SessionID);
        const normalizedSolves = solves.map(normalizeSolve);
      
        if (!sessionsByEvent[normalizedEvent]) sessionsByEvent[normalizedEvent] = [];
        if (session.SessionID === "main") {
          sessionsByEvent[normalizedEvent] = normalizedSolves;
        }
      }
      

      console.log("Final sessionsByEvent:", sessionsByEvent);

  
      setSessions(sessionsByEvent);
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };
  
  

  const fetchFullData = async (userID) => {
    try {
      const userData = await getUser(userID);
      if (userData) {
        setSessions(userData.Sessions || {});
      }
    } catch (error) {
      console.error("Error fetching full data:", error);
    }
  };

  const addSolve = async (newTime) => {
    const scramble = getNextScramble();
    const timestamp = new Date().toISOString();
  
    console.log("🧩 Adding solve:", {
      event: currentEvent,
      sessionID: "main",
      time: newTime,
      scramble
    });
  
    const newSolve = {
      time: newTime,
      scramble,
      event: currentEvent,
      penalty: null,
      note: "",
      datetime: timestamp,
      tags: {}
    };
  
    // Update local state
    const updatedSessions = {
      ...sessions,
      [currentEvent]: [...(sessions[currentEvent] || []), newSolve],
    };
    setSessions(updatedSessions);
  
    // Persist to DB
    if (isSignedIn && user) {
      try {
        await addSolveToDB(
          user.UserID,
          "main", // 🔹 Placeholder until multi-session support is added
          currentEvent,
          newTime,
          scramble,
          null,
          "",
          {}
        );
      } catch (err) {
        console.error("❌ Error adding solve:", err);
      }
    }
  };
  

  const applyPenalty = async (timestamp, penalty, updatedTime) => {
    const updatedSessions = { ...sessions };
    const eventSolves = updatedSessions[currentEvent] || [];

    const updatedSolves = eventSolves.map((solve) => {
      if (solve.datetime === timestamp) {
        return {
          ...solve,
          penalty,
          time: updatedTime,
          originalTime: solve.originalTime ?? solve.time
        };
      }
      return solve;
    });

    updatedSessions[currentEvent] = updatedSolves;
    setSessions(updatedSessions);

    if (isSignedIn && user?.UserID) {
      try {
        await updateSolve(user.UserID, timestamp, {
          Penalty: penalty,
          Time: updatedTime,
          OriginalTime: updatedSolves.find(s => s.datetime === timestamp)?.originalTime
        });
      } catch (err) {
        console.error("❌ Failed to update DynamoDB penalty:", err);
      }
    }
  };

  const deleteTime = async (eventKey, index) => {
    const originalSessions = { ...sessions };
    const solve = sessions[eventKey][index];
    const updated = sessions[eventKey].filter((_, idx) => idx !== index);
    setSessions({ ...sessions, [eventKey]: updated });

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
      setUser(prev => ({
        ...prev,
        Posts: posts
      }));
    } catch (err) {
      console.error("Error adding post:", err);
    }
  };

  const deletePost = async (timestamp) => {
    if (!user) return;

    try {
      await deletePostFromDB(user.UserID, timestamp);
      console.log("Post deleted.");
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  const handleUpdateComments = async (timestamp, comments) => {
    if (!user) return;
    try {
      await updatePostComments(user.UserID, timestamp, comments);
      const fresh = await getPosts(user.UserID);
      setUser(prev => ({ ...prev, Posts: fresh }));
    } catch (err) {
      console.error("Error updating comments:", err);
    }
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
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

  // NEW: open the native select programmatically (works in modern browsers)
  const openEventSelector = () => {
    const el =
      document.querySelector(".event-select select") ||
      document.querySelector(".event-select");
    if (el) {
      try {
        el.focus();
        el.click();
      } catch (_) {
        // ignore
      }
    }
  };

  const currentSolves = sessions[currentEvent] || [];
  const avgOfFive = calculateAverage(currentSolves.slice(-5).map((s) => s.time), true).average;
  const avgOfTwelve = calculateAverage(currentSolves.slice(-12).map((s) => s.time), true).average || "N/A";
  const bestAvgOfFive = calculateBestAverageOfFive(currentSolves.map((s) => s.time));
  const bestAvgOfTwelve =
    currentSolves.length >= 12
      ? Math.min(
          ...currentSolves.map((_, i) =>
            i + 12 <= currentSolves.length
              ? calculateAverage(currentSolves.slice(i, i + 12).map((s) => s.time), true).average
              : Infinity
          )
        )
      : "N/A";

  return (
    <div className={`App ${!isHomePage ? "music-player-mode" : ""}`}>
      <div className={`navAndPage ${isHomePage || !showPlayerBar ? "fullHeight" : "reducedHeight"}`}>
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
                    {/* LEFT SLOT (used to be EventSelector) -> now Sign-in/@Name */}
                    <div className="left-slot-auth">
                      <NameTag
                        isSignedIn={isSignedIn}
                        user={user}
                        handleSignIn={handleShowSignInPopup}
                      />
                    </div>

                    {/* SCRAMBLE text (center) */}
                    <Scramble
                      scramble={scrambles[currentEvent]?.[0] || ""}
                      currentEvent={currentEvent}
                      onScrambleClick={onScrambleClick}
                      onForwardScramble={skipToNextScramble}
                    />

                    {/* CUBE + EVENT SELECTOR (right column, selector under cube) */}
                    <div className="cube-and-event">
                      <div onClick={openEventSelector} style={{ cursor: "pointer" }}>
                        <PuzzleSVG
                          event={currentEvent}
                          scramble={scrambles[currentEvent]?.[0] || ""}
                          isMusicPlayer={!isHomePage}
                          isTimerCube={true}
                        />
                      </div>

                      <div onClick={openEventSelector} style={{ cursor: "pointer" }}>
                        <EventSelector
                          currentEvent={currentEvent}
                          handleEventChange={handleEventChange}
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
                    solves={sessions[currentEvent] || []}
                    deleteTime={(index) => deleteTime(currentEvent, index)}
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
                          currentEvent,
                          sessions[currentEvent].indexOf(
                            selectedAverageSolves[selectedAverageIndex]
                          )
                        )
                      }
                      addPost={addPost}
                      showNavButtons={true}
                      onPrev={() =>
                        setSelectedAverageIndex((i) => Math.max(0, i - 1))
                      }
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
                  setSessions={setSessions}
                  currentEvent={currentEvent}
                  setCurrentEvent={setCurrentEvent}
                  deleteTime={(eventKey, index) => deleteTime(eventKey, index)}
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
          handleEventChange={handleEventChange}
          deleteTime={deleteTime}
          addTime={addSolve}
          scramble={scrambles[currentEvent]?.[0] || ""}
          onScrambleClick={onScrambleClick}
          addPost={addPost}
          user={user}
          applyPenalty={applyPenalty}
        />
      )}

      {!isHomePage && (
        <div className="toggle-bar">
          {showPlayerBar ? (
            <button
              className="toggle-button"
              onClick={() => setShowPlayerBar(false)}
            >
              &#x25BC;
            </button>
          ) : (
            <button
              className="toggle-button"
              onClick={() => setShowPlayerBar(true)}
            >
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
          onProfileUpdate={(fresh) =>
            setUser((prev) => ({ ...prev, ...fresh }))
          }
        />
      )}
    </div>
  );
}

export default App;
