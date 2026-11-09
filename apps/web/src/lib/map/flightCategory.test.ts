import { describe, expect, it } from "vitest";
import { categoryOf, chipFillOf, colourOf } from "./flightCategory";
import { inkOn } from "../scoreScale";

// Each bound of AIM 7-1-7's categories, from either side: LIFR "ceiling
// less than 500 feet and/or visibility less than 1 mile"; IFR "ceiling
// 500 to less than 1,000 feet and/or visibility 1 to less than 3 miles";
// MVFR "ceiling 1,000 to 3,000 feet and/or visibility 3 to 5 miles
// inclusive"; VFR "ceiling greater than 3,000 feet and visibility greater
// than 5 miles".
describe("a forecast's flight category, as AIM 7-1-7 bounds it", () => {
  it("takes the ceiling's bounds, the visibility clear", () => {
    expect([499, 500, 999, 1000, 3000, 3001].map(ceiling => categoryOf(ceiling, 10)))
      .toEqual(["LIFR", "IFR", "IFR", "MVFR", "MVFR", "VFR"]);
  });

  it("takes the visibility's bounds, no ceiling", () => {
    expect([0.75, 1, 2.75, 3, 5, 6].map(visibility => categoryOf(null, visibility)))
      .toEqual(["LIFR", "IFR", "IFR", "MVFR", "MVFR", "VFR"]);
  });

  it("takes the worse of the two, and nothing known as no category", () => {
    expect(categoryOf(5000, 2)).toBe("IFR");
    expect(categoryOf(800, 10)).toBe("IFR");
    expect(categoryOf(null, null)).toBeNull();
  });

  it("with no visibility, says only what the ceiling decides alone", () => {
    // Under 500 ft it is LIFR whatever the visibility; over it the
    // visibility could still make it worse, so a VFR or an MVFR (a TAF
    // period's read gave them) would be a guess.
    expect(categoryOf(400, null)).toBe("LIFR");
    expect(categoryOf(800, null)).toBeNull();
    expect(categoryOf(5000, undefined)).toBeNull();
  });
});

describe("a category chip with its name on it", () => {
  it("reads white words at 4.5:1 or more on every category, LIFR on its deeper fill", () => {
    for (const c of ["VFR", "MVFR", "IFR", "LIFR"]) expect(inkOn(chipFillOf(c))).toBe("#ffffff");
    expect(chipFillOf("LIFR")).toBe("#7e3fb8");
    // The map keeps the lighter magenta for its pips, which carry no words.
    expect(colourOf("LIFR")).toBe("#a371f7");
    expect(chipFillOf(null)).toBe(colourOf(null));
  });
});
