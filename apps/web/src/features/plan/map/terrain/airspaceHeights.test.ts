import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/airspaceVolumeSpan.json";
import { groundSpan, volumeSpan } from "./airspaceHeights";

const FT = 0.3048;

describe("volumeSpan", () => {
  // The engine's cases (engine/facade/tests/airspace_volume_span.rs), in
  // metres, over ground given in metres.
  it.each(fixture.cases)("$about", (c) => {
    const ground = "ground" in c.input && c.input.ground ? { low: c.input.ground.low_ft * FT, high: c.input.ground.high_ft * FT } : null;
    const altitudes = "altitudes_ft" in c.input ? c.input.altitudes_ft : null;
    const span = volumeSpan({ floor: c.input.floor, ceiling: c.input.ceiling }, ground, altitudes);
    if (c.answer === null) expect(span).toBeNull();
    else
      expect(span).toEqual({
        floorM: expect.closeTo(c.answer.floor_ft * FT, 6),
        ceilingM: expect.closeTo(c.answer.ceiling_ft * FT, 6),
        floorFt: c.answer.floor_ft,
        surface: c.answer.surface,
        holds: "holds" in c.answer ? c.answer.holds : null,
      });
  });

  it("draws a to-but-not-including ceiling the NASR file sends at its figure", () => {
    // A Class D to but not including 3,000 under a Class B shelf: its top
    // at 3,000, where the shelf's floor begins.
    const d = volumeSpan({ floor: { ft: 0, code: "SFC" }, ceiling: { ft: 3_000, code: "MSL" } }, null)!;
    const shelf = volumeSpan({ floor: { ft: 3_000, code: "MSL" }, ceiling: { ft: 10_000, code: "MSL" } }, null)!;
    expect(d.ceilingM).toBeCloseTo(shelf.floorM, 6);
  });
});

describe("groundSpan", () => {
  it("is the lowest and highest the terrain reads, none where it has none in", () => {
    const heights = [120, null, 300, 80];
    let i = 0;
    expect(
      groundSpan(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        () => heights[i++] ?? null,
      ),
    ).toEqual({ low: 80, high: 300 });
    expect(groundSpan([[0, 0]], () => null)).toBeNull();
  });
});
