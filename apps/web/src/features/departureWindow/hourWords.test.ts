import { describe, expect, test } from "vitest";
import { zoneName } from "../../lib/format";
import type { DepartureWindowRun, WindowHour } from "../../lib/api/types";
import { HOUR_FINDING, bestLine, clock, dayOf, hourFigures, hourLabel } from "./hourWords";

// On this device's clock, whatever its zone: 10 November 2026, 04:30, and
// an instant at a local hour of that day (or the next) as an ISO string.
const NOW = new Date(2026, 10, 10, 4, 30);
const at = (hour: number, day = 10) => new Date(2026, 10, day, hour).toISOString();

const hour = (over: Partial<WindowHour> = {}): WindowHour => ({
  depart: at(7),
  verdict: "go",
  reasons: [],
  ete_min: 58,
  fuel_gal: 11.6,
  night: false,
  night_passengers: false,
  margin: 1.2,
  ...over,
});

describe("an hour as the strip writes it", () => {
  test("its clock time and zone on the given clock", () => {
    expect(clock(at(7))).toBe("07:00");
  });

  test("the best window, its first and last departure hours", () => {
    const run: DepartureWindowRun = { start: at(7), last: at(10), hours: 4, margin: 1.2, ete_min: 55, quickest: at(8) };
    const zone = zoneName(new Date(run.start));
    expect(bestLine(run, NOW)).toBe(`Best: 07:00–10:00 ${zone}`);
    expect(bestLine({ ...run, last: run.start, hours: 1 }, NOW)).toBe(`Best: 07:00 ${zone}`);
    // Tomorrow's, named by its day.
    expect(bestLine({ ...run, start: at(7, 11), last: at(8, 11), hours: 2 }, NOW)).toBe(`Best: Wed 07:00–08:00 ${zone}`);
    expect(dayOf(at(23), NOW)).toBeNull();
  });

  test("its time and fuel, or with no airplane that they need one", () => {
    expect(hourFigures(hour(), true)).toBe("ETE 58m · 11.6 gal");
    expect(hourFigures(hour({ ete_min: null, fuel_gal: null }), false)).toBe("ETE and fuel need an airplane");
  });

  test("each verdict a mark of its own shape, and a label that says it in words", () => {
    expect(HOUR_FINDING).toEqual({ go: "ok", caution: "caution", "no-go": "stop", unknown: "unknown" });
    const why = {
      key: "weather" as const,
      label: "Weather",
      tab: "enroute" as const,
      section: "Adverse Conditions",
      finding: "stop" as const,
      detail: "VFR not recommended: KOSH forecast 800 ft overcast, 2 sm",
    };
    expect(hourLabel(hour({ verdict: "no-go", night: true, reasons: [why] }))).toBe(
      "07:00: No-go, at night. VFR not recommended: KOSH forecast 800 ft overcast, 2 sm",
    );
  });
});
