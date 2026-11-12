// WCA-style (TNoodle-equivalent) random-state scramblers for 2x2, Skewb and
// Pyraminx.
//
// TNoodle, the WCA's official scrambler, does three things for these puzzles:
//   1. picks a uniformly random reachable state,
//   2. rejects it if it can be solved in fewer than N moves
//      (2x2: 4, Pyraminx: 6 counting tips, Skewb: 7),
//   3. writes the scramble as exactly 11 moves (Pyraminx: 11 + one move per
//      unsolved tip).
// cubing.js does (1) but not always (2)/(3), so we do all three here.
//
// The puzzles are small enough to hold a full distance table (exact optimal
// move count for every state), built lazily by BFS the first time an event is
// scrambled. Move definitions are copied from cubing.js's KPuzzle definitions
// so the scramble strings mean exactly what cubing.js (and our previews)
// think they mean.

const UNREACHED = 255;
const SCRAMBLE_LENGTH = 11;

// Transformation data from cubing.js `puzzles[id].kpuzzle()`. A move maps a
// pattern to: pieces[i] = old.pieces[perm[i]],
//             orientation[i] = (old.orientation[perm[i]] + delta[i]) % mod.
const DEFINITIONS = {
  "222": {
    minDistance: 4,
    order: 4,
    // Only R/U/F (like TNoodle), so the DBL corner never moves.
    components: [
      { orbit: "CORNERS", kind: "perm" },
      { orbit: "CORNERS", kind: "ori", mod: 3 },
    ],
    moves: {
      U: { CORNERS: { perm: [1, 2, 3, 0, 4, 5, 6, 7], delta: [0, 0, 0, 0, 0, 0, 0, 0] } },
      R: { CORNERS: { perm: [4, 0, 2, 3, 7, 5, 6, 1], delta: [2, 1, 0, 0, 1, 0, 0, 2] } },
      F: { CORNERS: { perm: [3, 1, 2, 5, 0, 4, 6, 7], delta: [1, 0, 0, 2, 2, 1, 0, 0] } },
    },
  },
  SKEWB: {
    minDistance: 7,
    order: 3,
    // Corner position and twist are tracked together (tracking them apart
    // gives a 28M-entry table, mostly unreachable). Center orientation is only
    // visible on a super-skewb, so it is ignored.
    components: [
      { orbit: "CORNERS", kind: "piece", mod: 3 },
      { orbit: "CENTERS", kind: "perm" },
    ],
    moves: {
      U: {
        CORNERS: { perm: [1, 7, 2, 3, 4, 5, 6, 0], delta: [2, 2, 0, 0, 0, 0, 1, 2] },
        CENTERS: { perm: [0, 1, 2, 5, 3, 4], delta: [0, 0, 0, 3, 0, 1] },
      },
      L: {
        CORNERS: { perm: [7, 1, 0, 3, 4, 5, 6, 2], delta: [2, 0, 2, 0, 1, 0, 0, 2] },
        CENTERS: { perm: [4, 1, 0, 3, 2, 5], delta: [1, 0, 1, 0, 2, 0] },
      },
      R: {
        CORNERS: { perm: [0, 2, 7, 3, 4, 5, 6, 1], delta: [0, 2, 2, 0, 0, 1, 0, 2] },
        CENTERS: { perm: [0, 2, 5, 3, 4, 1], delta: [0, 0, 3, 0, 0, 1] },
      },
      B: {
        CORNERS: { perm: [0, 1, 2, 3, 6, 4, 5, 7], delta: [0, 0, 0, 0, 2, 2, 2, 1] },
        CENTERS: { perm: [0, 1, 4, 3, 5, 2], delta: [0, 0, 0, 0, 1, 3] },
      },
    },
  },
  PYRAMINX: {
    minDistance: 6, // counts tip moves, like TNoodle
    order: 3,
    tips: ["u", "l", "r", "b"],
    // Axial pieces ("CORNERS") never move, they only twist. Tips are handled
    // separately because tip moves commute with everything.
    components: [
      { orbit: "EDGES", kind: "perm" },
      { orbit: "EDGES", kind: "ori", mod: 2 },
      { orbit: "CORNERS", kind: "ori", mod: 3 },
    ],
    moves: {
      U: {
        EDGES: { perm: [5, 0, 2, 3, 4, 1], delta: [0, 0, 0, 0, 0, 0] },
        CORNERS: { perm: [0, 1, 2, 3], delta: [1, 0, 0, 0] },
      },
      L: {
        EDGES: { perm: [4, 1, 0, 3, 2, 5], delta: [0, 0, 1, 0, 1, 0] },
        CORNERS: { perm: [0, 1, 2, 3], delta: [0, 0, 0, 1] },
      },
      R: {
        EDGES: { perm: [0, 1, 3, 5, 4, 2], delta: [0, 0, 0, 0, 0, 0] },
        CORNERS: { perm: [0, 1, 2, 3], delta: [0, 0, 1, 0] },
      },
      B: {
        EDGES: { perm: [0, 3, 2, 4, 1, 5], delta: [0, 1, 0, 0, 1, 0] },
        CORNERS: { perm: [0, 1, 2, 3], delta: [0, 1, 0, 0] },
      },
    },
  },
};

