import React, { useState, useEffect } from "react";
import "./SignInPopup.css";
import ptsLogo from '../../assets/ptslongoneline.svg';


function SignInPopup({ onSignIn, onSignUp, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSignIn = () => {
    onSignIn(username, password);
  };

  const handleSignUp = () => {
    onSignUp(username, password);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        isSignUp ? handleSignUp() : handleSignIn();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [username, password, isSignUp]);

  return (
    <div className="signInPopup">
      <div className="signInPopupContent">
        <span className="closePopup" onClick={onClose}>x</span>
        <div>
          <img src={ptsLogo} alt="signInLogo" className="signInLogo" style={{ width: '300px', height: 'auto', padding: '10px' }}/>
        </div>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="signInInput"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="signInInput"
        />
        <div>
          {isSignUp ? (
            <button onClick={handleSignUp} className="signInButton">Sign Up</button>
          ) : (
            <button onClick={handleSignIn} className="signInButton">Sign In</button>
          )}
        </div>
        <p
          className="toggleOption"
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </p>
      </div>
    </div>
  );
}

export default SignInPopup;
