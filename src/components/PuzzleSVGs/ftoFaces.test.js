import { getFTOFaces, parseFTOMove, FTO_FACE_NAMES } from "./ftoFaces";

const SOLVED = FTO_FACE_NAMES.map((c) => Array(9).fill(c));
const MOVES = ["U", "D", "R", "L", "F", "B", "BR", "BL"];

function invert(alg) {
  return alg
    .trim()
    .split(/\s+/)
    .reverse()
    .map((m) => (m.endsWith("'") ? m.slice(0, -1) : `${m}'`))
    .join(" ");
}

describe("ftoFaces", () => {
  test("parses two-letter faces before one-letter ones", () => {
    expect(parseFTOMove("BL'")).toEqual({ face: "BL", prime: true });
    expect(parseFTOMove("BR")).toEqual({ face: "BR", prime: false });
    expect(parseFTOMove("B'")).toEqual({ face: "B", prime: true });
    expect(parseFTOMove("U2")).toEqual({ face: "U", prime: true });
    expect(parseFTOMove("x")).toBeNull();
  });

  test.each(MOVES)("%s has order 3 and X X' is identity", (m) => {
    expect(getFTOFaces(`${m} ${m} ${m}`)).toEqual(SOLVED);
    expect(getFTOFaces(`${m} ${m}'`)).toEqual(SOLVED);
    expect(getFTOFaces(m)).not.toEqual(SOLVED);
  });

  test("a scramble followed by its inverse is solved", () => {
    const scramble =
      "D L' B' D B' D' B' BL' B L' R BL B' R' B BL B' D B F BL' B U' L BL U";
    expect(getFTOFaces(`${scramble} ${invert(scramble)}`)).toEqual(SOLVED);
  });

  test("every move keeps 9 stickers of each colour", () => {
    const faces = getFTOFaces("U R' BL F D' B BR L' U' BL");
    const counts = {};
    faces.flat().forEach((c) => (counts[c] = (counts[c] || 0) + 1));
    FTO_FACE_NAMES.forEach((c) => expect(counts[c]).toBe(9));
  });
});
