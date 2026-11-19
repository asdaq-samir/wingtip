// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LiveAge from "./LiveAge";
import { liveAge } from "../lib/kept/liveAge";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = Date.parse("2026-11-17T15:00:00Z");
const MIN = 60_000;

describe("a live figure's age", () => {
  it("is a few characters, stale by the engine's rule for its kind", () => {
    // A METAR counts for the hour after it was observed (weather_in_force,
    // AIM 7-1-28): twelve minutes is fresh, two hours is not.
    expect(liveAge({ product: "metar" }, NOW - 12 * MIN, NOW)).toEqual({ words: "12m", stale: false });
    expect(liveAge({ product: "metar" }, NOW - 125 * MIN, NOW)).toEqual({ words: "2h 5m", stale: true });
    // The plan's winds by kept_age's hour for a plan.
    expect(liveAge({ kept: "plan" }, NOW - 20 * MIN, NOW)?.stale).toBe(false);
    expect(liveAge({ kept: "plan" }, NOW - 3 * 60 * MIN, NOW)?.stale).toBe(true);
    expect(liveAge({ product: "metar" }, NOW - 10_000, NOW)?.words).toBe("now");
    expect(liveAge({ product: "metar" }, null, NOW)).toBeNull();
    // An airplane heard: seconds, stale past the planner's half minute (traffic_fresh).
    expect(liveAge({ traffic: true }, NOW - 12_000, NOW)).toEqual({ words: "12s", stale: false });
    expect(liveAge({ traffic: true }, NOW - 45_000, NOW)).toEqual({ words: "45s", stale: true });
  });

  it("greys when stale and says offline in its row", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<LiveAge at={NOW - 125 * MIN} what={{ product: "metar" }} />);
    const age = screen.getByTestId("live-age");
    expect(age.dataset.stale).toBe("true");
    expect(age.className).toContain("text-muted-foreground");
    expect(age.textContent).toContain("2h 5m · offline");
    expect(age.textContent).toContain("2h 5m old, stale, offline");
  });
});
