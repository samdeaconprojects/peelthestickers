// Navigation.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css';

function Navigation({ onNavClick, onMainLogoClick, handleSignIn, isSignedIn }) {
  return (
    <nav className="Navigation">
      <Link to="/" onClick={onMainLogoClick}>
        <img src={require('../../assets/PTS.png')} alt="logo" className="logo" />
      </Link>

      <button onClick={handleSignIn} className="sign-in-button">
          {isSignedIn ? 'Signed In' : 'Sign In'}
        </button>
      <ul>
   
        
    
        <li>
          <Link to="/profile" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={require('../../assets/Profile.png')} alt="Profile" className="profile" />
            </i>
          </Link>
        </li>
        <li>
          <Link to="/stats" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={require('../../assets/Stats.png')} alt="Stats" className="stats" />
            </i>
          </Link>
        </li>
        <li>
          <Link to="/social" onClick={onNavClick}>
            <i className="nav-icon">
              <img src={require('../../assets/Social.png')} alt="Social" className="social" />
            </i>
          </Link>
        </li>
      </ul>
      <div className="bottom-icons">
        
        <Link to="/settings" onClick={onNavClick}>
          <i className="nav-icon">
            <img src={require('../../assets/Settings.png')} alt="Settings" className="settings" />
          </i>
        </Link>
      </div>
    </nav>
  );
}

export default Navigation;
