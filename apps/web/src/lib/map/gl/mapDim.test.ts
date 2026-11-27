import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import { labelInk } from "./layers/common";
import {
  DIM_BY_COLOUR,
  DIM_WARNING,
  dimLayer,
  dimmedColour,
  dimmedOpacity,
  dimmedPaint,
  isDimmed,
  mapDimOf,
  warningLight,
  wordLight,
} from "./mapDim";

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
    // A fade's target: the dim now as a figure, which MapLibre eases to (glFadeIn).
    expect(dimmedOpacity(0.8, 0.5)).toEqual(["*", 0.5, 0.8]);
    expect(dimmedPaint({ type: "line" }, "line-opacity", 0.8, 0.5)).toEqual(["*", 0.5, 0.8]);
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
    expect(isDimmed({ type: "symbol" }, "text-opacity")).toBe(true);
    expect(isDimmed({ type: "line" }, "line-opacity")).toBe(true);
    expect(isDimmed({ type: "raster" }, "raster-opacity")).toBe(false);
    expect(isDimmed({ type: "fill" }, "fill-opacity")).toBe(false);
    const raster = { id: "r", type: "raster", source: "s" } as LayerSpecification;
    expect(dimLayer(raster)).toBe(raster);
    const words = dimLayer({ id: "w", type: "symbol", source: "s", paint: { "text-color": "#000" } } as LayerSpecification);
    expect(words.paint).toEqual({ "text-color": "#000", "icon-opacity": ["*", DIM, 1], "text-opacity": ["*", DIM, 1] });
  });

  it("dims a layer marked so by its colours, its opacities left alone", () => {
    const line = { type: "line", metadata: DIM_BY_COLOUR };
    expect(dimmedPaint(line, "line-color", "#e600e6")).toEqual(["interpolate", ["linear"], DIM, 0, "black", 1, "#e600e6"]);
    expect(dimmedPaint(line, "line-opacity", 0.35)).toBe(0.35);
    expect(dimmedPaint({ type: "line" }, "line-color", "#e600e6")).toBe("#e600e6");
    const spec = { id: "l", type: "line", source: "s", metadata: DIM_BY_COLOUR, paint: { "line-color": "#fff", "line-opacity": 0.35 } };
    expect(dimLayer(spec as LayerSpecification).paint).toEqual({ "line-color": dimmedColour("#fff"), "line-opacity": 0.35 });
  });

  it("leaves a light-haloed word's opacity alone, its ink dimmed by itself, and its icon dimmed", () => {
    const spec = { id: "w", type: "symbol", source: "s", metadata: DIM_BY_COLOUR, paint: { "text-color": labelInk("#2465b8") } };
    const words = dimLayer({ ...spec, metadata: undefined } as LayerSpecification);
    expect(words.paint).toEqual({ "text-color": labelInk("#2465b8"), "icon-opacity": ["*", DIM, 1] });
    expect(isDimmed(spec, "text-color")).toBe(false);
    // A style layer as the map holds it, read through its getPaintProperty.
    const held = { type: "symbol", getPaintProperty: () => labelInk("#2465b8") };
    expect(isDimmed(held, "text-opacity")).toBe(false);
  });

  it("dims a warning by its own state, under the paper's light", () => {
    const WARN = ["coalesce", ["global-state", "warningDim"], 1];
    expect(dimmedPaint({ type: "line", metadata: DIM_WARNING }, "line-color", "#dc2626")).toEqual([
      "interpolate",
      ["linear"],
      WARN,
      0,
      "black",
      1,
      "#dc2626",
    ]);
    expect(warningLight(false, 0.5, 0.13)).toBe(1);
    // The night's default: the paper sRGB 137 (0.537), the red at 0.85 of it.
    expect(warningLight(true, 0.5, 0.13)).toBe(0.46);
  });

  it("gives the words their light at night, none by day, never 0 after dark", () => {
    expect(wordLight(false, 0.5, 0.13)).toBe(0);
    expect(wordLight(true, 0.5, 0.13)).toBeCloseTo(0.77, 2);
    expect(wordLight(true, 1, 0.13)).toBe(1);
    expect(wordLight(true, 0, 0.13)).toBe(0.01);
  });
});
