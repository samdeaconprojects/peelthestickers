// Navigation.js
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIsMobileLayout } from '../../hooks/useMediaQuery';
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

// Text labels only show in the mobile drawer (hidden by CSS on desktop).
function NavLabel({ children }) {
  return <span className="nav-label">{children}</span>;
}

function NavItem({ to, isActive, onClick, children, label, activeClassName = '', activeDotColor }) {
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
        {label ? <NavLabel>{label}</NavLabel> : null}
      </span>
    );
  }

  return (
    <Link to={to} onClick={onClick}>
      <i className="nav-icon">{children}</i>
      {label ? <NavLabel>{label}</NavLabel> : null}
    </Link>
  );
}

function Navigation({
  onNavClick,
  onMainLogoClick,
  handleSettingsClick,
  user,
  dbStatus,
  isAdmin = false,
}) {
  const location = useLocation();
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/profile/');
  const isStatsPage = location.pathname === '/stats';
  const isSocialPage = location.pathname === '/social';
  const profileColor = user?.Color || user?.color || '#2EC4B6';

  // Phones: the sidebar becomes a slide-in drawer opened from a floating menu button.
  const isMobileLayout = useIsMobileLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, isMobileLayout]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const navClassName = [
    'Navigation',
    isMobileLayout ? 'Navigation--mobile' : '',
    isMobileLayout && drawerOpen ? 'is-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
    {isMobileLayout ? (
      <button
        type="button"
        className={`nav-mobile-toggle${drawerOpen ? ' is-open' : ''}`}
        aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={drawerOpen}
        onClick={(e) => {
          // Drop focus so a later spacebar press goes to the timer, not this button.
          e.currentTarget.blur();
          setDrawerOpen((open) => !open);
        }}
      >
        <span className="nav-mobile-toggle__bar" />
        <span className="nav-mobile-toggle__bar" />
        <span className="nav-mobile-toggle__bar" />
      </button>
    ) : null}
    {isMobileLayout && drawerOpen ? (
      <div className="nav-mobile-backdrop" onClick={closeDrawer} aria-hidden="true" />
    ) : null}
    <nav className={navClassName} aria-hidden={isMobileLayout && !drawerOpen ? true : undefined}>
      <Link
        to="/"
        onClick={(e) => {
          closeDrawer();
          onMainLogoClick?.(e);
        }}
        className={`nav-logo-link${location.pathname === '/' ? ' is-current' : ''}`}
      >
        <PTSStatusLogo status={dbStatus} />
        <NavLabel>Timer</NavLabel>
      </Link>

      <ul>
        <li>
          <NavItem
            to="/profile"
            onClick={onNavClick}
            isActive={isProfilePage}
            label="Profile"
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
            label="Stats"
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
            label="Social"
            activeClassName="nav-item-current--social"
            activeDotColor="#5DA9FF"
          >
            <img src={socialIcon} alt="Social" className="social" />
          </NavItem>
        </li>
      </ul>

      <div className="bottom-icons">
        {isAdmin ? (
          <Link
            to="/admin"
            className={`nav-admin-link${location.pathname === '/admin' ? ' is-active' : ''}`}
            title="Admin metrics"
            aria-label="Admin metrics"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <NavLabel>Admin</NavLabel>
          </Link>
        ) : null}
        <button
          onClick={(e) => {
            closeDrawer();
            handleSettingsClick?.(e);
          }}
          className="settings-button"
        >
          <i className="nav-icon">
            <img src={settingsIcon} alt="Settings" className="settings" />
          </i>
          <NavLabel>Settings</NavLabel>
        </button>
      </div>
    </nav>
    </>
  );
}

export default Navigation;
