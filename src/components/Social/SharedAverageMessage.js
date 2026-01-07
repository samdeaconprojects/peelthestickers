import React, { useState, useMemo } from 'react';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import './SharedAverageMessage.css';

function SharedAverageMessage({ msg, user, messages = [], onLoadSession, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

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

  if (!parsed) return null;

  // -----------------------------
  // Build lookup maps
  // -----------------------------
  const yourTimes = {};
  const theirTimes = {};

  updates.forEach(u => {
    if (u.userID === user.UserID) yourTimes[u.index] = u.time;
    else theirTimes[u.index] = u.time;
  });

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
    <div className="sharedAverageMessage">

      <div className="sharedAverageHeader">
        <PuzzleSVG
          event={parsed.event}
          scramble={parsed.scrambles?.[0] || ''}
        />
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
