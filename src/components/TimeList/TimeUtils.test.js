import {
  calculateAverage,
  getTrimCountForWindow,
  getTrimmedSideByIndex,
} from "./TimeUtils";

// Times ascending from 10.00s in 100ms steps, so any contiguous trimmed run has an
// easily stated mean.
function ramp(count) {
  return Array.from({ length: count }, (_, i) => 10000 + i * 100);
}

describe("getTrimCountForWindow", () => {
  it("is ceil(5%) per side, never below one", () => {
    expect([3, 5, 12, 25, 50, 100, 1000].map(getTrimCountForWindow)).toEqual([
      1, 1, 1, 2, 3, 5, 50,
    ]);
  });
});

describe("calculateAverage", () => {
  it("keeps Ao5 and Ao12 on the WCA single trim", () => {
    expect(calculateAverage([10000, 11000, 12000, 13000, 50000], true).average).toBe(12000);
    expect(calculateAverage(ramp(12), true).average).toBe(10550);
  });

  it("trims larger windows proportionally", () => {
    expect(calculateAverage(ramp(25), true).average).toBe(11200);
    expect(calculateAverage(ramp(100), true).average).toBe(14950);
  });

  it("absorbs DNFs into the trim, and only DNFs past it", () => {
    expect(calculateAverage([10000, 11000, 12000, 13000, "DNF"], true).average).toBe(12000);
    expect(calculateAverage([10000, 11000, 12000, "DNF", "DNF"], true).average).toBe("DNF");

    const ao100WithFive = [...ramp(95), ...Array(5).fill("DNF")];
    expect(calculateAverage(ao100WithFive, true).average).toBe(14950);

    const ao100WithSix = [...ramp(94), ...Array(6).fill("DNF")];
    expect(calculateAverage(ao100WithSix, true).average).toBe("DNF");
  });

  it("treats a three-solve mean as untrimmed", () => {
    const result = calculateAverage([10000, 11000, 12000], false);
    expect(result.average).toBe(11000);
    expect(result.trimmedIndexes).toEqual({ low: [], high: [] });
  });
});

// The detail popup dashes every discarded solve, so it needs each trimmed position,
// not just the single fastest and slowest.
describe("getTrimmedSideByIndex", () => {
  it("reports one solve per side for an Ao5, at their original positions", () => {
    const sides = getTrimmedSideByIndex(
      calculateAverage([12000, 10000, 50000, 11000, 13000], true)
    );
    expect([...sides].sort()).toEqual([
      [1, "low"],
      [2, "high"],
    ]);
  });

  it("reports two solves per side for an Ao25", () => {
    const sides = getTrimmedSideByIndex(calculateAverage(ramp(25), true));
    expect(sides.size).toBe(4);
    expect([...sides].sort((a, b) => a[0] - b[0])).toEqual([
      [0, "low"],
      [1, "low"],
      [23, "high"],
      [24, "high"],
    ]);
  });

  it("counts a DNF as trimmed from the slow end", () => {
    const sides = getTrimmedSideByIndex(
      calculateAverage([12000, 10000, "DNF", 11000, 13000], true)
    );
    expect(sides.get(2)).toBe("high");
    expect(sides.get(1)).toBe("low");
  });

  it("marks nothing for an untrimmed mean", () => {
    expect(getTrimmedSideByIndex(calculateAverage([10000, 11000, 12000], false)).size).toBe(0);
  });
});
