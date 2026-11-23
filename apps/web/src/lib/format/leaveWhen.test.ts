import { describe, expect, it } from "vitest";
import { dayAtNextHour } from "./leaveWhen";

describe("dayAtNextHour", () => {
  it("starts a picked day at the next whole hour", () => {
    const now = new Date(2026, 10, 21, 14, 20);
    expect(dayAtNextHour(new Date(2026, 10, 21), now)).toBe(new Date(2026, 10, 21, 15, 0).toISOString());
    expect(dayAtNextHour(new Date(2026, 10, 24), now)).toBe(new Date(2026, 10, 24, 15, 0).toISOString());
  });

  it("never starts today in the past: after 23:00 it is the next midnight", () => {
    const late = new Date(2026, 10, 21, 23, 20);
    expect(dayAtNextHour(new Date(2026, 10, 21), late)).toBe(new Date(2026, 10, 22, 0, 0).toISOString());
  });
});
