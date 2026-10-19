import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { formatTime } from "../TimeList/TimeUtils";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { getWcaCompetition } from "../../services/getWcaCompetitions";
import "./CompetitionPage.css";

const EVENT_ORDER = [
  "333",
  "222",
  "444",
  "555",
  "666",
  "777",
  "333BLD",
  "333OH",
  "CLOCK",
  "MEGAMINX",
  "PYRAMINX",
  "SKEWB",
  "SQ1",
  "444BLD",
  "555BLD",
];

const EVENT_LABELS = {
  "222": "2x2",
  "333": "3x3",
  "444": "4x4",
  "555": "5x5",
  "666": "6x6",
  "777": "7x7",
  "333OH": "3x3 One-Handed",
  "333BLD": "3x3 Blindfolded",
  "444BLD": "4x4 Blindfolded",
  "555BLD": "5x5 Blindfolded",
  CLOCK: "Clock",
  MEGAMINX: "Megaminx",
  PYRAMINX: "Pyraminx",
  SKEWB: "Skewb",
  SQ1: "Square-1",
};

// WCA round_type_id -> label and running order. The "combined" ids (d, e, g, c)
// are cutoff rounds; they read the same as their plain counterparts.
const ROUND_TYPES = {
  "0": { label: "Qualification", order: 0 },
  h: { label: "Qualification", order: 0 },
  "1": { label: "First Round", order: 1 },
  d: { label: "First Round", order: 1 },
  "2": { label: "Second Round", order: 2 },
  e: { label: "Second Round", order: 2 },
  "3": { label: "Semi Final", order: 3 },
  g: { label: "Semi Final", order: 3 },
  b: { label: "B Final", order: 4 },
  f: { label: "Final", order: 5 },
  c: { label: "Final", order: 5 },
};

const FORMAT_LABELS = {
  a: "Average of 5",
  m: "Mean of 3",
  "1": "Best of 1",
  "2": "Best of 2",
  "3": "Best of 3",
  "5": "Best of 5",
};

function roundInfo(roundTypeID) {
  return ROUND_TYPES[String(roundTypeID || "").toLowerCase()] || {
    label: roundTypeID ? `Round ${roundTypeID}` : "Round",
    order: 9,
  };
}

