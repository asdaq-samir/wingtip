import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import shared from "../../fixtures/mapDim.json";
import { rgbOf } from "../../rgb";
import { labelInk } from "./layers/common";
import { dimLayer, dimmedColour, dimmedOpacity, mapDimOf } from "./mapDim";

/** A colour's sRGB times `k`, as MapLibre's interpolate from black at 0 to
 *  the colour at 1 gives at `k`: the expression's own stops, read. */
function at(expression: unknown, k: number): string {
  const [op, how, , zero, black, one, colour] = expression as [string, string[], unknown, number, string, number, string];
  expect([op, how, zero, black, one]).toEqual(["interpolate", ["linear"], 0, "black", 1]);
  return `#${rgbOf(colour)
    .map((v) =>
      Math.round(v * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * The Dimmer's cases every app is held to (lib/fixtures/mapDim.json, read
 * too by Android's MapDimTest and iOS's MarkDimTests): a web figure that
 * drifts from the phones', or theirs from it, fails one of the three.
 */
describe("the Dimmer's shared cases", () => {
  it("names the web in every section the apps keep (the engine's are its own: facade/tests/map_dim.rs)", () => {
    for (const [name, section] of Object.entries(shared)) {
      const apps = name === "_note" ? [] : (section as { apps: string[] }).apps;
      if (name !== "_note" && !apps.includes("engine")) expect(apps, name).toContain("web");
    }
  });

  it("dims by the chart's brightness at night and not by day", () => {
    for (const c of shared.dim.cases) expect(mapDimOf(c.night, c.brightness), JSON.stringify(c)).toBe(c.dim);
  });

  it("dims a colour towards black, its sRGB times the dim", () => {
    for (const c of shared.colour.cases) expect(at(dimmedColour(c.colour), c.dim), JSON.stringify(c)).toBe(c.dimmed);
  });

  it("dims an opacity, a zoom curve in each stop", () => {
    for (const c of shared.opacity.cases) expect(dimmedOpacity(c.value ?? undefined), c.about).toEqual(c.dimmed);
  });

  it("reaches a layer's opacities by its type", () => {
    for (const c of shared.layers.cases) {
      const paint = (dimLayer(c.layer as LayerSpecification) as { paint?: unknown }).paint;
      expect(paint ?? null, c.about).toEqual(c.paint);
    }
  });

  it("brings each night ink to the towered blue's light", () => {
    for (const [day, night] of Object.entries(shared.nightInks.inks)) {
      const ink = ((labelInk(day) as unknown[])[2] as unknown[])[6];
      expect(ink, day).toBe(night);
    }
  });
});
