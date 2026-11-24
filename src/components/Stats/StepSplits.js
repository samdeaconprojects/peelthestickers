// src/components/Stats/StepSplits.js
//
// Smart-cube step splits for the solves in view: best / mean per step (cross,
// F2L, OLL, PLL, or Roux blocks), how much of each is recognition, and
// per-case times for OLL and PLL. Reads each solve's saved splits
// (src/smart/recon/splits.js); older solves are analysed from their moves.

import React, { useMemo, useState } from "react";
import { summarizeSplits } from "../../smart/recon/splits";
import "./StepSplits.css";

const PHASE_COLOUR = {
  cross: "#e76f8a",
  xcross: "#e76f8a",
  f2l: "#f4a261",
  pair1: "#f4a261",
  pair2: "#f4a261",
  pair3: "#f4a261",
  pair4: "#f4a261",
  crossf2l: "#ee8a76",
  oll: "#e9c46a",
  pll: "#2ec4b6",
  ll: "#8bc59a",
  fb: "#f4a261",
  sb: "#e76f8a",
  f2b: "#ee8a76",
  cmll: "#e9c46a",
  lse: "#2ec4b6",
};

const sec = (ms, digits = 2) => (Number.isFinite(ms) ? (ms / 1000).toFixed(digits) : "–");
const one = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");

function hasSmartCube(solve) {
  const tags = solve?.tags || solve?.Tags || {};
  return !!(tags.SmartCube || solve?.SmartCube);
}

// Mean split into recognition (hatched) and execution, scaled to the slowest row.
function SplitBar({ row, scale, colour }) {
  if (!Number.isFinite(row.mean) || !scale) return <span className="stepSplits__bar" />;
  const rec = Number.isFinite(row.recMean) ? row.recMean : 0;
  const exe = Math.max(0, row.mean - rec);
  return (
    <span className="stepSplits__bar" style={{ "--split-colour": colour }} aria-hidden="true">
      {rec > 0 ? <span className="stepSplits__barRec" style={{ width: `${(rec / scale) * 100}%` }} /> : null}
      <span className="stepSplits__barExe" style={{ width: `${(exe / scale) * 100}%` }} />
    </span>
  );
}

function BestCell({ best, onSolveOpen }) {
  if (!best) return <td className="stepSplits__num">–</td>;
  return (
    <td className="stepSplits__num">
      {onSolveOpen ? (
        <button
          type="button"
          className="stepSplits__best"
          onClick={() => onSolveOpen(best.solve)}
          title="Open this solve"
        >
          {sec(best.ms)}
        </button>
      ) : (
        sec(best.ms)
      )}
    </td>
  );
}

const CASE_SORTS = {
  count: (a, b) => b.n - a.n || (a.mean ?? 1e12) - (b.mean ?? 1e12),
  best: (a, b) => (a.best?.ms ?? 1e12) - (b.best?.ms ?? 1e12),
  mean: (a, b) => (a.mean ?? 1e12) - (b.mean ?? 1e12),
  recog: (a, b) => (a.recMean ?? 1e12) - (b.recMean ?? 1e12),
  name: (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }),
};

// Algs a case was solved with, for its expanded rows: every alg used at
// least twice, and one-offs (often a misfire or a fix-up) folded together
// when there are many of them.
function algRowsFor(row) {
  const algs = row.algs || [];
  if (algs.length < 2) return null;
  const repeat = algs.filter((a) => a.n >= 2);
  const once = algs.filter((a) => a.n < 2);
  const shown = once.length <= 2 ? algs : repeat;
  const folded = once.length <= 2 ? [] : once;
  const timed = shown.filter((a) => a.n >= 2 && Number.isFinite(a.mean));
  const fastest = timed.length > 1 ? timed.reduce((b, a) => (a.mean < b.mean ? a : b)) : null;
  return { shown, folded, fastest };
}

