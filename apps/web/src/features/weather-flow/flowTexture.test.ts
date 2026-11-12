import type { TextureData } from "weatherlayers-gl";
import { describe, expect, it } from "vitest";
import { callEngine } from "../../lib/engine/engine";
import fixture from "../../lib/fixtures/flowSample.json";
import { valueAt } from "./flowTexture";
import type { FlowLayer } from "./useWeatherFlow";

describe("the engine's reading of a picture", () => {
  // The engine's cases (engine/facade/tests/flow_sample.rs), which the
  // phones' FlowGrid are held to as well.
  it.each(fixture.cells)("$about", (c) => expect(callEngine("flow_cell", c.input)).toEqual(c.answer));
  it.each(fixture.samples)("$about", (c) => expect(callEngine("flow_sample", c.input)).toEqual(c.answer));
});

describe("valueAt", () => {
  // A 2 by 1 wind picture over 0 to 2 east, 0 to 1 north, unscaled -50 to
  // 50 kt: a westerly of 50 kt in the west pixel, an easterly in the east.
  const layer = { bounds: [0, 0, 2, 1], fields: { wind: { unscale: [-50, 50], vector: true, unit: "kt" } } } as unknown as FlowLayer;
  const texture = { data: new Uint8ClampedArray([255, 128, 0, 255, 0, 128, 0, 255]), width: 2, height: 1 } as unknown as TextureData;

  it("reads the wind on a pixel's middle, from where it blows", () => {
    const read = valueAt(layer, "wind-060", texture, [0.5, 0.5])!;
    expect(read.value).toBeCloseTo(50, 0);
    expect(read.direction).toBeCloseTo(270, 0);
  });

  it("averages the wind's parts between pixels, not its speeds", () => {
    // Half way the two cancel: nearly calm, where the speeds average 50.
    expect(valueAt(layer, "wind-060", texture, [1, 0.5])!.value).toBeLessThan(1);
  });

  it("reads a wind under a knot as calm, with no direction (the fixture's half-knot case)", () => {
    const half = fixture.samples.find((s) => s.about.startsWith("Calm: half a knot"))!;
    const calm = { data: new Uint8ClampedArray([128, 127.5, 0, 255]), width: 1, height: 1 } as unknown as TextureData;
    const small = {
      bounds: [0, 0, 1, 1],
      fields: { wind: { unscale: half.input.unscale, vector: true, unit: "kt" } },
    } as unknown as FlowLayer;
    const read = valueAt(small, "wind", calm, [0.5, 0.5])!;
    expect(read.calm).toBe(true);
    expect(read.direction).toBeUndefined();
    expect(half.answer).toMatchObject({ calm: true, from_deg: null });
  });

  it("reads the ceiling's picture as the ceiling: its top none, the rest rounded to 50 ft (the fixture's cases)", () => {
    const top = fixture.samples.find((s) => s.about.startsWith("The ceiling's picture at its top"))!;
    const mvfr = fixture.samples.find((s) => s.about.startsWith("A ceiling read between 3,000"))!;
    // A 2 by 1 ceiling picture: the top byte in the west pixel, 3,000 ft's in the east.
    const ceiling = {
      bounds: [0, 0, 2, 1],
      fields: { ceiling: { unscale: top.input.unscale, vector: false, unit: "ft" } },
    } as unknown as FlowLayer;
    const picture = { data: new Uint8ClampedArray([255, 0, 0, 255, 60, 0, 0, 255]), width: 2, height: 1 } as unknown as TextureData;
    expect(valueAt(ceiling, "ceiling", picture, [0.5, 0.5])).toMatchObject({ value: top.answer!.value, noCeiling: true });
    expect(valueAt(ceiling, "ceiling", picture, [1.5, 0.5])).toMatchObject({ value: mvfr.answer!.value, noCeiling: false });
  });

  it("sends the field by name, so a level's icing and the visibility read their worst (the fixture's cases)", () => {
    const icing = fixture.samples.find((s) => s.about.startsWith("No icing beside category 3"))!;
    const vis = fixture.samples.find((s) => s.about.startsWith("Visibility 10 SM beside 0.5 SM"))!;
    // 2 by 1 pictures, the west pixel clear, the east the worse: read half way.
    const both = {
      bounds: [0, 0, 2, 1],
      fields: {
        icing: { unscale: icing.input.unscale, vector: false, unit: "category" },
        vis: { unscale: vis.input.unscale, vector: false, unit: "SM" },
      },
    } as unknown as FlowLayer;
    const picture = (west: number, east: number) =>
      ({ data: new Uint8ClampedArray([west, 0, 0, 255, east, 0, 0, 255]), width: 2, height: 1 }) as unknown as TextureData;
    expect(valueAt(both, "icing-060", picture(0, 150), [1, 0.5])!.value).toBe(icing.answer!.value);
    // Byte 13 is 0.51 SM: the lowest, where half way between reads over 5.
    expect(valueAt(both, "vis", picture(255, 13), [1, 0.5])!.value).toBeCloseTo(0.51, 2);
  });

  it("reads nothing off the picture or before it loads", () => {
    expect(valueAt(layer, "wind-060", texture, [3, 0.5])).toBeNull();
    expect(valueAt(layer, "wind-060", undefined, [0.5, 0.5])).toBeNull();
  });
});
