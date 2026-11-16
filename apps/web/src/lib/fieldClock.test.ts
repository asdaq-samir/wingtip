import { describe, expect, it } from "vitest";
import { fieldClock } from "./fieldClock";

describe("fieldClock", () => {
  it("reads a field's clock in its own zone, standard time and daylight saving time", () => {
    // Noon CST on Saturday 14 Nov 2026 is 18:00Z.
    expect(fieldClock("America/Chicago", new Date("2026-11-14T18:00:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 14,
      weekday: 5,
      minute: 720,
      utcOffsetMin: -360,
      dst: false,
    });
    const july = fieldClock("America/Chicago", new Date("2026-07-06T03:30:00Z"))!;
    expect([july.day, july.weekday, july.minute, july.utcOffsetMin, july.dst]).toEqual([5, 6, 1350, -300, true]);
    // Arizona keeps no daylight saving time.
    expect(fieldClock("America/Phoenix", new Date("2026-07-06T18:00:00Z"))?.dst).toBe(false);
  });
  it("is null with no zone, or one the platform does not know", () => {
    expect(fieldClock(null, new Date())).toBeNull();
    expect(fieldClock("Mars/Olympus_Mons", new Date())).toBeNull();
  });
});
