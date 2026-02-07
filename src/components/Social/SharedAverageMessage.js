// src/components/Social/SharedAverageMessage.js
import React, { useMemo, useState } from "react";

import { useSettings } from "../../contexts/SettingsContext";
import { hexToRgbString } from "../../utils/colorUtils";

import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import "./SharedAverageMessage.css";

// keep importing so nothing else breaks if you rely on it elsewhere
import TimeItem from "../TimeList/TimeItem";
import "../TimeList/TimeItem.css";

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hslColor(h, s = 100, l = 55) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Green (fast) -> Red (slow)
function hueGreenToRed(t01) {
  const t = clamp01(t01);
  return 120 * (1 - t);
}

/* -------------------------------------------
   EVENT NORMALIZATION
-------------------------------------------- */
const normalizeEventKey = (evt) => {
  if (!evt) return "333";
  const e = String(evt).trim().toUpperCase();

  // common variations
  if (e === "3X3" || e === "3X3X3") return "333";
  if (e === "2X2" || e === "2X2X2") return "222";
  if (e === "4X4" || e === "4X4X4") return "444";
  if (e === "5X5" || e === "5X5X5") return "555";
  if (e === "6X6" || e === "6X6X6") return "666";
  if (e === "7X7" || e === "7X7X7") return "777";

  return e;
};

// PuzzleSVG likely only supports core puzzle keys.
// OH/BLD should still show a 3x3 cube icon.
const puzzleSvgEventKey = (eventKey) => {
  if (eventKey === "333OH") return "333";
  if (eventKey === "333BLD") return "333";
  return eventKey;
};


/* -------------------------------------------
   TWO UI MAPS (LEFT/THEM and RIGHT/YOU)
   - label: what to display in header (333 -> 3x3)
   - labelSize: font size for event label
   - labelTrack: letter spacing (px)
   - iconScale: scale applied to the icon container
   - iconDx/iconDy: translate in px
-------------------------------------------- */
const LEFT_UI = {
  "222": { label: "2x2", labelSize: 26, labelTrack: 0.4, iconScale: 0.52, iconDx: -2, iconDy: 0 },
  "333": { label: "3x3", labelSize: 28, labelTrack: 0.4, iconScale: 0.44, iconDx: -16, iconDy: -4 },
  "444": { label: "4x4", labelSize: 26, labelTrack: 0.4, iconScale: 0.40, iconDx: -16, iconDy: -4 },
  "555": { label: "5x5", labelSize: 24, labelTrack: 0.4, iconScale: 0.42, iconDx: -16, iconDy: -5 },
  "666": { label: "6x6", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -16, iconDy: -5 },
  "777": { label: "7x7", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -18, iconDy: -5 },

  "MEGAMINX": { label: "MEGAMINX", labelSize: 20, labelTrack: 0.8, iconScale: 0.30, iconDx: -10, iconDy: -18 },
  "PYRAMINX": { label: "PYRAMINX", labelSize: 22, labelTrack: 0.8, iconScale: 0.44, iconDx: -18, iconDy: -28 },
  "SKEWB": { label: "SKEWB", labelSize: 24, labelTrack: 0.8, iconScale: 0.60, iconDx: -22, iconDy: -15 },
  "SQ1": { label: "SQ-1", labelSize: 24, labelTrack: 0.8, iconScale: 0.56, iconDx: -28, iconDy: -36 },
  "CLOCK": { label: "CLOCK", labelSize: 24, labelTrack: 0.8, iconScale: 0.46, iconDx: -18, iconDy: -24 },
  "333OH": { label: "3x3 OH", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: -4, iconDy: 0 },
  "333BLD": { label: "3x3 BLD", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: -4, iconDy: 0 },
};

