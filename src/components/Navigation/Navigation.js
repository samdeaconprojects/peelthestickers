import React from 'react';
import { Link } from 'react-router-dom';
import './Navigation.css'; 
// No need to import the image if it is in the public folder

function Navigation() {
  return (
    <nav className="Navigation">
      <Link to="/">
          <img src={require('../../assets/logo.png')} alt="Logo" className="logo" />
      </Link>
      <ul>
        <li><Link to="/"><i className="social-icon">1</i></Link></li>
        <li><Link to="/social"><i className="social-icon">2</i></Link></li>
        {/* Add additional navigation options here */}
      </ul>
    </nav>
  );
}

export default Navigation;
