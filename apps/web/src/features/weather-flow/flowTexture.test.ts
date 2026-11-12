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

  it("reads nothing off the picture or before it loads", () => {
    expect(valueAt(layer, "wind-060", texture, [3, 0.5])).toBeNull();
    expect(valueAt(layer, "wind-060", undefined, [0.5, 0.5])).toBeNull();
  });
});
