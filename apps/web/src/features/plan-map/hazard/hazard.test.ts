import { describe, expect, test } from "vitest";
import { callEngine, type EngineInput } from "../../../lib/engine/engine";
import { M_PER_FT } from "../../../lib/geo";
import fixture from "../../../lib/fixtures/hazardView.json";
import { hazardColours, hazardView } from "./hazard";

// The engine's hazard_view as the web's build of it answers the shared
// cases (the facade's hazard_view test reads the same file), and the
// colours the map is given from it.
describe("hazard colouring", () => {
  test.each(fixture.views)("$why", ({ input, expected }) => {
    expect(callEngine("hazard_view", input as unknown as EngineInput<"hazard_view">)).toMatchObject(expected);
  });

  test("the profile's obstacles as the fixture says", () => {
    expect(callEngine("profile_obstacles", fixture.obstacles.input)).toEqual(fixture.obstacles.expected);
  });

  test("a GPS fix in flight is asked for its height, the plan's cruise on the ground", () => {
    expect(hazardView("on", { speedKt: 110, altitudeFt: 8500 }, 9500, null).source).toBe("gps");
    expect(hazardView("on", { speedKt: 0, altitudeFt: 700 }, 9500, null).altitude_ft).toBe(9500);
  });

  test("the ground is clear under the amber line, amber to the red, red over it", () => {
    // After ["interpolate", ["linear"], ["elevation"]]: height, colour, ...
    const stops = hazardColours({ warning_from_ft: 4500, caution_from_ft: 3500 }).slice(3);
    expect(stops[2]).toBeCloseTo(3500 * M_PER_FT - 1);
    expect(stops[3]).toBe("transparent");
    expect(stops[4]).toBeCloseTo(3500 * M_PER_FT);
    expect(stops[8]).toBeCloseTo(4500 * M_PER_FT + 1);
  });
});
