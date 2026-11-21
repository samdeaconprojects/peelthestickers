// src/components/Social/SharedAverageModal.js
import React, { useEffect, useMemo, useState } from "react";
import "./SharedAverageModal.css";
import { matchBlockSize } from "../../utils/tournament";

const EVENT_OPTIONS = [
  { value: "222", label: "2x2", short: "2x2" },
  { value: "333", label: "3x3", short: "3x3" },
  { value: "444", label: "4x4", short: "4x4" },
  { value: "555", label: "5x5", short: "5x5" },
  { value: "666", label: "6x6", short: "6x6" },
  { value: "777", label: "7x7", short: "7x7" },
  { value: "333OH", label: "3x3 One-Handed", short: "OH" },
  { value: "333BLD", label: "3x3 Blindfolded", short: "BLD" },
  { value: "SKEWB", label: "Skewb", short: "Skewb" },
  { value: "PYRAMINX", label: "Pyraminx", short: "Pyra" },
  { value: "MEGAMINX", label: "Megaminx", short: "Mega" },
  { value: "CLOCK", label: "Clock", short: "Clock" },
  { value: "SQ1", label: "Square-1", short: "Sq-1" },
];

const COUNT_OPTIONS = [1, 2, 3, 5, 12, 50, 100];
const AVERAGE_COUNT_OPTIONS = [1, 3, 5, 12, 50, 100];
const ROUND_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const SET_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const AVERAGE_OF_OPTIONS = [3, 5];
const BEST_OF_OPTIONS = [3, 5, 7];