const RIGHT_UI = {
  // for most puzzles, same scaling, but iconDx is typically mirrored (positive)
  "222": { label: "2x2", labelSize: 26, labelTrack: 0.4, iconScale: 0.52, iconDx: 2, iconDy: 0 },
  "333": { label: "3x3", labelSize: 28, labelTrack: 0.4, iconScale: 0.44, iconDx: -32, iconDy: -4 },
  "444": { label: "4x4", labelSize: 26, labelTrack: 0.4, iconScale: 0.40, iconDx: -34, iconDy: -4 },
  "555": { label: "5x5", labelSize: 24, labelTrack: 0.4, iconScale: 0.42, iconDx: -36, iconDy: -5 },
  "666": { label: "6x6", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -38, iconDy: -5 },
  "777": { label: "7x7", labelSize: 24, labelTrack: 0.4, iconScale: 0.40, iconDx: -38, iconDy: -5 },

  "MEGAMINX": { label: "MEGAMINX", labelSize: 20, labelTrack: 0.8, iconScale: 0.30, iconDx: -20, iconDy: -18 },
  "PYRAMINX": { label: "PYRAMINX", labelSize: 22, labelTrack: 0.8, iconScale: 0.44, iconDx: -32, iconDy: -28 },
  "SKEWB": { label: "SKEWB", labelSize: 24, labelTrack: 0.8, iconScale: 0.60, iconDx: -38, iconDy: -15 },
  "SQ1": { label: "SQ-1", labelSize: 24, labelTrack: 0.8, iconScale: 0.56, iconDx: -48, iconDy: -36 },
  "CLOCK": { label: "CLOCK", labelSize: 24, labelTrack: 0.8, iconScale: 0.46, iconDx: -36, iconDy: -24 },
  "333OH": { label: "3x3 OH", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: 4, iconDy: 0 },
  "333BLD": { label: "3x3 BLD", labelSize: 22, labelTrack: 0.6, iconScale: 0.52, iconDx: 4, iconDy: 0 },
};

const getUiForSide = (side, eventKey) => {
  const fallback = {
    label: eventKey,
    labelSize: 28,
    labelTrack: 0.4,
    iconScale: 0.52,
    iconDx: 0,
    iconDy: 0,
  };
  const map = side === "you" ? RIGHT_UI : LEFT_UI;
  return map[eventKey] || fallback;
};

