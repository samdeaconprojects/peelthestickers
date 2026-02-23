// Navigation.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css';
import ptsLogo from '../../assets/LogoStrokeWide.svg';
import statsIcon from '../../assets/Stats.svg';
import socialIcon from '../../assets/Social.svg';
import profileIcon from '../../assets/Profile.svg';
import settingsIcon from '../../assets/SettingsOrange.svg';

function DbIndicator({ dbStatus }) {
  const phase = dbStatus?.phase || "idle";
  const tick = dbStatus?.tick || 0;
  const label = dbStatus?.op || "";

  // Keep DOM footprint stable
  if (phase === "idle") {
    return (
      <span
        aria-hidden="true"
        style={{ display: "inline-block", width: 14, height: 14, marginLeft: 10, opacity: 0 }}
      />
    );
  }

  const wrapStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 14,
    height: 14,
    marginLeft: 10,
    position: "relative",
  };

  const spinnerStyle = {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.25)",
    borderTopColor: "rgba(255,255,255,0.95)",
    animation: "ptsDbSpin 0.7s linear infinite",
    boxSizing: "border-box",
  };

  const popStyle = {
    width: 14,
    height: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "ptsDbPop 180ms ease-out",
  };

  const checkStyle = {
    fontSize: 14,
    lineHeight: 1,
    color: "rgba(46,196,182,1)",
    transform: "translateY(-0.5px)",
  };

  const xStyle = {
    fontSize: 14,
    lineHeight: 1,
    color: "rgba(255,77,77,1)",
    transform: "translateY(-0.5px)",
  };

  return (
    <>
      {/* local keyframes so you don't have to touch Navigation.css */}
      <style>
        {`
          @keyframes ptsDbSpin { to { transform: rotate(360deg); } }
          @keyframes ptsDbPop {
            from { transform: scale(0.85); opacity: 0.2; }
            to   { transform: scale(1); opacity: 1; }
          }
        `}
      </style>

      <span style={wrapStyle} title={label} key={`${phase}-${tick}`}>
        {phase === "loading" && <span style={spinnerStyle} />}
        {phase === "success" && (
          <span style={popStyle} aria-label="Saved">
            <span style={checkStyle}>✓</span>
          </span>
        )}
        {phase === "error" && (
          <span style={popStyle} aria-label="Error">
            <span style={xStyle}>×</span>
          </span>
        )}
      </span>
    </>
  );
}

function Navigation({ onNavClick, onMainLogoClick, handleSignIn, isSignedIn, handleSettingsClick, name, dbStatus }) {
  return (
    <nav className="Navigation">
      <Link
        to="/"
        onClick={onMainLogoClick}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        <img src={ptsLogo} alt="logo" className="logo" />
        <DbIndicator dbStatus={dbStatus} />
      </Link>

      <ul>
        <li>
          <Link to="/profile" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={profileIcon} alt="Profile" className="profile" />
            </i>
          </Link>
        </li>
        <li>
          <Link to="/stats" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={statsIcon} alt="Stats" className="stats" />
            </i>
          </Link>
        </li>
        <li>
          <Link to="/social" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={socialIcon} alt="Social" className="social" />
            </i>
          </Link>
        </li>
      </ul>

      <div className="bottom-icons">
        <button onClick={handleSettingsClick} className="settings-button">
          <i className="nav-icon">
            <img src={settingsIcon} alt="Settings" className="settings" />
          </i>
        </button>

        <button onClick={handleSignIn} className="sign-in-button">
          {isSignedIn ? "@" + name : 'Sign In'}
        </button>
      </div>
    </nav>
  );
}

export default Navigation;