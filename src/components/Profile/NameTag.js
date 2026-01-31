// src/components/NameTag.js
import React from "react";
import { Link } from "react-router-dom";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import "./NameTag.css";

function NameTag({ isSignedIn, handleSignIn, user, name, picture, to, size = "sm" }) {
  if (isSignedIn === false) {
    return (
      <div className={`name-tag name-tag--${size}`}>
        <button className="auth-button" onClick={handleSignIn}>
          Sign in
        </button>
      </div>
    );
  }

  const u = user || {};
  const derivedId =
    u?.UserID || u?.userID || (typeof u?.PK === "string" ? u.PK.split("#")[1] : null);

  const displayName = u?.Name || name || derivedId || "user";
  const profileColor = u?.Color || u?.color || "#FFFFFF";
  const linkTo = to || (derivedId ? `/profile/${derivedId}` : "/profile");

  const ev = (u?.ProfileEvent || u?.profileEvent || "333");
  const evClass = String(ev).toLowerCase();

  return (
    <div className={`name-tag name-tag--${size}`}>
      <Link to={linkTo} className="name-tag-link" style={{ borderColor: profileColor }}>
        <div className={`nametagCube nametagCube--${evClass}`}>
          <PuzzleSVG
            event={ev}
            scramble={u?.ProfileScramble || u?.profileScramble || ""}
            isTimerCube={false}
            isNameTagCube={true}
          />
        </div>

        <div className="nametagText">
          <span className="name-tag-text">@{displayName}</span>
        </div>
      </Link>
    </div>
  );
}

export default NameTag;
