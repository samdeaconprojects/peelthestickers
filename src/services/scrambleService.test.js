import {
  clearScrambleQueue,
  getScrambleQueueSnapshot,
  insertScramble,
  prependScramble,
  replaceHeadScramble,
  setGlobalScrambleMode,
  warmScrambleQueue,
} from "./scrambleService";

jest.mock("cubing/scramble", () => ({
  randomScrambleForEvent: jest.fn(),
}), { virtual: true });

jest.mock("../components/scrambleUtils", () => ({
  generateScramble: jest.fn(() => "legacy-scramble"),
}));

const { randomScrambleForEvent } = require("cubing/scramble");

describe("scrambleService history navigation", () => {
  let scrambleCounter = 0;

  beforeEach(() => {
    scrambleCounter = 0;
    randomScrambleForEvent.mockImplementation(async () => `scramble-${++scrambleCounter}`);
    setGlobalScrambleMode("random-state");
    clearScrambleQueue();
  });

  it("restores the previous scramble when navigating back", async () => {
    await warmScrambleQueue("333", 3);

    const initial = getScrambleQueueSnapshot("333");
    await replaceHeadScramble("333");
    const afterForward = getScrambleQueueSnapshot("333");

    await prependScramble("333");
    const afterBack = getScrambleQueueSnapshot("333");

    await replaceHeadScramble("333");
    const afterForwardAgain = getScrambleQueueSnapshot("333");

    expect(afterForward[0]).not.toBe(initial[0]);
    expect(afterBack[0]).toBe(initial[0]);
    expect(afterForwardAgain[0]).toBe(afterForward[0]);
  });

  it("does not invent a new scramble when already at the oldest visible entry", async () => {
    await warmScrambleQueue("333", 2);
    const initial = getScrambleQueueSnapshot("333");

    await prependScramble("333");
    const afterBackAtStart = getScrambleQueueSnapshot("333");

    expect(afterBackAtStart[0]).toBe(initial[0]);
  });

  it("inserts a custom scramble as the next one and keeps arrow history", async () => {
    await warmScrambleQueue("333", 3);
    await replaceHeadScramble("333");
    const before = getScrambleQueueSnapshot("333");

    const { queue } = insertScramble("333", "  R U R' U'  ");
    expect(queue[0]).toBe("R U R' U'");
    expect(queue[1]).toBe(before[0]);
    expect(queue.length).toBe(before.length + 1);

    // Forward goes to the scramble that was showing before the insert.
    await replaceHeadScramble("333");
    expect(getScrambleQueueSnapshot("333")[0]).toBe(before[0]);

    // Back returns to the custom one, and back again to the older history.
    await prependScramble("333");
    expect(getScrambleQueueSnapshot("333")[0]).toBe("R U R' U'");
    await prependScramble("333");
    expect(getScrambleQueueSnapshot("333")[0]).toBe("scramble-1");
  });

  it("keeps an inserted scramble when a refill finishes afterwards", async () => {
    await warmScrambleQueue("333", 1);
    const warming = warmScrambleQueue("333", 4);
    insertScramble("333", "F2 B2");
    await warming;

    expect(getScrambleQueueSnapshot("333")[0]).toBe("F2 B2");
  });
});
