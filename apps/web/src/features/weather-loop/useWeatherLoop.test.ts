import { afterEach, describe, expect, it, vi } from "vitest";
import { setLoopReady, usePlayer } from "./useWeatherLoop";

describe("setLoopReady", () => {
  afterEach(() => usePlayer.setState({ ready: false }));

  it("tells the loop's readers once, not at every tile the map loads", () => {
    const heard = vi.fn();
    const stop = usePlayer.subscribe(heard);
    // The map's sourcedata and idle: many, all saying the same.
    for (let i = 0; i < 20; i++) setLoopReady(true);
    stop();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState().ready).toBe(true);
  });

  it("still says a new pick is loading again", () => {
    setLoopReady(true);
    setLoopReady(false);
    expect(usePlayer.getState().ready).toBe(false);
  });
});
