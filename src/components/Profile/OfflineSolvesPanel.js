import React, { useState } from "react";
import useOfflineQueue from "../../hooks/useOfflineQueue";
import { removeOfflineSolve } from "../../services/offlineQueue";
import { addSolve } from "../../services/addSolve";
import { formatTime } from "../TimeList/TimeUtils";
import { EVENT_KEYBINDING_LABELS } from "../../utils/keybindings";
import "./OfflineSolvesPanel.css";

function eventLabel(event) {
  return EVENT_KEYBINDING_LABELS[String(event || "").toUpperCase()] || event;
}

function sessionLabel(sessionID, sessionName) {
  if (sessionName) return sessionName;
  if (!sessionID || sessionID === "main") return "Main";
  return sessionID;
}

/**
 * Shown only on the signed-in user's own profile. Lists solves that were
 * timed while offline and never reached the server, grouped by event and
 * session, with a manual "sync now" flow the user drives - nothing here
 * pushes to the profile until they ask it to.
 */
export default function OfflineSolvesPanel({ userID, isOnline, onSynced }) {
  const { groups, count, refresh } = useOfflineQueue(userID);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [progress, setProgress] = useState(null);

  if (!count) return null;

  const totalSolves = groups.reduce(
    (sum, g) => sum + g.sessions.reduce((s2, sess) => s2 + sess.solves.length, 0),
    0
  );

  const syncAll = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    setSyncError("");

    const allEntries = groups.flatMap((g) =>
      g.sessions.flatMap((sess) => sess.solves.map((solve) => ({ ...solve, event: g.event })))
    );

    let synced = 0;
    let failed = 0;
    const affectedEvents = new Set();

    for (const entry of allEntries) {
      setProgress({ done: synced + failed, total: allEntries.length });
      try {
        await addSolve(userID, {
          event: entry.event,
          sessionID: entry.sessionID,
          rawTimeMs: entry.rawTimeMs,
          penalty: entry.penalty,
          scramble: entry.scramble,
          note: entry.note,
          createdAt: entry.createdAt,
          tags: entry.tags,
        });
        removeOfflineSolve(userID, entry.localId);
        affectedEvents.add(entry.event);
        synced += 1;
      } catch (err) {
        console.error("Failed to sync offline solve:", err);
        failed += 1;
      }
    }

    setProgress(null);
    setSyncing(false);
    refresh();

    if (failed > 0) {
      setSyncError(
        `Synced ${synced} of ${allEntries.length} solves. ${failed} failed and stayed queued — try again once you're reliably online.`
      );
    }

    if (synced > 0 && typeof onSynced === "function") {
      onSynced(Array.from(affectedEvents));
    }
  };

  return (
    <div className="offline-solves-panel">
      <div className="offline-solves-panel__header">
        <div>
          <h3 className="offline-solves-panel__title">Offline solves</h3>
          <p className="offline-solves-panel__subtitle">
            {totalSolves} solve{totalSolves === 1 ? "" : "s"} timed while offline, not yet on your
            profile.
          </p>
        </div>
        <button
          type="button"
          className="offline-solves-panel__sync-btn"
          onClick={syncAll}
          disabled={syncing || !isOnline}
          title={!isOnline ? "Reconnect to sync" : undefined}
        >
          {syncing
            ? progress
              ? `Syncing ${progress.done}/${progress.total}…`
              : "Syncing…"
            : isOnline
            ? "Add to profile"
            : "Offline"}
        </button>
      </div>

      {syncError && <div className="offline-solves-panel__error">{syncError}</div>}

      <div className="offline-solves-panel__groups">
        {groups.map((g) => (
          <div key={g.event} className="offline-solves-panel__group">
            <div className="offline-solves-panel__group-title">{eventLabel(g.event)}</div>
            {g.sessions.map((sess) => (
              <div key={sess.sessionID} className="offline-solves-panel__session">
                <div className="offline-solves-panel__session-title">
                  {sessionLabel(sess.sessionID, sess.sessionName)} · {sess.solves.length} solve
                  {sess.solves.length === 1 ? "" : "s"}
                </div>
                <div className="offline-solves-panel__chips">
                  {sess.solves.map((solve) => (
                    <span key={solve.localId} className="offline-solves-panel__chip">
                      {solve.penalty === "DNF" ? "DNF" : formatTime(solve.rawTimeMs, false, solve.penalty)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
