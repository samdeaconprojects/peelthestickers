// src/components/Timer/SolveStepBar.js
//
// After a smart-cube solve: one bar with a segment per step (cross, F2L pairs,
// OLL, PLL / Roux blocks), sized by time, the hatched start of each segment
// being the pause before it. Each segment shows what fits of: the cross colour
// or the pair's colours, the step (with its OLL / PLL case) and its time.
// Hovering (or tapping) a segment shows all of it plus recognition /
// execution, moves, TPS, the moves themselves, and how the step compares with
// the same step in the user's other solves.
//
// Rendered by Timer: into the slot App keeps above the averages when there is
// one (#pts-stepbar-slot), else just under the time.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { analyzeSolve } from "../../smart/recon/analyze";
import { readSmartRecord } from "../../smart/recon/solveRecord";
import {
  MIN_SAMPLES,
  buildRecognitionRanker,
  buildStepRanker,
  rankColour,
  useReconPool,
} from "../../smart/recon/stepStats";
import { buildStepAverages, formatDelta } from "../../smart/recon/splits";
import { faceHex, useCubeColors } from "../../utils/cubeColors";
import "./SolveStepBar.css";

export const STEP_BAR_SLOT_ID = "pts-stepbar-slot";

const SHORT = { cross: "Cross", fb: "FB", sb: "SB", cmll: "CMLL", lse: "LSE", oll: "OLL", pll: "PLL" };

const fmt = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : "–");

function shortLabel(step) {
  if (SHORT[step.key]) {
    // XCross & co: keep the long name when the step covers more than one key.
    return step.keys?.length > 1 ? step.label : SHORT[step.key];
  }
  return step.label;
}

// "T perm" -> "T", "OLL 27 · Sune" -> "27 · Sune", "OLL 45" -> "45", "skip" -> "skip".
function shortCase(step) {
  const c = step.caseName;
  if (!c) return null;
  if (c === "skip") return "skip";
  return c.replace(/ perm$/, "").replace(/^OLL /, "").replace(/ OLL$/, "").replace(/-shape$/, "");
}

function caseText(step) {
  if (!step.caseName) return null;
  return step.caseName === "skip" ? `${step.label} skip` : step.caseName;
}

function compareText(p, what) {
  if (!p) return null;
  if (p.rank01 == null) {
    const more = Math.max(1, MIN_SAMPLES - p.n);
    return `${what}: ${more} more solve${more === 1 ? "" : "s"} to compare`;
  }
  const of = `${p.n + 1} solves`;
  if (p.rank01 === 0) return `${what}: fastest of ${of}`;
  if (p.rank01 === 1) return `${what}: slowest of ${of}`;
  return `${what}: faster than ${Math.round((1 - p.rank01) * 100)}% of ${p.n}`;
}

function smartOf(solve) {
  const tags = solve?.tags || solve?.Tags || {};
  return tags.SmartCube || solve?.SmartCube || null;
}

// What a step is judged against on the bar, most specific first: the same alg
// (when the case is solved more than one way), the same case, the step.
function headlineAvg(a) {
  if (!a) return null;
  if (a.alg && a.alg.mean != null) return { ...a.alg, label: "this alg" };
  if (a.case && a.case.mean != null) return { ...a.case, label: a.case.name };
  if (a.step && a.step.mean != null) return { ...a.step, label: "avg" };
  return null;
}

const deltaClass = (d) => (d < 0 ? "is-faster" : "is-slower");

// Same colouring as the reconstruction in the solve detail: each step against
// the same step in the user's other solves, green (faster) to red (slower).
function stepColourStyle(p) {
  if (!p) return undefined;
  return { "--ssb-step": rankColour(p.rank01) };
}

// Colour chips for a step: the cross colour on the cross, each pair's two
// colours on its F2L step (several pairs when one step finished more).
function StepColours({ step, analysis, colors }) {
  const chips = [];
  if (step.keys?.includes("cross") && analysis.bottomColour) {
    chips.push(
      <span key="x" className="solveStepBar__chip" title={`${analysis.bottomColour} cross`}>
        <span className="solveStepBar__chipDot" style={{ background: colors[analysis.bottomColour] }} />
      </span>
    );
  }
  (step.slots || []).forEach((faces, i) => {
    chips.push(
      <span key={i} className="solveStepBar__chip" title="Pair colours">
        {faces.map((f) => (
          <span key={f} className="solveStepBar__chipDot" style={{ background: faceHex(colors, f) }} />
        ))}
      </span>
    );
  });
  return chips.length ? <span className="solveStepBar__chips">{chips}</span> : null;
}

