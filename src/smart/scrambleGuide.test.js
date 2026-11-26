import { createScrambleGuide, nextFixDisplay, pushSimplified } from "./scrambleGuide";
import { SOLVED, applyAlg, formatToken } from "./recon/cube3";

const feed = (guide, alg) => {
  let snap = guide.snapshot();
  for (const m of alg.split(" ").filter(Boolean)) snap = guide.onMove(m);
  return snap;
};

const simplify = (alg) =>
  alg
    .split(" ")
    .reduce((l, m) => pushSimplified(l, m), [])
    .map((m) => formatToken(m.base, m.amount))
    .join(" ");

test("simplifies detours", () => {
  expect(simplify("R R")).toBe("R2");
  expect(simplify("R R'")).toBe("");
  expect(simplify("R L R'")).toBe("L");
  expect(simplify("R U R'")).toBe("R U R'");
});

test("follows a clean scramble, doubles in either direction", () => {
  const g = createScrambleGuide("R U2 F'");
  expect(g.total).toBe(4);
  expect(feed(g, "R").progress).toBe(1);
  expect(feed(g, "U'").progress).toBe(2); // half of U2, other way round
  expect(feed(g, "U'").progress).toBe(3);
  const end = feed(g, "F'");
  expect(end).toMatchObject({ progress: 4, complete: true, fix: [] });
});

test("a wrong turn gives the fix, and doing it gets back on track", () => {
  const g = createScrambleGuide("R U F D");
  feed(g, "R U");
  let snap = g.onMove("B"); // should have been F
  expect(snap).toMatchObject({ progress: 2, offTrack: true, fix: ["B'"] });
  snap = g.onMove("L'");
  expect(snap.fix).toEqual(["L", "B'"]);
  snap = feed(g, "L B'");
  expect(snap).toMatchObject({ progress: 2, offTrack: false, fix: [] });
  expect(feed(g, "F D").complete).toBe(true);
});

test("turning the wrong way: fix then carry on", () => {
  const g = createScrambleGuide("R U");
  const snap = g.onMove("R'");
  expect(snap.fix).toEqual(["R"]);
  // R (fix) then R (scramble) reaches progress 1 — the guide sees it by state.
  expect(feed(g, "R2").progress).toBe(1);
});

test("starting from a non-solved state", () => {
  const start = applyAlg(SOLVED, "F R");
  const g = createScrambleGuide("U D", start);
  expect(feed(g, "U D").complete).toBe(true);
});

test("a stray turn that commutes with the next move doesn't undo good moves", () => {
  const g = createScrambleGuide("R2 U F");
  let snap = g.onMove("L"); // wrong: should have been R2
  expect(snap.fix).toEqual(["L'"]);
  snap = feed(g, "R R"); // carries on with R2 anyway
  expect(snap).toMatchObject({ progress: 2, fix: ["L'"] });
  snap = g.onMove("L'");
  expect(snap).toMatchObject({ progress: 2, offTrack: false });
  expect(feed(g, "U F").complete).toBe(true);
});

test("a wrong turn halfway through a double: the fix finishes the double", () => {
  const g = createScrambleGuide("R U2 F D");
  let snap = feed(g, "R U B"); // one U of U2, then a stray B
  // Not "B'" alone: that leaves the cube halfway through U2 while the display
  // shows a whole U2 to do, and doing it lands halfway the other way.
  expect(snap).toMatchObject({ progress: 3, fix: ["B'", "U"] });
  expect(nextFixDisplay(nextFixDisplay(null, ["B'", "U"]), ["U"])).toEqual({
    moves: ["B'", "U"],
    done: 1,
  });
  snap = feed(g, "B' U");
  expect(snap).toMatchObject({ progress: 3, offTrack: false, fix: [] });
  expect(g.onMove("F")).toMatchObject({ progress: 4, fix: [] });
  expect(feed(g, "D").complete).toBe(true);
});

test("back halfway through a double some other way asks for the last quarter", () => {
  const g = createScrambleGuide("R U2 F");
  const snap = feed(g, "R U' B B'"); // undid the stray B without the fix
  expect(snap).toMatchObject({ progress: 3, fix: ["U'"] });
  expect(g.onMove("U'")).toMatchObject({ progress: 3, fix: [] });
});

test("turning back from the end of a double asks to finish it again", () => {
  const g = createScrambleGuide("R U2 F");
  feed(g, "R U2");
  expect(g.onMove("U'")).toMatchObject({ progress: 3, fix: ["U"] });
});

test("halfway through a double by turning it is still just progress", () => {
  const g = createScrambleGuide("R U2 F");
  expect(feed(g, "R U")).toMatchObject({ progress: 2, fix: [] });
});

test("fix display keeps done moves until back on track", () => {
  let d = nextFixDisplay(null, ["L'", "U", "R"]);
  expect(d).toEqual({ moves: ["L'", "U", "R"], done: 0 });
  d = nextFixDisplay(d, ["U", "R"]);
  expect(d).toEqual({ moves: ["L'", "U", "R"], done: 1 });
  d = nextFixDisplay(d, ["R"]);
  expect(d).toEqual({ moves: ["L'", "U", "R"], done: 2 });
  d = nextFixDisplay(d, []);
  expect(d).toEqual({ moves: [], done: 0 });
});

test("fix display: half a double keeps the double, a new wrong turn restarts", () => {
  let d = nextFixDisplay(null, ["R2", "U"]);
  d = nextFixDisplay(d, ["R", "U"]);
  expect(d).toEqual({ moves: ["R2", "U"], done: 0 });
  d = nextFixDisplay(d, ["U"]);
  expect(d).toEqual({ moves: ["R2", "U"], done: 1 });
  d = nextFixDisplay(d, ["F", "U"]);
  expect(d).toEqual({ moves: ["F", "U"], done: 0 });
});
