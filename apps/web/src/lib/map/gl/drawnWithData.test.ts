import type { Map as MlMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { EMPTY, drawnWithData } from "./glLayer";

/** A map with two layers of `dots` (one with a zoom range of its own) and
 *  one of `lines`, keeping their ranges as MapLibre does. */
function fakeMap() {
  const layers = new Map<string, { source: string; minzoom?: number; maxzoom?: number }>([
    ["dots", { source: "dots" }],
    ["dots-names", { source: "dots", minzoom: 8, maxzoom: 14 }],
    ["lines", { source: "lines" }],
  ]);
  const map = {
    style: {},
    getLayersOrder: () => [...layers.keys()],
    getLayer: (id: string) => layers.get(id),
    setLayerZoomRange: (id: string, min: number, max: number) => Object.assign(layers.get(id)!, { minzoom: min, maxzoom: max }),
  } as unknown as MlMap;
  return { map, layers };
}

const ONE: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-89, 43] } }],
};

describe("drawnWithData", () => {
  it("gives an empty source's layers no level to draw at, and their own back as data comes", () => {
    const { map, layers } = fakeMap();
    drawnWithData(map, "dots", EMPTY);
    expect(layers.get("dots")).toMatchObject({ minzoom: 24, maxzoom: 24 });
    expect(layers.get("dots-names")).toMatchObject({ minzoom: 24, maxzoom: 24 });
    // Another source's layer is left as it is.
    expect(layers.get("lines")!.minzoom).toBeUndefined();
    drawnWithData(map, "dots", ONE);
    expect(layers.get("dots")).toMatchObject({ minzoom: 0, maxzoom: 24 });
    expect(layers.get("dots-names")).toMatchObject({ minzoom: 8, maxzoom: 14 });
  });

  it("takes no data as empty, and keeps the own range through a second empty", () => {
    const { map, layers } = fakeMap();
    drawnWithData(map, "dots", null);
    drawnWithData(map, "dots", EMPTY);
    drawnWithData(map, "dots", ONE);
    expect(layers.get("dots-names")).toMatchObject({ minzoom: 8, maxzoom: 14 });
  });
});