function CaseTable({ rows, group, onSolveOpen }) {
  const [sort, setSort] = useState("count");
  const [open, setOpen] = useState(() => new Set());
  const timed = rows.filter((r) => r.n > 0).sort(CASE_SORTS[sort] || CASE_SORTS.count);
  const skips = rows.find((r) => r.key === "skip")?.skips || 0;
  const scale = Math.max(0, ...timed.map((r) => r.mean || 0));
  const colour = group === "PLL" ? PHASE_COLOUR.pll : PHASE_COLOUR.oll;

  if (!timed.length && !skips) {
    return <div className="stepSplits__empty">No {group} cases recognised yet.</div>;
  }

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const head = (key, label, cls = "stepSplits__num") => (
    <th className={cls} aria-sort={sort === key ? "ascending" : undefined}>
      <button
        type="button"
        className={`stepSplits__sort${sort === key ? " is-active" : ""}`}
        onClick={() => setSort(key)}
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="stepSplits__tableWrap">
      <table className="stepSplits__table">
        <thead>
          <tr>
            {head("name", "Case", "stepSplits__name")}
            {head("count", "Count")}
            {head("best", "Best")}
            {head("mean", "Mean")}
            {head("recog", "Recog")}
            <th className="stepSplits__num">Exec</th>
            <th className="stepSplits__barCol" aria-label="Recognition and execution" />
          </tr>
        </thead>
        <tbody>
          {timed.map((r) => {
            const algs = algRowsFor(r);
            const isOpen = algs && open.has(r.key);
            return (
              <React.Fragment key={r.key}>
                <tr>
                  <td className="stepSplits__name">
                    {r.label}
                    {algs ? (
                      <button
                        type="button"
                        className={`stepSplits__algToggle${isOpen ? " is-open" : ""}`}
                        onClick={() => toggle(r.key)}
                        aria-expanded={!!isOpen}
                        title="Times for each alg you solved this case with"
                      >
                        {r.algs.length} algs
                      </button>
                    ) : null}
                  </td>
                  <td className="stepSplits__num stepSplits__muted">{r.n}</td>
                  <BestCell best={r.best} onSolveOpen={onSolveOpen} />
                  <td className="stepSplits__num stepSplits__strong">{sec(r.mean)}</td>
                  <td className="stepSplits__num">{sec(r.recMean)}</td>
                  <td className="stepSplits__num">{sec(r.exeMean)}</td>
                  <td className="stepSplits__barCol">
                    <SplitBar row={r} scale={scale} colour={colour} />
                  </td>
                </tr>
                {isOpen
                  ? algs.shown.map((a) => (
                      <tr key={`${r.key}|${a.alg}`} className="stepSplits__sub stepSplits__algRow">
                        <td className="stepSplits__name">
                          <span className="stepSplits__alg" title={a.alg}>
                            {a.alg}
                          </span>
                          {algs.fastest === a ? <span className="stepSplits__fastest">fastest</span> : null}
                        </td>
                        <td className="stepSplits__num stepSplits__muted">{a.n}</td>
                        <BestCell best={a.best} onSolveOpen={onSolveOpen} />
                        <td className="stepSplits__num stepSplits__strong">{sec(a.mean)}</td>
                        <td className="stepSplits__num">{sec(a.recMean)}</td>
                        <td className="stepSplits__num">{sec(a.exeMean)}</td>
                        <td className="stepSplits__barCol">
                          <SplitBar row={a} scale={scale} colour={colour} />
                        </td>
                      </tr>
                    ))
                  : null}
                {isOpen && algs.folded.length ? (
                  <tr className="stepSplits__sub stepSplits__algRow">
                    <td className="stepSplits__name stepSplits__muted" colSpan={7}>
                      + {algs.folded.length} other way{algs.folded.length === 1 ? "" : "s"}, used once each
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {skips ? (
        <div className="stepSplits__foot">
          {group} skip × {skips}
        </div>
      ) : null}
    </div>
  );
}

function PhaseTable({ summary, onSolveOpen }) {
  const rows = summary.phases;
  const hasF2l = rows.some((r) => r.key === "f2l");
  const scale = Math.max(0, ...rows.filter((r) => !r.sub).map((r) => r.mean || 0));
  return (
    <div className="stepSplits__tableWrap">
      <table className="stepSplits__table">
        <thead>
          <tr>
            <th className="stepSplits__name">Step</th>
            <th className="stepSplits__num">Best</th>
            <th className="stepSplits__num">Mean</th>
            <th className="stepSplits__num" title="Pause before and between this step's moves: recognising the case, finding the next pair">
              Recog
            </th>
            <th className="stepSplits__num">Exec</th>
            <th className="stepSplits__num">Moves</th>
            <th className="stepSplits__num">TPS</th>
            <th className="stepSplits__num">Solves</th>
            <th className="stepSplits__barCol" aria-label="Recognition and execution" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.sub && hasF2l ? "stepSplits__sub" : undefined}>
              <td className="stepSplits__name">
                <span className="stepSplits__swatch" style={{ background: PHASE_COLOUR[r.key] || "#8d99ae" }} />
                {r.label}
              </td>
              <BestCell best={r.best} onSolveOpen={onSolveOpen} />
              <td className="stepSplits__num stepSplits__strong">{sec(r.mean)}</td>
              <td className="stepSplits__num">{r.recMean == null ? "–" : sec(r.recMean)}</td>
              <td className="stepSplits__num">{sec(r.exeMean)}</td>
              <td className="stepSplits__num stepSplits__muted">{one(r.movesMean)}</td>
              <td className="stepSplits__num stepSplits__muted">{one(r.tps)}</td>
              <td
                className="stepSplits__num stepSplits__muted"
                title={r.skips ? `${r.skips} skip${r.skips === 1 ? "" : "s"} not counted` : undefined}
              >
                {r.n}
                {r.skips ? <span className="stepSplits__skip">+{r.skips} skip</span> : null}
              </td>
              <td className="stepSplits__barCol">
                <SplitBar row={r} scale={scale} colour={PHASE_COLOUR[r.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StepSplits({ solves, onSolveOpen }) {
  const smartSolves = useMemo(() => (solves || []).filter(hasSmartCube), [solves]);
  const { methods } = useMemo(() => summarizeSplits(smartSolves), [smartSolves]);
  const [methodPick, setMethodPick] = useState(null);
  const [view, setView] = useState("steps");

  if (!smartSolves.length) return null;

  const summary = methods.find((m) => m.method === methodPick) || methods[0] || null;
  const caseGroups = summary?.method === "CFOP" ? ["OLL", "PLL"] : [];
  const activeView = view !== "steps" && !caseGroups.includes(view) ? "steps" : view;
  const total = summary?.total;
  const recShare =
    total && Number.isFinite(total.recMean) && total.mean > 0 ? Math.round((total.recMean / total.mean) * 100) : null;

  return (
    <div className="stepSplits">
      <div className="stepSplits__head">
        <div>
          <div className="stepSplits__eyebrow">Smart cube</div>
          <h3 className="stepSplits__title">Step splits</h3>
        </div>
        {summary ? (
          <div className="stepSplits__meta">
            <div className="stepSplits__metaCard">
              <span className="stepSplits__metaLabel">Solves</span>
              <span className="stepSplits__metaValue">{summary.count}</span>
            </div>
            <div className="stepSplits__metaCard" title="Mean time per solve spent between steps">
              <span className="stepSplits__metaLabel">Recognition</span>
              <span className="stepSplits__metaValue">
                {sec(total?.recMean)}
                {recShare != null ? <small> {recShare}%</small> : null}
              </span>
            </div>
            <div className="stepSplits__metaCard">
              <span className="stepSplits__metaLabel">Moves · TPS</span>
              <span className="stepSplits__metaValue">
                {one(total?.movesMean)} <small>· {one(total?.tps)}</small>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {summary ? (
        <>
          <div className="stepSplits__tabs" role="tablist" aria-label="Step splits view">
            {methods.length > 1
              ? methods.map((m) => (
                  <button
                    key={m.method}
                    type="button"
                    role="tab"
                    aria-selected={m.method === summary.method}
                    className={`tagBreakdownFieldTab ${m.method === summary.method ? "is-active" : ""}`}
                    onClick={() => setMethodPick(m.method)}
                  >
                    {m.method}
                  </button>
                ))
              : null}
            {methods.length > 1 ? <span className="stepSplits__tabGap" /> : null}
            {["steps", ...caseGroups].map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={v === activeView}
                className={`tagBreakdownFieldTab ${v === activeView ? "is-active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "steps" ? "Steps" : `${v} cases`}
              </button>
            ))}
          </div>

          {activeView === "steps" ? (
            <PhaseTable summary={summary} onSolveOpen={onSolveOpen} />
          ) : (
            <CaseTable rows={summary.cases[activeView] || []} group={activeView} onSolveOpen={onSolveOpen} />
          )}
          <div className="stepSplits__legend">
            <span className="stepSplits__legendRec" /> recognition
            <span className="stepSplits__legendExe" /> execution
          </div>
        </>
      ) : (
        <div className="stepSplits__empty">
          No CFOP or Roux steps found in these smart-cube solves yet.
        </div>
      )}
    </div>
  );
}
