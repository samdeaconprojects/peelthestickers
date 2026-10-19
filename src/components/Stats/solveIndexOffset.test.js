import { computeSolveIndexOffset } from "./solveIndexOffset";

describe("computeSolveIndexOffset", () => {
  it("offsets the loaded window by the older unloaded solves", () => {
    expect(
      computeSolveIndexOffset({ overallStats: { SolveCountTotal: 50000 }, loadedCount: 500 })
    ).toBe(49500);
  });

  it("hides numbers (null) when the cached total is missing, instead of 0", () => {
    // Regression: stats fetch failed/offline → range read "401-500".
    expect(computeSolveIndexOffset({ overallStats: null, loadedCount: 500 })).toBeNull();
    expect(
      computeSolveIndexOffset({ overallStats: { SolveCountTotal: null }, loadedCount: 500 })
    ).toBeNull();
  });

  it("treats a total smaller than the loaded window as stale", () => {
    expect(
      computeSolveIndexOffset({ overallStats: { SolveCountTotal: 100 }, loadedCount: 500 })
    ).toBeNull();
  });

  it("numbers from 1 when everything is loaded, even without a total", () => {
    expect(computeSolveIndexOffset({ overallStats: null, loadedCount: 300, isAllLoaded: true })).toBe(0);
  });

  it("hides numbers for tag filters and keeps raw-range offsets for date filters", () => {
    expect(computeSolveIndexOffset({ hasActiveTagFilter: true })).toBeNull();
    expect(
      computeSolveIndexOffset({ hasActiveDateFilter: true, rawRangeViewActive: true, rawRangeIndexOffset: 1234 })
    ).toBe(1234);
  });
});
