// src/components/NameTag.js
import React from "react";
import { Link } from "react-router-dom";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import "./NameTag.css";

function NameTag({
  isSignedIn,
  handleSignIn,
  user,
  name,
  picture,
  to,
  size = "sm",
  variant = "default",
  reverse = false,
}) {
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
  const linkClassName = [
    "name-tag-link",
    variant === "profile-corner" ? "name-tag-link--profileCorner" : "",
    reverse ? "name-tag-link--reverse" : "",
  ].filter(Boolean).join(" ");
  const displayNameLength = String(displayName).length;
  const nameLengthClass =
    displayNameLength >= 18
      ? "name-tag--name-xl"
      : displayNameLength >= 14
        ? "name-tag--name-lg"
        : "";
  const linkStyle =
    variant === "profile-corner"
      ? { "--name-tag-border-color": profileColor }
      : {
          borderColor: profileColor,
          "--name-tag-border-color": profileColor,
        };

  return (
    <div className={`name-tag name-tag--${size} ${nameLengthClass}`.trim()}>
      <Link
        to={linkTo}
        className={linkClassName}
        style={linkStyle}
      >
        <div
          className="name-tag-cubeFrame"
          style={variant === "profile-corner" ? { borderColor: profileColor } : undefined}
        >
          <div className={`nametagCube nametagCube--${evClass}`}>
            <PuzzleSVG
              event={ev}
              scramble={u?.ProfileScramble || u?.profileScramble || ""}
              isTimerCube={false}
              isNameTagCube={true}
            />
          </div>
        </div>

        <div className="nametagText">
          <span className="name-tag-text">@{displayName}</span>
        </div>
      </Link>
    </div>
  );
}

export default NameTag;
