import { CubieCube, SOLVED_FACELET, moveTokenToIndex } from "./cubieCube";

function applySequence(tokens) {
  let prev = new CubieCube();
  let cur = new CubieCube();
  for (const t of tokens) {
    CubieCube.CubeMult(prev, CubieCube.moveCube[moveTokenToIndex(t)], cur);
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev.toFaceCube();
}

describe("CubieCube", () => {
  it("starts solved", () => {
    expect(new CubieCube().toFaceCube()).toBe(SOLVED_FACELET);
  });

  it("returns to solved after (R U R' U') x6", () => {
    const seq = [];
    for (let i = 0; i < 6; i++) seq.push("R", "U", "R'", "U'");
    expect(applySequence(seq)).toBe(SOLVED_FACELET);
  });

  it("a move then its inverse is identity", () => {
    for (const [m, inv] of [
      ["R", "R'"],
      ["U", "U'"],
      ["F", "F'"],
      ["D", "D'"],
      ["L", "L'"],
      ["B", "B'"],
    ]) {
      expect(applySequence([m, inv])).toBe(SOLVED_FACELET);
    }
  });

  it("round-trips through fromFacelet / toFaceCube", () => {
    const scrambled = applySequence(["R", "U", "F", "L", "D", "B", "R", "U"]);
    const cc = new CubieCube().fromFacelet(scrambled);
    expect(cc).not.toBe(-1);
    expect(cc.toFaceCube()).toBe(scrambled);
  });

  it("maps move tokens to indices", () => {
    expect(moveTokenToIndex("U")).toBe(0);
    expect(moveTokenToIndex("U'")).toBe(2);
    expect(moveTokenToIndex("R")).toBe(3);
    expect(moveTokenToIndex("B'")).toBe(17);
  });
});
