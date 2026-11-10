// src/components/Account/EmailBanner.js
import React, { useState } from "react";
import { resendVerificationEmail } from "../../services/auth";
import "../Offline/OfflineBanner.css";
import "./Account.css";

const DISMISS_KEY = "pts:emailBannerDismissed";

function readDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Nudges signed-in users whose account has no email, or an unconfirmed one,
 * since that's the only way to get back in after a forgotten password.
 * Dismissing hides it until the browser tab is closed.
 */
export default function EmailBanner({ accountEmail, onAddEmail }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!accountEmail?.loaded || dismissed) return null;
  const { email, emailVerified } = accountEmail;
  if (email && emailVerified) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // fine: it just comes back on reload
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resendVerificationEmail();
      setStatus("Sent. Check your inbox (and spam).");
    } catch (err) {
      setStatus(err?.message || "Couldn't send it right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="offline-banner offline-banner--viewing email-banner" role="status">
      <span className="offline-banner__dot" aria-hidden="true" />
      <span className="offline-banner__text">
        {email
          ? status || `Confirm ${email} so you can reset your password if you forget it.`
          : "Add an email to your account so you can reset your password if you forget it."}
      </span>
      {email ? (
        <button type="button" className="offline-banner__action" onClick={resend} disabled={busy}>
          {busy ? "Sending…" : "Resend email"}
        </button>
      ) : (
        <button type="button" className="offline-banner__action" onClick={onAddEmail}>
          Add email →
        </button>
      )}
      <button
        type="button"
        className="email-banner__dismiss"
        onClick={dismiss}
        aria-label="Hide this message"
        title="Hide"
      >
        ×
      </button>
    </div>
  );
}
