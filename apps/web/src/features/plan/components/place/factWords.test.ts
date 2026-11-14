import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/surfaceAirspace.json";
import { airspaceWords, distanceWords, patternWords } from "./factWords";

type Surface = Parameters<typeof airspaceWords>[0];

describe("airspaceWords", () => {
  // The engine's answers in the shared cases (surface_airspace), as the strip writes them.
  const said = Object.fromEntries(fixture.cases.map((c) => [c.about, airspaceWords(c.answer as Surface, null)]));
  it("writes the class at the surface in a letter, a shelf over the field not it", () => {
    expect(said["KORD, Chicago O'Hare: the Class B surface area, its shelves over it"]).toEqual({ value: "Class B", note: null });
    expect(said["A field under a Class B shelf and a 700 ft Class E: G at its surface"]).toEqual({ value: "Class G", note: null });
  });
  it("says a part-time class with no hours to read as part-time alone, never E or G", () => {
    expect(said["A part-time Class D and a part-time Class E surface area: E or G other times"]).toEqual({ value: "Class D", note: "Part-time" });
  });
  it("is a dash where the airspace could not be read", () => {
    expect(airspaceWords(null, null)).toEqual({ value: "—", note: null });
  });
});

describe("patternWords", () => {
  it("writes the TPA in feet MSL with no note, published or the AIM's", () => {
    expect(patternWords({ agl_ft: 807, altitude_ft: 1000, published: true, remarks: ["TPA 1300 ft AGL for large aircraft."] })).toEqual({
      value: "1,000 ft",
      note: null,
    });
    // KPWK: 645 ft, none published: AIM 4-3-3a's 1,000 ft over it.
    expect(patternWords({ agl_ft: 1000, altitude_ft: 1645, published: false, remarks: [] })).toEqual({ value: "1,645 ft", note: null });
  });
  it("is a dash with no elevation or no answer", () => {
    expect(patternWords({ agl_ft: 1000, altitude_ft: null, published: false, remarks: [] }).value).toBe("—");
    expect(patternWords(null).value).toBe("—");
  });
});

describe("distanceWords", () => {
  it("keeps the figure without its compass point", () => {
    expect(distanceWords("12 nm NE")).toBe("12 nm");
    expect(distanceWords("4.2 nm S")).toBe("4.2 nm");
    expect(distanceWords(null)).toBe("—");
  });
});
