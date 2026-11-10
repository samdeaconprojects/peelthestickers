import { apiGet } from "./api.js";
import { forEachSolvesPage, getSolvesBySession } from "./getSolvesBySession";
import { getLastNSolvesScoped } from "./getSolvesScoped";

jest.mock("./api.js", () => ({ apiGet: jest.fn() }));

// Serves `pages` pages of solves newest first, one solve per page, using the
// page number as the cursor. The URL also carries a per-test tag via the user ID.
const servePages = (pages, itemsForPage = (page) => [{ id: pages - page }]) => {
  apiGet.mockImplementation(async (path) => {
    const cursor = new URLSearchParams(path.split("?")[1]).get("cursor");
    const page = cursor ? JSON.parse(cursor).page : 0;
    return {
      items: itemsForPage(page),
      lastKey: page + 1 < pages ? { page: page + 1 } : null,
    };
  });
};

let testUser = 0;
const nextUser = () => {
  testUser += 1;
  return `user${testUser}`;
};

beforeEach(() => apiGet.mockReset());

describe("getSolvesBySession", () => {
  test("loads a session longer than the old 100 page limit, oldest first", async () => {
    servePages(250);
    const items = await getSolvesBySession(nextUser(), "333", "main");
    expect(items).toHaveLength(250);
    expect(items[0].id).toBe(1);
    expect(items[249].id).toBe(250);
  });

  test("fails instead of returning part of a session when the cursor repeats", async () => {
    apiGet.mockResolvedValue({ items: [{ id: 1 }], lastKey: { page: 1 } });
    await expect(getSolvesBySession(nextUser(), "333", "main")).rejects.toThrow("repeated cursor");
  });
});

describe("forEachSolvesPage", () => {
  test("hands over every page in the order it arrives", async () => {
    servePages(3);
    const seen = [];
    await forEachSolvesPage(nextUser(), "333", "main", (items) => seen.push(items[0].id));
    expect(seen).toEqual([3, 2, 1]);
  });

  test("stops with the error when a page handler fails", async () => {
    servePages(3);
    await expect(
      forEachSolvesPage(nextUser(), "333", "main", () => {
        throw new Error("no space");
      })
    ).rejects.toThrow("no space");
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});

describe("getLastNSolvesScoped", () => {
  test("keeps paging past the old 50 page limit to find solves under a sparse filter", async () => {
    servePages(120, (page) => (page === 119 ? [{ id: "old main" }] : []));
    const items = await getLastNSolvesScoped(nextUser(), { n: 100, sessionsMode: "main" });
    expect(items).toEqual([{ id: "old main" }]);
    expect(apiGet).toHaveBeenCalledTimes(120);
  });

  test("stops scanning once the caller has moved on", async () => {
    servePages(120, () => []);
    let calls = 0;
    await getLastNSolvesScoped(nextUser(), {
      n: 100,
      isCancelled: () => {
        calls += 1;
        return calls >= 3;
      },
    });
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  test("returns the newest n, oldest first, without reading further", async () => {
    servePages(10, (page) => [{ id: 10 - page }]);
    const items = await getLastNSolvesScoped(nextUser(), { n: 2 });
    expect(items.map((s) => s.id)).toEqual([9, 10]);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  test("fails instead of returning a partial list when the cursor repeats", async () => {
    apiGet.mockResolvedValue({ items: [], lastKey: { page: 1 } });
    await expect(getLastNSolvesScoped(nextUser(), { n: 5 })).rejects.toThrow("repeated cursor");
  });
});
