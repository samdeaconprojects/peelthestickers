// Pure helpers for group "tournament" shared sessions.
//
// A tournament rides on the normal group shared-session machinery: the whole
// field solves one flat list of scrambles, and the tournament layer is a
// scoring/structure overlay computed from `roundResults` ({ [solveIndex]:
// { [userID]: { time } } }).
//
// Two formats:
//  - "bracket"     single elimination. Each bracket round has its own block of
//                  `blockSize` solves; round r lives at solve indices
//                  [r*blockSize, (r+1)*blockSize). Losers stop solving.
//  - "roundrobin"  everyone solves ONE block; every pair is compared over it.
//
// Per-match rule:
//  - "average"  lower mean over the block wins (needs the full block).
//  - "bestof"   most round wins over the block; first to floor(n/2)+1 clinches.
//  - "sets"     "first to setCount sets, each set first to roundCount rounds"
//               (same model as the 1-1 head to head).

export const TOURNAMENT_FORMATS = ["bracket", "roundrobin"];
export const MATCH_RULES = ["average", "bestof", "sets"];

export function matchBlockSize(matchRule, params = {}) {
  if (matchRule === "sets") {
    const r = Math.max(1, Number(params.roundCount) || 3);
    const s = Math.max(1, Number(params.setCount) || 3);
    return (2 * s - 1) * (2 * r - 1);
  }
  if (matchRule === "bestof") return Math.max(1, Number(params.bestOf) || 5);
  return Math.max(1, Number(params.averageOf) || 5);
}

export function matchRuleLabel(matchRule, params = {}) {
  if (matchRule === "sets") {
    const r = Math.max(1, Number(params.roundCount) || 3);
    const s = Math.max(1, Number(params.setCount) || 3);
    return `First to ${s} set${s === 1 ? "" : "s"} · first to ${r}`;
  }
  if (matchRule === "bestof") return `Best of ${matchBlockSize("bestof", params)}`;
  return `Ao${matchBlockSize("average", params)}`;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Order players for the draw. `seeding`: "random" | "pb" | "host".
export function seedPlayers(players, seeding, { seedOrder = [], pbById = {} } = {}) {
  const byId = new Map(players.map((p) => [p.id, p]));

  if (seeding === "host" && Array.isArray(seedOrder) && seedOrder.length) {
    const ordered = seedOrder.map((id) => byId.get(id)).filter(Boolean);
    players.forEach((p) => {
      if (!ordered.some((o) => o.id === p.id)) ordered.push(p);
    });
    return ordered;
  }

  if (seeding === "pb") {
    return [...players].sort((a, b) => {
      const av = Number(pbById?.[a.id]);
      const bv = Number(pbById?.[b.id]);
      const aok = Number.isFinite(av) && av > 0;
      const bok = Number.isFinite(bv) && bv > 0;
      if (aok && bok) return av - bv;
      if (aok) return -1;
      if (bok) return 1;
      return 0;
    });
  }

  return shuffle(players);
}

// Standard bracket slot order (1-indexed seeds) for a power-of-two size.
function seedSlots(size) {
  let slots = [1, 2];
  while (slots.length < size) {
    const sum = slots.length * 2 + 1;
    const next = [];
    slots.forEach((s) => {
      next.push(s);
      next.push(sum - s);
    });
    slots = next;
  }
  return slots;
}

export function buildTournament({ format, players, seeding, seedOrder, matchRule, params, pbById }) {
  const cleanPlayers = (Array.isArray(players) ? players : [])
    .map((p) => ({ id: String(p?.id || "").trim(), name: p?.name || p?.id || "Player" }))
    .filter((p) => p.id);

  const seeded = seedPlayers(cleanPlayers, seeding, { seedOrder, pbById });
  const blockSize = matchBlockSize(matchRule, params);

  if (format === "roundrobin") {
    const matches = [];
    for (let i = 0; i < seeded.length; i += 1) {
      for (let j = i + 1; j < seeded.length; j += 1) {
        matches.push({
          id: `rr-${i}-${j}`,
          round: 0,
          aId: seeded[i].id,
          bId: seeded[j].id,
        });
      }
    }
    return {
      format: "roundrobin",
      matchRule,
      params: params || {},
      blockSize,
      totalRounds: 1,
      roundOffsets: [0],
      totalSolves: blockSize,
      seedOrder: seeded.map((p) => p.id),
      players: seeded,
      matches,
    };
  }

  // bracket
  const size = Math.max(2, nextPow2(seeded.length || 2));
  const slots = seedSlots(size);
  const totalRounds = Math.round(Math.log2(size));
  const matches = [];

  const first = [];
  for (let i = 0; i < size; i += 2) {
    const a = seeded[slots[i] - 1] || null;
    const b = seeded[slots[i + 1] - 1] || null;
    first.push({
      id: `m-0-${i / 2}`,
      round: 0,
      slot: i / 2,
      aId: a?.id || null,
      bId: b?.id || null,
      isBye: !a || !b,
    });
  }
  matches.push(...first);

  let prev = first;
  for (let r = 1; r < totalRounds; r += 1) {
    const cur = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m = { id: `m-${r}-${i / 2}`, round: r, slot: i / 2, aId: null, bId: null, isBye: false };
      prev[i].nextMatchId = m.id;
      prev[i].nextSlot = "a";
      prev[i + 1].nextMatchId = m.id;
      prev[i + 1].nextSlot = "b";
      cur.push(m);
    }
    matches.push(...cur);
    prev = cur;
  }

  return {
    format: "bracket",
    matchRule,
    params: params || {},
    blockSize,
    size,
    totalRounds,
    roundOffsets: Array.from({ length: totalRounds }, (_, r) => r * blockSize),
    totalSolves: totalRounds * blockSize,
    seedOrder: seeded.map((p) => p.id),
    players: seeded,
    matches,
  };
}

