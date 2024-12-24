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
import RubiksCubeSVG from "./components/RubiksCubeSVG";
import SignInPopup from "./components/SignInPopup/SignInPopup";
import { generateScramble, getScrambledFaces } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { SettingsProvider } from "./contexts/SettingsContext";
import {
  getUserData,
  addSolveToDynamoDB,
  deleteSolveFromDynamoDB,
  addPostToDynamoDB,
  deletePostFromDynamoDB,
  signUpUser,
} from "./services/awsService";
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

  const location = useLocation();
  const isHomePage = location.pathname === "/";

  useEffect(() => {
    if (!scrambles[currentEvent]) {
      preloadScrambles(currentEvent);
    }
  }, [currentEvent]);

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

  const handleSignIn = async (username, password) => {
    try {
      const userData = await getUserData(username);
      if (userData) {
        setUser(userData);
        setSessions(userData.Sessions || {});
        setIsSignedIn(true);
        fetchFullData(username);
        setShowSignInPopup(false);
      } else {
        alert("Invalid credentials!");
      }
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  const handleSignUp = async (username, password) => {
    try {
      const response = await signUpUser(username, password);
      alert(response.message);
    } catch (error) {
      console.error("Error signing up:", error);
      alert("An error occurred during sign-up.");
    }
  };

  const fetchFullData = async (userID) => {
    try {
      const userData = await getUserData(userID);
      if (userData) {
        setSessions(userData.Sessions || {});
      }
    } catch (error) {
      console.error("Error fetching full data:", error);
    }
  };

  const addSolve = async (newTime) => {
    const newSolve = {
      time: newTime,
      scramble: getNextScramble(),
      event: currentEvent,
      note: "",
    };

    const updatedSessions = {
      ...sessions,
      [currentEvent]: [...(sessions[currentEvent] || []), newSolve], // Initialize if undefined
    };

    setSessions(updatedSessions);

    if (isSignedIn && user) {
      try {
        await addSolveToDynamoDB(user.UserID, currentEvent, newSolve);
      } catch (error) {
        console.error("Error adding solve:", error);
      }
    }
  };

  const deleteTime = async (eventKey, index) => {
    const originalSessions = { ...sessions }; // Backup the current state for potential rollback
  
    // Optimistically update the UI
    const updatedTimes = sessions[eventKey].filter((_, idx) => idx !== index);
    setSessions((prevSessions) => ({
      ...prevSessions,
      [eventKey]: updatedTimes,
    }));
  
    if (isSignedIn && user) {
      try {
        // Perform the database deletion
        await deleteSolveFromDynamoDB(user.UserID, eventKey, index);
  
        // Optionally refetch the updated sessions for consistency (not necessary if deleteSolveFromDynamoDB is reliable)
        // const updatedUserData = await getUserData(user.UserID);
        // setSessions(updatedUserData.Sessions || {});
      } catch (error) {
        console.error("Error deleting solve:", error);
  
        // Revert to the original state if the deletion fails
        alert("Failed to delete the solve. Please try again.");
        setSessions(originalSessions);
      }
    }
  };
  
  

  const addPost = async (newPost) => {
    if (user) {
      const updatedUser = {
        ...user,
        Posts: [...user.Posts, newPost],
      };
      setUser(updatedUser);

      if (isSignedIn) {
        try {
          await addPostToDynamoDB(user.UserID, newPost);
        } catch (error) {
          console.error("Error adding post:", error);
        }
      }
    }
  };

  const deletePost = async (postIndex) => {
    if (user) {
      const updatedUser = {
        ...user,
        Posts: user.Posts.filter((_, idx) => idx !== postIndex),
      };
      setUser(updatedUser);

      if (isSignedIn) {
        try {
          await deletePostFromDynamoDB(user.UserID, postIndex);
        } catch (error) {
          console.error("Error deleting post:", error);
        }
      }
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
    <SettingsProvider>
      <div className={`App ${!isHomePage ? "music-player-mode" : ""}`}>
        <div className={`navAndPage ${isHomePage || !showPlayerBar ? "fullHeight" : "reducedHeight"}`}>
          <Navigation handleSignIn={handleShowSignInPopup} isSignedIn={isSignedIn} />

          <div className="main-content">
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <div className="scramble-select-container">
                      <EventSelector currentEvent={currentEvent} handleEventChange={handleEventChange} />
                      <Scramble scramble={scrambles[currentEvent]?.[0] || ""} currentEvent={currentEvent} onScrambleClick={onScrambleClick}/>
                      <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scrambles[currentEvent]?.[0] || "", currentEvent)} isMusicPlayer={!isHomePage} isTimerCube={true} />
                    </div>
                    <Timer addTime={addSolve} />
                    <div className="averages-display">
                      <p></p>
                      <p className="averagesTitle">Ao5</p>
                      <p className="averagesTitle">Ao12</p>
                      <p className="averagesTitle">Current</p>
                      <p className="averagesTime">{formatTime(avgOfFive)}</p>
                      <p className="averagesTime"> {formatTime(avgOfTwelve)}</p>
                      <p className="averagesTitle">Best</p>
                      <p className="averagesTime">{formatTime(bestAvgOfFive)}</p>
                      <p className="averagesTime">{formatTime(bestAvgOfTwelve)}</p>
                    </div>
                    <TimeList solves={sessions[currentEvent] || []} deleteTime={(index) => deleteTime(currentEvent, index)} addPost={addPost} rowsToShow={3} />
                  </>
                }
              />
              <Route path="/profile" element={<Profile user={user} deletePost={deletePost} sessions={sessions} />} />
              <Route
                path="/stats"
                element={<Stats sessions={sessions} currentEvent={currentEvent} setCurrentEvent={setCurrentEvent} deleteTime={(eventKey, index) => deleteTime(eventKey, index)} addPost={addPost} />}
              />
              <Route path="/social" element={<Social user={user} deletePost={deletePost} />} />
              <Route path="/settings" element={<Settings />} />
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
        {showSignInPopup && <SignInPopup onSignIn={handleSignIn} onSignUp={handleSignUp} onClose={handleCloseSignInPopup} />}
      </div>
    </SettingsProvider>
  );
}

export default App;
