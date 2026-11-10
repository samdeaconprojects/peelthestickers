// src/components/Account/AccountEmailSettings.js
//
// Settings block for the account's private email: shows it and whether it's
// confirmed, resends the confirmation, and adds or changes it (needs the
// current password).
import React, { useState } from "react";
import { changeAccountEmail, resendVerificationEmail } from "../../services/auth";
import "./Account.css";

export default function AccountEmailSettings({ accountEmail, onChanged }) {
  const email = accountEmail?.email || "";
  const verified = !!accountEmail?.emailVerified;
  const [editing, setEditing] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const startEdit = () => {
    setEditing(true);
    setNextEmail(email);
    setPassword("");
    setError("");
    setMessage("");
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await changeAccountEmail(nextEmail.trim(), password);
      onChanged?.({ email: res?.email || nextEmail.trim(), emailVerified: !!res?.emailVerified });
      setEditing(false);
      setPassword("");
      setMessage(res?.emailVerified ? "Saved." : "Saved. We sent a confirmation link to the new address.");
    } catch (err) {
      setError(err?.message || "Couldn't save the email.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await resendVerificationEmail();
      setMessage("Sent. Check your inbox (and spam).");
    } catch (err) {
      setError(err?.message || "Couldn't send it right now.");
    } finally {
      setBusy(false);
    }
  };

  // Keep typing here from reaching the timer's keyboard shortcuts.
  const stopKeys = (e) => e.stopPropagation();

  return (
    <div className="accountEmail" onKeyDown={stopKeys} onKeyUp={stopKeys}>
      <div className="accountEmail__row">
        <div>
          <div className="accountEmail__label">Account email (private)</div>
          <div className="accountEmail__value">
            {email || <span className="accountEmail__muted">No email yet</span>}
            {email ? (
              <span className={`accountEmail__badge ${verified ? "is-ok" : "is-pending"}`}>
                {verified ? "Confirmed" : "Not confirmed"}
              </span>
            ) : null}
          </div>
        </div>
        {!editing ? (
          <div className="accountEmail__actions">
            {email && !verified ? (
              <button type="button" className="settingsActionButton settingsActionButtonSecondary" onClick={resend} disabled={busy}>
                Resend confirmation
              </button>
            ) : null}
            <button type="button" className="settingsActionButton settingsActionButtonSecondary" onClick={startEdit}>
              {email ? "Change" : "Add email"}
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="accountEmail__form">
          <input
            type="email"
            className="accountEmail__input"
            placeholder="you@example.com"
            autoComplete="email"
            value={nextEmail}
            onChange={(e) => setNextEmail(e.target.value)}
            disabled={busy}
          />
          <input
            type="password"
            className="accountEmail__input"
            placeholder="Current password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <div className="accountEmail__actions">
            <button type="button" className="settingsActionButton" onClick={save} disabled={busy || !nextEmail.trim() || !password}>
              {busy ? "Saving…" : "Save email"}
            </button>
            <button type="button" className="settingsActionButton settingsActionButtonSecondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="accountEmail__error">{error}</div> : null}
      {message ? <div className="accountEmail__message">{message}</div> : null}
      <div className="accountEmail__help">
        Used only to confirm it's you and to reset your password. Never shown on your profile.
      </div>
    </div>
  );
}
