import { describe, expect, test } from "vitest";
import { callEngine, type EngineInput } from "../../lib/engine/engine";
import type { DepartureWindowRun, WindowHour } from "../../lib/api/types";
import fixture from "../../lib/fixtures/departureWindow.json";
import { HOUR_FINDING, bestLine, clock, dayOf, hourFigures, hourLabel } from "./hourWords";

const ZONE = "America/Chicago";
// 10 November 2026, 04:30 CST.
const NOW = new Date("2026-11-10T10:30:00Z");

const hour = (over: Partial<WindowHour> = {}): WindowHour => ({
  depart: "2026-11-10T13:00:00Z",
  verdict: "go",
  reasons: [],
  ete_min: 58,
  fuel_gal: 11.6,
  night: false,
  night_passengers: false,
  margin: 1.2,
  ...over,
});

// The engine's rule as the web's build of it answers the shared cases
// (engine/facade/tests/departure_window.rs), the planner asking the same.
describe("the engine's departure_window", () => {
  test.each(fixture.cases)("$name", ({ input, answer }) => {
    expect(callEngine("departure_window", input as unknown as EngineInput<"departure_window">)).toEqual(answer);
  });
});

describe("an hour as the strip writes it", () => {
  test("its clock time and zone on the given clock", () => {
    expect(clock("2026-11-10T13:00:00Z", ZONE)).toBe("07:00");
  });

  test("the best window, its first and last departure hours", () => {
    const run: DepartureWindowRun = {
      start: "2026-11-10T13:00:00Z",
      last: "2026-11-10T16:00:00Z",
      hours: 4,
      margin: 1.2,
      ete_min: 55,
      quickest: "2026-11-10T14:00:00Z",
    };
    expect(bestLine(run, NOW, ZONE)).toBe("Best: 07:00–10:00 CST");
    expect(bestLine({ ...run, last: run.start, hours: 1 }, NOW, ZONE)).toBe("Best: 07:00 CST");
    // Tomorrow's, named by its day.
    expect(bestLine({ ...run, start: "2026-11-11T13:00:00Z", last: "2026-11-11T14:00:00Z", hours: 2 }, NOW, ZONE)).toBe(
      "Best: Wed 07:00–08:00 CST",
    );
    expect(dayOf("2026-11-10T23:00:00Z", NOW, ZONE)).toBeNull();
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
    expect(hourLabel(hour({ verdict: "no-go", night: true, reasons: [why] }), ZONE)).toBe(
      "07:00: No-go, at night. VFR not recommended: KOSH forecast 800 ft overcast, 2 sm",
    );
  });
});
