import { describe, expect, it } from "vitest";
import fixture from "../../../../lib/fixtures/airspaceVolumeSpan.json";
import { groundSpan, keptGround, volumeSpan, type GroundPoint } from "./airspaceHeights";

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
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const reading = (heights: GroundPoint[]) => {
    let i = 0;
    return groundSpan(corners, () => heights[i++] ?? null);
  };

  it("is the lowest and highest the terrain reads, none where it has none", () => {
    expect(reading([120, null, 300, 80])).toEqual({ span: { low: 80, high: 300 }, settled: true });
    expect(groundSpan([[0, 0]], () => null)).toEqual({ span: null, settled: true });
  });

  it("is unsettled while a point's tile is still loading, never read as the sea", () => {
    expect(reading([120, "loading", 300, 80])).toEqual({ span: { low: 80, high: 300 }, settled: false });
  });
});

describe("keptGround", () => {
  const hills = { low: 150, high: 300 };

  it("keeps a volume's last good ground while the terrain under it is still loading", () => {
    // After a pan: part of the outline's tiles are in, part still coming.
    // The volume stays where it was, neither lower nor gone.
    expect(keptGround(hills, { span: { low: 0, high: 300 }, settled: false })).toBe(hills);
    expect(keptGround(hills, { span: null, settled: false })).toBe(hills);
    expect(keptGround(hills, { span: null, settled: true })).toBe(hills);
  });

  it("takes the fresh ground once every point's tile is in", () => {
    expect(keptGround(hills, { span: { low: 140, high: 310 }, settled: true })).toEqual({ low: 140, high: 310 });
  });

  it("has a volume above the ground wait for a settled reading at first", () => {
    expect(keptGround(null, { span: { low: 0, high: 300 }, settled: false })).toBeNull();
    expect(keptGround(null, { span: hills, settled: true })).toBe(hills);
  });
});
