// src/components/Social/SharedAverageMessage.js
import React, { useState, useMemo } from 'react';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import './SharedAverageMessage.css';

function SharedAverageMessage({
  msg,
  user,
  messages = [],
  onLoadSession,
  onDismiss,

  // OPTIONAL: pass these in from Social.js for true profile colors
  yourColor,
  theirColor,
}) {
  const [expanded, setExpanded] = useState(false);

  const safeYourColor = yourColor || user?.Color || user?.color || '#2EC4B6';
  const safeTheirColor = theirColor || '#888888';

  // -----------------------------
  // Parse ORIGINAL shared message
  // -----------------------------
  const parsed = useMemo(() => {
    try {
      const [, payload] = msg.text.split(']');

      // We MUST only grab the first 3 "|" fields
      const first = payload.indexOf('|');
      const second = payload.indexOf('|', first + 1);
      const third = payload.indexOf('|', second + 1);

      const sharedID = payload.slice(0, first);
      const event = payload.slice(first + 1, second);
      const count = parseInt(payload.slice(second + 1, third), 10);

      const scramblesString = payload.slice(third + 1);

      const scrambles = scramblesString
        .split('||')
        .map(s => s.trim())
        .filter(Boolean);

      return { sharedID, event, count, scrambles };
    } catch (err) {
      console.error("Failed to parse shared message:", msg.text, err);
      return null;
    }
  }, [msg.text]);

  // -----------------------------
  // Parse [sharedUpdate] messages
  // -----------------------------
  const updates = useMemo(() => {
    if (!parsed) return [];

    return messages
      .filter(m => m.text?.startsWith('[sharedUpdate]'))
      .map(m => {
        try {
          const [, payload] = m.text.split(']');
          const [sid, indexStr, timeStr, uid] = payload.split('|');

          if (sid !== parsed.sharedID) return null;

          return {
            index: parseInt(indexStr, 10),
            time: parseInt(timeStr, 10),
            userID: uid
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }, [messages, parsed]);

  // -----------------------------
  // Build times maps + compute split
  // (all inside one memo so deps are stable)
  // -----------------------------
  const { yourTimes, theirTimes, splitPercent } = useMemo(() => {
    const yt = {};
    const tt = {};

    // fill maps
    updates.forEach(u => {
      if (u.userID === user?.UserID) yt[u.index] = u.time;
      else tt[u.index] = u.time;
    });

    // compute wins-based split
    let yourWins = 0;
    let theirWins = 0;

    const count = parsed?.count || 0;
    for (let i = 0; i < count; i++) {
      const a = yt[i];
      const b = tt[i];

      if (typeof a !== 'number' || typeof b !== 'number') continue;
      if (!isFinite(a) || !isFinite(b)) continue;

      if (a < b) yourWins++;
      else if (b < a) theirWins++;
    }

    const total = yourWins + theirWins;
    let p = 50;

    if (total > 0) {
      p = (yourWins / total) * 100;

      // clamp so it doesn't go full 0/100 instantly
      // remove this clamp if you want true extremes
      p = Math.max(20, Math.min(80, p));
    }

    return { yourTimes: yt, theirTimes: tt, splitPercent: p };
  }, [updates, user?.UserID, parsed?.count]);

  // After all hooks:
  if (!parsed) return null;

  const formatMs = ms =>
    ms || ms === 0 ? (ms / 1000).toFixed(2) : '–';

  // -----------------------------
  // Show up to 12 rows
  // -----------------------------
  const MAX_VISIBLE = 12;
  const rowsToShow =
    expanded || parsed.count <= MAX_VISIBLE
      ? parsed.scrambles
      : parsed.scrambles.slice(0, MAX_VISIBLE);

  return (
    <div
      className="sharedAverageMessage"
      style={{
        '--youColor': safeYourColor,
        '--theirColor': safeTheirColor,
        '--split': `${splitPercent}%`,
      }}
    >
      <div className="sharedAverageHeader">
        <div className="sharedAverageIcon">
          <PuzzleSVG
            event={parsed.event}
            scramble={parsed.scrambles?.[0] || ''}
          />
        </div>

        <span>
          {msg.sender === user.UserID ? 'You' : msg.sender}
          {" shared an Ao"}
          {parsed.count} ({parsed.event})
        </span>
      </div>

      <div className="sharedAverageTable">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Scramble</th>
              <th>Your Time</th>
              <th>Their Time</th>
            </tr>
          </thead>

          <tbody>
            {rowsToShow.map((scramble, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="scrambleText">{scramble}</td>
                <td>{formatMs(yourTimes[i])}</td>
                <td>{formatMs(theirTimes[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {parsed.count > MAX_VISIBLE && !expanded && (
          <button
            className="expandSharedBtn"
            onClick={() => setExpanded(true)}
          >
            Show all {parsed.count}
          </button>
        )}

        <div className="sharedAverageActions">
          <button
            className="loadSharedBtn"
            onClick={() =>
              onLoadSession?.({
                sharedID: parsed.sharedID,
                event: parsed.event,
                scrambles: parsed.scrambles,
                sourceMessage: msg,
              })
            }
          >
            Load Into Timer
          </button>

          {onDismiss && (
            <button className="dismissSharedBtn">
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedAverageMessage;
