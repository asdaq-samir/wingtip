import { describe, expect, it } from "vitest";
import fixture from "../fixtures/timeAgo.json";
import { ago, clockAndZulu, clockTime, duration, durationByHand, hm, instantOf, stopwatch, zoneName } from "./time";

describe("a time en route as a paper nav log writes it", () => {
  it("pads the minutes, rounded first", () => {
    expect(hm(18)).toBe("0:18");
    expect(hm(95)).toBe("1:35");
    // 119.6 minutes is two hours: rounded on its own, the remainder read "1:60".
    expect(hm(119.6)).toBe("2:00");
  });
});

describe("a duration", () => {
  it("is Intl.DurationFormat's narrow style", () => {
    expect(duration(65)).toBe("1h 5m");
    expect(duration(45)).toBe("45m");
    expect(duration(180)).toBe("3h");
    expect(duration(0)).toBe("0m");
  });
  it("carries a rounded-up minute into the hour", () => {
    expect(duration(179.6)).toBe("3h");
    expect(duration(59.6)).toBe("1h");
  });
  it("writes by hand what the browser's formatter writes", () => {
    for (const minutes of [7, 45, 60, 65, 125, 179.6, 1500]) {
      const t = { hours: Math.floor(Math.round(minutes) / 60), minutes: Math.round(minutes) % 60 };
      expect(durationByHand(t)).toBe(duration(minutes));
    }
  });
});

describe("how long ago", () => {
  it("is a duration with ago, just now under a minute", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(-5_000)).toBe("just now");
    expect(ago(23 * 60_000 + 40_000)).toBe("23m ago");
    expect(ago(125 * 60_000)).toBe("2h 5m ago");
  });

  it.each(fixture.cases)("is the engine's time_ago, as both phones write it: $why", (c) => {
    expect(ago(c.input.seconds * 1000)).toBe(c.expected);
  });

  it("writes a stopwatch's minutes and seconds, the one helper the timers and the approach brief share", () => {
    expect(stopwatch(0)).toBe("0:00");
    expect(stopwatch(127)).toBe("2:07");
    expect(stopwatch(125.4)).toBe("2:05");
    expect(stopwatch(-3)).toBe("0:00");
    expect(stopwatch(3600)).toBe("60:00");
  });
});

describe("a feed's time", () => {
  it("reads one with no zone as UTC, and nothing from one that does not read", () => {
    expect(instantOf("2026-11-21T14:00:00")).toBe(Date.UTC(2026, 10, 21, 14));
    expect(instantOf("2026-11-21T14:00:00Z")).toBe(Date.UTC(2026, 10, 21, 14));
    expect(instantOf("2026-11-21T08:00:00-06:00")).toBe(Date.UTC(2026, 10, 21, 14));
    expect(instantOf("PERM")).toBeNull();
    expect(instantOf(null)).toBeNull();
  });

  it("writes a product's time with its zone and UTC beside it", () => {
    const at = new Date(Date.UTC(2026, 10, 21, 21));
    expect(clockAndZulu(at)).toBe(`${clockTime(at)} ${zoneName(at)} (2100Z)`);
  });
});
