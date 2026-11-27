import { describe, expect, test } from "vitest";
import fixture from "./fixtures/flightRules.json";
import { callEngine } from "./engine/engine";

// The engine's flight rules the web asks, held to the fixture the engine
// (engine/facade), the planner and the iOS app are held to. The wind
// triangle is the engine's own test's (facade/tests/contract/
// flight_rules_cases.rs): the web asks it no more, and its module is
// built without it.
describe("the shared flight rules", () => {
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
