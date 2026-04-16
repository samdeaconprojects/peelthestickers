describe("GanTimerClient", () => {
  let GanTimerClient;
  let GanTimerState;
  let timerLib;
  let mockGetRecordedTimes;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockGetRecordedTimes = jest.fn(async () => null);

    jest.doMock("gan-web-bluetooth", () => {
      const subscribers = [];

      return {
        __esModule: true,
        GanTimerState: {
          DISCONNECT: 0,
          GET_SET: 1,
          HANDS_OFF: 2,
          RUNNING: 3,
          STOPPED: 4,
          IDLE: 5,
          HANDS_ON: 6,
          FINISHED: 7,
        },
        connectGanTimer: jest.fn(async () => ({
          events$: {
            subscribe: ({ next, error }) => {
              const sub = { next, error };
              subscribers.push(sub);
              return {
                unsubscribe: jest.fn(() => {
                  const idx = subscribers.indexOf(sub);
                  if (idx >= 0) subscribers.splice(idx, 1);
                }),
              };
            },
          },
          disconnect: jest.fn(async () => {}),
          getRecordedTimes: (...args) => mockGetRecordedTimes(...args),
        })),
        __emitTimerEvent: (ev) => {
          subscribers.slice().forEach((sub) => sub.next?.(ev));
        },
        __resetMock: () => {
          subscribers.splice(0, subscribers.length);
        },
      };
    });

    jest.isolateModules(() => {
      ({ GanTimerClient, GanTimerState } = require("./ganTimerClient"));
      timerLib = require("gan-web-bluetooth");
    });
  });

  const flushDisconnectChecks = async (ms = 5000) => {
    if (typeof jest.advanceTimersByTimeAsync === "function") {
      await jest.advanceTimersByTimeAsync(ms);
      return;
    }

    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  };

  afterEach(() => {
    timerLib?.__resetMock?.();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.dontMock("gan-web-bluetooth");
  });

  it("does not disconnect on a transient DISCONNECT state followed by another event", async () => {
    const client = new GanTimerClient();
    const onDisconnect = jest.fn();

    await client.connect({ onDisconnect });

    timerLib.__emitTimerEvent({ state: GanTimerState.DISCONNECT });
    await flushDisconnectChecks(500);
    timerLib.__emitTimerEvent({ state: GanTimerState.HANDS_ON });
    await flushDisconnectChecks();

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("stays connected when the timer is still readable during a false disconnect", async () => {
    const client = new GanTimerClient();
    const onDisconnect = jest.fn();
    mockGetRecordedTimes.mockResolvedValue({ displayTime: "5.00", previousTimes: [] });

    await client.connect({ onDisconnect });

    timerLib.__emitTimerEvent({ state: GanTimerState.DISCONNECT });
    await flushDisconnectChecks(500);
    await flushDisconnectChecks();

    expect(mockGetRecordedTimes).toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
