import React, { useCallback, useEffect, useState } from "react";
import "./SignInPopup.css";
import PTSLongStatusLogo from "./PTSLongStatusLogo";

function SignInPopup({ onSignIn, onSignUp, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSignIn(username, password);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onSignIn, password, username]);

  const handleSignUp = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSignUp(username, password);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onSignUp, password, username]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isSubmitting) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Enter") {
        isSignUp ? handleSignUp() : handleSignIn();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSignIn, handleSignUp, isSubmitting, isSignUp, onClose]);

  return (
    <div className="signInPopup" onClick={isSubmitting ? undefined : onClose}>
      <div className="signInPopupContent" onClick={(e) => e.stopPropagation()}>
        <div className="signInLogoWrap">
          <PTSLongStatusLogo
            status={{ phase: isSubmitting ? "loading" : "idle" }}
            label={isSignUp ? "Creating account" : "Signing in"}
          />
        </div>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="signInInput"
          disabled={isSubmitting}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="signInInput"
          disabled={isSubmitting}
        />
        <div>
          {isSignUp ? (
            <button onClick={handleSignUp} className="signInButton" disabled={isSubmitting}>
              {isSubmitting ? "Signing Up..." : "Sign Up"}
            </button>
          ) : (
            <button onClick={handleSignIn} className="signInButton" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          )}
        </div>
        <p
          className="toggleOption"
          aria-disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) setIsSignUp(!isSignUp);
          }}
        >
          {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </p>
      </div>
    </div>
  );
}

export default SignInPopup;
