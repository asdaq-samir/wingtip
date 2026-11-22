import { describe, expect, it } from "vitest";
import { callEngine } from "../../lib/engine/engine";
import cases from "../../lib/fixtures/citations.json";

/** The engine's citations, as Cited asks it, held to the shared cases the
 *  engine's own tests read (engine/facade/tests/citations.rs). */
describe("a rule's citation cut into the library's links", () => {
  it.each(cases.cases.map((c) => [c.about, c] as const))("%s", (_, c) => {
    expect(callEngine("citations", { text: c.text }).pieces).toEqual(c.want);
  });
});
