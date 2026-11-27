import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import type { OverlayTiles } from "../../api/types";
import { OVERLAY_LAYERS } from "../sources/overlayTiles";
import { overlayStyle } from "./glOverlays";
import { routeLayers } from "./glRoute";
import { LABEL_NIGHT } from "./layers/common";
import { dimLayer, MAP_DIM } from "./mapDim";

const TILES: OverlayTiles = {
  cycle: "2026-10-29",
  name: "2026-10-29-v3-0badf00d",
  version: 3,
  bytes: 1,
  built_at: 1,
  min_zoom: 4,
  max_zoom: 12,
  tolerance_m: 4.1,
  layers: OVERLAY_LAYERS.map((name) => ({ name, features: 1 })),
};

/** The operators that make a paint differ by feature (MapLibre's
 *  data-driven ones, feature state among them). */
const BY_FEATURE = new Set(["get", "has", "feature-state", "properties", "id", "geometry-type", "in"]);

function reads(value: unknown, test: (v: unknown[]) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  return test(value) || value.some((v) => reads(v, test));
}

/** The paints of a layer, as it is added, that read the Dimmer's global
 *  state and differ by feature: MapLibre lays such a layer's source out
 *  again at every step of the Dimmer (Style._applyGlobalStateChanges, a
 *  data-driven paint's setPaintProperty asking a relayout). */
function relaidByDim(layer: LayerSpecification, added = false): string[] {
  const paint = ((added ? layer : dimLayer(layer)) as { paint?: Record<string, unknown> }).paint ?? {};
  return Object.entries(paint)
    .filter(([, v]) => reads(v, (e) => e[0] === "global-state" && e[1] === MAP_DIM) && reads(v, (e) => BY_FEATURE.has(String(e[0]))))
    .map(([k]) => `${layer.id}.${k}`);
}

describe("the Dimmer's step", () => {
  it("lays out none of the overlay tiles' layers again", () => {
    const { layers } = overlayStyle(TILES, "https://wingtip.test");
    const all = [...(layers.lines ?? []), ...(layers.marks ?? [])];
    // overlayStyle's layers are dimmed already, as the first style holds them.
    expect(all.flatMap((l) => relaidByDim(l, true))).toEqual([]);
  });

  it("lays out none of the route's layers again", () => {
    expect(routeLayers().flatMap((l) => relaidByDim(l))).toEqual([]);
  });

  it("lays out none of the overlay tiles' layers again at a commit at night", () => {
    // The words' light (LABEL_NIGHT) follows the Dimmer as committed, and
    // the theme: no overlay word's ink reads a feature with it, a field's
    // tower its own layer's and the open card's field hidden by its opacity
    // (the round-7 map audit's W1), so a commit lays out no tile.
    const { layers } = overlayStyle(TILES, "https://wingtip.test");
    const relaid = [...(layers.lines ?? []), ...(layers.marks ?? [])].flatMap((l) => {
      const paint = (l as { paint?: Record<string, unknown> }).paint ?? {};
      return Object.entries(paint)
        .filter(
          ([, v]) => reads(v, (e) => e[0] === "global-state" && e[1] === LABEL_NIGHT) && reads(v, (e) => BY_FEATURE.has(String(e[0]))),
        )
        .map(([k]) => k);
    });
    expect(relaid).toEqual([]);
  });

  it("is caught where an opacity by feature reads it", () => {
    const layer = { id: "l", type: "line", source: "s", paint: { "line-opacity": ["case", ["get", "a"], 1, 0] } };
    expect(relaidByDim(layer as LayerSpecification)).toEqual(["l.line-opacity"]);
  });
});
