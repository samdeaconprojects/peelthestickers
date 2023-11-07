import React from 'react';
import { Link } from 'react-router-dom';

function Navigation() {
  return (
    <nav className="Navigation">
      <ul>
        <li><Link to="/"><i className="social-icon">1</i></Link></li>
        <li><Link to="/social"><i className="social-icon">2</i></Link></li>
        {/* Add additional navigation options here */}
      </ul>
    </nav>
  );
}

export default Navigation;
