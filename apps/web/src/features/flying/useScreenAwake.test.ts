// @vitest-environment jsdom
/**
 * The screen kept on in flying mode (useScreenAwake): the lock taken as
 * flying mode comes on, taken again as the page comes back into sight,
 * and let go with flying mode.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useScreenAwake } from "./useScreenAwake";

function fakeLocks() {
  const locks: { released: boolean; release: () => Promise<void> }[] = [];
  const request = vi.fn(() => {
    const lock = {
      released: false,
      release: vi.fn(() => {
        lock.released = true;
        return Promise.resolve();
      }),
    };
    locks.push(lock);
    return Promise.resolve(lock);
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { locks, request };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useScreenAwake", () => {
  test("takes the screen lock while on, again on coming back, and lets it go when off", async () => {
    const { locks, request } = fakeLocks();
    const { rerender } = renderHook(({ on }) => useScreenAwake(on), { initialProps: { on: false } });
    expect(request).not.toHaveBeenCalled();
    rerender({ on: true });
    await act(async () => undefined);
    expect(request).toHaveBeenCalledWith("screen");
    // Hidden, the browser let it go; back in sight, it is taken again.
    locks[0]!.released = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => undefined);
    expect(request).toHaveBeenCalledTimes(2);
    rerender({ on: false });
    expect(locks[1]!.release).toHaveBeenCalled();
  });
});
