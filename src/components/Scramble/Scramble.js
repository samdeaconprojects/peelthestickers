import React, { useMemo } from "react";
import "./Scramble.css";

import ForwardSVG from "../../assets/ForwardSVG.svg";
import BackwardSVG from "../../assets/BackwardSVG.svg";

function stepsInToken(tok) {
  const t = String(tok || "").trim();
  if (!t) return 0;
  return t.endsWith("2") ? 2 : 1;
}

function Scramble({
  onScrambleClick,
  onForwardScramble,
  onBackwardScramble,
  scramble,
  currentEvent,
  isMusicPlayer,
  scrambleProgress = 0, // ✅ now treated as STEP progress
}) {
  let fontSize, maxWidth;

  switch (currentEvent) {
    case "222":
      fontSize = 20;
      maxWidth = 100;
      break;
    case "333":
    case "333OH":
    case "333BLD":
      fontSize = 20;
      maxWidth = 80;
      break;
    case "444":
      fontSize = isMusicPlayer ? 16 : 20;
      maxWidth = 80;
      break;
    case "555":
      fontSize = isMusicPlayer ? 15 : 16;
      maxWidth = 70;
      break;
    case "666":
      fontSize = isMusicPlayer ? 12 : 14;
      maxWidth = 70;
      break;
    case "777":
      fontSize = isMusicPlayer ? 11 : 13;
      maxWidth = 70;
      break;
    case "MEGAMINX":
      fontSize = isMusicPlayer ? 12 : 15;
      maxWidth = 90;
      break;
    default:
      fontSize = 20;
      maxWidth = 80;
  }

  const tokens = useMemo(() => {
    return String(scramble || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }, [scramble]);

  return (
    <div className="scramble-container">
      <button
        type="button"
        className="scramble-nav-btn scramble-prev-button"
        onClick={onBackwardScramble}
        aria-label="Previous scramble"
      >
        <img src={BackwardSVG} alt="" className="scramble-nav-icon" />
      </button>

      <p
        className="scramble-text"
        style={{ fontSize: `${fontSize}pt`, maxWidth: `${maxWidth}%` }}
        onClick={() => onScrambleClick(scramble)}
      >
        {tokens.length ? (
          (() => {
            // mark tokens done by consuming steps from scrambleProgress
            let remaining = Math.max(0, Number(scrambleProgress || 0));

            return tokens.map((t, i) => {
              const need = stepsInToken(t);
              const done = remaining >= need;
              remaining -= need;

              return (
  <span
    key={`${t}-${i}`}
    style={{
      opacity: done ? 0.35 : 1,
      textDecoration: done ? "line-through" : "none",
      transition: "opacity 120ms linear",
      marginRight: i === tokens.length - 1 ? 0 : 8,
      whiteSpace: "nowrap", //  prevents F and ' splitting
      display: "inline-block", //  extra safety across browsers
    }}
  >
    {t}
  </span>
);
            });
          })()
        ) : (
          scramble
        )}
      </p>

      <button
        type="button"
        className="scramble-nav-btn scramble-next-button"
        onClick={onForwardScramble}
        aria-label="Next scramble"
      >
        <img src={ForwardSVG} alt="" className="scramble-nav-icon" />
      </button>
    </div>
  );
}

export default Scramble;