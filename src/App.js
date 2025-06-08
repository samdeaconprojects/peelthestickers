import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Profile from "./components/Profile/Profile";
import Stats from "./components/Stats/Stats";
import Social from "./components/Social/Social";
import Settings from "./components/Settings/Settings";
import Navigation from "./components/Navigation/Navigation";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import EventSelector from "./components/EventSelector";
import Scramble from "./components/Scramble/Scramble";
import RubiksCubeSVG from "./components/PuzzleSVGs/RubiksCubeSVG";
import SkewbSVG from "./components/PuzzleSVGs/SkewbSVG";
import Square1SVG from "./components/PuzzleSVGs/Square1SVG";
import PyraminxSVG from "./components/PuzzleSVGs/PyraminxSVG";
import MegaminxSVG from "./components/PuzzleSVGs/MegaminxSVG";
import ClockSVG from "./components/PuzzleSVGs/ClockSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import { useSettings } from "./contexts/SettingsContext";

import { generateScramble, getScrambledFaces } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { SettingsProvider } from "./contexts/SettingsContext";
import { getUser } from "./services/getUser";
import { getSessions } from "./services/getSessions";
import { getSolvesBySession } from "./services/getSolvesBySession";
import { addSolve as addSolveToDB  } from "./services/addSolve";
import { deleteSolve } from "./services/deleteSolve";
import { getPosts } from "./services/getPosts";
import { createPost } from "./services/createPost";
import { deletePost as deletePostFromDB } from "./services/deletePost";
import { updatePostComments } from "./services/updatePostComments";
import { createSession } from "./services/createSession";
import { createUser } from "./services/createUser";
import { updateSolve } from "./services/updateSolve";
import { updateUser } from "./services/updateUser";






import { calculateBestAverageOfFive, calculateAverage, formatTime } from "./components/TimeList/TimeUtils";

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
      const [modifier, boundKey] = combo.split('+');
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

    // map each event code to its SVG component
    const puzzleMap = {
      SKEWB:    SkewbSVG,
      SQ1:      Square1SVG,
      MEGAMINX: MegaminxSVG,
      PYRAMINX: PyraminxSVG,
      CLOCK:    ClockSVG
    };

    const PuzzleSVG = puzzleMap[currentEvent] || RubiksCubeSVG;
  

   const normalizeSolve = (item) => ({
    time: item.Time,
    scramble: item.Scramble,
    event: item.Event,
    penalty: item.Penalty,
    note: item.Note || "",
    datetime: item.DateTime,
    tags: item.Tags || {}
  });
  


  const handleSignIn = async (username, password) => {
    try {
      const profile = await getUser(username);
      if (!profile) return alert("Invalid credentials!");
  
      const userID = profile.PK?.split("#")[1] || username;
  
      const posts = await getPosts(userID);
      const userWithData = { ...profile, UserID: userID, Posts: posts, Friends: profile.Friends || [] };
  
      setUser(userWithData);
      setIsSignedIn(true);
      setShowSignInPopup(false);
  
      const sessionItems = await getSessions(userID);
      const sessionsByEvent = {};
  
      for (const session of sessionItems) {
        const solves = await getSolvesBySession(userID, session.Event, session.SessionID);
        const normalizedSolves = solves.map(normalizeSolve);
  
        if (!sessionsByEvent[session.Event]) sessionsByEvent[session.Event] = [];
        if (session.SessionID === "main") {
          sessionsByEvent[session.Event] = normalizedSolves;
        }
      }
  
      setSessions(sessionsByEvent);
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };
  

  
  
  

const handleSignUp = async (username, password) => {
  try {
    // 1. Create the user profile
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

    // 2. Create default sessions for each event
    const defaultEvents = ["222", "333", "444", "555", "666", "777", "333OH", "333BLD"];
    const createSessionPromises = defaultEvents.map(event =>
      createSession(username, event, "main", "Main Session")
    );
    await Promise.all(createSessionPromises);

    // 3. Fetch and store user locally
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
  
    const newSolve = {
      time: newTime,
      scramble,
      event: currentEvent,
      penalty: null,
      note: "",
      datetime: timestamp,
      tags: {}
    };
  
    const updatedSessions = {
      ...sessions,
      [currentEvent]: [...(sessions[currentEvent] || []), newSolve],
    };
    setSessions(updatedSessions);
  
    if (isSignedIn && user) {
      try {
        const sessionID = "main"; // or generate if needed, or use a selected session
        await addSolveToDB(
          user.UserID,
          sessionID,
          currentEvent,
          newTime,
          scramble,
          null,   // penalty
          "",     // note
          {}      // tags
        );
      } catch (err) {
        console.error("Error adding solve:", err);
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
      console.log("Post added successfully.");
  
      // ✅ Refresh posts after posting
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
    // Optionally refetch or update UI state here
  } catch (err) {
    console.error("Error deleting post:", err);
  }
};

  const handleUpdateComments = async (timestamp, comments) => {
     if (!user) return;
     try {
       // 1) write to Dynamo
       await updatePostComments(user.UserID, timestamp, comments);
       // 2) refresh your local Posts array on `user`
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
    const scrambleText = scrambles[currentEvent]?.[0] || ""; // Get the current scramble
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
        />

        <div className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="scramble-select-container">
                    <EventSelector
                      currentEvent={currentEvent}
                      handleEventChange={handleEventChange}
                    />
                    <Scramble
                      scramble={scrambles[currentEvent]?.[0] || ""}
                      currentEvent={currentEvent}
                      onScrambleClick={onScrambleClick}
                    />

                    {PuzzleSVG === RubiksCubeSVG ? (
                      <RubiksCubeSVG
                        n={currentEvent}
                        faces={getScrambledFaces(
                          scrambles[currentEvent]?.[0] || "",
                          currentEvent
                        )}
                        isMusicPlayer={!isHomePage}
                        isTimerCube={true}
                      />
                    ) : (
                      <PuzzleSVG
                        scramble={scrambles[currentEvent]?.[0] || ""}
                        size={60}
                        gap={2}
                      />
                    )}
                  </div>

                  <Timer addTime={addSolve} />

                  <div className="averages-display">
                    <p></p>
                    <p className="averagesTitle">AO5</p>
                    <p className="averagesTitle">AO12</p>
                    <p className="averagesTitle">CURRENT</p>
                    <p className="averagesTime">{formatTime(avgOfFive)}</p>
                    <p className="averagesTime">{formatTime(avgOfTwelve)}</p>
                    <p className="averagesTitle">BEST</p>
                    <p className="averagesTime">{formatTime(bestAvgOfFive)}</p>
                    <p className="averagesTime">{formatTime(bestAvgOfTwelve)}</p>
                  </div>

                  <TimeList
                    solves={sessions[currentEvent] || []}
                    deleteTime={(index) => deleteTime(currentEvent, index)}
                    addPost={addPost}
                    rowsToShow={3}
                  />
                </>
              }
            />

            {/* own profile */}
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

            {/* any user’s profile */}
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
