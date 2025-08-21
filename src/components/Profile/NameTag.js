// src/components/NameTag.js
import React from "react";
import { Link } from "react-router-dom";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import "./NameTag.css";

function NameTag({ isSignedIn, user, handleSignIn }) {
  if (!isSignedIn) {
    return (
      <div className="name-tag">
        <button className="auth-button" onClick={handleSignIn}>
          Sign in
        </button>
      </div>
    );
  }

  // fallback color if user has none set
  const profileColor = user?.Color || "#FFFFFF";

  return (
    <div className="name-tag">
      
      <Link
        to="/profile"
        className="name-tag-link"
        style={{ border: `2px solid ${profileColor}` }}
      >
        <div className="nametagCube">
        <PuzzleSVG
          event={user?.ProfileEvent || "333"}
          scramble={user?.ProfileScramble || ""}
          isTimerCube={false}
          isNameTagCube={true}
        />
        </div>

        <div className="nametagText">

        <span className="name-tag-text">@{user?.Name || user?.UserID}</span>
        </div>
      </Link>
    </div>
  );
}

export default NameTag;
