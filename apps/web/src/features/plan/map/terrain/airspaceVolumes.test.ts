import { describe, expect, it } from "vitest";
import { boxOf, classesAt, kindOf, labelsOf, piecesOf } from "./airspaceVolumes";

const FT = 0.3048;
const square = (w: number, s: number, d = 0.5) => [
  [
    [w, s],
    [w + d, s],
    [w + d, s + d],
    [w, s + d],
    [w, s],
  ],
];

describe("the volumes in view", () => {
  it("asks only for Class B far out, C from 9, D and E from 10", () => {
    expect(classesAt(7)).toEqual(["B"]);
    expect(classesAt(9)).toEqual(["B", "C"]);
    expect(classesAt(10)).toEqual(["B", "C", "D", "E"]);
  });

  it("asks for the view's box out to the next half degree, a state's width at most", () => {
    expect(boxOf({ south: 41.8, west: -88.2, north: 42.1, east: -87.6 }, { lat: 42, lon: -87.9 })).toEqual({
      south: 41.5,
      west: -88.5,
      north: 42.5,
      east: -87.5,
    });
    const far = boxOf({ south: 20, west: -110, north: 60, east: -70 }, { lat: 40, lon: -90 });
    expect(far.north - far.south).toBe(12);
  });

  it("stands each polygon whole at its floor, as tall as to its ceiling, rimmed at its top", () => {
    // A Class B shelf, 3,000 to 10,000 MSL, drawn as two polygons.
    const shelf = {
      geometry: { type: "MultiPolygon", coordinates: [square(-88, 42), square(-87, 42)] },
      properties: { layer: "airspace", class: "B", floor_ft: 3000, floor_ref: "MSL", ceiling_ft: 10000 },
    };
    const pieces = piecesOf([shelf], () => null);
    expect(pieces).toHaveLength(2);
    const [a] = pieces;
    expect(a!.kind).toBe("B");
    expect(a!.polygon[0]![0]).toEqual([-88, 42, expect.closeTo(3000 * FT, 6)]);
    expect(a!.heightM).toBeCloseTo(7000 * FT, 6);
    // A rim at its top and, its floor off the ground, one at its floor.
    expect(a!.rims.map((r) => r[0]![2])).toEqual([expect.closeTo(10000 * FT, 6), expect.closeTo(3000 * FT, 6)]);
  });

  it("waits for the ground under a volume above it", () => {
    const brady = {
      geometry: { type: "Polygon", coordinates: square(-99.5, 31) },
      properties: {
        layer: "special_use",
        type: "MOA",
        name: "BRADY LOW MOA",
        floor_ft: 500,
        floor_ref: "SFC",
        ceiling_ft: 6000,
        ceiling_ref: "MSL",
      },
    };
    expect(piecesOf([brady], () => null)).toEqual([]);
    const [p] = piecesOf([brady], () => 520);
    expect(p!.kind).toBe("moa");
    expect(p!.polygon[0]![0]![2]).toBeCloseTo(520 + 500 * FT, 6);
  });

  it("stands a volume up with the ground by the Heights' stretch, its words' figures true", () => {
    const brady = {
      geometry: { type: "Polygon", coordinates: square(-99.5, 31) },
      properties: {
        layer: "special_use",
        type: "MOA",
        name: "BRADY LOW MOA",
        floor_ft: 500,
        floor_ref: "SFC",
        ceiling_ft: 6000,
        ceiling_ref: "MSL",
      },
    };
    // The map's ground drawn three times its 520 m; the floor 500 ft over
    // the true ground, the whole stood up three times, as the ground is.
    const [p] = piecesOf([brady], () => 3 * 520, null, 3);
    expect(p!.polygon[0]![0]![2]).toBeCloseTo(3 * (520 + 500 * FT), 6);
    expect(p!.topM).toBeCloseTo(3 * 6000 * FT, 6);
    expect(p!.heightM).toBeCloseTo(3 * (6000 * FT - (520 + 500 * FT)), 6);
    expect(p!.floorFt).toBeCloseTo((520 + 500 * FT) / FT, 6);
  });

  it("names an area drawn as several polygons once, at its top", () => {
    const part = (n: number) => ({
      geometry: { type: "Polygon", coordinates: square(-84.5 + n, 44.5) },
      properties: {
        layer: "special_use",
        type: "R",
        name: "R-4207",
        floor_ft: 0,
        floor_ref: "SFC",
        ceiling_ft: 45000,
        ceiling_ref: "STD",
        label: [-84.2 + n, 44.7],
      },
    });
    const features = [part(0), part(1)];
    const labels = labelsOf(
      features,
      piecesOf(features, () => null),
    );
    expect(labels.features).toHaveLength(1);
    // Its top is the drawn top, the floor of Class A (14 CFR 71.33).
    expect(labels.features[0]!.properties!.top_m).toBeCloseTo(18000 * FT, 6);
  });

  it("inks each kind as the chart does", () => {
    expect(kindOf({ layer: "special_use", type: "R" })).toBe("restricted");
    expect(kindOf({ layer: "special_use", type: "MOA" })).toBe("moa");
    expect(kindOf({ layer: "tfr", active: false })).toBe("tfrLater");
    expect(kindOf({ layer: "airspace", class: "C" })).toBe("C");
  });
});
