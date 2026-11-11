// src/components/Account/EmailActionPages.js
//
// Landing pages for the links in account emails:
//   /verify-email?token=...    confirms the address
//   /reset-password?token=...  sets a new password
// Both work signed out.
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { verifyEmail, resetPassword } from "../../services/auth";
import "../Legal/Legal.css";
import "./Account.css";

function useToken() {
  const { search } = useLocation();
  return new URLSearchParams(search).get("token") || "";
}

function Shell({ title, children }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Peel The Stickers`;
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <div className="Page legalPage accountPage">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function VerifyEmailPage({ onVerified }) {
  const token = useToken();
  const [state, setState] = useState({ phase: token ? "working" : "error", message: "" });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then((res) => {
        setState({ phase: "done", message: res?.email || "" });
        onVerified?.(res);
      })
      .catch((err) => setState({ phase: "error", message: err?.message || "" }));
  }, [token, onVerified]);

  return (
    <Shell title="Confirm your email">
      {state.phase === "working" ? <p>Confirming…</p> : null}
      {state.phase === "done" ? (
        <>
          <p className="accountPage__ok">
            {state.message ? `${state.message} is confirmed.` : "Your email is confirmed."} You can
            now reset your password by email if you ever forget it.
          </p>
          <p>
            <Link to="/">Back to the timer</Link>
          </p>
        </>
      ) : null}
      {state.phase === "error" ? (
        <>
          <p className="accountPage__error">
            {state.message || "This link is missing its code."} If you need a new link, sign in and
            use “Resend email” in the banner or in Settings.
          </p>
          <p>
            <Link to="/">Back to the timer</Link>
          </p>
        </>
      ) : null}
    </Shell>
  );
}

export function ResetPasswordPage({ onRequestSignIn }) {
  const token = useToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "This link is missing its code. Ask for a new one from Sign In → Forgot password.");
  const [doneFor, setDoneFor] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy || !token) return;
    if (password.length < 10) return setError("Password must be at least 10 characters");
    if (password !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError("");
    try {
      const res = await resetPassword(token, password);
      setDoneFor(res?.username || "your account");
    } catch (err) {
      setError(err?.message || "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  };

  if (doneFor) {
    return (
      <Shell title="Password updated">
        <p className="accountPage__ok">
          The password for <strong>{doneFor}</strong> has been changed.
        </p>
        <p>
          <button type="button" className="accountPage__button" onClick={onRequestSignIn}>
            Sign in
          </button>
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <p className="accountPage__hint">
        Use 10 or more characters. A few unrelated words work well, like "blue cube orange tuesday".
        Changing your password signs you out on your other devices.
      </p>
      <form className="accountPage__form" onSubmit={submit}>
        <input
          type="password"
          className="accountPage__input"
          placeholder="New password (10+ characters)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy || !token}
        />
        <input
          type="password"
          className="accountPage__input"
          placeholder="Type it again"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy || !token}
        />
        {error ? <p className="accountPage__error">{error}</p> : null}
        <button type="submit" className="accountPage__button" disabled={busy || !token}>
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </Shell>
  );
}
