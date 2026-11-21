import { describe, expect, it } from "vitest";
import { publicationNotes } from "./publicationWords";

const current = { state: "current" as const, edition: "2610" };

describe("publicationNotes", () => {
  it("says nothing while both are of the editions in force, or the planner says nothing", () => {
    expect(publicationNotes({ publications: { plates: current, supplement: { state: "current", edition: "03Sep2026" } } })).toEqual([]);
    expect(publicationNotes({})).toEqual([]);
  });

  it("says an FAA outage where the list is empty, not that the field has no plates", () => {
    expect(publicationNotes({ publications: { plates: { state: "unavailable", edition: null }, supplement: current } })).toEqual([
      { title: "Plates couldn't be fetched from the FAA" },
    ]);
  });

  it("names the kept cycle shown in place of the one in force", () => {
    expect(
      publicationNotes({
        publications: { plates: { state: "kept", edition: "2609" }, supplement: { state: "unavailable", edition: null } },
      }),
    ).toEqual([
      { title: "Plates from kept cycle 2609", description: "The cycle in force couldn't be fetched from the FAA" },
      { title: "Chart Supplement couldn't be fetched from the FAA" },
    ]);
  });
});
