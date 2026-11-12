import {
  generateWcaScramble,
  getDistanceDistribution,
  hasWcaScrambler,
} from "./wcaScramblers";

// Published optimal-distance tables (half-turn metric for 2x2, Pyraminx
// without tips). Matching them exactly shows the move definitions and the
// distance table are right.
const KNOWN_DISTRIBUTIONS = {
  "222": [1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644],
  SKEWB: [1, 8, 48, 288, 1728, 10248, 59304, 315198, 1225483, 1455856, 81028, 90],
  PYRAMINX: [1, 8, 48, 288, 1728, 9896, 51808, 220111, 480467, 166276, 2457, 32],
};

const MAIN_MOVES = {
  "222": /^[RUF](2|')?$/,
  SKEWB: /^[ULRB]'?$/,
  PYRAMINX: /^[ULRB]'?$/,
};

describe("wcaScramblers", () => {
  it.each(Object.keys(KNOWN_DISTRIBUTIONS))(
    "%s distance table matches the known state counts",
    (event) => {
      const { counts, reachable } = getDistanceDistribution(event);
      expect(counts).toEqual(KNOWN_DISTRIBUTIONS[event]);
      expect(reachable).toBe(KNOWN_DISTRIBUTIONS[event].reduce((a, b) => a + b, 0));
    }
  );

  it.each(Object.keys(MAIN_MOVES))("%s scrambles are exactly 11 WCA moves", (event) => {
    const mainLengths = new Set();
    const tipTokens = new Set();
    let repeatedFace = 0;
    let repeatedTip = 0;

    for (let i = 0; i < 200; i++) {
      const tokens = generateWcaScramble(event).split(" ");
      const main = tokens.filter((t) => MAIN_MOVES[event].test(t));
      const tips = tokens.slice(main.length);

      mainLengths.add(main.length);
      tips.forEach((t) => tipTokens.add(t));
      repeatedFace += main.filter((t, j) => j > 0 && t[0] === main[j - 1][0]).length;
      repeatedTip += tips.length - new Set(tips.map((t) => t[0])).size;
    }

    expect([...mainLengths]).toEqual([11]);
    expect(repeatedFace).toBe(0);
    expect(repeatedTip).toBe(0);
    const expectedTips = event === "PYRAMINX" ? ["b", "b'", "l", "l'", "r", "r'", "u", "u'"] : [];
    expect([...tipTokens].sort()).toEqual(expectedTips);
  });

  it("rejects states closer than the WCA minimum distance", () => {
    // Feed the generator the solved state (index 0) first; it must skip it.
    const calls = [];
    const randomInt = (n) => {
      calls.push(n);
      if (calls.length === 1) return 0;
      return Math.floor(Math.random() * n);
    };
    const scramble = generateWcaScramble("222", { randomInt });
    expect(scramble.split(" ")).toHaveLength(11);
    // More than one state pick happened, so the near-solved one was rejected.
    expect(calls.filter((n) => n === 5040 * 729).length).toBeGreaterThan(1);
  });

  it("only handles 2x2, Skewb and Pyraminx", () => {
    expect(hasWcaScrambler("222")).toBe(true);
    expect(hasWcaScrambler("skewb")).toBe(true);
    expect(hasWcaScrambler("PYRAMINX")).toBe(true);
    expect(hasWcaScrambler("333")).toBe(false);
    expect(() => generateWcaScramble("333")).toThrow();
  });
});
