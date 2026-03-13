// Navigation.js
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import ptsLogo from '../../assets/LogoStrokeWide.svg';
import statsIcon from '../../assets/Stats.svg';
import socialIcon from '../../assets/Social.svg';
import profileIcon from '../../assets/Profile.svg';
import settingsIcon from '../../assets/SettingsOrange.svg';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';

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

function CompactProfileChip({ user }) {
  const profileColor = user?.Color || user?.color || '#FFFFFF';
  const profileEvent = user?.ProfileEvent || user?.profileEvent || '333';
  const profileScramble = user?.ProfileScramble || user?.profileScramble || '';

  return (
    <span
      className={`nav-profile-chip nav-profile-chip--${String(profileEvent).toLowerCase()}`}
      style={{ borderColor: profileColor }}
      aria-hidden="true"
    >
      <span className="nav-profile-chip__cube">
        <PuzzleSVG
          event={profileEvent}
          scramble={profileScramble}
          isMusicPlayer={false}
          isTimerCube={false}
          isNameTagCube={true}
        />
      </span>
    </span>
  );
}

function NavItem({ to, isActive, onClick, children, activeClassName = '', activeDotColor }) {
  if (isActive) {
    return (
      <span
        className={`nav-item-current ${activeClassName}`.trim()}
        aria-current="page"
        style={
          activeDotColor
            ? {
                '--nav-active-dot-color': activeDotColor,
                '--nav-active-shadow-color': activeDotColor,
              }
            : undefined
        }
      >
        <i className="nav-icon nav-icon--active">{children}</i>
      </span>
    );
  }

  return (
    <Link to={to} onClick={onClick}>
      <i className="nav-icon">{children}</i>
    </Link>
  );
}

function Navigation({
  onNavClick,
  onMainLogoClick,
  isSignedIn,
  handleSettingsClick,
  user,
  dbStatus,
}) {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/profile/');
  const isStatsPage = location.pathname === '/stats';
  const isSocialPage = location.pathname === '/social';
  const showCompactProfileChip = isSignedIn && !isHomePage;

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
          <NavItem
            to="/profile"
            onClick={onNavClick}
            isActive={isProfilePage}
            activeClassName="nav-item-current--profile"
            activeDotColor={user?.Color || user?.color || '#FFFFFF'}
          >
            {showCompactProfileChip && !isProfilePage ? (
              <CompactProfileChip user={user} />
            ) : (
              <img src={profileIcon} alt="Profile" className="profile" />
            )}
          </NavItem>
        </li>

        <li>
          <NavItem
            to="/stats"
            onClick={onNavClick}
            isActive={isStatsPage}
            activeClassName="nav-item-current--stats"
            activeDotColor="#F4C542"
          >
            <img src={statsIcon} alt="Stats" className="stats" />
          </NavItem>
        </li>

        <li>
          <NavItem
            to="/social"
            onClick={onNavClick}
            isActive={isSocialPage}
            activeClassName="nav-item-current--social"
            activeDotColor="#5DA9FF"
          >
            <img src={socialIcon} alt="Social" className="social" />
          </NavItem>
        </li>
      </ul>

      <div className="bottom-icons">
        <button onClick={handleSettingsClick} className="settings-button">
          <i className="nav-icon">
            <img src={settingsIcon} alt="Settings" className="settings" />
          </i>
        </button>
      </div>
    </nav>
  );
}

export default Navigation;
