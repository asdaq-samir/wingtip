import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/airspaceShelfLabel.json";
import { CHART } from "../../../../lib/tokens";
import { piecesOf } from "./airspaceVolumes";
import { planAltitudes, shadeOf, shelfLabelsOf, shelfText } from "./airspaceShelves";

const ring = (w: number, s: number, d = 0.5) => [
  [
    [w, s],
    [w + d, s],
    [w + d, s + d],
    [w, s + d],
    [w, s],
  ],
];
const shelf = (floor_ft: number, ceiling_ft: number, w = -88) => ({
  geometry: { type: "Polygon", coordinates: ring(w, 42) },
  properties: { layer: "airspace", class: "B", floor_ft, floor_ref: floor_ft ? "MSL" : "SFC", ceiling_ft },
});

describe("shelfText", () => {
  // The engine's cases (engine/facade/tests/airspace_shelf_label.rs).
  it.each(fixture.cases)("$about", (c) => {
    expect(shelfText({ layer: "airspace", ...c.input })).toBe(c.answer?.text ?? null);
  });

  it("writes nothing for a special use area or a TFR, whose own tabs name them", () => {
    expect(shelfText({ layer: "special_use", class: "B", floor_ft: 0, ceiling_ft: 5000 })).toBeNull();
    expect(shelfText({ layer: "tfr", floor_ft: 0, ceiling_ft: 3000 })).toBeNull();
  });
});

describe("shadeOf", () => {
  const lum = ([r, g, b]: number[]) => r! + g! + b!;
  it("darkens a lower floor and lightens a higher one, in the class's own ink", () => {
    const sfc = shadeOf(CHART.airspaceBlue, 0, 0.2, null);
    const thirty = shadeOf(CHART.airspaceBlue, 3000, 0.2, null);
    const eighty = shadeOf(CHART.airspaceBlue, 8000, 0.2, null);
    expect(lum(sfc)).toBeLessThan(lum(thirty));
    expect(lum(thirty)).toBeLessThan(lum(eighty));
    // Blue stays the strongest channel at every floor.
    for (const c of [sfc, thirty, eighty]) expect(c[2]).toBe(Math.max(c[0], c[1], c[2]));
  });

  it("is stronger at the plan's altitudes, fainter off them, as it is with no plan", () => {
    const none = shadeOf(CHART.airspaceBlue, 3000, 0.2, null)[3];
    expect(shadeOf(CHART.airspaceBlue, 3000, 0.2, true)[3]).toBeGreaterThan(none);
    expect(shadeOf(CHART.airspaceBlue, 3000, 0.2, false)[3]).toBeLessThan(none);
    expect(shadeOf(CHART.airspaceBlue, 3000, 0.9, true)[3]).toBe(255);
  });
});

describe("the plan's altitudes", () => {
  it("are each leg's own, once each; none with no plan", () => {
    expect(planAltitudes(null)).toBeNull();
    expect(
      planAltitudes([
        { lat: 42, lon: -88, altFt: 700, legFt: 4500 },
        { lat: 42.1, lon: -88, altFt: 4500, legFt: 4500 },
        { lat: 42.2, lon: -88, altFt: 6500, legFt: 6500 },
      ]),
    ).toEqual([4500, 6500]);
  });

  it("stand out the shelf the plan is in and fade the one it is under, by the engine's rule", () => {
    const pieces = piecesOf([shelf(3000, 10000), shelf(8000, 10000, -87)], () => null, [4500]);
    expect(pieces.map((p) => p.holds)).toEqual([true, false]);
    expect(piecesOf([shelf(3000, 10000)], () => null)[0]!.holds).toBeNull();
  });
});

describe("shelfLabelsOf", () => {
  it("labels each shelf at its top in places spread along its edge, the nearest the camera first", () => {
    const pieces = piecesOf([shelf(3000, 10000)], () => null);
    // The same shelf twice (a multipolygon's pieces) is labelled along one.
    const labels = shelfLabelsOf([...pieces, ...pieces], [-88.25, 41]);
    expect(labels.features).toHaveLength(8);
    const f = labels.features[0]!;
    expect(f.properties).toMatchObject({ text: "100\n30", class: "B", floor_ft: 3000, held: true, rank: 0 });
    expect(f.properties!.top_m).toBeCloseTo(10000 * 0.3048, 6);
    // The camera is south of the ring: the first place is on its south side.
    expect((f.geometry as GeoJSON.Point).coordinates[1]).toBe(42);
    expect(labels.features.map((l) => l.properties!.rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Spread round it, none on another: at least 8 km apart.
    const at = labels.features.map((l) => (l.geometry as GeoJSON.Point).coordinates);
    for (let i = 0; i < at.length; i++)
      for (let j = i + 1; j < at.length; j++) {
        const dx = (at[i]![0]! - at[j]![0]!) * Math.cos((42 * Math.PI) / 180) * 111.32;
        const dy = (at[i]![1]! - at[j]![1]!) * 111.32;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(8);
      }
  });

  it("gives a small shelf fewer places, so its label never crowds itself", () => {
    const small = { ...shelf(0, 4000), geometry: { type: "Polygon", coordinates: ring(-88, 42, 0.05) } };
    // Some 19 km round: two places, 8 km apart at least.
    expect(
      shelfLabelsOf(
        piecesOf([small], () => 200),
        [-88, 41],
      ).features,
    ).toHaveLength(2);
  });
});
