// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fix } from "../../lib/map/position/ownShip";
import { SAVE_EVERY_MS, asked, forget, record, recorded } from "./recorder";

const KEY = "wingtip.autolog.track";

function fixAt(at: number): Fix {
  return { at, lat: 43, lon: -89, altitudeFt: 2000, accuracyM: 5, headingDeg: 90, speedKt: 100 } as Fix;
}

/** The points written down in the browser. */
function keptPoints(): number {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { points: unknown[] }).points.length : 0;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  forget();
});
afterEach(() => vi.useRealTimers());

describe("the recorded track", () => {
  it("is written down at most every half minute while it grows, each point recorded at once", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockClear();
    // A minute's fixes, one every five seconds.
    for (let s = 0; s < 60; s += 5) {
      vi.setSystemTime(1_000_000 + s * 1000);
      record(fixAt(1_000_000 + s * 1000));
    }
    expect(recorded.getState().value.points).toHaveLength(12);
    const writes = setItem.mock.calls.filter(([name]) => name === KEY).length;
    expect(writes).toBeLessThanOrEqual(Math.ceil((60 * 1000) / SAVE_EVERY_MS));
    setItem.mockRestore();
  });

  it("is written down whole as the page is put away", () => {
    vi.setSystemTime(2_000_000);
    record(fixAt(2_000_000));
    vi.setSystemTime(2_005_000);
    record(fixAt(2_005_000));
    expect(keptPoints()).toBeLessThan(recorded.getState().value.points.length);
    window.dispatchEvent(new Event("pagehide"));
    expect(keptPoints()).toBe(recorded.getState().value.points.length);
  });

  it("writes an ask and a forget at once", () => {
    vi.setSystemTime(3_000_000);
    record(fixAt(3_000_000));
    asked(42);
    expect(JSON.parse(localStorage.getItem(KEY)!).askedTo).toBe(42);
    forget();
    expect(keptPoints()).toBe(0);
  });
});