const MODE_BLURBS = {
  average: "Same scrambles for everyone. Each solve is a round; the best average wins.",
  head_to_head: "Solve-by-solve duel. Win rounds to take sets, win sets to take the match.",
  tournament: "Knockout bracket or round robin. Matches are played on shared scrambles.",
  hosted: "You stream scrambles live. Everyone solves the same feed.",
};

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

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function Chips({ value, options, onChange, ariaLabel, wrap = false }) {
  return (
    <div
      className={`samChips ${wrap ? "samChips--wrap" : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const label = typeof option === "object" ? option.label : String(option);
        const title = typeof option === "object" ? option.title : undefined;
        const active = optionValue === value;
        return (
          <button
            key={String(optionValue)}
            type="button"
            role="radio"
            aria-checked={active}
            title={title}
            className={active ? "isActive" : ""}
            onClick={() => onChange(optionValue)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="samField">
      <div className="samFieldLabel">
        <span>{label}</span>
        {hint && <span className="samFieldHint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function EventChips({ value, onChange }) {
  return (
    <Chips
      wrap
      ariaLabel="Event"
      value={value}
      onChange={onChange}
      options={EVENT_OPTIONS.map((o) => ({ value: o.value, label: o.short, title: o.label }))}
    />
  );
}

function EventSelect({ value, onChange }) {
  return (
    <select className="samSelect" value={value} onChange={(e) => onChange(e.target.value)}>
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
        <span className="sharedAveragePlanName">{label}</span>
        <span className="sharedAveragePlanCount">{plural(planLength(rows), "solve")}</span>
        <button type="button" className="sharedAverageAddRow" onClick={onAdd}>
          + Event
        </button>
      </div>

      <div className="sharedAveragePlanRows">
        {rows.map((row, index) => (
          <div key={row.id} className="sharedAveragePlanRow">
            <EventSelect
              value={row.event}
              onChange={(nextEvent) => onChange(row.id, { ...row, event: nextEvent })}
            />

            <select
              className="samSelect"
              value={row.count}
              onChange={(e) => onChange(row.id, { ...row, count: Number(e.target.value) })}
            >
              {COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}×
                </option>
              ))}
            </select>

            <button
              type="button"
              className="sharedAverageRemoveRow"
              onClick={() => onRemove(row.id)}
              disabled={rows.length === 1 && index === 0}
              aria-label={`Remove ${label} event`}
              title="Remove"
            >
              ×
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
        { key: "creator", label: yourLabel, event: yourDefaultEvent || defaultEvent || "333", isYou: true },
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
  const [excluded, setExcluded] = useState(() => new Set()); // participant keys sitting out

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
    setExcluded(new Set());
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

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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
      // Skip over players who are sitting out so arrows move between visible seeds.
      const active = prev.filter((k) => !excluded.has(k));
      const idx = active.indexOf(key);
      const target = active[idx + dir];
      if (idx < 0 || !target) return prev;
      const copy = [...prev];
      const a = copy.indexOf(key);
      const b = copy.indexOf(target);
      [copy[a], copy[b]] = [copy[b], copy[a]];
      return copy;
    });
  };

  const toggleExcluded = (key) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const tournamentParams = {
    averageOf: Number(averageOf) || 5,
    bestOf: Number(bestOf) || 5,
    roundCount: Number(roundsPerSet) || 3,
    setCount: Number(setsToWin) || 3,
  };
  const orderedSeedParticipants = seedOrder
    .map((key) => participants.find((p) => p.key === key))
    .filter(Boolean);
  const tournamentPlayers = orderedSeedParticipants.filter((p) => !excluded.has(p.key));
  const playerCount = tournamentPlayers.length;
  const tournamentBlock = matchBlockSize(matchRule, tournamentParams);
  const bracketSize = nextPow2(Math.max(2, playerCount));
  const bracketRounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const byeCount = Math.max(0, bracketSize - playerCount);
  const roundRobinMatches = (playerCount * (playerCount - 1)) / 2;
  const tournamentTotalSolves =
    tFormat === "bracket" ? tournamentBlock * bracketRounds : tournamentBlock;
  const tournamentReady = playerCount >= 2;

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
      if (!tournamentReady) return;
      onConfirm({
        mode: "tournament",
        tournament: {
          format: tFormat,
          matchRule,
          params: tournamentParams,
          event: sharedEvent,
          seeding,
          seedOrder: seeding === "host" ? tournamentPlayers.map((p) => p.key) : [],
          playerIds: tournamentPlayers.map((p) => p.key),
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

  const firstToChips = (value, onChange, label) => (
    <Chips
      ariaLabel={label}
      value={value}
      onChange={onChange}
      options={ROUND_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
    />
  );

  const renderSetsFields = () => (
    <div className="samFieldRow">
      <Field label="Sets to win" hint="first to">
        <Chips
          ariaLabel="Sets to win"
          value={setsToWin}
          onChange={setSetsToWin}
          options={SET_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
        />
      </Field>
      <Field label="Rounds per set" hint="first to">
        {firstToChips(roundsPerSet, setRoundsPerSet, "Rounds per set")}
      </Field>
    </div>
  );

  const renderPlayerPanel = () => (
    <div className="samPlayers">
      <div className="samPlayersHead">
        <span className="samFieldLabel">
          <span>Players</span>
          <span className="samFieldHint">
            {playerCount} of {participants.length}
          </span>
        </span>
        <span className="samPlayersActions">
          <button type="button" onClick={() => setExcluded(new Set())}>
            All
          </button>
        </span>
      </div>

      <Chips
        ariaLabel="Seeding"
        value={seeding}
        onChange={setSeeding}
        options={[
          { value: "random", label: "Random draw" },
          { value: "pb", label: "By PB" },
          { value: "host", label: "Set order" },
        ]}
      />

      <div className="samPlayerList">
        {(() => {
          let seed = 0;
          return orderedSeedParticipants.map((participant) => {
            const out = excluded.has(participant.key);
            if (!out) seed += 1;
            const activeIndex = out ? -1 : seed - 1;
            return (
              <div
                key={participant.key}
                className={`samPlayerRow ${out ? "isOut" : ""} ${participant.isYou ? "isYou" : ""}`}
              >
                <label className="samPlayerCheck">
                  <input
                    type="checkbox"
                    checked={!out}
                    onChange={() => toggleExcluded(participant.key)}
                  />
                  <span className="samPlayerSeed">
                    {out ? "–" : seeding === "host" ? seed : "•"}
                  </span>
                  <span className="samPlayerName">
                    {participant.label}
                    {participant.isYou && <em> you</em>}
                  </span>
                </label>
                {seeding === "host" && !out && (
                  <span className="samPlayerMove">
                    <button
                      type="button"
                      onClick={() => moveSeed(participant.key, -1)}
                      disabled={activeIndex <= 0}
                      aria-label={`Move ${participant.label} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSeed(participant.key, 1)}
                      disabled={activeIndex >= playerCount - 1}
                      aria-label={`Move ${participant.label} down`}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </div>
            );
          });
        })()}
      </div>

      <p className="samNote">
        {seeding === "random"
          ? "Seeds are drawn when the tournament starts."
          : seeding === "pb"
          ? "Fastest PB on this event gets seed 1. Players without one go last."
          : "Seed 1 meets the lowest seed first; top seeds can only meet late."}
        {" "}Unchecked members can still watch.
      </p>
    </div>
  );

  const renderTournamentConfig = () => (
    <div className="samTournament">
      <div className="samTournamentMain">
        <Field label="Format">
          <div className="samFormatCards">
            <button
              type="button"
              className={`samFormatCard ${tFormat === "bracket" ? "isActive" : ""}`}
              onClick={() => setTFormat("bracket")}
            >
              <span className="samFormatGlyph" aria-hidden="true">
                <svg viewBox="0 0 36 24" width="36" height="24">
                  <path d="M2 5h10v14H2M12 12h10M22 12h12" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <span className="samFormatName">Knockout</span>
              <span className="samFormatDesc">Lose a match, you're out</span>
            </button>
            <button
              type="button"
              className={`samFormatCard ${tFormat === "roundrobin" ? "isActive" : ""}`}
              onClick={() => setTFormat("roundrobin")}
            >
              <span className="samFormatGlyph" aria-hidden="true">
                <svg viewBox="0 0 36 24" width="36" height="24">
                  <circle cx="8" cy="6" r="3" fill="currentColor" />
                  <circle cx="28" cy="6" r="3" fill="currentColor" />
                  <circle cx="18" cy="20" r="3" fill="currentColor" />
                  <path d="M8 6h20L18 20z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <span className="samFormatName">Round robin</span>
              <span className="samFormatDesc">Everyone vs everyone</span>
            </button>
          </div>
        </Field>

        <Field label="Event">
          <EventChips value={sharedEvent} onChange={setSharedEvent} />
        </Field>

        <Field label="Each match">
          <Chips
            ariaLabel="Match rule"
            value={matchRule}
            onChange={setMatchRule}
            options={[
              { value: "average", label: "Average" },
              { value: "bestof", label: "Best of" },
              { value: "sets", label: "Sets" },
            ]}
          />
        </Field>

        {matchRule === "average" && (
          <Field label="Average of" hint="lower mean wins">
            <Chips
              ariaLabel="Average of"
              value={averageOf}
              onChange={setAverageOf}
              options={AVERAGE_OF_OPTIONS.map((n) => ({ value: n, label: `Ao${n}` }))}
            />
          </Field>
        )}

        {matchRule === "bestof" && (
          <Field label="Best of" hint="win the most solves">
            <Chips
              ariaLabel="Best of"
              value={bestOf}
              onChange={setBestOf}
              options={BEST_OF_OPTIONS.map((n) => ({ value: n, label: `${n} solves` }))}
            />
          </Field>
        )}

        {matchRule === "sets" && renderSetsFields()}
      </div>

      {renderPlayerPanel()}
    </div>
  );

  const summary = (() => {
    if (mode === "tournament") {
      if (!tournamentReady) return "Pick at least 2 players.";
      return tFormat === "bracket"
        ? [
            plural(playerCount, "player"),
            plural(bracketRounds, "round"),
            byeCount ? plural(byeCount, "bye") : null,
            `up to ${plural(tournamentTotalSolves, "solve")} each`,
          ]
            .filter(Boolean)
            .join(" · ")
        : [
            plural(playerCount, "player"),
            plural(roundRobinMatches, "matchup"),
            `${plural(tournamentTotalSolves, "solve")} each`,
          ].join(" · ");
    }
    if (mode === "hosted") return "25 scrambles at a time, more on demand.";
    if (mode === "head_to_head") {
      return `First to ${plural(setsToWin, "set")} · first to ${roundsPerSet} per set · up to ${plural(
        maxHeadToHeadSolves(roundsPerSet, setsToWin),
        "solve"
      )}`;
    }
    if (useSeparateEvents) return `${plural(longestPlan(), "solve")} each, lined up solve-for-solve`;
    return `${plural(count, "solve")} · ${participants.length || 2} players`;
  })();

  const modeTabs = [
    { key: "average", label: "Average", show: true },
    { key: "head_to_head", label: "Head to Head", show: isTwoPerson },
    { key: "tournament", label: "Tournament", show: canRunTournament },
    { key: "hosted", label: "Host Live", show: allowHostedMode },
  ].filter((tab) => tab.show);

  return (
    <div
      className="sharedAverageOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`sharedAverageModal ${mode === "tournament" ? "sharedAverageModal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Start shared session"
      >
        <div className="samHeader">
          <div>
            <h2>Start Shared Session</h2>
            <p className="samSub">
              {isTwoPerson
                ? `You vs ${theirLabel}`
                : `${plural(participants.length, "member")} in this group`}
            </p>
          </div>
          <button type="button" className="samClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="samBody">
          {modeTabs.length > 1 && (
            <div className="samModeTabs" role="tablist" aria-label="Shared mode">
              {modeTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.key}
                  className={mode === tab.key ? "isActive" : ""}
                  onClick={() => setMode(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <p className="samBlurb">{MODE_BLURBS[mode]}</p>

          {mode === "tournament" ? (
            renderTournamentConfig()
          ) : mode === "hosted" ? (
            <Field label="Event">
              <EventChips value={hostEvent} onChange={setHostEvent} />
            </Field>
          ) : (
            <>
              {canSeparateEvents && (
                <Field label="Events">
                  <Chips
                    ariaLabel="Event format"
                    value={eventFormat}
                    onChange={setEventFormat}
                    options={[
                      { value: "same", label: "Everyone the same" },
                      {
                        value: "separate",
                        label: isGroup ? "Different per player" : "Different per side",
                      },
                    ]}
                  />
                </Field>
              )}

              {mode === "head_to_head" && renderSetsFields()}

              {useSeparateEvents ? (
                <>
                  <div className={isGroup ? "sharedAverageMemberPlans" : "sharedAverageSplitGrid"}>
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
                  <p className="samNote">
                    {isGroup
                      ? "Lists line up solve-for-solve; shorter lists repeat to match the longest."
                      : "Each side's list lines up solve-for-solve; the shorter one repeats."}
                  </p>
                </>
              ) : (
                <>
                  <Field label="Event">
                    <EventChips value={sharedEvent} onChange={setSharedEvent} />
                  </Field>
                  {mode === "average" && (
                    <Field label="Solves">
                      <Chips
                        ariaLabel="Solve count"
                        value={count}
                        onChange={setCount}
                        options={AVERAGE_COUNT_OPTIONS.map((n) => ({
                          value: n,
                          label: n === 1 ? "1" : n === 3 ? "Mo3" : `Ao${n}`,
                        }))}
                      />
                    </Field>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="samFooter">
          <span className="samSummary">{summary}</span>
          <div className="sharedAverageButtons">
            <button type="button" className="samBtnGhost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="samBtnPrimary"
              onClick={handleConfirm}
              disabled={mode === "tournament" && !tournamentReady}
            >
              {mode === "hosted"
                ? "Start Hosting"
                : mode === "tournament"
                ? "Start Tournament"
                : "Start"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SharedAverageModal;
