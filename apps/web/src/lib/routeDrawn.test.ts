import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fresh module each test: the gate opens once a page. */
const fresh = async () => {
  vi.resetModules();
  return import("./routeDrawn");
};

describe("afterRouteDrawn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for the route to draw, then its own moment", async () => {
    const { afterRouteDrawn, markRouteDrawn } = await fresh();
    const go = vi.fn();
    afterRouteDrawn(go, 2000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(go).not.toHaveBeenCalled();
    markRouteDrawn();
    await vi.advanceTimersByTimeAsync(1999);
    expect(go).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(go).toHaveBeenCalledOnce();
  });

  it("is called off by what it gives back, before or after the route draws", async () => {
    const { afterRouteDrawn, markRouteDrawn } = await fresh();
    const before = vi.fn();
    const after = vi.fn();
    afterRouteDrawn(before, 100)();
    const off = afterRouteDrawn(after, 100);
    markRouteDrawn();
    await vi.advanceTimersByTimeAsync(50);
    off();
    await vi.advanceTimersByTimeAsync(100);
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("opens by itself 15 s on, where no plan ever comes", async () => {
    const { afterRouteDrawn } = await fresh();
    const go = vi.fn();
    afterRouteDrawn(go, 0);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(go).not.toHaveBeenCalled();
    // Opened at 15 s, and its own moment (none) a turn of the timers after.
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(go).toHaveBeenCalledOnce();
  });
});
