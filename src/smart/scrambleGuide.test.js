import { createScrambleGuide, pushSimplified } from "./scrambleGuide";
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
