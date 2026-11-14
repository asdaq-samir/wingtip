import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/surfaceAirspace.json";
import { airspaceWords, patternWords } from "./factWords";

type Surface = Parameters<typeof airspaceWords>[0];

describe("airspaceWords", () => {
  // The engine's answers in the shared cases (surface_airspace), as the card writes them.
  const said = Object.fromEntries(fixture.cases.map((c) => [c.about, airspaceWords(c.answer as Surface)]));
  it("writes the class at the surface, a shelf over the field not it", () => {
    expect(said["KORD, Chicago O'Hare: the Class B surface area, its shelves over it"]).toEqual({ value: "Class B", note: null });
    expect(said["A field under a Class B shelf and a 700 ft Class E: G at its surface"]).toEqual({ value: "Class G", note: null });
  });
  it("says a part-time class's other times as the Chart Supplement does", () => {
    expect(said["A part-time Class D over a full-time Class E surface area: other times E"]?.note).toBe("Part-time, E other times");
    expect(said["A part-time Class D alone: other times G"]?.note).toBe("Part-time, G other times");
    expect(said["A part-time Class D and a part-time Class E surface area: E or G other times"]?.note).toBe(
      "Part-time, E or G other times",
    );
  });
  it("is a dash where the airspace could not be read", () => {
    expect(airspaceWords(null)).toEqual({ value: "—", note: null });
  });
});

describe("patternWords", () => {
  it("writes a published TPA in feet MSL with its height over the field", () => {
    // CUB: APT_BASE's TPA 807 ft AGL over its 193 ft, "1000 FT MSL" in its remark.
    expect(patternWords({ agl_ft: 807, altitude_ft: 1000, published: true, remarks: [] })).toEqual({
      value: "1,000 ft",
      note: "807 ft AGL",
    });
    expect(patternWords({ agl_ft: 800, altitude_ft: 1588, published: true, remarks: ["TPA 1300 ft AGL for large aircraft."] }).note).toBe(
      "800 ft AGL, others differ",
    );
  });
  it("marks AIM 4-3-3's 1,000 ft over the field as the AIM's, not published", () => {
    // KORD: 680 ft, no TPA in APT_BASE.
    expect(patternWords({ agl_ft: 1000, altitude_ft: 1680, published: false, remarks: [] })).toEqual({
      value: "1,680 ft",
      note: "AIM, none published",
    });
    expect(patternWords({ agl_ft: 1000, altitude_ft: 1077, published: false, remarks: ["TPA small aircraft 800' MSL."] }).note).toBe(
      "AIM; FAA remarks differ",
    );
  });
  it("is a dash with no elevation or no answer", () => {
    expect(patternWords({ agl_ft: 1000, altitude_ft: null, published: false, remarks: [] })).toEqual({ value: "—", note: null });
    expect(patternWords(null)).toEqual({ value: "—", note: null });
  });
});
