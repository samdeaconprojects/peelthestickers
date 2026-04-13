// Navigation.js
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import statsIcon from '../../assets/Stats.svg';
import socialIcon from '../../assets/Social.svg';
import profileIcon from '../../assets/Profile.svg';
import settingsIcon from '../../assets/SettingsOrange.svg';
import PTSStatusLogo from './PTSStatusLogo';
import { hexToRgbString } from '../../utils/colorUtils';

// Paused nav-profile cube experiment. Keeping this here commented out so we can
// bring it back later without losing the in-progress implementation.
// import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
// function CompactProfileChip({ user }) {
//   const profileColor = user?.Color || user?.color || '#FFFFFF';
//   const profileEvent = user?.ProfileEvent || user?.profileEvent || '333';
//   const profileScramble = user?.ProfileScramble || user?.profileScramble || '';
//
//   return (
//     <span
//       className={`nav-profile-chip nav-profile-chip--${String(profileEvent).toLowerCase()}`}
//       style={{ borderColor: profileColor }}
//       aria-hidden="true"
//     >
//       <span className="nav-profile-chip__cube">
//         <PuzzleSVG
//           event={profileEvent}
//           scramble={profileScramble}
//           isMusicPlayer={false}
//           isTimerCube={false}
//           isNameTagCube={true}
//         />
//       </span>
//     </span>
//   );
// }

function NavItem({ to, isActive, onClick, children, activeClassName = '', activeDotColor }) {
  if (isActive) {
    const activeDotGlowColor = activeDotColor
      ? `rgba(${hexToRgbString(activeDotColor, '255, 255, 255')}, 0.82)`
      : undefined;

    return (
      <span
        className={`nav-item-current ${activeClassName}`.trim()}
        aria-current="page"
        style={
          activeDotColor
            ? {
                '--nav-active-dot-color': activeDotColor,
                '--nav-active-shadow-color': activeDotColor,
                '--nav-active-dot-glow-color': activeDotGlowColor,
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
  handleSettingsClick,
  user,
  dbStatus,
}) {
  const location = useLocation();
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/profile/');
  const isStatsPage = location.pathname === '/stats';
  const isSocialPage = location.pathname === '/social';
  const profileColor = user?.Color || user?.color || '#2EC4B6';

  return (
    <nav className="Navigation">
      <Link
        to="/"
        onClick={onMainLogoClick}
        className="nav-logo-link"
      >
        <PTSStatusLogo status={dbStatus} />
      </Link>

      <ul>
        <li>
          <NavItem
            to="/profile"
            onClick={onNavClick}
            isActive={isProfilePage}
            activeClassName="nav-item-current--profile"
            activeDotColor={profileColor}
          >
            {/*
              Paused version while we simplify back to the standard profile icon:
              {showCompactProfileChip && !isProfilePage ? (
                <CompactProfileChip user={user} />
              ) : (
                <img src={profileIcon} alt="Profile" className="profile" />
              )}
            */}
            <span
              className="profile profile-icon-mask"
              role="img"
              aria-label="Profile"
              style={{
                '--profile-icon-color': isProfilePage ? '#FFFFFF' : profileColor,
                '--profile-icon-mask': `url(${profileIcon})`,
              }}
            />
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
