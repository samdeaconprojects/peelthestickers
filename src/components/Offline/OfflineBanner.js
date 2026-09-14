import React from "react";
import { Link } from "react-router-dom";
import "./OfflineBanner.css";

/**
 * Persistent, unobtrusive status strip. Two situations show it:
 *  - we're currently offline (app still works, solves save locally)
 *  - we're back online but still have solves queued from earlier that
 *    haven't been reviewed/synced to the profile yet
 */
export default function OfflineBanner({ isOnline, pendingCount = 0, isSignedIn }) {
  if (isOnline && pendingCount === 0) return null;
  if (!isSignedIn) return null;

  return (
    <div className={`offline-banner${isOnline ? " offline-banner--pending" : " offline-banner--offline"}`}>
      <span className="offline-banner__dot" aria-hidden="true" />
      {!isOnline ? (
        <span className="offline-banner__text">
          You're offline — timing still works, solves are saving on this device.
          {pendingCount > 0 ? ` (${pendingCount} waiting to sync)` : ""}
        </span>
      ) : (
        <span className="offline-banner__text">
          {pendingCount} offline solve{pendingCount === 1 ? "" : "s"} ready to add to your profile.
        </span>
      )}
      {isOnline && pendingCount > 0 && (
        <Link className="offline-banner__action" to="/profile#offline-solves">
          Review offline solves →
        </Link>
      )}
    </div>
  );
}