function formatDay(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dayKey || "";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatDateRange(start, end) {
  if (!start) return "";
  if (!end || end === start) return formatDay(start);
  return `${formatDay(start)} – ${formatDay(end)}`;
}

function solveMs(solve) {
  const penalty = String(solve?.Penalty || "").toUpperCase();
  if (penalty === "DNF") return null;
  const ms = Number(solve?.FinalTimeMs ?? solve?.RawTimeMs);
  return Number.isFinite(ms) ? ms : null;
}

function resultText(ms, isDNF) {
  if (isDNF) return "DNF";
  return Number.isFinite(ms) && ms > 0 ? formatTime(ms) : "—";
}

// The fastest and slowest attempt of an Ao5 are trimmed, shown in brackets.
function trimmedIndexes(solves, formatID) {
  if (formatID !== "a" || solves.length !== 5) return new Set();
  let best = -1;
  let worst = -1;
  solves.forEach((solve, index) => {
    const ms = solveMs(solve);
    const bestMs = best >= 0 ? solveMs(solves[best]) : null;
    const worstMs = worst >= 0 ? solveMs(solves[worst]) : null;
    if (ms != null && (best < 0 || bestMs == null || ms < bestMs)) best = index;
    if (worst < 0 || (worstMs != null && (ms == null || ms > worstMs))) worst = index;
  });
  return new Set([best, worst].filter((index) => index >= 0));
}

function RecordBadge({ record }) {
  if (!record) return null;
  return <span className={`competition-record competition-record--${record.toLowerCase()}`}>{record}</span>;
}

RecordBadge.propTypes = { record: PropTypes.string };

function CompetitionPage({ user, accentColor = "#2EC4B6" }) {
  const { competitionID = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ownerID = new URLSearchParams(location.search).get("user") || user?.UserID || "";

  const [state, setState] = useState({ loading: true, error: "", competition: null, solves: [] });

  useEffect(() => {
    if (!ownerID || !competitionID) return undefined;
    let cancelled = false;
    setState({ loading: true, error: "", competition: null, solves: [] });
    getWcaCompetition(ownerID, competitionID)
      .then((data) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: "",
          competition: data?.competition || null,
          solves: Array.isArray(data?.solves) ? data.solves : [],
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, error: err?.message || "Could not load this competition.", competition: null, solves: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [competitionID, ownerID]);

  const { competition, solves } = state;

  const events = useMemo(() => {
    if (!competition) return [];
    const solvesByRound = new Map();
    for (const solve of solves) {
      const key = `${solve?.Event}#${solve?.Tags?.CompetitionRound || solve?.Tag_CompetitionRound || ""}`;
      if (!solvesByRound.has(key)) solvesByRound.set(key, []);
      solvesByRound.get(key).push(solve);
    }

    const byEvent = new Map();
    for (const round of Array.isArray(competition.Rounds) ? competition.Rounds : []) {
      if (!byEvent.has(round.Event)) byEvent.set(round.Event, []);
      byEvent.get(round.Event).push({
        ...round,
        ...roundInfo(round.RoundTypeID),
        solves: solvesByRound.get(`${round.Event}#${round.RoundTypeID || ""}`) || [],
      });
    }

    const rank = (event) => {
      const index = EVENT_ORDER.indexOf(event);
      return index < 0 ? EVENT_ORDER.length : index;
    };

    return Array.from(byEvent.entries())
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([event, rounds]) => {
        const ordered = rounds.sort((a, b) => a.order - b.order);
        const final = ordered[ordered.length - 1];
        const bestSingle = Math.min(...ordered.map((r) => (r.BestMs > 0 ? r.BestMs : Infinity)));
        const bestAverage = Math.min(...ordered.map((r) => (r.AverageMs > 0 ? r.AverageMs : Infinity)));
        return {
          event,
          rounds: ordered,
          finalPos: final?.Pos ?? null,
          bestSingle: Number.isFinite(bestSingle) ? bestSingle : null,
          bestAverage: Number.isFinite(bestAverage) ? bestAverage : null,
        };
      });
  }, [competition, solves]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/stats");
  };

  if (!ownerID) {
    return (
      <div className="Page competition-page">
        <div className="competition-empty">Sign in to view competition results.</div>
      </div>
    );
  }

  return (
    <div className="Page competition-page" style={{ "--competition-accent": accentColor }}>
      <button type="button" className="competition-back" onClick={goBack}>
        ‹ Back
      </button>

      {state.loading && <div className="competition-empty">Loading competition…</div>}
      {!state.loading && state.error && <div className="competition-empty">{state.error}</div>}

      {competition && (
        <>
          <header className="competition-header">
            <span className="competition-badge">WCA Competition</span>
            <h1>{competition.Name || competition.CompetitionID}</h1>
            <div className="competition-meta">
              {[competition.City, competition.Country].filter(Boolean).join(", ")}
              {competition.City || competition.Country ? " · " : ""}
              {formatDateRange(competition.StartDay, competition.EndDay)}
            </div>
            <div className="competition-summary">
              <div>
                <strong>{events.length}</strong>
                <span>{events.length === 1 ? "event" : "events"}</span>
              </div>
              <div>
                <strong>{events.reduce((sum, event) => sum + event.rounds.length, 0)}</strong>
                <span>rounds</span>
              </div>
              <div>
                <strong>{competition.SolveCount ?? solves.length}</strong>
                <span>solves</span>
              </div>
              <a
                className="competition-wca-link"
                href={`https://www.worldcubeassociation.org/competitions/${encodeURIComponent(competition.CompetitionID)}`}
                target="_blank"
                rel="noreferrer"
              >
                View on WCA ↗
              </a>
            </div>
          </header>

          <div className="competition-events">
            {events.map(({ event, rounds, finalPos, bestSingle, bestAverage }) => (
              <section key={event} className="competition-event">
                <div className="competition-event-head">
                  <span className="competition-event-icon" aria-hidden="true">
                    <PuzzleSVG event={event} scramble="" isStatsHeaderIcon colorStyle="color" />
                  </span>
                  <h2>{EVENT_LABELS[event] || event}</h2>
                  <div className="competition-event-stats">
                    {finalPos != null && (
                      <span>
                        Place <strong>#{finalPos}</strong>
                      </span>
                    )}
                    {bestSingle != null && (
                      <span>
                        Single <strong>{formatTime(bestSingle)}</strong>
                      </span>
                    )}
                    {bestAverage != null && (
                      <span>
                        Average <strong>{formatTime(bestAverage, true)}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="competition-rounds">
                  {rounds.map((round) => {
                    const trimmed = trimmedIndexes(round.solves, round.FormatID);
                    return (
                      <div key={`${event}-${round.RoundTypeID}`} className="competition-round">
                        <div className="competition-round-name">
                          <strong>{round.label}</strong>
                          <span>{FORMAT_LABELS[round.FormatID] || ""}</span>
                        </div>
                        <div className="competition-round-pos">
                          {round.Pos != null ? `#${round.Pos}` : "—"}
                        </div>
                        <div className="competition-round-result">
                          <span>Single</span>
                          <strong>
                            {resultText(round.BestMs, round.BestIsDNF)}
                            <RecordBadge record={round.SingleRecord} />
                          </strong>
                        </div>
                        <div className="competition-round-result">
                          <span>{round.FormatID === "m" ? "Mean" : "Average"}</span>
                          <strong>
                            {resultText(round.AverageMs, round.AverageIsDNF)}
                            <RecordBadge record={round.AverageRecord} />
                          </strong>
                        </div>
                        <div className="competition-round-solves">
                          {round.solves.map((solve, index) => {
                            const text = formatTime(solveMs(solve), false, solve?.Penalty);
                            return (
                              <span key={solve.SK || index} className="competition-solve">
                                {trimmed.has(index) ? `(${text})` : text}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

CompetitionPage.propTypes = {
  user: PropTypes.object,
  accentColor: PropTypes.string,
};

export default CompetitionPage;
