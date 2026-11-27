import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import { dimLayer, dimmedOpacity, isDimmed, mapDimOf } from "./mapDim";

const DIM = ["coalesce", ["global-state", "mapDim"], 1];

describe("the Dimmer over what is drawn on the chart", () => {
  it("is the chart's brightness at night and nothing by day", () => {
    // The night's default Dimmer, raster-brightness-max 0.5 (chartLook NIGHT_DIM).
    expect(mapDimOf(true, 0.5)).toBe(0.5);
    expect(mapDimOf(false, 0.5)).toBe(1);
  });

  it("multiplies a constant and a data expression whole", () => {
    expect(dimmedOpacity(0.8)).toEqual(["*", DIM, 0.8]);
    expect(dimmedOpacity(undefined)).toEqual(["*", DIM, 1]);
    expect(dimmedOpacity(["get", "o"])).toEqual(["*", DIM, ["get", "o"]]);
  });

  it("puts the dim into each output of a zoom curve, where MapLibre allows the zoom", () => {
    expect(dimmedOpacity(["interpolate", ["linear"], ["zoom"], 8, 0, 10, 1])).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      ["*", DIM, 0],
      10,
      ["*", DIM, 1],
    ]);
    expect(dimmedOpacity(["step", ["zoom"], 0, 9, 1])).toEqual(["step", ["zoom"], ["*", DIM, 0], 9, ["*", DIM, 1]]);
  });

  it("reaches words, icons, lines and circles, never a raster or a wash", () => {
    expect(isDimmed("symbol", "text-opacity")).toBe(true);
    expect(isDimmed("line", "line-opacity")).toBe(true);
    expect(isDimmed("raster", "raster-opacity")).toBe(false);
    expect(isDimmed("fill", "fill-opacity")).toBe(false);
    const raster = { id: "r", type: "raster", source: "s" } as LayerSpecification;
    expect(dimLayer(raster)).toBe(raster);
    const words = dimLayer({ id: "w", type: "symbol", source: "s", paint: { "text-color": "#000" } } as LayerSpecification);
    expect(words.paint).toEqual({ "text-color": "#000", "icon-opacity": ["*", DIM, 1], "text-opacity": ["*", DIM, 1] });
  });
});
