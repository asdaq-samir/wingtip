import type { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { describe, expect, test } from "vitest";
import { nearestHit, pickTap, type GlTap } from "./glLayer";
import { TAP } from "./layers/common";

// A flat projection for the test: a degree a hundred pixels, north up.
const project = ([lon, lat]: [number, number]) => ({ x: lon * 100, y: -lat * 100 });

const point = (key: string, lon: number, lat: number) =>
  ({ properties: { key }, geometry: { type: "Point", coordinates: [lon, lat] } }) as unknown as MapGeoJSONFeature;
const line = (key: string) =>
  ({
    properties: { key },
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 0],
      ],
    },
  }) as unknown as MapGeoJSONFeature;

describe("nearestHit", () => {
  const finger = { x: 0, y: 0 };

  test("the nearest mark within a finger's reach", () => {
    const found = [point("far", 0.2, 0), point("near", 0.1, 0)];
    expect(nearestHit(found, finger, TAP.mark, project)?.properties.key).toBe("near");
  });

  test("a mark whose words reach the finger but whose point is a finger and more away is not hit", () => {
    // A field's ident, drawn to the right of its point, under the finger's
    // square: its point 32 points off, past the 22 of a 44-point target.
    expect(nearestHit([point("KDPA", -0.32, 0)], finger, TAP.mark, project)).toBeNull();
  });

  test("a line in the square is hit as MapLibre found it, the topmost first", () => {
    expect(nearestHit([line("top"), line("under")], finger, TAP.line, project)?.properties.key).toBe("top");
  });

  test("nothing found, nothing hit", () => {
    expect(nearestHit([], finger, TAP.mark, project)).toBeNull();
  });
});

describe("pickTap", () => {
  const finger = { x: 0, y: 0 };
  // Each tap's own finder hands back its mark: the style's layers are not asked.
  const map = { project } as unknown as MlMap;
  const tap = (key: string, rank: number, lon: number): GlTap => ({
    layers: [],
    reach: TAP.mark,
    rank,
    onTap: () => {},
    find: () => point(key, lon, 0),
  });

  test("of one rank, the mark nearest the finger, whichever was registered first", () => {
    const taps = [tap("field", TAP.rank.mark, 0.2), tap("airplane", TAP.rank.mark, 0)];
    expect(pickTap(map, taps, finger)?.hit.properties.key).toBe("airplane");
  });

  test("a lower rank before a nearer mark of a higher one", () => {
    const taps = [tap("airplane", TAP.rank.mark, 0), tap("route field", TAP.rank.field, 0.2)];
    expect(pickTap(map, taps, finger)?.hit.properties.key).toBe("route field");
  });
});
