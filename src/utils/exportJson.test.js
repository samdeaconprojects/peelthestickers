import { buildExportJsonParts, serializeSolvesPage } from "./exportJson";
import { detectFormat } from "./importParsers";

describe("export JSON", () => {
  const payload = { format: "pts-export", version: 1, totals: { solves: 3 } };

  test("stores solves oldest first across pages that arrive newest first", () => {
    const solveParts = [
      serializeSolvesPage([{ id: 3 }, { id: 2 }]),
      serializeSolvesPage([{ id: 1 }]),
    ];
    const parsed = JSON.parse(buildExportJsonParts(payload, [{ session: { SessionID: "main" }, solveParts }]).join(""));
    expect(parsed.data.sessions[0].solves.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(parsed.totals.solves).toBe(3);
  });

  test("handles several sessions, including an empty one", () => {
    const parsed = JSON.parse(
      buildExportJsonParts(payload, [
        { session: { SessionID: "a" }, solveParts: [] },
        { session: { SessionID: "b" }, solveParts: [serializeSolvesPage([{ id: 1 }])] },
      ]).join("")
    );
    expect(parsed.data.sessions.map((s) => s.solves.length)).toEqual([0, 1]);
  });

  test("handles an export with no sessions", () => {
    expect(JSON.parse(buildExportJsonParts(payload, []).join("")).data.sessions).toEqual([]);
  });

  test("applies the item mapper", () => {
    expect(JSON.parse(`[${serializeSolvesPage([{ id: 1, PK: "x" }], ({ PK, ...rest }) => rest)}]`)).toEqual([{ id: 1 }]);
  });

  test("the importer recognises the file", () => {
    const text = buildExportJsonParts(payload, [{ session: { SessionID: "main" }, solveParts: [] }]).join("");
    expect(detectFormat(text)).toBe("pts-export");
  });
});