/* --------------------------------------------------------------------------
   SCORING
-------------------------------------------------------------------------- */

function blockTimes(roundResults, playerId, start, len) {
  const out = [];
  for (let k = 0; k < len; k += 1) {
    const t = Number(roundResults?.[start + k]?.[playerId]?.time);
    out.push(Number.isFinite(t) ? t : null);
  }
  return out;
}

const mean = (arr) => {
  const vals = arr.filter((v) => typeof v === "number" && isFinite(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
};

function pairRoundWins(aTimes, bTimes) {
  let a = 0;
  let b = 0;
  let played = 0;
  for (let i = 0; i < Math.max(aTimes.length, bTimes.length); i += 1) {
    const x = aTimes[i];
    const y = bTimes[i];
    if (x == null || y == null) continue;
    played += 1;
    if (x < y) a += 1;
    else if (y < x) b += 1;
  }
  return { a, b, played };
}

function setsStanding(aTimes, bTimes, params) {
  const R = Math.max(1, Number(params?.roundCount) || 3);
  const S = Math.max(1, Number(params?.setCount) || 3);
  let aSets = 0;
  let bSets = 0;
  let aCur = 0;
  let bCur = 0;
  let winner = null;
  for (let i = 0; i < Math.max(aTimes.length, bTimes.length); i += 1) {
    if (winner) break;
    const x = aTimes[i];
    const y = bTimes[i];
    if (x == null || y == null) continue;
    if (x < y) aCur += 1;
    else if (y < x) bCur += 1;
    else continue;
    if (aCur >= R) {
      aSets += 1;
      aCur = 0;
      bCur = 0;
    } else if (bCur >= R) {
      bSets += 1;
      aCur = 0;
      bCur = 0;
    }
    if (aSets >= S) winner = "a";
    else if (bSets >= S) winner = "b";
  }
  return { aSets, bSets, aCur, bCur, roundCount: R, setCount: S, winner };
}

// Resolve one match's outcome over its block.
export function computeMatchResult(tournament, match, roundResults) {
  const start =
    tournament.format === "bracket"
      ? tournament.roundOffsets[match.round] || 0
      : 0;
  const len = tournament.blockSize;

  const aId = match.aId;
  const bId = match.bId;

  // Structural bye (a first-round slot with no seed) — the present player walks
  // through. A later-round slot that is merely undetermined is NOT a bye.
  if (match.isBye) {
    const winnerId = aId || bId || null;
    return {
      start,
      len,
      decided: !!winnerId,
      winnerId,
      loserId: null,
      isBye: true,
      scoreLabel: winnerId ? "Bye" : "",
    };
  }

  // One or both players not decided yet (waiting on an earlier round).
  if (!aId || !bId) {
    return { start, len, decided: false, winnerId: null, loserId: null, scoreLabel: "" };
  }

  const aTimes = blockTimes(roundResults, aId, start, len);
  const bTimes = blockTimes(roundResults, bId, start, len);
  const aDone = aTimes.filter((t) => t != null).length;
  const bDone = bTimes.filter((t) => t != null).length;

  if (tournament.matchRule === "sets") {
    const st = setsStanding(aTimes, bTimes, tournament.params);
    const decided = !!st.winner;
    return {
      start,
      len,
      decided,
      winnerId: st.winner === "a" ? aId : st.winner === "b" ? bId : null,
      loserId: st.winner === "a" ? bId : st.winner === "b" ? aId : null,
      aScore: st.aSets,
      bScore: st.bSets,
      scoreLabel: `${st.aSets}–${st.bSets} sets`,
    };
  }

  if (tournament.matchRule === "bestof") {
    const { a, b } = pairRoundWins(aTimes, bTimes);
    const target = Math.floor(len / 2) + 1;
    const exhausted = aDone >= len && bDone >= len;
    let winner = null;
    if (a >= target) winner = "a";
    else if (b >= target) winner = "b";
    else if (exhausted && a !== b) winner = a > b ? "a" : "b";
    return {
      start,
      len,
      decided: !!winner,
      winnerId: winner === "a" ? aId : winner === "b" ? bId : null,
      loserId: winner === "a" ? bId : winner === "b" ? aId : null,
      aScore: a,
      bScore: b,
      scoreLabel: `${a}–${b}`,
    };
  }

  // average
  const ready = aDone >= len && bDone >= len;
  const aMean = mean(aTimes);
  const bMean = mean(bTimes);
  let winner = null;
  if (ready && aMean != null && bMean != null && aMean !== bMean) {
    winner = aMean < bMean ? "a" : "b";
  }
  return {
    start,
    len,
    decided: !!winner,
    winnerId: winner === "a" ? aId : winner === "b" ? bId : null,
    loserId: winner === "a" ? bId : winner === "b" ? aId : null,
    aScore: aMean,
    bScore: bMean,
    scoreLabel:
      aMean != null && bMean != null
        ? `${(aMean / 1000).toFixed(2)} vs ${(bMean / 1000).toFixed(2)}`
        : `${aDone}/${len} vs ${bDone}/${len}`,
  };
}

export function computeTournamentState(tournament, roundResults = {}) {
  if (!tournament || !Array.isArray(tournament.matches)) {
    return { format: null, matches: [], isComplete: false, champion: null, currentRound: 0, standings: [] };
  }

  const nameById = new Map((tournament.players || []).map((p) => [p.id, p.name]));

  if (tournament.format === "roundrobin") {
    const results = tournament.matches.map((match) => {
      const result = computeMatchResult(tournament, match, roundResults);
      return { ...match, result, aName: nameById.get(match.aId) || match.aId, bName: nameById.get(match.bId) || match.bId };
    });

    const stats = new Map();
    (tournament.players || []).forEach((p) => {
      stats.set(p.id, { id: p.id, name: p.name, wins: 0, losses: 0, roundWins: 0, played: 0, means: [] });
    });

    results.forEach(({ aId, bId, result }) => {
      const start = 0;
      const len = tournament.blockSize;
      const aTimes = blockTimes(roundResults, aId, start, len);
      const bTimes = blockTimes(roundResults, bId, start, len);
      const { a, b } = pairRoundWins(aTimes, bTimes);
      const A = stats.get(aId);
      const B = stats.get(bId);
      if (A) A.roundWins += a;
      if (B) B.roundWins += b;
      if (result.decided) {
        if (result.winnerId === aId) {
          if (A) A.wins += 1;
          if (B) B.losses += 1;
        } else if (result.winnerId === bId) {
          if (B) B.wins += 1;
          if (A) A.losses += 1;
        }
      }
    });

    (tournament.players || []).forEach((p) => {
      const len = tournament.blockSize;
      const m = mean(blockTimes(roundResults, p.id, 0, len));
      const s = stats.get(p.id);
      if (s) s.mean = m;
    });

    const standings = [...stats.values()].sort(
      (x, y) =>
        y.wins - x.wins ||
        y.roundWins - x.roundWins ||
        (x.mean == null ? Infinity : x.mean) - (y.mean == null ? Infinity : y.mean)
    );

    const isComplete = results.every((r) => r.result.decided);
    return {
      format: "roundrobin",
      matches: results,
      standings,
      isComplete,
      champion: isComplete ? standings[0] || null : null,
      currentRound: 0,
      blockSize: tournament.blockSize,
    };
  }

  // bracket
  const byId = new Map();
  const resolved = tournament.matches.map((m) => ({ ...m, aId: m.aId, bId: m.bId, result: null }));
  resolved.forEach((m) => byId.set(m.id, m));

  // Resolve round by round so winners flow forward.
  for (let round = 0; round < tournament.totalRounds; round += 1) {
    resolved
      .filter((m) => m.round === round)
      .forEach((m) => {
        m.result = computeMatchResult(tournament, m, roundResults);
        m.aName = nameById.get(m.aId) || m.aId || null;
        m.bName = nameById.get(m.bId) || m.bId || null;
        if (m.result.decided && m.nextMatchId) {
          const next = byId.get(m.nextMatchId);
          if (next) {
            if (m.nextSlot === "a") next.aId = m.result.winnerId;
            else next.bId = m.result.winnerId;
          }
        }
      });
  }

  const finalMatch = resolved.find((m) => m.round === tournament.totalRounds - 1);
  const champion =
    finalMatch && finalMatch.result?.decided
      ? { id: finalMatch.result.winnerId, name: nameById.get(finalMatch.result.winnerId) || finalMatch.result.winnerId }
      : null;

  let currentRound = tournament.totalRounds - 1;
  for (let round = 0; round < tournament.totalRounds; round += 1) {
    const pending = resolved.some(
      (m) => m.round === round && !m.result?.decided && m.aId && m.bId
    );
    if (pending) {
      currentRound = round;
      break;
    }
  }

  return {
    format: "bracket",
    matches: resolved,
    rounds: Array.from({ length: tournament.totalRounds }, (_, r) =>
      resolved.filter((m) => m.round === r)
    ),
    isComplete: !!champion,
    champion,
    currentRound,
    blockSize: tournament.blockSize,
  };
}

// What should this player be doing right now?
// Returns { status, activeMatch, blockStart, nextIndex }
//   status: "solving" | "waiting" | "eliminated" | "champion" | "done" | "spectator"
export function playerState(tournament, state, roundResults, userId) {
  if (!tournament || !state) return { status: "spectator", activeMatch: null, nextIndex: null };
  const id = String(userId || "");

  if (tournament.format === "roundrobin") {
    const len = tournament.blockSize;
    const inField = (tournament.players || []).some((p) => p.id === id);
    if (!inField) return { status: "spectator", activeMatch: null, nextIndex: null };
    for (let k = 0; k < len; k += 1) {
      const t = Number(roundResults?.[k]?.[id]?.time);
      if (!Number.isFinite(t)) return { status: "solving", activeMatch: null, blockStart: 0, nextIndex: k };
    }
    return { status: "done", activeMatch: null, nextIndex: null };
  }

  // bracket
  const champ = state.champion?.id === id;
  if (champ) return { status: "champion", activeMatch: null, nextIndex: null };

  // Earliest round with an undecided match this player is in.
  for (let round = 0; round < tournament.totalRounds; round += 1) {
    const m = (state.matches || []).find(
      (mm) => mm.round === round && (mm.aId === id || mm.bId === id)
    );
    if (!m) continue;
    if (m.result?.decided) {
      if (m.result.winnerId !== id) {
        return { status: "eliminated", activeMatch: m, nextIndex: null };
      }
      continue; // won this round, look further
    }
    // Undecided match in this round.
    if (!m.aId || !m.bId) {
      return { status: "waiting", activeMatch: m, nextIndex: null };
    }
    const start = tournament.roundOffsets[round] || 0;
    for (let k = 0; k < tournament.blockSize; k += 1) {
      const t = Number(roundResults?.[start + k]?.[id]?.time);
      if (!Number.isFinite(t)) {
        return { status: "solving", activeMatch: m, blockStart: start, nextIndex: start + k };
      }
    }
    return { status: "waiting", activeMatch: m, blockStart: start, nextIndex: null };
  }

  // Player is not in the bracket at all, or has won everything without a final.
  const inField = (tournament.players || []).some((p) => p.id === id);
  return { status: inField ? "waiting" : "spectator", activeMatch: null, nextIndex: null };
}
