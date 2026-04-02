import React, { useMemo } from "react";
import "./Scramble.css";
import { useSettings } from "../../contexts/SettingsContext";

import ForwardSVG from "../../assets/ForwardSVG.svg";
import BackwardSVG from "../../assets/BackwardSVG.svg";

function normalizeNavigationArrowStyle(style) {
  return String(style || "").trim().toLowerCase() === "classic"
    ? "classic"
    : "scramble";
}

function stepsInToken(tok) {
  const t = String(tok || "").trim();
  if (!t) return 0;
  return t.endsWith("2") ? 2 : 1;
}

function getScrambleControlLayout(currentEvent, isMusicPlayer) {
  switch (currentEvent) {
    case "444":
      return {
        prevShiftX: "10px",
        nextShiftX: "-10px",
        addButtonOffset: isMusicPlayer ? "72px" : "78px",
      };
    case "555":
      return {
        prevShiftX: "12px",
        nextShiftX: "-12px",
        addButtonOffset: isMusicPlayer ? "68px" : "74px",
      };
    case "666":
      return {
        prevShiftX: "14px",
        nextShiftX: "-14px",
        addButtonOffset: isMusicPlayer ? "64px" : "70px",
      };
    case "777":
      return {
        prevShiftX: "16px",
        nextShiftX: "-16px",
        addButtonOffset: isMusicPlayer ? "60px" : "66px",
      };
    default:
      return {
        prevShiftX: "0px",
        nextShiftX: "0px",
        addButtonOffset: "88px",
      };
  }
}

function Scramble({
  onScrambleClick,
  onForwardScramble,
  onBackwardScramble,
  onAddSolveClick,
  scramble,
  currentEvent,
  isMusicPlayer,
  scrambleProgress = 0, // ✅ now treated as STEP progress
  copyFeedback = "idle",
}) {
  const { settings } = useSettings();
  const navigationArrowStyle = normalizeNavigationArrowStyle(
    settings?.navigationArrowStyle
  );
  const isSingleLineEvent = currentEvent === "SKEWB" || currentEvent === "PYRAMINX";
  const controlLayout = useMemo(
    () => getScrambleControlLayout(currentEvent, isMusicPlayer),
    [currentEvent, isMusicPlayer]
  );
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
    case "SKEWB":
    case "PYRAMINX":
      fontSize = 20;
      maxWidth = 100;
      break;
    default:
      fontSize = 20;
      maxWidth = 80;
  }

  const tokens = useMemo(() => {
    const text = String(scramble || "").trim();
    if (!text) return [];

    if (currentEvent === "SQ1") {
      return text.match(/\([^)]*\)|\//g) || [];
    }

    return text.split(/\s+/).filter(Boolean);
  }, [scramble, currentEvent]);

  return (
    <div
      className="scramble-container"
      style={{
        "--scramble-prev-shift-x": controlLayout.prevShiftX,
        "--scramble-next-shift-x": controlLayout.nextShiftX,
        "--scramble-add-offset": controlLayout.addButtonOffset,
      }}
    >
      <div
        className={`scramble-copy-indicator scramble-copy-indicator--top ${
          copyFeedback !== "idle" ? "scramble-copy-indicator--visible" : ""
        }`}
        aria-live="polite"
      >
        {copyFeedback === "copied"
          ? "Copied"
          : copyFeedback === "error"
            ? "Copy failed"
            : copyFeedback === "empty"
              ? "No scramble"
              : ""}
      </div>

      <button
        type="button"
        className="scramble-nav-btn scramble-prev-button"
        onClick={onBackwardScramble}
        aria-label="Previous scramble"
      >
        {navigationArrowStyle === "classic" ? (
          <span className="scramble-nav-glyph" aria-hidden="true">
            ◀
          </span>
        ) : (
          <img src={BackwardSVG} alt="" className="scramble-nav-icon" />
        )}
      </button>

      <div className="scramble-content">
        <button
          type="button"
          className="scramble-click-target"
          onClick={() => onScrambleClick(scramble)}
          aria-label="Copy scramble"
          title="Copy scramble"
        >
          <div
            className={`scramble-text ${isSingleLineEvent ? "scramble-text--single-line" : ""}`}
            style={{ fontSize: `${fontSize}pt`, maxWidth: `${maxWidth}%` }}
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
                        whiteSpace: "nowrap",
                        display: "inline-block",
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
          </div>
        </button>

        {typeof onAddSolveClick === "function" ? (
          <button
            type="button"
            className="scramble-add-btn"
            aria-label="Add solve manually"
            title="Add Solve"
            data-tooltip="Add Solve"
            onClick={onAddSolveClick}
          >
            +
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="scramble-nav-btn scramble-next-button"
        onClick={onForwardScramble}
        aria-label="Next scramble"
      >
        {navigationArrowStyle === "classic" ? (
          <span className="scramble-nav-glyph" aria-hidden="true">
            ▶
          </span>
        ) : (
          <img src={ForwardSVG} alt="" className="scramble-nav-icon" />
        )}
      </button>
    </div>
  );
}

export default Scramble;
