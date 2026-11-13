import { describe, expect, test } from "vitest";
import { callEngine } from "./engine";
import type { ApproachFixTagsInput } from "./contract";
import KOSH from "../fixtures/approachKosh.json";

// KOSH's ILS, LOC and RNAV (GPS) RWY 36 as the planner draws them, with the
// tags the engine answers for each (engine/facade/tests/approach_tags.rs
// holds them to the plate): the web's module answers the same.
const fixture = KOSH as unknown as { drawings: Record<string, ApproachFixTagsInput["drawing"]>; tags: Record<string, unknown> };

describe("an approach's fix tags", () => {
  test.each(Object.keys(fixture.drawings))("%s is tagged as the fixture keeps it", (id) => {
    expect(callEngine("approach_fix_tags", { drawing: fixture.drawings[id]! })).toEqual(fixture.tags[id]);
  });

  test("KOSH ILS 36's FAF carries the glide slope the CIFP codes", () => {
    const answer = callEngine("approach_fix_tags", { drawing: fixture.drawings["I36:OSH"]! });
    const pober = answer.tags.find((t) => t.ident === "POBER")!;
    expect(pober.altitude).toEqual({ sense: "at_or_above", min_ft: 2700, max_ft: null });
    expect(pober.vertical).toEqual({ kind: "glideslope", ft: 2610, deg: 3, source: "cifp" });
    expect(answer.final?.from).toBe("POBER");
  });
});
