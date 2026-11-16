import { describe, expect, it } from "vitest";
import { geoLoaded } from "../../geo";
import { nearestFrom } from "./nearestFrom";

const geo = await geoLoaded;
const { distanceNm, bearingDeg } = geo;

// C81 (Campbell, Grayslake IL) and IL11, about 8.5 nm north of it: the
// audit's case (WEB-3), where the list asked from the rounded point read
// C81 1.9 nm SW from C81 itself.
const C81 = { lat: 42.3246, lon: -88.0741 };
const IL11 = { lat: 42.4664, lon: -88.0595 };

describe("the nearest fields from the airplane's own fix", () => {
  const asked = [
    { ident: "IL11", ...IL11, distance_nm: 6.9, bearing_deg: 4 },
    { ident: "C81", ...C81, distance_nm: 1.9, bearing_deg: 225 },
  ];
  const fromFix = nearestFrom(asked, C81, geo);

  it("measures each from the fix, not the rounded point asked from", () => {
    expect(fromFix[0]!.ident).toBe("C81");
    expect(fromFix[0]!.distance_nm).toBeCloseTo(0, 6);
    expect(fromFix[1]!.distance_nm).toBeCloseTo(distanceNm(C81, IL11), 9);
    expect(fromFix[1]!.bearing_deg).toBeCloseTo(bearingDeg(C81, IL11), 9);
  });

  it("sorts them nearest first", () => {
    expect(fromFix.map((f) => f.ident)).toEqual(["C81", "IL11"]);
  });

  it("is empty for an empty list", () => {
    expect(nearestFrom([], C81, geo)).toEqual([]);
  });
});