export default function SolveStepBar({ solve, variant = "slot" }) {
  const smart = smartOf(solve);
  const tags = solve?.tags || solve?.Tags || {};
  const method = tags.Method || "";
  const event = solve?.event || solve?.Event || "";
  const colors = useCubeColors();

  const analysis = useMemo(() => {
    const record = readSmartRecord(smart);
    if (!record) return null;
    try {
      return analyzeSolve({ startState: record.startState, moves: record.moves, method });
    } catch (_) {
      return null;
    }
  }, [smart, method]);

  const pool = useReconPool();
  const { perf, recogPerf, avgs } = useMemo(() => {
    if (!analysis) return { perf: [], recogPerf: [], avgs: [] };
    const opts = { event, method: analysis.method, exclude: smart };
    const rank = buildStepRanker(pool, opts);
    const rankRecog = buildRecognitionRanker(pool, opts);
    const avg = buildStepAverages(pool, opts);
    return {
      perf: analysis.steps.map((s) => rank(s)),
      recogPerf: analysis.steps.map((s) => rankRecog(s)),
      avgs: analysis.steps.map((s) => avg(s)),
    };
  }, [pool, event, analysis, smart]);

  const [active, setActive] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const wrapRef = useRef(null);
  const trackRef = useRef(null);

  // Segment widths decide how much text each one can hold.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    setTrackWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setTrackWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [analysis]);

  // A tapped card stays until the next tap, here or anywhere else.
  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setPinned(false);
        setActive(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [pinned]);

  // A new solve starts with no card open.
  const solveKey = smart?.Moves || "";
  useEffect(() => {
    setPinned(false);
    setActive(null);
  }, [solveKey]);

  if (!analysis?.method) return null;
  const steps = analysis.steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.durationMs > 0 && s.moveCount > 0);
  const total = steps.reduce((a, { s }) => a + s.durationMs, 0);
  if (!steps.length || !total) return null;

  const gaps = 2 * (steps.length - 1);
  const pxPer = Math.max(0, trackWidth - gaps) / total;

  // Where each segment's middle sits (0..1), to place the hover card.
  let acc = 0;
  const mids = steps.map(({ s }) => {
    const mid = (acc + s.durationMs / 2) / total;
    acc += s.durationMs;
    return mid;
  });

  const shown = active != null ? steps.find(({ i }) => i === active) : null;
  const shownMid = shown ? mids[steps.indexOf(shown)] : 0;

  const enter = (i) => {
    if (!pinned) setActive(i);
  };
  const leave = () => {
    if (!pinned) setActive(null);
  };
  const tap = (i) => {
    if (pinned && active === i) {
      setPinned(false);
      setActive(null);
    } else {
      setPinned(true);
      setActive(i);
    }
  };

  return (
    <div
      className={`solveStepBar solveStepBar--${variant}`}
      ref={wrapRef}
      onMouseLeave={() => {
        setPinned(false);
        setActive(null);
      }}
    >
      <div className="solveStepBar__track" ref={trackRef} role="list" aria-label={`${analysis.method} steps`}>
        {steps.map(({ s, i }) => {
          const px = s.durationMs * pxPer;
          const label = shortLabel(s);
          const sc = shortCase(s);
          // Fill the segment in order: time, colours, step name, case.
          let room = px - 12;
          const fits = (w) => {
            if (room < w) return false;
            room -= w + 5;
            return true;
          };
          const showTime = fits(30);
          const head = headlineAvg(avgs[i]);
          const showDelta = showTime && head && head.delta != null && fits(36);
          const chipCount = (s.keys?.includes("cross") ? 1 : 0) + (s.slots?.length || 0);
          const chipWidth = (s.keys?.includes("cross") ? 11 : 0) + (s.slots?.length || 0) * 20 + 3 * (chipCount - 1);
          const showChips = showTime && chipCount > 0 && fits(chipWidth);
          const showLabel = showTime && fits(label.length * 7);
          const showCase = showLabel && !!sc && fits(sc.length * 6.5);
          return (
            <div
              key={`${s.key}-${s.from}`}
              role="listitem"
              className={`solveStepBar__seg solveStepBar__seg--${s.group}${active === i ? " is-active" : ""}`}
              style={{ flexGrow: s.durationMs, ...stepColourStyle(perf[i]) }}
              aria-label={`${s.label}${caseText(s) ? `, ${caseText(s)}` : ""}: ${fmt(s.durationMs)} seconds`}
              onMouseEnter={() => enter(i)}
              onMouseLeave={leave}
              onClick={() => tap(i)}
            >
              {s.recognitionMs > 0 && i > 0 ? (
                <span className="solveStepBar__rec" style={{ flexGrow: s.recognitionMs }} />
              ) : null}
              <span className="solveStepBar__exe" style={{ flexGrow: Math.max(1, s.executionMs) }} />
              {showTime ? (
                <span className="solveStepBar__label">
                  {showChips ? <StepColours step={s} analysis={analysis} colors={colors} /> : null}
                  {showLabel ? <span className="solveStepBar__name">{label}</span> : null}
                  {showCase ? <span className="solveStepBar__caseInline">{sc}</span> : null}
                  <span className="solveStepBar__time">{fmt(s.durationMs)}</span>
                  {showDelta ? (
                    <span className={`solveStepBar__delta ${deltaClass(head.delta)}`}>{formatDelta(head.delta)}</span>
                  ) : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {shown ? (
        <StepCard
          step={shown.s}
          analysis={analysis}
          colors={colors}
          first={shown.i === 0}
          perf={perf[shown.i]}
          recogPerf={recogPerf[shown.i]}
          avg={avgs[shown.i]}
          mid={shownMid}
        />
      ) : null}
    </div>
  );
}

function AvgRow({ label, data }) {
  if (!data || data.mean == null) return null;
  return (
    <div className="solveStepBar__avg">
      <span className="solveStepBar__avgLabel">{label}</span>
      <span>
        <b>{fmt(data.mean)}</b> <small>({data.n})</small>
      </span>
      <span className={`solveStepBar__delta ${deltaClass(data.delta)}`}>{formatDelta(data.delta)}</span>
    </div>
  );
}

function StepCard({ step, analysis, colors, first, perf, recogPerf, avg, mid }) {
  const caseName = caseText(step);
  const stepCompare = compareText(perf, "Step");
  const recCompare = !first && step.recognitionMs > 0 ? compareText(recogPerf, "Recog") : null;
  const moves = (step.tokens || []).map((t) => t.text).join(" ");
  // Keep the card inside the bar: anchor it left/right near the ends.
  const align = mid < 0.25 ? "start" : mid > 0.75 ? "end" : "mid";
  return (
    <div
      className={`solveStepBar__card solveStepBar__card--${align}`}
      style={{ "--card-x": `${(mid * 100).toFixed(2)}%` }}
      role="tooltip"
    >
      <div className="solveStepBar__cardHead">
        <span className={`solveStepBar__dot solveStepBar__seg--${step.group}`} style={stepColourStyle(perf)} />
        <span className="solveStepBar__cardTitle">{step.label}</span>
        <StepColours step={step} analysis={analysis} colors={colors} />
        {caseName ? <span className="solveStepBar__case">{caseName}</span> : null}
        <span className="solveStepBar__cardTime">{fmt(step.durationMs)}</span>
      </div>
      <div className="solveStepBar__cardRow">
        {!first && step.recognitionMs > 0 ? (
          <span>
            recog <b>{fmt(step.recognitionMs)}</b>
          </span>
        ) : null}
        <span>
          exec <b>{fmt(step.executionMs)}</b>
        </span>
        <span>
          <b>{step.stm}</b> moves
        </span>
        {Number.isFinite(step.tps) ? (
          <span>
            <b>{step.tps.toFixed(1)}</b> tps
          </span>
        ) : null}
      </div>
      {moves ? <div className="solveStepBar__moves">{moves}</div> : null}
      {avg?.step?.mean != null || avg?.case?.mean != null || avg?.alg?.mean != null ? (
        <div className="solveStepBar__avgs">
          <AvgRow label={`Your ${step.label} avg`} data={avg.step} />
          {avg.case ? <AvgRow label={`${avg.case.name} avg`} data={avg.case} /> : null}
          {avg.alg ? <AvgRow label={`This alg (1 of ${avg.alg.variants}) avg`} data={avg.alg} /> : null}
        </div>
      ) : null}
      {stepCompare || recCompare ? (
        <div className="solveStepBar__cardRow solveStepBar__cardRow--cmp">
          {stepCompare ? (
            <span style={perf?.rank01 != null ? { color: rankColour(perf.rank01) } : undefined}>{stepCompare}</span>
          ) : null}
          {recCompare ? (
            <span style={recogPerf?.rank01 != null ? { color: rankColour(recogPerf.rank01) } : undefined}>
              {recCompare}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
