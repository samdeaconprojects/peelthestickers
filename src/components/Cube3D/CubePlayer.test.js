import { buildSchedule } from "./CubePlayer";

// Replay must run at the solve's real pace: each move lands at its recorded
// time, however fast the solver turned, and rotations add no time.
test("schedule keeps recorded times", () => {
  const moves = [
    { text: "y", t: 0, rotation: true },
    { text: "R", t: 0 },
    { text: "U", t: 40 }, // faster than a full animation
    { text: "R'", t: 70 },
    { text: "M", t: 70 }, // simultaneous
    { text: "U2", t: 400 },
    { text: "y'", t: 900, rotation: true },
    { text: "F", t: 900 },
    { text: "F'", t: 2000 },
  ];
  const s = buildSchedule(moves);
  moves.forEach((m, k) => {
    if (!m.rotation) expect(s[k].end).toBe(m.t);
    expect(s[k].d).toBeGreaterThanOrEqual(0);
    expect(s[k].end - s[k].start).toBe(s[k].d);
    if (k) expect(s[k].start).toBeGreaterThanOrEqual(s[k - 1].end);
  });
  expect(s[s.length - 1].end).toBe(2000);
  // The rotation before F plays in the pause, finishing before F starts.
  expect(s[6].end).toBeLessThanOrEqual(s[7].start);
  expect(s[6].start).toBeGreaterThanOrEqual(400);
});
