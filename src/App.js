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
import {
  getUserData,
  addSolveToDynamoDB,
  deleteSolveFromDynamoDB,
  addPostToDynamoDB,
  deletePostFromDynamoDB
} from './services/awsService';
import {calculateBestAverageOfFive, calculateAverage, formatTime } from './components/TimeList/TimeUtils';

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

  const location = useLocation();
  const isHomePage = location.pathname === "/";

  useEffect(() => {
    setScramble(generateScramble(currentEvent));
  }, [currentEvent]);

  const handleSignIn = async () => {
    const userID = "samtest3"; // Example userID
    const limit = 100; // Load the most recent 300 solves initially
    try {
      const userData = await getUserData(userID, limit);
      if (userData) {
        setUser(userData);
        setSessions(userData.Sessions || {});
        setIsSignedIn(true);
        fetchFullData(userID);
      } else {
        alert("User not found!");
      }
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  const fetchFullData = async (userID) => {
    try {
      const userData = await getUserData(userID); // Fetch all data without limits
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

    setScramble(generateScramble(currentEvent));
  };

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

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
  };

  const currentSolves = sessions[currentEvent] || [];
  const avgOfFive = calculateAverage(currentSolves.slice(-5).map(s => s.time), true).average;
  const avgOfTwelve = calculateAverage(currentSolves.slice(-12).map(s => s.time), true).average || 'N/A';
  const bestAvgOfFive = calculateBestAverageOfFive(currentSolves.map(s => s.time));
  const bestAvgOfTwelve = currentSolves.length >= 12 
    ? Math.min(...currentSolves.map((_, i) =>
        i + 12 <= currentSolves.length
          ? calculateAverage(currentSolves.slice(i, i + 12).map(s => s.time), true).average
          : Infinity
      ))
    : 'N/A';

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
                  <div className="averages-display">
                    <p>Avg of 5: {formatTime(avgOfFive)}</p>
                    <p>Avg of 12: {formatTime(avgOfTwelve)}</p>
                    <p>Best Avg of 5: {formatTime(bestAvgOfFive)}</p>
                    <p>Best Avg of 12: {formatTime(bestAvgOfTwelve)}</p>
                  </div>
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
