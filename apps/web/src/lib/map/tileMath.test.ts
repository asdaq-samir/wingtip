import { describe, expect, it } from "vitest";
import { latOf, mercX, mercY, tileFraction, tileOf } from "./tileMath";

describe("the slippy-map tile a point is in", () => {
  it("is the OSM wiki's own example: Duluth at zoom 10", () => {
    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames, the formula.
    const lat = 46.842,
      lon = -92.194,
      n = 2 ** 10;
    const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    expect(tileOf(lat, lon, 10)).toEqual({ x: Math.floor(((lon + 180) / 360) * n), y });
  });

  it("clamps the latitude to Web Mercator's edge, not Infinity at a pole", () => {
    expect(tileFraction(90, 0, 2).y).toBeCloseTo(0, 6);
    expect(tileFraction(-90, 0, 2).y).toBeCloseTo(4, 6);
  });
});

describe("the Web Mercator world, 0 to 1 each way", () => {
  it("puts the equator and the prime meridian at its middle", () => {
    expect(mercX(0)).toBe(0.5);
    expect(mercY(0)).toBeCloseTo(0.5, 12);
  });

  it("gives a latitude back from where it falls", () => {
    for (const lat of [-60, -12.5, 0, 33.9425, 71]) expect(latOf(mercY(lat))).toBeCloseTo(lat, 9);
  });
});
