import { describe, expect, test } from "vitest";
import fixture from "./fixtures/flightRules.json";
import { callEngine } from "./engine/engine";

// The engine's wind triangle, as the web asks it, held to the fixture the
// engine (engine/facade), the planner and the iOS app are held to.
describe("the shared flight rules", () => {
  test.each(fixture.windTriangle)("the wind triangle at $tc° with $windKt kt from $windFrom°", (c) => {
    const got = callEngine("wind_triangle", { tc: c.tc, tas: c.tas, wind_from_deg: c.windFrom, wind_kt: c.windKt });
    if (c.expected === null) {
      expect(got).toBeNull();
      return;
    }
    expect(got!.wca).toBeCloseTo(c.expected.wca, 9);
    expect(got!.th).toBeCloseTo(c.expected.th, 9);
    expect(got!.gs).toBeCloseTo(c.expected.gs, 9);
  });

  // When a report stops counting, asked of the engine as Observed and the
  // plan's winds ask it.
  test.each(fixture.weatherInForce)("weather in force: $why", (c) => {
    const at = (k: string) => ((c as Record<string, unknown>)[k] as number | undefined) ?? null;
    expect(
      callEngine("weather_in_force", {
        product: c.product as "metar" | "speci" | "taf" | "winds" | "advisory",
        now: c.now,
        observed: at("observed"),
        last_routine: at("lastRoutine"),
        valid_from: at("validFrom"),
        valid_to: at("validTo"),
      }),
    ).toBe(c.inForce);
  });
});
