import { createCachedRequestLoader } from "./requestCache";

describe("createCachedRequestLoader", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("serves a repeat request from the cache, then reloads after it expires", async () => {
    const load = jest.fn(async (arg) => arg);
    const loader = createCachedRequestLoader(load, { cacheMs: 1000 });

    await loader.run("a", { loadArg: 1 });
    await loader.run("a", { loadArg: 1 });
    expect(load).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1002);
    await loader.run("a", { loadArg: 1 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("releases a response whose key is never requested again", async () => {
    const loader = createCachedRequestLoader(async () => "value", { cacheMs: 1000 });

    await loader.run("page-1");
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(1002);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("an expired timer doesn't evict a newer entry for the same key", async () => {
    const load = jest.fn(async () => "value");
    const loader = createCachedRequestLoader(load, { cacheMs: 1000 });

    await loader.run("a");
    jest.advanceTimersByTime(500);
    await loader.run("a", { force: true });
    jest.advanceTimersByTime(600);
    await loader.run("a");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
