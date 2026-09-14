// src/components/Social/SharedAverageModal.js
import React, { useEffect, useMemo, useState } from "react";
import "./SharedAverageModal.css";
import { matchBlockSize } from "../../utils/tournament";

const EVENT_OPTIONS = [
  { value: "222", label: "2x2" },
  { value: "333", label: "3x3" },
  { value: "444", label: "4x4" },
  { value: "555", label: "5x5" },
  { value: "666", label: "6x6" },
  { value: "777", label: "7x7" },
  { value: "333OH", label: "3x3 One-Handed" },
  { value: "333BLD", label: "3x3 Blindfolded" },
  { value: "SKEWB", label: "Skewb" },
  { value: "PYRAMINX", label: "Pyraminx" },
  { value: "MEGAMINX", label: "Megaminx" },
  { value: "CLOCK", label: "Clock" },
  { value: "SQ1", label: "Square-1" },
];

const COUNT_OPTIONS = [1, 2, 3, 5, 12, 50, 100];
const ROUND_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const SET_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const AVERAGE_OF_OPTIONS = [3, 5];
const BEST_OF_OPTIONS = [3, 5, 7];

// Longest a "first to `setCount` sets, each set first to `roundCount` rounds"
// match can run: every set goes the distance and the match goes the distance.
const maxHeadToHeadSolves = (roundCount, setCount) =>
  Math.max(1, (2 * Number(setCount) - 1) * (2 * Number(roundCount) - 1));

const createEventRow = (event = "333") => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  event,
  count: 1,
});

const planLength = (rows) =>
  (rows || []).reduce((sum, row) => sum + (Number(row.count) || 1), 0);

const nextPow2 = (n) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

function EventSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {EVENT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EventRows({ label, rows, onChange, onAdd, onRemove }) {
  return (
    <div className="sharedAveragePlan">
      <div className="sharedAveragePlanHeader">
        <span>{label}</span>
        <button type="button" className="sharedAverageAddRow" onClick={onAdd}>
          Add Event
        </button>
      </div>

      <div className="sharedAveragePlanRows">
        {rows.map((row, index) => (
          <div key={row.id} className="sharedAveragePlanRow">
            <EventSelect
              value={row.event}
              onChange={(nextEvent) =>
                onChange(row.id, {
                  ...row,
                  event: nextEvent,
                })
              }
            />

            <select
              value={row.count}
              onChange={(e) =>
                onChange(row.id, {
                  ...row,
                  count: Number(e.target.value),
                })
              }
            >
              {COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}x
                </option>
              ))}
            </select>

            <button
              type="button"
              className="sharedAverageRemoveRow"
              onClick={() => onRemove(row.id)}
              disabled={rows.length === 1 && index === 0}
              aria-label={`Remove ${label} event`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SharedAverageModal({
  isOpen,
  onClose,
  onConfirm,
  defaultEvent = "333",
  yourDefaultEvent = "333",
  theirDefaultEvent = "333",
  isTwoPerson = false,
  yourLabel = "You",
  theirLabel = "Them",
  // Group conversations: [{ id, name, event, isYou }] for every member.
  members = [],
  allowHostedMode = false,
}) {
  // Ordered list of participants that can be given their own event plan.
  const participants = useMemo(() => {
    if (isTwoPerson) {
      return [
        { key: "creator", label: yourLabel, event: yourDefaultEvent || defaultEvent || "333" },
        { key: "opponent", label: theirLabel, event: theirDefaultEvent || defaultEvent || "333" },
      ];
    }
    return (Array.isArray(members) ? members : [])
      .map((member) => ({
        key: String(member?.id || member?.userID || "").trim(),
        label: member?.name || member?.username || member?.id || "Player",
        event: member?.event || member?.profileEvent || defaultEvent || "333",
        isYou: !!member?.isYou,
      }))
      .filter((participant) => participant.key);
  }, [
    isTwoPerson,
    members,
    yourLabel,
    theirLabel,
    yourDefaultEvent,
    theirDefaultEvent,
    defaultEvent,
  ]);

  // Per-participant event plans can be offered whenever there are at least two
  // distinct people — 1-1 or a whole group.
  const canSeparateEvents = participants.length >= 2;
  const isGroup = !isTwoPerson;
  const canRunTournament = isGroup && participants.length >= 2;

  // mode: "average" | "head_to_head" | "tournament" | "hosted"
  const [mode, setMode] = useState("average");
  // eventFormat: "same" | "separate"
  const [eventFormat, setEventFormat] = useState("same");
  const [sharedEvent, setSharedEvent] = useState(defaultEvent);
  const [count, setCount] = useState(5);
  const [roundsPerSet, setRoundsPerSet] = useState(3);
  const [setsToWin, setSetsToWin] = useState(3);
  const [hostEvent, setHostEvent] = useState(defaultEvent);
  // { [participantKey]: EventRow[] }
  const [plans, setPlans] = useState({});

  // Tournament config
  const [tFormat, setTFormat] = useState("bracket"); // "bracket" | "roundrobin"
  const [matchRule, setMatchRule] = useState("average"); // "average" | "bestof" | "sets"
  const [averageOf, setAverageOf] = useState(5);
  const [bestOf, setBestOf] = useState(5);
  const [seeding, setSeeding] = useState("random"); // "random" | "pb" | "host"
  const [seedOrder, setSeedOrder] = useState([]); // participant keys

  useEffect(() => {
    if (!isOpen) return;
    setMode("average");
    setEventFormat("same");
    setSharedEvent(defaultEvent || "333");
    setCount(5);
    setRoundsPerSet(3);
    setSetsToWin(3);
    setHostEvent(defaultEvent || "333");
    setTFormat("bracket");
    setMatchRule("average");
    setAverageOf(5);
    setBestOf(5);
    setSeeding("random");
    setSeedOrder(participants.map((participant) => participant.key));
    // Every player starts on the same event — the shared default — so "different
    // events" is an opt-in change per row, not a pre-filled grid of profile events.
    setPlans(
      Object.fromEntries(
        participants.map((participant) => [
          participant.key,
          [createEventRow(defaultEvent || "333")],
        ])
      )
    );
  }, [isOpen, defaultEvent, participants]);

  if (!isOpen) return null;

  const rowsFor = (key) => plans[key] || [createEventRow(defaultEvent || "333")];

  const updatePlanRow = (key) => (rowID, nextRow) => {
    setPlans((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((row) => (row.id === rowID ? nextRow : row)),
    }));
  };

  const removePlanRow = (key) => (rowID) => {
    setPlans((prev) => {
      const current = prev[key] || [];
      if (current.length <= 1) return prev;
      return { ...prev, [key]: current.filter((row) => row.id !== rowID) };
    });
  };

  const addPlanRow = (key, fallbackEvent) => () => {
    setPlans((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), createEventRow(fallbackEvent || "333")],
    }));
  };

  const buildPlan = (rows) =>
    (rows || []).map((row) => ({
      event: row.event,
      count: Number(row.count) || 1,
    }));

  const useSeparateEvents = canSeparateEvents && eventFormat === "separate";

  const longestPlan = () =>
    Math.max(1, ...participants.map((participant) => planLength(rowsFor(participant.key))));

  const moveSeed = (key, dir) => {
    setSeedOrder((prev) => {
      const idx = prev.indexOf(key);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const tournamentParams = {
    averageOf: Number(averageOf) || 5,
    bestOf: Number(bestOf) || 5,
    roundCount: Number(roundsPerSet) || 3,
    setCount: Number(setsToWin) || 3,
  };
  const tournamentBlock = matchBlockSize(matchRule, tournamentParams);
  const bracketRounds = Math.max(1, Math.round(Math.log2(nextPow2(participants.length || 2))));
  const roundRobinMatches = (participants.length * (participants.length - 1)) / 2;
  const tournamentTotalSolves =
    tFormat === "bracket" ? tournamentBlock * bracketRounds : tournamentBlock;

  const orderedSeedParticipants = seedOrder
    .map((key) => participants.find((p) => p.key === key))
    .filter(Boolean);

  const handleConfirm = () => {
    if (mode === "hosted") {
      onConfirm({
        mode: "hosted",
        count: 25,
        batchSize: 25,
        creatorEvent: hostEvent,
        opponentEvent: hostEvent,
      });
      onClose();
      return;
    }

    if (mode === "tournament") {
      onConfirm({
        mode: "tournament",
        tournament: {
          format: tFormat,
          matchRule,
          params: tournamentParams,
          event: sharedEvent,
          seeding,
          seedOrder: seeding === "host" ? seedOrder : [],
        },
      });
      onClose();
      return;
    }

    const separatePayload = () => {
      if (isGroup) {
        return {
          participantPlans: Object.fromEntries(
            participants.map((participant) => [
              participant.key,
              buildPlan(rowsFor(participant.key)),
            ])
          ),
        };
      }
      return {
        creatorPlan: buildPlan(rowsFor("creator")),
        opponentPlan: buildPlan(rowsFor("opponent")),
      };
    };

    if (mode === "head_to_head") {
      const payload = {
        mode: "head_to_head",
        roundCount: Number(roundsPerSet) || 3,
        setCount: Number(setsToWin) || 3,
      };

      if (useSeparateEvents) {
        Object.assign(payload, separatePayload());
        // Group head to head has no set structure — run it like a mixed average.
        payload.count = isGroup ? longestPlan() : maxHeadToHeadSolves(roundsPerSet, setsToWin);
      } else {
        payload.count = maxHeadToHeadSolves(roundsPerSet, setsToWin);
        payload.creatorEvent = sharedEvent;
        payload.opponentEvent = sharedEvent;
      }

      onConfirm(payload);
      onClose();
      return;
    }

    // mode === "average"
    if (useSeparateEvents) {
      onConfirm({ mode: "average", ...separatePayload() });
      onClose();
      return;
    }

    onConfirm({
      mode: "average",
      count,
      creatorEvent: sharedEvent,
      opponentEvent: sharedEvent,
    });
    onClose();
  };

  const renderTournamentConfig = () => (
    <>
      <div className="sharedAverageModeToggle" role="tablist" aria-label="Tournament format">
        <button
          type="button"
          className={tFormat === "bracket" ? "isActive" : ""}
          onClick={() => setTFormat("bracket")}
        >
          Bracket
        </button>
        <button
          type="button"
          className={tFormat === "roundrobin" ? "isActive" : ""}
          onClick={() => setTFormat("roundrobin")}
        >
          Round Robin
        </button>
      </div>

      <label>
        Event
        <EventSelect value={sharedEvent} onChange={setSharedEvent} />
      </label>

      <label>
        Each match
        <select value={matchRule} onChange={(e) => setMatchRule(e.target.value)}>
          <option value="average">Single average</option>
          <option value="bestof">Best of N solves</option>
          <option value="sets">Sets &amp; rounds</option>
        </select>
      </label>

      {matchRule === "average" && (
        <label>
          Average of
          <select value={averageOf} onChange={(e) => setAverageOf(Number(e.target.value))}>
            {AVERAGE_OF_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Ao{n}
              </option>
            ))}
          </select>
        </label>
      )}

      {matchRule === "bestof" && (
        <label>
          Best of
          <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value))}>
            {BEST_OF_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} solves
              </option>
            ))}
          </select>
        </label>
      )}

      {matchRule === "sets" && (
        <div className="sharedAverageSplitFields">
          <label>
            Rounds per set
            <select
              value={roundsPerSet}
              onChange={(e) => setRoundsPerSet(Number(e.target.value))}
            >
              {ROUND_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  First to {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sets to win
            <select value={setsToWin} onChange={(e) => setSetsToWin(Number(e.target.value))}>
              {SET_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  First to {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label>
        Seeding
        <select value={seeding} onChange={(e) => setSeeding(e.target.value)}>
          <option value="random">Random draw</option>
          <option value="pb">By personal best</option>
          <option value="host">Host order</option>
        </select>
      </label>

      {seeding === "host" && (
        <div className="sharedAverageSeedList">
          {orderedSeedParticipants.map((participant, index) => (
            <div key={participant.key} className="sharedAverageSeedRow">
              <span className="sharedAverageSeedNum">{index + 1}</span>
              <span className="sharedAverageSeedName">
                {participant.label}
                {participant.isYou ? " (you)" : ""}
              </span>
              <button
                type="button"
                onClick={() => moveSeed(participant.key, -1)}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSeed(participant.key, 1)}
                disabled={index === orderedSeedParticipants.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="sharedAverageHelperText">
        {tFormat === "bracket"
          ? `${participants.length}-player knockout · ${bracketRounds} round${
              bracketRounds === 1 ? "" : "s"
            } · ~${tournamentTotalSolves} solves each if you go the distance.`
          : `${participants.length}-player round robin · ${roundRobinMatches} matchup${
              roundRobinMatches === 1 ? "" : "s"
            } · ${tournamentTotalSolves} solves each.`}
      </p>
    </>
  );

  return (
    <div className="sharedAverageOverlay">
      <div className="sharedAverageModal">
        <h2>Start Shared Session</h2>

        <div className="sharedAverageModeToggle" role="tablist" aria-label="Shared mode">
          <button
            type="button"
            className={mode === "average" ? "isActive" : ""}
            onClick={() => setMode("average")}
          >
            Average
          </button>
          {isTwoPerson && (
            <button
              type="button"
              className={mode === "head_to_head" ? "isActive" : ""}
              onClick={() => setMode("head_to_head")}
            >
              Head to Head
            </button>
          )}
          {canRunTournament && (
            <button
              type="button"
              className={mode === "tournament" ? "isActive" : ""}
              onClick={() => setMode("tournament")}
            >
              Tournament
            </button>
          )}
          {allowHostedMode && (
            <button
              type="button"
              className={mode === "hosted" ? "isActive" : ""}
              onClick={() => setMode("hosted")}
            >
              Host Live
            </button>
          )}
        </div>

        {(mode === "average" || mode === "head_to_head") && canSeparateEvents && (
          <div className="sharedAverageModeToggle" role="tablist" aria-label="Event format">
            <button
              type="button"
              className={eventFormat === "same" ? "isActive" : ""}
              onClick={() => setEventFormat("same")}
            >
              Same Event
            </button>
            <button
              type="button"
              className={eventFormat === "separate" ? "isActive" : ""}
              onClick={() => setEventFormat("separate")}
            >
              {isGroup ? "Different Events Per Player" : "Different Events"}
            </button>
          </div>
        )}

        {mode === "head_to_head" && (
          <div className="sharedAverageSplitFields">
            <label>
              Rounds per set
              <select
                value={roundsPerSet}
                onChange={(e) => setRoundsPerSet(Number(e.target.value))}
              >
                {ROUND_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    First to {n}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sets to win
              <select
                value={setsToWin}
                onChange={(e) => setSetsToWin(Number(e.target.value))}
              >
                {SET_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    First to {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {mode === "tournament" ? (
          renderTournamentConfig()
        ) : mode === "hosted" ? (
          <>
            <label>
              Event
              <EventSelect value={hostEvent} onChange={setHostEvent} />
            </label>

            <p className="sharedAverageHelperText">
              Host-led scramble stream. Everyone solves the same feed, and their solves can
              still save to main.
            </p>
          </>
        ) : useSeparateEvents ? (
          <>
            <div
              className={
                isGroup ? "sharedAverageMemberPlans" : "sharedAverageSplitGrid"
              }
            >
              {participants.map((participant) => (
                <EventRows
                  key={participant.key}
                  label={participant.isYou ? `${participant.label} (you)` : participant.label}
                  rows={rowsFor(participant.key)}
                  onChange={updatePlanRow(participant.key)}
                  onAdd={addPlanRow(participant.key, defaultEvent)}
                  onRemove={removePlanRow(participant.key)}
                />
              ))}
            </div>

            <p className="sharedAverageHelperText">
              {isGroup
                ? "Each player gets their own events. They line up solve-for-solve; shorter lists repeat to match the longest."
                : mode === "head_to_head"
                ? `Each side's events line up solve-for-solve (the shorter list repeats). First to ${setsToWin} sets wins the match; each set goes to the first to ${roundsPerSet} round wins.`
                : "Each side gets their own events, lined up solve-for-solve."}
            </p>
          </>
        ) : mode === "head_to_head" ? (
          <>
            <label>
              Event
              <EventSelect value={sharedEvent} onChange={setSharedEvent} />
            </label>

            <p className="sharedAverageHelperText">
              Shared scrambles, round-by-round scoring. First to {setsToWin} sets wins the
              match; each set goes to the first to {roundsPerSet} round wins.
            </p>
          </>
        ) : (
          <>
            <label>
              Event
              <EventSelect value={sharedEvent} onChange={setSharedEvent} />
            </label>

            <label>
              Count
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={12}>12</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </>
        )}

        <div className="sharedAverageButtons">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={handleConfirm}>
            {mode === "hosted"
              ? "Start Hosting"
              : mode === "tournament"
              ? "Start Tournament"
              : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SharedAverageModal;
