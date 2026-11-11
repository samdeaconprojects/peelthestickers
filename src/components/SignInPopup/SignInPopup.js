import React, { useCallback, useEffect, useState } from "react";
import "./SignInPopup.css";
import PTSLongStatusLogo from "./PTSLongStatusLogo";
import { requestPasswordReset } from "../../services/auth";

// mode: "signin" | "signup" | "forgot"
function SignInPopup({
  onSignIn,
  onSignUp,
  onClose,
  inline = false,
  title = "",
}) {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [notice, setNotice] = useState("");

  const isSignUp = mode === "signup";
  const isForgot = mode === "forgot";

  const switchMode = (next) => {
    if (isSubmitting) return;
    setNotice("");
    setMode(next);
  };

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
    if (isSubmitting || !acceptedTerms) return;
    setIsSubmitting(true);
    try {
      await onSignUp(username, password, { acceptTerms: true, email: email.trim() });
    } finally {
      setIsSubmitting(false);
    }
  }, [acceptedTerms, email, isSubmitting, onSignUp, password, username]);

  const handleForgot = useCallback(async () => {
    if (isSubmitting || !username.trim()) return;
    setIsSubmitting(true);
    setNotice("");
    try {
      const res = await requestPasswordReset(username.trim());
      setNotice(res?.message || "If that account has a confirmed email, we've sent a reset link to it.");
    } catch (err) {
      setNotice(err?.message || "Couldn't send the reset email. Try again in a few minutes.");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, username]);

  const submit = isForgot ? handleForgot : isSignUp ? handleSignUp : handleSignIn;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isSubmitting) return;

      if (e.key === "Escape" && onClose) {
        onClose();
        return;
      }

      if (e.key === "Enter") submit();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onClose, submit]);

  const wrapperClassName = inline ? "signInPopup signInPopup--inline" : "signInPopup";
  const contentClassName = inline
    ? "signInPopupContent signInPopupContent--inline"
    : "signInPopupContent";

  const logoLabel = isForgot ? "Sending link" : isSignUp ? "Creating account" : "Signing in";

  return (
    <div
      className={wrapperClassName}
      onClick={!inline && !isSubmitting ? onClose : undefined}
    >
      <div className={contentClassName} onClick={(e) => e.stopPropagation()}>
        {title ? <p className="signInPopupTitle">{title}</p> : null}
        <div className="signInLogoWrap">
          <PTSLongStatusLogo
            status={{ phase: isSubmitting ? "loading" : "idle" }}
            label={logoLabel}
          />
        </div>

        {isForgot ? (
          <p className="signInHelp">
            Enter your username or email. If your account has a confirmed email, we'll send you a
            link to choose a new password.
          </p>
        ) : null}

        <input
          type="text"
          placeholder={isSignUp ? "Username" : "Username or email"}
          autoComplete={isSignUp ? "username" : "username email"}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="signInInput"
          disabled={isSubmitting}
        />
        {isSignUp ? (
          <input
            type="email"
            placeholder="Email (private, for password resets)"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="signInInput"
            disabled={isSubmitting}
          />
        ) : null}
        {!isForgot ? (
          <input
            type="password"
            placeholder={isSignUp ? "Password (10+ characters)" : "Password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="signInInput"
            disabled={isSubmitting}
          />
        ) : null}

        {isSignUp ? (
          <p className="signInHint">
            Tip: a few unrelated words make a strong password, like "blue cube orange tuesday".
          </p>
        ) : null}
        {isSignUp ? (
          <label className="signInTerms">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>
              I'm 13 or older and agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </span>
          </label>
        ) : null}

        {notice ? <p className="signInNotice" role="status">{notice}</p> : null}

        <div>
          {isForgot ? (
            <button
              onClick={handleForgot}
              className="signInButton"
              disabled={isSubmitting || !username.trim()}
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          ) : isSignUp ? (
            <button
              onClick={handleSignUp}
              className="signInButton"
              disabled={isSubmitting || !acceptedTerms}
            >
              {isSubmitting ? "Signing Up..." : "Sign Up"}
            </button>
          ) : (
            <button onClick={handleSignIn} className="signInButton" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          )}
        </div>

        {mode === "signin" ? (
          <p
            className="toggleOption signInForgot"
            aria-disabled={isSubmitting}
            onClick={() => switchMode("forgot")}
          >
            Forgot password?
          </p>
        ) : null}
        <p
          className="toggleOption"
          aria-disabled={isSubmitting}
          onClick={() => switchMode(isSignUp ? "signin" : isForgot ? "signin" : "signup")}
        >
          {isSignUp
            ? "Already have an account? Sign In"
            : isForgot
            ? "Back to Sign In"
            : "Don't have an account? Sign Up"}
        </p>
        <p className="signInLegalLinks">
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </div>
    </div>
  );
}

export default SignInPopup;
