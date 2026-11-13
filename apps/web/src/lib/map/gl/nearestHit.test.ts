import type { MapGeoJSONFeature } from "maplibre-gl";
import { describe, expect, test } from "vitest";
import { nearestHit } from "./glLayer";
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
