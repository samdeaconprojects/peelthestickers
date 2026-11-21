// src/components/Reconstruction/Reconstruction.js
//
// Smart-cube reconstruction for the solve detail: method steps with moves,
// timings (recognition / execution), last-layer cases, a step timeline, copy
// and a 3D replay on our own cube.

import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import "./Reconstruction.css";
import { analyzeSolve, reconstructionText } from "../../smart/recon/analyze";
import { readSmartRecord } from "../../smart/recon/solveRecord";
import { applyAlg } from "../../smart/recon/cube3";
import { faceHex, useCubeColors } from "../../utils/cubeColors";
import { buildStepRanker, rankColour, useReconPool } from "../../smart/recon/stepStats";

const CubePlayer = React.lazy(() => import("../Cube3D/CubePlayer"));

const TIMELINE_LABEL = { fb: "FB", sb: "SB" };

const fmt = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : "–");
const fmtTps = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");

const OPPOSITE_COLOUR = {
  white: "yellow",
  yellow: "white",
  green: "blue",
  blue: "green",
  red: "orange",
  orange: "red",
};

// Top-down view of the last layer: which stickers already show the top colour.
function OllDiagram({ pattern, colour }) {
  if (!pattern || pattern.length !== 21) return null;
  const on = (i) => pattern[i] === "1";
  const cell = 10;
  const pad = 4;
  const size = cell * 3 + pad * 2;
  const top = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      top.push(
        <rect
          key={`u${r}${c}`}
          x={pad + c * cell}
          y={pad + r * cell}
          width={cell - 1}
          height={cell - 1}
          rx="1.5"
          className={on(r * 3 + c) ? "reconOll__on" : "reconOll__off"}
        />
      );
    }
  }
  // side stickers: R (9..11) F (12..14) L (15..17) B (18..20), each listed
  // left-to-right as seen from that side.
  const bars = [];
  const bar = (key, x, y, w, h, i) =>
    bars.push(<rect key={key} x={x} y={y} width={w} height={h} rx="1" className={on(i) ? "reconOll__on" : "reconOll__none"} />);
  for (let k = 0; k < 3; k++) {
    // F: bottom edge, left->right
    bar(`f${k}`, pad + k * cell, pad + 3 * cell + 0.5, cell - 1, 3, 12 + k);
    // B: top edge, seen from behind so right->left
    bar(`b${k}`, pad + (2 - k) * cell, pad - 3.5, cell - 1, 3, 18 + k);
    // R: right edge, seen from the right: front (bottom) -> back (top)
    bar(`r${k}`, pad + 3 * cell + 0.5, pad + (2 - k) * cell, 3, cell - 1, 9 + k);
    // L: left edge, seen from the left: back (top) -> front (bottom)
    bar(`l${k}`, pad - 3.5, pad + k * cell, 3, cell - 1, 15 + k);
  }
  return (
    <svg
      className="reconOll"
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={colour ? { "--recon-oll-on": colour } : undefined}
    >
      {bars}
      {top}
    </svg>
  );
}

// Steps are coloured by how they compare with the user's other solves: green
// = faster than usual, red = slower, yellow = typical or not enough solves yet.
function stepColourStyle(p) {
  if (!p) return undefined;
  return { "--recon-step": rankColour(p.rank01) };
}

function perfText(p, prefix = "") {
  if (!p) return "";
  if (p.rank01 == null) {
    return `${prefix}Not enough solves to compare yet (${p.n})`;
  }
  const pct = Math.round((1 - p.rank01) * 100);
  return `${prefix}Faster than ${pct}% of ${p.n} other solve${p.n === 1 ? "" : "s"}`;
}

function stepCaseLabel(step) {
  if (step.caseName === "skip") return `${step.label} skip`;
  return step.caseName || null;
}

function slotLabel(step, colors) {
  if (!step.slots?.length) return null;
  return step.slots
    .map((faces) => faces.map((f) => ({ f, hex: faceHex(colors, f) })))
    .map((pair, i) => (
      <span className="reconSlot" key={i} title="Pair colours">
        {pair.map((p) => (
          <span key={p.f} className="reconSlot__dot" style={{ background: p.hex }} />
        ))}
      </span>
    ));
}

