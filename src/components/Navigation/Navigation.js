// Navigation.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css';
import ptsLogo from '../../assets/LogoStrokeWide.svg';
import statsIcon from '../../assets/Stats.svg';
import socialIcon from '../../assets/Social.svg';
import profileIcon from '../../assets/Profile.svg';
import settingsIcon from '../../assets/SettingsOrange.svg';





function Navigation({ onNavClick, onMainLogoClick, handleSignIn, isSignedIn, handleSettingsClick, name }) {
  return (
    <nav className="Navigation">
      <Link to="/" onClick={onMainLogoClick}>
        <img src={ptsLogo} alt="logo" className="logo" />
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
