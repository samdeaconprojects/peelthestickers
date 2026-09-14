import React, { useState } from "react";
import "./LiveRoomBar.css";

function formatTime(ms) {
  if (!Number.isFinite(ms)) return "--";
  const seconds = ms / 1000;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

// Host-side pill: shows while broadcasting, with a stop control.
export function LiveRoomHostPill({ roomID, spectatorCount = 0, onStop }) {
  return (
    <div className="liveRoomPill liveRoomPill--host">
      <span className="liveRoomPill__dot" />
      <span className="liveRoomPill__label">Live</span>
      {typeof spectatorCount === "number" ? (
        <span className="liveRoomPill__meta">{spectatorCount} watching</span>
      ) : null}
      <button type="button" className="liveRoomPill__button" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}

// Spectator-side indicator + collapsible leaderboard.
export function LiveRoomFollowBar({
  follow,
  waitingForHost,
  currentUserID,
  onLeave,
  onJumpToLatest,
}) {
  const [expanded, setExpanded] = useState(false);
  if (!follow) return null;

  const behind = Math.max(0, (follow.hostIndex ?? -1) - follow.localIndex);
  const leaderboard = [...(follow.leaderboard || [])].sort(
    (a, b) => (b.currentIndex ?? -1) - (a.currentIndex ?? -1)
  );

  return (
    <div className="liveRoomFollowBar">
      <div className="liveRoomFollowBar__row">
        <div className="liveRoomFollowBar__info" onClick={() => setExpanded((v) => !v)}>
          <span className="liveRoomPill__dot" />
          <span className="liveRoomFollowBar__label">
            Following {follow.hostName || "host"}&apos;s room
          </span>
          <span className="liveRoomFollowBar__status">
            {waitingForHost
              ? "waiting for next scramble…"
              : behind > 0
              ? `${behind} behind`
              : "caught up"}
          </span>
        </div>
        <div className="liveRoomFollowBar__actions">
          {behind > 0 ? (
            <button type="button" className="liveRoomPill__button" onClick={onJumpToLatest}>
              Jump to current
            </button>
          ) : null}
          <button type="button" className="liveRoomPill__button" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="liveRoomFollowBar__leaderboard">
          {leaderboard.length === 0 ? (
            <div className="liveRoomFollowBar__empty">No one else here yet.</div>
          ) : (
            leaderboard.map((row) => (
              <div
                key={row.userID}
                className={`liveRoomFollowBar__row2 ${
                  row.userID === currentUserID ? "liveRoomFollowBar__row2--me" : ""
                }`}
              >
                <span
                  className="liveRoomFollowBar__swatch"
                  style={{ background: row.color || "#50B6FF" }}
                />
                <span className="liveRoomFollowBar__name">
                  {row.name || row.userID}
                  {row.role === "HOST" ? " (host)" : ""}
                </span>
                <span className="liveRoomFollowBar__index">
                  #{Math.max(0, (row.currentIndex ?? -1) + 1)}
                </span>
                <span className="liveRoomFollowBar__time">{formatTime(row.lastTime)}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// Modal shown when the host switches events and the spectator has backlog
// scrambles remaining under the old event.
export function LiveRoomEventPromptModal({ prompt, onChoice }) {
  if (!prompt) return null;

  return (
    <div className="liveRoomPromptOverlay">
      <div className="liveRoomPromptModal">
        <h3>Host switched events</h3>
        <p>
          The host moved on to <strong>{prompt.newEvent}</strong>. You&apos;re still on{" "}
          <strong>{prompt.previousEvent}</strong>.
        </p>
        <div className="liveRoomPromptModal__actions">
          <button type="button" onClick={() => onChoice("finish")}>
            Finish this solve, then switch
          </button>
          <button type="button" onClick={() => onChoice("now")}>
            Switch now
          </button>
          <button type="button" className="liveRoomPromptModal__leave" onClick={() => onChoice("leave")}>
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
