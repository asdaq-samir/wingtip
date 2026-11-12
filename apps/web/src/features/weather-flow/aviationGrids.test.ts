import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/aviationGrids.json";
import { callEngine } from "../../lib/engine/engine";

/** The engine's answer for a fixture case, by the rules the web asks;
 *  gfa_cloud_layers is the weather service's alone, so not in the web's module. */
function ask(rule: string, input: Record<string, unknown>): unknown {
  if (rule === "icing_severity") return callEngine("icing_severity", input as { category: number });
  if (rule === "turbulence_category")
    return callEngine("turbulence_category", input as { edr: number; weight_class: "light" | "medium" | "heavy" });
  return undefined;
}

describe("AWC's grids in a pilot's words, the engine's (aviationGrids.json)", () => {
  test.each(fixture.cases.filter((c) => c.rule !== "gfa_cloud_layers"))("$why", (c) => {
    expect(ask(c.rule, c.input as Record<string, unknown>)).toEqual(c.expected);
  });
});