export const WCA_SCRAMBLER_EVENTS = Object.freeze(Object.keys(DEFINITIONS));

export function hasWcaScrambler(event) {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, String(event || "").toUpperCase());
}

// ---------------------------------------------------------------------------
// Coordinate tables

// "perm" tracks which piece is where, "ori" only the twists, and "piece"
// both at once (value = piece * mod + twist), for orbits where tracking them
// separately would leave many unreachable combinations.
function applyComponent(state, transformation, kind, mod) {
  const { perm, delta } = transformation;
  const out = new Array(state.length);
  for (let i = 0; i < state.length; i++) {
    const from = state[perm[i]];
    if (kind === "perm") {
      out[i] = from;
    } else if (kind === "ori") {
      out[i] = (from + delta[i]) % mod;
    } else {
      const piece = Math.floor(from / mod);
      out[i] = piece * mod + (((from % mod) + delta[i]) % mod);
    }
  }
  return out;
}

// Enumerates every reachable value of one component (e.g. corner permutation)
// and returns a move table over those values.
function buildComponentTable(component, baseMoves) {
  const first = baseMoves[0][component.orbit];
  const size = first.perm.length;
  const solved = Array.from({ length: size }, (_, i) => {
    if (component.kind === "perm") return i;
    if (component.kind === "ori") return 0;
    return i * component.mod;
  });

  const index = new Map([[solved.join(","), 0]]);
  const states = [solved];
  const edges = [];

  for (let s = 0; s < states.length; s++) {
    for (let m = 0; m < baseMoves.length; m++) {
      const next = applyComponent(
        states[s],
        baseMoves[m][component.orbit],
        component.kind,
        component.mod
      );
      const key = next.join(",");
      let nextIndex = index.get(key);
      if (nextIndex === undefined) {
        nextIndex = states.length;
        index.set(key, nextIndex);
        states.push(next);
      }
      edges[s * baseMoves.length + m] = nextIndex;
    }
  }

  return { count: states.length, table: Int32Array.from(edges) };
}

const builtPuzzles = new Map();

function buildPuzzle(eventKey) {
  const def = DEFINITIONS[eventKey];
  const baseNames = Object.keys(def.moves);
  const baseMoves = baseNames.map((name) => def.moves[name]);
  const numBase = baseNames.length;

  const components = def.components.map((c) => buildComponentTable(c, baseMoves));
  const radix = components.map((c) => c.count);
  const size = radix.reduce((a, b) => a * b, 1);

  // Search moves: every base move at every non-trivial power.
  const searchMoves = [];
  for (let m = 0; m < numBase; m++) {
    for (let power = 1; power < def.order; power++) {
      searchMoves.push({ base: m, power });
    }
  }

  // Per search move, per component: value -> value after the move.
  const moveTables = searchMoves.map(({ base, power }) =>
    components.map(({ count, table }) => {
      const out = new Int32Array(count);
      for (let v = 0; v < count; v++) {
        let x = v;
        for (let p = 0; p < power; p++) x = table[x * numBase + base];
        out[v] = x;
      }
      return out;
    })
  );

  const numComponents = components.length;
  const digits = new Int32Array(numComponents);
  const applyMove = (idx, moveIndex) => {
    let rest = idx;
    for (let c = numComponents - 1; c >= 0; c--) {
      digits[c] = rest % radix[c];
      rest = (rest - digits[c]) / radix[c];
    }
    const tables = moveTables[moveIndex];
    let out = 0;
    for (let c = 0; c < numComponents; c++) {
      out = out * radix[c] + tables[c][digits[c]];
    }
    return out;
  };

  // BFS from solved (index 0), one depth layer at a time by scanning the
  // table, so no queue is needed. Some product indices may be unreachable;
  // they stay UNREACHED.
  const dist = new Uint8Array(size).fill(UNREACHED);
  dist[0] = 0;
  let reachable = 1;
  for (let depth = 0, grew = true; grew; depth++) {
    grew = false;
    for (let idx = 0; idx < size; idx++) {
      if (dist[idx] !== depth) continue;
      for (let mv = 0; mv < searchMoves.length; mv++) {
        const next = applyMove(idx, mv);
        if (dist[next] === UNREACHED) {
          dist[next] = depth + 1;
          reachable++;
          grew = true;
        }
      }
    }
  }

  const moveName = ({ base, power }) => {
    const name = baseNames[base];
    if (power === 1) return name;
    if (power === def.order - 1) return `${name}'`;
    return `${name}2`;
  };

  return { def, size, reachable, dist, searchMoves, applyMove, moveName };
}

