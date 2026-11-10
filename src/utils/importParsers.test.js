import { chunkImportSolves, dedupeAndStabilize, detectFormat, parseCsTimer } from "./importParsers";

const csTimer = (sessions, sessionData) =>
  JSON.stringify({
    ...sessions,
    ...(sessionData ? { properties: { sessionData: JSON.stringify(sessionData) } } : {}),
  });

const row = (ms, date, flag = 0, scramble = "R U", comment = "") => [[flag, ms], scramble, comment, date];

describe("parseCsTimer", () => {
  test("reads penalties, excluding the penalty from the time", () => {
    const rows = parseCsTimer(
      csTimer({ session1: [row(9000, 1500000000), row(9000, 1500000001, 2000), row(9000, 1500000002, -1)] }),
      "333"
    );
    expect(rows.map((r) => [r.time, r.penalty])).toEqual([
      [9000, null],
      [9000, "+2"],
      [9000, "DNF"],
    ]);
  });

  test("uses the total time of multi-phase solves", () => {
    const rows = parseCsTimer(csTimer({ session1: [[[0, 9000, 3000, 1000], "R", "", 1500000000]] }), "333");
    expect(rows[0].time).toBe(9000);
  });

  test("reads sessions stored as JSON strings", () => {
    const rows = parseCsTimer(csTimer({ session1: JSON.stringify([row(1000, 1500000000)]) }), "333");
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe(1000);
  });

  test("skips a session whose string is not JSON", () => {
    expect(parseCsTimer(csTimer({ session1: "not json", session2: [row(1000, 1500000000)] }), "333")).toHaveLength(1);
  });

  test("accepts a leading byte order mark", () => {
    expect(parseCsTimer(`﻿${csTimer({ session1: [row(1000, 1500000000)] })}`, "333")).toHaveLength(1);
  });

  test.each([
    ["missing", [[0, 1000], "R", ""]],
    ["zero", [[0, 1000], "R", "", 0]],
  ])("marks a solve with a %s date as undated instead of dating it 1970", (_, solve) => {
    const [parsed] = parseCsTimer(csTimer({ session1: [solve] }), "333");
    expect(parsed._undated).toBe(true);
    expect(new Date(parsed.datetime).getFullYear()).toBeGreaterThan(2000);
  });

  test("drops rows without a usable time", () => {
    const rows = parseCsTimer(
      csTimer({ session1: [[[0, null], "R", "", 1500000000], [[0, -5], "R", "", 1500000001], "junk"] }),
      "333"
    );
    expect(rows).toHaveLength(0);
  });

  test("maps scramble types to events and falls back to the viewed event", () => {
    const rows = parseCsTimer(
      csTimer(
        { session1: [row(1000, 1500000000)], session2: [row(1000, 1500000001)], session3: [row(1000, 1500000002)] },
        { 1: { name: "OH", opt: { scrType: "333oh" } }, 2: { name: 7, opt: {} }, 3: { name: "PLL", opt: { scrType: "pll" } } }
      ),
      "444"
    );
    expect(rows.map((r) => [r._importSessionName, r.event, r._importEventDetected])).toEqual([
      ["OH", "333OH", true],
      ["7", "333", true],
      ["PLL", "444", false],
    ]);
  });
});

describe("chunkImportSolves", () => {
  const solves = (count, note = "") => Array.from({ length: count }, () => ({ scramble: "R U", note }));

  test("caps chunks by count and keeps every solve in order", () => {
    const input = solves(3501);
    const chunks = chunkImportSolves(input);
    expect(chunks.map((c) => c.length)).toEqual([1500, 1500, 501]);
    expect(chunks.flat()).toEqual(input);
  });

  test("makes chunks smaller when notes are long", () => {
    const chunks = chunkImportSolves(solves(1500, "x".repeat(20000)));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const chars = chunk.reduce((n, s) => n + s.note.length, 0);
      expect(chars).toBeLessThanOrEqual(6000000);
    }
  });

  test("still sends a single solve larger than the cap", () => {
    expect(chunkImportSolves(solves(1, "x".repeat(7000000)))).toHaveLength(1);
  });

  test("returns nothing for no solves", () => {
    expect(chunkImportSolves([])).toEqual([]);
  });
});

describe("detectFormat", () => {
  test("recognises a csTimer export", () => {
    expect(detectFormat(csTimer({ session1: [] }))).toBe("cstimer");
    expect(detectFormat(`﻿${csTimer({ session1: [] })}`)).toBe("cstimer");
  });
});

describe("dedupeAndStabilize", () => {
  const parse = (sessions) => parseCsTimer(csTimer(sessions), "333");

  test("sorts by date and drops exact repeats", () => {
    const out = dedupeAndStabilize(
      parse({ session1: [row(2000, 1500000002), row(1000, 1500000001), row(1000, 1500000001)] }),
      "333"
    );
    expect(out.map((s) => s.time)).toEqual([1000, 2000]);
  });

  test("keeps repeats of undated solves, which can't be told apart", () => {
    const out = dedupeAndStabilize(parse({ session1: [[[0, 1000], "R", ""], [[0, 1000], "R", ""]] }), "333");
    expect(out).toHaveLength(2);
  });

  test("gives solves in the same second distinct stamps", () => {
    const out = dedupeAndStabilize(
      parse({ session1: [row(1000, 1500000000), row(1001, 1500000000), row(1002, 1500000000)] }),
      "333"
    );
    expect(new Set(out.map((s) => s.datetime)).size).toBe(3);
  });

  test("stamps don't depend on which other sessions are imported, so re-imports dedupe", () => {
    const session1 = [row(1000, 1500000000)];
    const session2 = [row(2000, 1500000000, 0, "U")];
    const together = dedupeAndStabilize(parse({ session1, session2 }), "333");
    const alone = dedupeAndStabilize(parse({ session2 }), "333");
    expect(together.find((s) => s.time === 2000).datetime).toBe(alone[0].datetime);
  });

  test("sorts a large unsorted import quickly and keeps every solve", () => {
    const solves = Array.from({ length: 200000 }, (_, i) => ({
      time: i,
      scramble: "",
      note: "",
      penalty: null,
      event: "333",
      datetime: new Date(1400000000000 + ((i * 7919) % 200000) * 1000).toISOString(),
    }));
    const startedAt = Date.now();
    const out = dedupeAndStabilize(solves, "333");
    expect(out).toHaveLength(200000);
    expect(out[0].datetime < out[199999].datetime).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
