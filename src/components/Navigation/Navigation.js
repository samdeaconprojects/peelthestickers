import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css'; 
// No need to import the image if it is in the public folder

function Navigation() {
  return (
    <nav className="Navigation">
      <Link to="/">
          <img src={require('../../assets/PTS.png')} alt="Logo" className="logo" />
      </Link>
      <ul>
        <li><Link to="/"><i className="social-icon">
          <img src={require('../../assets/Profile.png')} alt="Profile" className="profile" />
        </i></Link></li>
        <li><Link to="/"><i className="social-icon">
          <img src={require('../../assets/Stats.png')} alt="Stats" className="stats" />
        </i></Link></li>
        <li><Link to="/"><i className="social-icon">
          <img src={require('../../assets/Social.png')} alt="Social" className="social" />
        </i></Link></li>
        <li><Link to="/"><i className="social-icon">
          <img src={require('../../assets/Settings.png')} alt="Settings" className="settings" />
        </i></Link></li>
        {/* Add additional navigation options here */}
      </ul>
    </nav>
  );
}

export default Navigation;
