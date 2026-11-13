import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/modelWeather.json";
import { callEngine } from "../../lib/engine/engine";

/** The engine's answer for a fixture case, by the rules the web asks;
 *  precip_dbz is the weather service's alone, so not in the web's module. */
function ask(rule: string, input: Record<string, unknown>): unknown {
  if (rule === "precip_intensity") return callEngine("precip_intensity", input as { dbz: number; temp_c?: number | null });
  if (rule === "cloud_cover") return callEngine("cloud_cover", input as { percent: number });
  if (rule === "cape_category") return callEngine("cape_category", input as { j_kg: number });
  if (rule === "sun_down") return callEngine("sun_down", input as { lat: number; lon: number; at_s: number });
  if (rule === "compass_point") return callEngine("compass_point", input as { bearing_deg: number });
  return undefined;
}

describe("the model weather in a pilot's words, the engine's (modelWeather.json)", () => {
  test.each(fixture.cases.filter((c) => c.rule !== "precip_dbz"))("$why", (c) => {
    expect(ask(c.rule, c.input)).toEqual(c.expected);
  });
});