function SharedAverageMessage({
  msg,
  user,
  messages = [],
  onLoadSession,
  onDismiss,

  yourColor,
  theirColor,

  yourUsername,
  theirUsername,

  onOpenSideDetail,
}) {
  const [expanded, setExpanded] = useState(false);

  const safeYourColor = yourColor || user?.Color || user?.color || "#2EC4B6";
  const safeTheirColor = theirColor || "#888888";

  const { settings } = useSettings();
  const primaryRgb = hexToRgbString(settings?.primaryColor || "#0E171D");

  // match TimeList modes:
  // "binary" | "continuous" | "bucket" | "index"
  // also accept old "spectrum" as "bucket"
  const timeColorModeRaw = settings?.timeColorMode || "binary";
  const timeColorMode =
    timeColorModeRaw === "spectrum" ? "bucket" : timeColorModeRaw;

  // YOU should appear on the RIGHT
  const nameYou =
    yourUsername || user?.Username || user?.Name || user?.UserID || "You";
  const nameThem = theirUsername || msg?.sender || "Them";

  // -----------------------------
  // Parse ORIGINAL shared message
  // -----------------------------
  const parsed = useMemo(() => {
    try {
      if (!msg?.text || !msg.text.includes("]")) return null;
      const [, payload] = msg.text.split("]");

      const first = payload.indexOf("|");
      const second = payload.indexOf("|", first + 1);
      const third = payload.indexOf("|", second + 1);
      if (first < 0 || second < 0 || third < 0) return null;

      const sharedID = payload.slice(0, first);
      const event = payload.slice(first + 1, second);
      const count = parseInt(payload.slice(second + 1, third), 10);

      const scramblesString = payload.slice(third + 1);
      const scrambles = scramblesString
        .split("||")
        .map((s) => s.trim())
        .filter(Boolean);

      return {
        sharedID,
        event,
        count: Number.isFinite(count) ? count : 0,
        scrambles,
      };
    } catch (err) {
      console.error("Failed to parse shared message:", msg?.text, err);
      return null;
    }
  }, [msg?.text]);

  // -----------------------------
  // Parse [sharedUpdate] messages
  // -----------------------------
  const updates = useMemo(() => {
    if (!parsed) return [];
    return (messages || [])
      .filter((m) => m?.text?.startsWith("[sharedUpdate]"))
      .map((m) => {
        try {
          const [, payload] = m.text.split("]");
          const [sid, indexStr, timeStr, uid] = payload.split("|");
          if (sid !== parsed.sharedID) return null;

          const index = parseInt(indexStr, 10);
          const time = parseInt(timeStr, 10);

          if (!Number.isFinite(index) || !Number.isFinite(time) || !uid)
            return null;

          return { index, time, userID: uid };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }, [messages, parsed]);

  // -----------------------------
  // Build maps + compute stats
  // -----------------------------
  const computed = useMemo(() => {
    const yt = {};
    const tt = {};

    (updates || []).forEach((u) => {
      if (u.userID === user?.UserID) yt[u.index] = u.time;
      else tt[u.index] = u.time;
    });

    const count = parsed?.count || 0;

    let yourWins = 0;
    let theirWins = 0;

    const yourVals = [];
    const theirVals = [];

    for (let i = 0; i < count; i++) {
      const a = yt[i];
      const b = tt[i];

      if (typeof a === "number" && isFinite(a)) yourVals.push(a);
      if (typeof b === "number" && isFinite(b)) theirVals.push(b);

      if (typeof a !== "number" || typeof b !== "number") continue;
      if (!isFinite(a) || !isFinite(b)) continue;

      if (a < b) yourWins++;
      else if (b < a) theirWins++;
    }

    const mean = (arr) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    const yourAo = mean(yourVals);
    const theirAo = mean(theirVals);
    const yourMean = mean(yourVals);
    const theirMean = mean(theirVals);

    const total = yourWins + theirWins;
    let p = 50;
    if (total > 0) {
      p = (yourWins / total) * 100;
      p = Math.max(20, Math.min(80, p));
    }

    return {
      yourTimes: yt,
      theirTimes: tt,
      yourWins,
      theirWins,
      yourAo,
      theirAo,
      yourMean,
      theirMean,
      splitPercent: p,
      yourVals,
      theirVals,
    };
  }, [updates, user?.UserID, parsed]);

  // ---- derived values (NO hooks below this line) ----
  const youRgb = hexToRgbString(safeYourColor);
  const theirRgb = hexToRgbString(safeTheirColor);

  const yourMin = computed?.yourVals?.length
    ? Math.min(...computed.yourVals)
    : null;
  const yourMax = computed?.yourVals?.length
    ? Math.max(...computed.yourVals)
    : null;
  const theirMin = computed?.theirVals?.length
    ? Math.min(...computed.theirVals)
    : null;
  const theirMax = computed?.theirVals?.length
    ? Math.max(...computed.theirVals)
    : null;

  // rank maps for INDEX mode (computed WITHOUT useMemo to avoid hook-order issues)
  const buildRankPack = (arr) => {
    const vals = (arr || [])
      .filter((v) => typeof v === "number" && isFinite(v))
      .slice();
    vals.sort((a, b) => a - b);
    const m = new Map();
    vals.forEach((v, idx) => {
      if (!m.has(v)) m.set(v, idx);
    });
    return { map: m, size: vals.length };
  };
  const yourRankPack = buildRankPack(computed?.yourVals);
  const theirRankPack = buildRankPack(computed?.theirVals);

  // NOW it's safe to early-return (no hooks below)
  if (!parsed) return null;

  const eventKey = normalizeEventKey(parsed.event);
  const uiThem = getUiForSide("them", eventKey);
  const uiYou = getUiForSide("you", eventKey);

  const formatMs = (ms) => (ms || ms === 0 ? (ms / 1000).toFixed(2) : "–");

  const getPerfClassAndStyle = (value, min, max, rank01) => {
    if (timeColorMode === "binary") return { perfClass: "", perfStyle: null };

    if (timeColorMode === "index") {
      const h = hueGreenToRed(rank01);
      const c = hslColor(h, 100, 55);
      return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
    }

    if (typeof value !== "number" || !isFinite(value))
      return { perfClass: "", perfStyle: null };
    if (typeof min !== "number" || !isFinite(min))
      return { perfClass: "", perfStyle: null };
    if (typeof max !== "number" || !isFinite(max))
      return { perfClass: "", perfStyle: null };
    if (max <= min) return { perfClass: "", perfStyle: null };

    const t = clamp01((value - min) / (max - min));

    if (timeColorMode === "bucket") {
      if (t <= 0.20) return { perfClass: "overall-border-min", perfStyle: null };
      if (t <= 0.40) return { perfClass: "faster", perfStyle: null };
      if (t <= 0.60) return { perfClass: "middle-fast", perfStyle: null };
      if (t <= 0.80) return { perfClass: "slower", perfStyle: null };
      return { perfClass: "overall-border-max", perfStyle: null };
    }

    // continuous
    const h = hueGreenToRed(t);
    const c = hslColor(h, 100, 55);
    return { perfClass: "", perfStyle: { border: `2px solid ${c}` } };
  };

  const getBinaryExtremesClass = (value, min, max, dashed = true) => {
    if (timeColorMode !== "binary") return "";
    if (typeof value !== "number" || !isFinite(value)) return "";
    if (typeof min !== "number" || !isFinite(min)) return "";
    if (typeof max !== "number" || !isFinite(max)) return "";
    if (max <= min) return "";
    if (value === min) return dashed ? "dashed-border-min" : "overall-border-min";
    if (value === max) return dashed ? "dashed-border-max" : "overall-border-max";
    return "";
  };

  const winnerForIndex = (i) => {
    const a = computed.yourTimes[i];
    const b = computed.theirTimes[i];
    if (typeof a !== "number" || typeof b !== "number") return "none";
    if (!isFinite(a) || !isFinite(b)) return "none";
    if (a < b) return "you";
    if (b < a) return "them";
    return "tie";
  };

  const rowWinClass = (w) => {
    if (w === "you") return "sharedRowWinYou"; // YOU on RIGHT
    if (w === "them") return "sharedRowWinThem"; // THEM on LEFT
    if (w === "tie") return "sharedRowTie";
    return "";
  };

  const renderTimeCell = (side, ms) => {
    const value = typeof ms === "number" && isFinite(ms) ? ms : null;

    const min = side === "you" ? yourMin : theirMin;
    const max = side === "you" ? yourMax : theirMax;

    let rank01 = 0;
    if (timeColorMode === "index" && value != null) {
      const pack = side === "you" ? yourRankPack : theirRankPack;
      const idx = pack.map.get(value);
      const denom = Math.max(1, pack.size - 1);
      rank01 = typeof idx === "number" ? idx / denom : 0;
    }

    const { perfClass, perfStyle } =
      timeColorMode === "binary"
        ? { perfClass: "", perfStyle: null }
        : getPerfClassAndStyle(value, min, max, rank01);

    const binaryClass = getBinaryExtremesClass(value, min, max, true);

    return (
      <div
        className={["TimeItem", "sharedAverageTimeItem", perfClass, binaryClass].join(
          " "
        )}
        style={perfStyle || undefined}
      >
        <TimeItem time={formatMs(value)} />
      </div>
    );
  };

  const MAX_VISIBLE = 12;
  const rowsToShow =
    expanded || parsed.count <= MAX_VISIBLE
      ? parsed.scrambles
      : parsed.scrambles.slice(0, MAX_VISIBLE);

  return (
    <div
      className="sharedAverageCard"
      style={{
        "--primaryRgb": primaryRgb,
        "--youColor": safeYourColor,
        "--theirColor": safeTheirColor,
        "--youRgb": youRgb,
        "--theirRgb": theirRgb,
        "--split": `${computed.splitPercent}%`,
      }}
    >
      {/* TOP */}
      <div className="sharedAverageTop">
        {/* LEFT (THEM) */}
        <button
          className="sharedAverageSide sharedAverageSideThem"
          type="button"
          onClick={() =>
            onOpenSideDetail?.({
              side: "them",
              sharedID: parsed.sharedID,
              event: parsed.event,
              scrambles: parsed.scrambles,
              yourTimes: computed.yourTimes,
              theirTimes: computed.theirTimes,
              sourceMessage: msg,
            })
          }
        >
          <div
            className="sharedAverageSideIcon"
            style={{
              transform: `translate(${uiThem.iconDx}px, ${uiThem.iconDy}px) scale(${uiThem.iconScale})`,
              marginRight: 0,
              marginLeft: 0,
            }}
          >
            <PuzzleSVG event={puzzleSvgEventKey(eventKey)} scramble={parsed.scrambles?.[0] || ""} />
          </div>

          <div className="sharedAverageSideMeta sharedAverageSideMetaThem">
            <div
              className="sharedAverageEventLabel"
              style={{
                fontSize: uiThem.labelSize,
                letterSpacing: `${uiThem.labelTrack ?? 0.4}px`,
              }}
            >
              {uiThem.label}
            </div>
            <div className="sharedAverageName">{nameThem}</div>
          </div>

          <div className="sharedAverageSideBig sharedAverageSideBigCenter">
            <div className="sharedAverageBig">
              {computed.theirAo != null ? formatMs(computed.theirAo) : "–"}
            </div>
            <div className="sharedAverageSmallLabel">Ao{parsed.count}</div>
          </div>
        </button>

        {/* CENTER */}
        <div className="sharedAverageCenter">
          <div className="sharedAverageCenterTitle">
            Mixed average — {parsed.count} solves
          </div>

          <div className="sharedAverageScoreRow">
            <span className="sharedAverageScore">{computed.theirWins}</span>
            <span className="sharedAverageScoreLabel">WINS</span>
            <span className="sharedAverageScore">{computed.yourWins}</span>
          </div>

          <div className="sharedAverageMeanRow">
            <span className="sharedAverageMeanLabel">MEAN</span>
            <span className="sharedAverageMean">
              {computed.theirMean != null ? formatMs(computed.theirMean) : "–"}
            </span>
            <span className="sharedAverageMeanMid">vs</span>
            <span className="sharedAverageMean">
              {computed.yourMean != null ? formatMs(computed.yourMean) : "–"}
            </span>
          </div>
        </div>

        {/* RIGHT (YOU) */}
        <button
          className="sharedAverageSide sharedAverageSideYou"
          type="button"
          onClick={() =>
            onOpenSideDetail?.({
              side: "you",
              sharedID: parsed.sharedID,
              event: parsed.event,
              scrambles: parsed.scrambles,
              yourTimes: computed.yourTimes,
              theirTimes: computed.theirTimes,
              sourceMessage: msg,
            })
          }
        >
          <div className="sharedAverageSideBig sharedAverageSideBigCenter">
            <div className="sharedAverageBig">
              {computed.yourAo != null ? formatMs(computed.yourAo) : "–"}
            </div>
            <div className="sharedAverageSmallLabel">Ao{parsed.count}</div>
          </div>

          <div className="sharedAverageSideMeta sharedAverageSideMetaRight">
            <div
              className="sharedAverageEventLabel"
              style={{
                fontSize: uiYou.labelSize,
                letterSpacing: `${uiYou.labelTrack ?? 0.4}px`,
              }}
            >
              {uiYou.label}
            </div>
            <div className="sharedAverageName">{nameYou}</div>
          </div>

          <div
            className="sharedAverageSideIcon"
            style={{
              transform: `translate(${uiYou.iconDx}px, ${uiYou.iconDy}px) scale(${uiYou.iconScale})`,
              marginRight: 0,
              marginLeft: 0,
            }}
          >
            <PuzzleSVG event={puzzleSvgEventKey(eventKey)} scramble={parsed.scrambles?.[0] || ""} />
          </div>
        </button>
      </div>

      {/* TABLE */}
      <div className="sharedAverageTableWrap">
        <table className="sharedAverageTable">
          <tbody>
            {rowsToShow.map((scramble, i) => {
              const w = winnerForIndex(i);
              const yourTime = computed.yourTimes[i]; // YOU on RIGHT
              const theirTime = computed.theirTimes[i]; // THEM on LEFT

              return (
                <tr key={i} className={rowWinClass(w)}>
                  <td className="sharedAverageIdx sharedAverageIdxLeft">{i + 1}</td>

                  <td className="sharedAverageTimeCell sharedAverageTimeCellLeft">
                    <div
                      className={[
                        "sharedAveragePillWrap",
                        w === "them" ? "isWin" : "",
                        w === "you" ? "isLose" : "",
                        w === "tie" ? "isTie" : "",
                      ].join(" ")}
                    >
                      {renderTimeCell("them", theirTime)}
                    </div>
                  </td>

                  <td className="sharedAverageScramble">
                    <span className="sharedAverageScrambleText">{scramble}</span>
                  </td>

                  <td className="sharedAverageTimeCell sharedAverageTimeCellRight">
                    <div
                      className={[
                        "sharedAveragePillWrap",
                        w === "you" ? "isWin" : "",
                        w === "them" ? "isLose" : "",
                        w === "tie" ? "isTie" : "",
                      ].join(" ")}
                    >
                      {renderTimeCell("you", yourTime)}
                    </div>
                  </td>

                  <td className="sharedAverageIdx sharedAverageIdxRight">{i + 1}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {parsed.count > MAX_VISIBLE && !expanded && (
          <button className="sharedAverageExpandBtn" onClick={() => setExpanded(true)}>
            Show all {parsed.count}
          </button>
        )}

        <div className="sharedAverageActions">
          <button
            className="sharedAverageBtn sharedAverageBtnPrimary"
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
            <button className="sharedAverageBtn sharedAverageBtnGhost" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedAverageMessage;