function getPuzzle(eventKey) {
  let puzzle = builtPuzzles.get(eventKey);
  if (!puzzle) {
    puzzle = buildPuzzle(eventKey);
    builtPuzzles.set(eventKey, puzzle);
  }
  return puzzle;
}

// ---------------------------------------------------------------------------
// Randomness (crypto when available, like TNoodle's SecureRandom)

function defaultRandomInt(maxExclusive) {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    do {
      cryptoObj.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function shuffled(items, randomInt) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scramble generation

// Finds a solution of exactly `length` moves (never the same base move twice
// in a row), using the distance table to prune.
function solveExactly(puzzle, startIdx, length, randomInt) {
  const { dist, searchMoves, applyMove } = puzzle;
  const order = searchMoves.map((_, i) => i);
  const path = [];

  const search = (idx, remaining, lastBase) => {
    if (remaining === 0) return idx === 0;
    for (const mv of shuffled(order, randomInt)) {
      if (searchMoves[mv].base === lastBase) continue;
      const next = applyMove(idx, mv);
      if (dist[next] > remaining - 1) continue;
      path.push(mv);
      if (search(next, remaining - 1, searchMoves[mv].base)) return true;
      path.pop();
    }
    return false;
  };

  return search(startIdx, length, -1) ? path : null;
}

function invertSolution(puzzle, solution) {
  const { def, searchMoves, moveName } = puzzle;
  return solution
    .slice()
    .reverse()
    .map((mv) => {
      const { base, power } = searchMoves[mv];
      return moveName({ base, power: def.order - power });
    });
}

/**
 * Returns a WCA-style scramble for "222", "SKEWB" or "PYRAMINX".
 * `options.randomInt(n)` (uniform in [0, n)) can be injected for tests.
 */
export function generateWcaScramble(event, options = {}) {
  const eventKey = String(event || "").toUpperCase();
  if (!hasWcaScrambler(eventKey)) {
    throw new Error(`No WCA scrambler for event ${event}`);
  }

  const randomInt = options.randomInt || defaultRandomInt;
  const puzzle = getPuzzle(eventKey);
  const { def, size, dist } = puzzle;

  for (;;) {
    const idx = randomInt(size);
    const mainDistance = dist[idx];
    if (mainDistance === UNREACHED) continue;

    // Tip twists are uniform and independent of the rest of the puzzle.
    const tipTwists = (def.tips || []).map(() => randomInt(def.order));
    const unsolvedTips = tipTwists.filter((t) => t !== 0).length;
    if (mainDistance + unsolvedTips < def.minDistance) continue;

    const solution = solveExactly(puzzle, idx, SCRAMBLE_LENGTH, randomInt);
    if (!solution) continue; // not expected; TNoodle asserts it never happens

    const moves = invertSolution(puzzle, solution);
    (def.tips || []).forEach((tip, i) => {
      if (tipTwists[i] === 1) moves.push(tip);
      if (tipTwists[i] === 2) moves.push(`${tip}'`);
    });
    return moves.join(" ");
  }
}

/** Optimal distance histogram for tests/diagnostics (excludes Pyraminx tips). */
export function getDistanceDistribution(event) {
  const eventKey = String(event || "").toUpperCase();
  const { dist, reachable } = getPuzzle(eventKey);
  const counts = [];
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    if (d !== UNREACHED) counts[d] = (counts[d] || 0) + 1;
  }
  return { counts, reachable };
}
