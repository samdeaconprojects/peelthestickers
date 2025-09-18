// src/components/Social/SharedAverageMessage.js
import React, { useState } from 'react';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import './SharedAverageMessage.css';

function SharedAverageMessage({ msg, user, onLoadSession, onMerge, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  const parseShared = (text) => {
    try {
      const [, payload] = text.split(']'); // remove [sharedAoN]
      const [event, count, scramblesString] = payload.split('|');
      const scrambles = scramblesString.split('||').filter(Boolean);
      return { event, count: parseInt(count, 10), scrambles };
    } catch {
      return null;
    }
  };

  const parsed = parseShared(msg.text);
  if (!parsed) return null;

  return (
    <div className="sharedAverageMessage">
      <div className="sharedAverageHeader">
        <PuzzleSVG
          event={parsed.event}
          scramble={parsed.scrambles[0]}
          isMusicPlayer={false}
          isTimerCube={false}
        />
        <span>
          {msg.sender === user.UserID ? 'You' : msg.sender} shared an Ao
          {parsed.count} ({parsed.event})
        </span>
      </div>

      {!expanded && (
        <button className="expandSharedBtn" onClick={() => setExpanded(true)}>
          View Scrambles
        </button>
      )}

      {expanded && (
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
              {parsed.scrambles.map((scramble, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="scrambleText">{scramble}</td>
                  <td>–</td> {/* TODO: populate when solves sync */}
                  <td>–</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sharedAverageActions">
            <button
              className="loadSharedBtn"
              onClick={() =>
                onLoadSession?.({
                  event: parsed.event,
                  scrambles: parsed.scrambles,
                  sourceMessage: msg,
                })
              }
            >
              Load Into Timer
            </button>

            {onMerge && (
              <button
                className="mergeSharedBtn"
                onClick={() =>
                  onMerge({
                    event: parsed.event,
                    scrambles: parsed.scrambles,
                    sourceMessage: msg,
                  })
                }
              >
                Merge to Main
              </button>
            )}

            {onDismiss && (
              <button className="dismissSharedBtn" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SharedAverageMessage;
