import { describe, expect, test } from "vitest";
import type { AirportPlace, ProcedureDrawing } from "../../../../lib/api/types";
import KOSH from "../../../../lib/fixtures/approachKosh.json";
import { aloft, approachScene, centrelineFeatures, pickedApproach, ringPoints } from "./approachScene";

// KOSH runway 36's ILS as the planner draws it from the CIFP (the shared
// fixture; engine/facade/tests/approach_scene.rs holds the engine's
// answer to the plate: GS 2,610 at POBER, TCH 53 over the threshold at
// 808), and the field as its card has it: 8,002 ft of 18/36, the pattern
// at 1,000 ft above the field (AIM 4-3-3).
const drawings = (KOSH as unknown as { drawings: Record<string, ProcedureDrawing> }).drawings;
const field = {
  ident: "KOSH",
  lat: 43.984,
  lon: -88.557,
  elevation_ft: 808,
  pattern: { agl_ft: 1000, altitude_ft: 1808, published: false },
  runways: [
    {
      closed: false,
      length_ft: 8002,
      runway_ends: [
        { ident: "36", lat: 43.963839, lon: -88.556717, heading_true_deg: 0.4, traffic: "left" },
        { ident: "18", lat: 43.985763, lon: -88.556461, heading_true_deg: 180.4, traffic: "left" },
      ],
    },
  ],
} as unknown as AirportPlace;

describe("a field's way in, in 3D", () => {
  test("the approach picked at the field is its own, not another field's", () => {
    const ils = drawings["I36"]!;
    expect(pickedApproach("OSH", [ils])).toBe(ils);
    expect(pickedApproach("KATW", [ils])).toBeNull();
  });

  test("with the ILS picked, runway 36's glidepath is the CIFP's and reaches POBER near the plate's 2,610", () => {
    const scene = approachScene(field, drawings["I36"]!);
    expect(scene.glidepaths.map((g) => [g.end, g.source, g.deg, g.tch_ft, g.cross_ft])).toEqual([["36", "cifp", 3, 53, 861]]);
    const top = aloft(scene.glidepaths[0]!.points).at(-1)!;
    expect(Math.abs(top.altFt - 2610)).toBeLessThanOrEqual(30);
    expect(aloft(scene.path!)[0]!.altFt).toBe(2700);
    expect(centrelineFeatures(scene).features).toHaveLength(2);
  });

  test("with no approach, each end has the standard 3° over 40 ft, and the ring is at the pattern's altitude", () => {
    const scene = approachScene(field, null);
    expect(scene.glidepaths.map((g) => [g.end, g.source, g.cross_ft])).toEqual([
      ["36", "standard", 848],
      ["18", "standard", 848],
    ]);
    expect(scene.path).toBeNull();
    expect(new Set(ringPoints(scene).map((p) => p.altFt))).toEqual(new Set([1808]));
  });
});
