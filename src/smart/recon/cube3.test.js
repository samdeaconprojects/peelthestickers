import { SOLVED, applyAlg, applyMove, invertAlg, isSolved, faceMapForRotation, rotationBringing } from "./cube3";
import { CubieCube, moveTokenToIndex } from "../cubieCube";

function cubieApply(tokens) {
  let a = new CubieCube();
  let b = new CubieCube();
  for (const t of tokens) {
    CubieCube.CubeMult(a, CubieCube.moveCube[moveTokenToIndex(t)], b);
    [a, b] = [b, a];
  }
  return a.toFaceCube();
}

test("face turns match the min2phase cubie model", () => {
  const faces = "URFDLB";
  for (const f of faces) {
    for (const suf of ["", "2", "'"]) {
      expect(applyMove(SOLVED, f + suf)).toBe(cubieApply([f + suf]));
    }
  }
  const seq = "R U R' F2 D L' B U2 F' D2 L B' R2 U'".split(" ");
  expect(applyAlg(SOLVED, seq)).toBe(cubieApply(seq));
});

test("identities: wide, slice and rotation moves", () => {
  // x = R M' L'
  expect(applyAlg(SOLVED, "x")).toBe(applyAlg(SOLVED, "R M' L'"));
  expect(applyAlg(SOLVED, "y")).toBe(applyAlg(SOLVED, "U E' D'"));
  expect(applyAlg(SOLVED, "z")).toBe(applyAlg(SOLVED, "F S B'"));
  expect(applyAlg(SOLVED, "r")).toBe(applyAlg(SOLVED, "R M'"));
  expect(applyAlg(SOLVED, "Rw")).toBe(applyAlg(SOLVED, "r"));
  expect(applyAlg(SOLVED, "u")).toBe(applyAlg(SOLVED, "U E'"));
  expect(applyAlg(SOLVED, "f")).toBe(applyAlg(SOLVED, "F S"));
  // sexy move has order 6
  expect(isSolved(applyAlg(SOLVED, "R U R' U' ".repeat(6)))).toBe(true);
  const a = "R U2 r' F M2 S E' x y' z2 l b' d";
  expect(isSolved(applyAlg(applyAlg(SOLVED, a), invertAlg(a)))).toBe(true);
  // rotated solved cube is still solved
  expect(isSolved(applyAlg(SOLVED, "x y2"))).toBe(true);
});

test("rotation face maps", () => {
  expect(faceMapForRotation("z2")).toMatchObject({ U: "D", D: "U", R: "L", L: "R", F: "F" });
  expect(faceMapForRotation("x")).toMatchObject({ F: "U", U: "B", D: "F", R: "R" });
  expect(rotationBringing("U", "D", "F", "F")).toBe("z2");
  expect(rotationBringing("D", "D")).toBe("");
});

test("24 orientations", () => {
  const { allOrientations } = require("./cube3");
  expect(allOrientations()).toHaveLength(24);
});
