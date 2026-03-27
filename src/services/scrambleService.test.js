import {
  clearScrambleQueue,
  getScrambleQueueSnapshot,
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
});
