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
import { generateScramble, getScrambledFaces } from "./components/scrambleUtils";
import { Routes, Route, useLocation } from "react-router-dom";
import { SettingsProvider } from "./contexts/SettingsContext";

// Import the AWS service functions
import {
  getUserData,
  addSolveToDynamoDB,
  deleteSolveFromDynamoDB,
  addPostToDynamoDB,
  deletePostFromDynamoDB
} from './services/awsService'; // Ensure this path is correct based on your project structure

function App() {
  const [currentEvent, setCurrentEvent] = useState("333");
  const [scramble, setScramble] = useState("");
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
  
  useEffect(() => {
    setScramble(generateScramble(currentEvent));
  }, [currentEvent]);

  const location = useLocation();
  const isHomePage = location.pathname === "/";

  // Handle Sign In
  const handleSignIn = async () => {
    const userID = "samtest3"; // For now, fixed UserID
    try {
      const userData = await getUserData(userID);
      if (userData) {
        setUser(userData);
        setSessions(userData.Sessions || {});
        setIsSignedIn(true);
      } else {
        alert("User not found!");
      }
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  // Add Solve
  const addSolve = async (newTime) => {
    const newSolve = {
      time: newTime,
      scramble,
      event: currentEvent,
      note: ""
    };

    const updatedSessions = {
      ...sessions,
      [currentEvent]: [...sessions[currentEvent], newSolve]
    };

    setSessions(updatedSessions);

    if (isSignedIn && user) {
      try {
        await addSolveToDynamoDB(user.UserID, currentEvent, newSolve);
      } catch (error) {
        console.error("Error adding solve:", error);
      }
    }

    setScramble(generateScramble(currentEvent)); // Generate a new scramble after saving solve
  };

  // Delete Solve
  const deleteTime = async (eventKey, index) => {
    const updatedTimes = sessions[eventKey].filter((_, idx) => idx !== index);
    setSessions((prevSessions) => ({
      ...prevSessions,
      [eventKey]: updatedTimes
    }));

    if (isSignedIn && user) {
      try {
        await deleteSolveFromDynamoDB(user.UserID, eventKey, index);
      } catch (error) {
        console.error("Error deleting solve:", error);
      }
    }
  };

  // Add Post
  const addPost = async (newPost) => {
    if (user) {
      const updatedUser = {
        ...user,
        Posts: [...user.Posts, newPost]
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

  // Delete Post
  const deletePost = async (postIndex) => {
    if (user) {
      const updatedUser = {
        ...user,
        Posts: user.Posts.filter((_, idx) => idx !== postIndex)
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

  // Handle Event Change
  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
  };

  return (
    <SettingsProvider>
      <div className={`App ${!isHomePage ? "music-player-mode" : ""}`}>
        <div className={`navAndPage ${isHomePage || !showPlayerBar ? "fullHeight" : "reducedHeight"}`}>
          <Navigation handleSignIn={handleSignIn} isSignedIn={isSignedIn} />

          <div className="main-content">
            <Routes>
              <Route path="/" element={
                <>
                  <div className="scramble-select-container">
                    <EventSelector currentEvent={currentEvent} handleEventChange={handleEventChange} />
                    <Scramble onScrambleClick={() => setShowDetail(true)} scramble={scramble} currentEvent={currentEvent} isMusicPlayer={!isHomePage} />
                    <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scramble, currentEvent)} isMusicPlayer={!isHomePage} isTimerCube={true} />
                  </div>
                  <Timer addTime={addSolve} />
                  <TimeList solves={sessions[currentEvent] || []} deleteTime={(index) => deleteTime(currentEvent, index)} addPost={addPost} rowsToShow={3} />
                </>
              } />
              <Route path="/profile" element={<Profile user={user} deletePost={deletePost} sessions={sessions} />} />
              <Route path="/stats" element={
                <Stats 
                  sessions={sessions} 
                  currentEvent={currentEvent} 
                  setCurrentEvent={setCurrentEvent} 
                  deleteTime={(eventKey, index) => deleteTime(eventKey, index)} 
                  addPost={addPost} 
                />
              } />
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
            scramble={scramble}
            addPost={addPost}
          />
        )}
        {!isHomePage && (
          <div className="toggle-bar">
            {showPlayerBar ? (
              <button className="toggle-button" onClick={() => setShowPlayerBar(false)}>&#x25BC;</button> // Down arrow
            ) : (
              <button className="toggle-button" onClick={() => setShowPlayerBar(true)}>&#x25B2;</button> // Up arrow
            )}
          </div>
        )}
      </div>
    </SettingsProvider>
  );
}

export default App;