export default function Reconstruction({
  smartCube,
  scramble = "",
  method = "",
  solveTimeMs = null,
  event = "",
}) {
  const record = useMemo(() => readSmartRecord(smartCube), [smartCube]);
  const analysis = useMemo(
    () => (record ? analyzeSolve({ startState: record.startState, moves: record.moves, method }) : null),
    [record, method]
  );
  const colors = useCubeColors();
  const [showPlayer, setShowPlayer] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [copied, setCopied] = useState(false);
  const playerRef = useRef(null);
  const pendingRangeRef = useRef(null);

  const text = useMemo(() => reconstructionText(analysis), [analysis]);

  // Each step against the same step in the user's other smart-cube solves.
  const pool = useReconPool();
  const perf = useMemo(() => {
    if (!analysis) return [];
    const rank = buildStepRanker(pool, { event, method: analysis.method, exclude: smartCube });
    return analysis.steps.map((s) => rank(s));
  }, [pool, event, analysis, smartCube]);

  // Everything the player replays: the solver's hold first (e.g. z2, applied
  // to the start state, not animated), then every displayed token in order.
  const replay = useMemo(() => {
    if (!analysis || !record) return null;
    const startState = applyAlg(record.startState, analysis.rotation || "");
    const moves = [];
    const ranges = [];
    for (const s of analysis.steps) {
      const from = moves.length;
      for (const tok of s.tokens) moves.push({ text: tok.text, t: tok.t, rotation: !!tok.rotation });
      ranges.push([from, moves.length]);
    }
    return { startState, moves, ranges };
  }, [analysis, record]);

  const onPlayerRef = useCallback((p) => {
    playerRef.current = p;
    if (p && pendingRangeRef.current) {
      const [from, to] = pendingRangeRef.current;
      pendingRangeRef.current = null;
      p.playRange(from, to);
    }
  }, []);

  if (!analysis) return null;

  const total = analysis.totalMs || 0;
  const timelineSteps = analysis.steps.filter((s) => s.durationMs > 0);

  const copy = async () => {
    const full = [String(scramble || "").trim(), "", text].filter((x, i) => i !== 0 || x).join("\n");
    try {
      await navigator.clipboard.writeText(full.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };

  const playStep = (i) => {
    const range = replay.ranges[i];
    if (!range || range[0] === range[1]) return;
    if (playerRef.current) playerRef.current.playRange(range[0], range[1]);
    else {
      pendingRangeRef.current = range;
      setShowPlayer(true);
    }
  };

  const seekTo = (count) => {
    if (playerRef.current) playerRef.current.seekToCount(count);
  };

  const topColour = OPPOSITE_COLOUR[analysis.bottomColour] || "yellow";
  const ollHex = colors[topColour] || colors.yellow;

  const timeMismatch =
    Number.isFinite(solveTimeMs) && solveTimeMs > 0 && Math.abs(solveTimeMs - total) > 50;

  return (
    <section className={`recon${showPlayer ? " recon--player" : ""}`} aria-label="Reconstruction">
      <header className="recon__head">
        <div className="recon__title">
          <span>Reconstruction</span>
          {analysis.method ? <span className="recon__chip">{analysis.method}</span> : null}
          {analysis.bottomColour && analysis.method === "CFOP" ? (
            <span className="recon__chip recon__chip--plain">
              <span className="reconSlot__dot" style={{ background: colors[analysis.bottomColour] }} />
              {analysis.bottomColour} cross
            </span>
          ) : null}
        </div>
        <div className="recon__totals">
          <span><b>{analysis.stm}</b> moves</span>
          <span><b>{fmtTps(analysis.tps)}</b> tps</span>
          {!analysis.solved ? <span className="recon__warn">not solved</span> : null}
        </div>
      </header>

      {total > 0 && timelineSteps.length ? (
        <div className="recon__timeline" role="img" aria-label="Time per step">
          {timelineSteps.map((s) => (
            <div
              key={`${s.key}-${s.from}`}
              className={`recon__seg recon__seg--${s.group}`}
              style={{
                flexGrow: s.durationMs,
                ...stepColourStyle(perf[analysis.steps.indexOf(s)]),
              }}
              title={`${s.label}: ${fmt(s.durationMs)}s${perfText(perf[analysis.steps.indexOf(s)], " · ")}`}
            >
              <span>{TIMELINE_LABEL[s.key] || s.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <ol className="recon__steps">
        {analysis.steps.map((s, i) => {
          const caseLabel = stepCaseLabel(s);
          return (
            <li
              key={`${s.key}-${s.from}`}
              className={`reconStep reconStep--${s.group}`}
              style={stepColourStyle(perf[i])}
            >
              <div className="reconStep__name">
                <span className="reconStep__swatch" />
                <span className="reconStep__label">{s.label}</span>
                {slotLabel(s, colors)}
                {s.oll && !s.oll.skip ? <OllDiagram pattern={s.oll.pattern} colour={ollHex} /> : null}
              </div>
              <div className="reconStep__moves">
                {s.tokens.length ? (
                  <span className="reconStep__alg">
                    {s.tokens.map((x, j) => {
                      const g = replay.ranges[i][0] + j;
                      const state = !showPlayer
                        ? ""
                        : g === playhead - 1
                        ? " is-current"
                        : g < playhead
                        ? " is-done"
                        : "";
                      return (
                        <span
                          key={j}
                          className={`reconMove${x.rotation ? " reconMove--rotation" : ""}${state}`}
                          onClick={showPlayer ? () => seekTo(g + 1) : undefined}
                        >
                          {x.text}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="recon__muted">—</span>
                )}
                {caseLabel ? <span className="reconStep__case">{caseLabel}</span> : null}
              </div>
              <div className="reconStep__stats">
                <span className="reconStep__time" title={perfText(perf[i]) || undefined}>
                  {fmt(s.durationMs)}
                </span>
                <span className="recon__muted">
                  {s.stm} mv · {fmtTps(s.tps)} tps
                </span>
                {s.recognitionMs > 0 ? (
                  <span className="recon__muted">
                    recog {fmt(s.recognitionMs)} · exec {fmt(s.executionMs)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="reconStep__play"
                onClick={() => playStep(i)}
                disabled={!s.tokens.length}
                title={`Replay ${s.label}`}
                aria-label={`Replay ${s.label}`}
              >
                ▶
              </button>
            </li>
          );
        })}
      </ol>

      {timeMismatch ? (
        <p className="recon__note">
          Moves span {fmt(total)}s; the saved time is {fmt(solveTimeMs)}s.
        </p>
      ) : null}
      {record.startSource === "derived" ? (
        <p className="recon__note">Start state rebuilt from the moves.</p>
      ) : null}

      <div className="recon__actions">
        <button type="button" className="share-button" onClick={() => setShowPlayer((v) => !v)}>
          {showPlayer ? "Hide replay" : "Replay"}
        </button>
        <button type="button" className="share-button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {showPlayer ? (
        <div className="recon__player">
          <Suspense fallback={<div className="recon__muted">Loading 3D…</div>}>
            <CubePlayer
              ref={onPlayerRef}
              startState={replay.startState}
              moves={replay.moves}
              onPosition={setPlayhead}
            />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}
