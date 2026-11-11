import { describe, expect, it } from "vitest";
import recordsFixture from "../../lib/fixtures/records.json";
import { daysBetween, daysWords, dueFinding, dueTitle, whenWords } from "./paperwork";

describe("the paperwork list's words", () => {
  it("counts days on the calendar, across a month's end and a clock change", () => {
    expect(daysBetween("2026-11-08", "2026-11-30")).toBe(22);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-08", "2026-11-05")).toBe(-3);
  });

  it("says when, by the day where there is one, else by the hours", () => {
    expect(daysWords(0)).toBe("Today");
    expect(daysWords(1)).toBe("Tomorrow");
    expect(daysWords(22)).toBe("In 22 days");
    expect(daysWords(-3)).toBe("3 days past");
    expect(whenWords({ daysLeft: null, dueAtHours: 2350, hoursLeft: 19.5 })).toBe("19.5 h to go");
    expect(whenWords({ daysLeft: null, dueAtHours: 2350, hoursLeft: -0.4 })).toBe("Due now");
    expect(whenWords({ daysLeft: null, dueAtHours: 2350, hoursLeft: null })).toBe("At 2350.0 h");
  });

  it.each(recordsFixture.dueTone)("is the engine's tone: $days_left days, $hours_left h, $tone", ({ days_left, hours_left, tone }) => {
    expect(dueFinding({ daysLeft: days_left, hoursLeft: hours_left })).toBe(tone);
  });

  it("puts the airplane's tail before its own items", () => {
    expect(dueTitle({ title: "Annual inspection", tailNumber: "N12345" })).toBe("N12345 · Annual inspection");
    expect(dueTitle({ title: "Flight review", tailNumber: null })).toBe("Flight review");
  });
});
