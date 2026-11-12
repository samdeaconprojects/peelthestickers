// src/components/NameTag.js
import React from "react";
import { Link } from "react-router-dom";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import "./NameTag.css";
import { getProfileEventScramble } from "../../utils/profileEventSolves";

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
  hideName = false,
}) {
  if (isSignedIn === false) {
    return (
      <div className={`name-tag name-tag--${size} name-tag--signedOut`}>
        <button className="auth-button" onClick={handleSignIn}>
          Sign in
        </button>
      </div>
    );
  }

  const u = user || {};
  const derivedId =
    u?.UserID || u?.userID || (typeof u?.PK === "string" ? u.PK.split("#")[1] : null);

  // The tag shows the @handle (the account ID); the username (Name) is the
  // screen name and only shows on hover.
  const displayName = u?.Name || name || derivedId || "user";
  const handle = derivedId || displayName;
  const profileColor = u?.Color || u?.color || "#FFFFFF";
  const linkTo = to || (derivedId ? `/profile/${derivedId}` : "/profile");

  const ev = (u?.ProfileEvent || u?.profileEvent || "333");
  const profileScramble = getProfileEventScramble(
    u,
    ev,
    u?.ProfileScramble || u?.profileScramble || ""
  );
  const evClass = String(ev).toLowerCase();
  const linkClassName = [
    "name-tag-link",
    variant === "profile-corner" ? "name-tag-link--profileCorner" : "",
    reverse ? "name-tag-link--reverse" : "",
  ].filter(Boolean).join(" ");
  const displayNameLength = String(handle).length;
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
    <div
      className={`name-tag name-tag--${size} name-tag--signedIn ${nameLengthClass} ${
        hideName ? "name-tag--iconOnly" : ""
      }`.trim()}
    >
      <Link
        to={linkTo}
        className={linkClassName}
        style={linkStyle}
        aria-label={`Open ${displayName}'s profile`}
        title={displayName === handle ? `@${handle}` : `${displayName} (@${handle})`}
      >
        <div
          className="name-tag-cubeFrame"
          style={variant === "profile-corner" ? { borderColor: profileColor } : undefined}
        >
          <div className={`nametagCube nametagCube--${evClass}`}>
            <PuzzleSVG
              event={ev}
              scramble={profileScramble}
              isTimerCube={false}
              isNameTagCube={true}
            />
          </div>
        </div>

        {!hideName ? (
          <div className="nametagText">
            <span className="name-tag-text">@{handle}</span>
          </div>
        ) : null}
      </Link>
    </div>
  );
}

export default NameTag;
