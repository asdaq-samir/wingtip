import { describe, expect, it } from "vitest";
import { callEngine } from "../../../../lib/engine/engine";
import webRules from "../../../../lib/fixtures/webRules.json";
import { coursePieces, corridorBounds, heightsOverPlan, OUTSIDE_M, terrariumHeights, terrariumPixels } from "./clearance";
import { M_PER_FT } from "./geometry";

/** Tile 12/1000/1500's middle and edges (it is some 3.9 nm across at 43 N). */
const TILE = { z: 12, x: 1000, y: 1500 };
const latOfY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** TILE.z))) * 180) / Math.PI;
const lonOfX = (x: number) => (x / 2 ** TILE.z) * 360 - 180;
const MID = { lat: latOfY(TILE.y + 0.5), lon: lonOfX(TILE.x + 0.5) };
const SIZE = 16;
const flat = (m: number) => new Float32Array(SIZE * SIZE).fill(m);

describe("the ground near the route against the plan", () => {
  it("takes its corridor from the engine, the VFR floor's", () => {
    expect(callEngine("floor_corridor_nm", {})).toBe(webRules.floorCorridorNm);
  });

  it("is the ground over the leg's planned altitude within the corridor, and nothing past it", () => {
    // A leg straight across the tile's middle at 10,000 ft, over ground
    // 3,000 m high: 48 m under the plan.
    const leg = [
      { lat: MID.lat, lon: lonOfX(TILE.x - 1), altFt: 10000, legFt: 10000 },
      { lat: MID.lat, lon: lonOfX(TILE.x + 2), altFt: 10000, legFt: 10000 },
    ];
    const got = heightsOverPlan(flat(3000), SIZE, TILE, coursePieces(leg), 1);
    const row = (r: number) => got[r * SIZE + SIZE / 2]!;
    expect(row(SIZE / 2)).toBeCloseTo(3000 - 10000 * M_PER_FT, 3);
    // The tile's top row is some 1.9 nm off the line: past a 1 nm corridor.
    expect(row(0)).toBe(OUTSIDE_M);
    // Within a 5 nm one, the whole tile.
    expect(heightsOverPlan(flat(3000), SIZE, TILE, coursePieces(leg), 5).every((v) => v > OUTSIDE_M)).toBe(true);
  });

  it("measures each point against the leg nearest it, not the airplane's climb", () => {
    // The tile's top edge flown at 12,500 ft, its bottom edge at 8,500 ft,
    // the airplane itself still climbing on both (altFt).
    const top = latOfY(TILE.y),
      bottom = latOfY(TILE.y + 1);
    const pieces = coursePieces([
      { lat: top, lon: lonOfX(TILE.x - 1), altFt: 6000, legFt: 12500 },
      { lat: top, lon: lonOfX(TILE.x + 2), altFt: 7000, legFt: 12500 },
      { lat: bottom, lon: lonOfX(TILE.x + 2), altFt: 7000, legFt: 8500 },
      { lat: bottom, lon: lonOfX(TILE.x - 1), altFt: 7000, legFt: 8500 },
    ]);
    const got = heightsOverPlan(flat(3000), SIZE, TILE, pieces, 5);
    expect(got[SIZE / 2]!).toBeCloseTo(3000 - 12500 * M_PER_FT, 3);
    expect(got[(SIZE - 1) * SIZE + SIZE / 2]!).toBeCloseTo(3000 - 8500 * M_PER_FT, 3);
  });

  it("keeps a point every mile and both ends of a change of leg", () => {
    const points = Array.from({ length: 101 }, (_, i) => ({ lat: 40, lon: -105 + i * 0.002, altFt: 9000, legFt: i < 50 ? 9500 : 11500 }));
    const pieces = coursePieces(points);
    // Some 9 nm of course: a piece a mile or so, and the change's own.
    expect(pieces.length).toBeGreaterThan(8);
    expect(pieces.length).toBeLessThan(14);
    expect(pieces[0]!.altM).toBeCloseTo(9500 * M_PER_FT);
    expect(pieces.at(-1)!.altM).toBeCloseTo(11500 * M_PER_FT);
  });

  it("asks no tile past the route's box and its corridor", () => {
    const [west, south, east, north] = corridorBounds(
      [
        { lat: 39.57, lon: -104.85, altFt: 5885 },
        { lat: 39.22, lon: -106.87, altFt: 7838 },
      ],
      5,
    );
    expect(north).toBeCloseTo(39.57 + 5 / 60, 6);
    expect(south).toBeCloseTo(39.22 - 5 / 60, 6);
    expect(west).toBeLessThan(-106.87 - 5 / 60);
    expect(east).toBeGreaterThan(-104.85 + 5 / 60);
  });

  it("writes heights back in the terrarium encoding they were read in", () => {
    const heights = new Float32Array([3.25, -85.75, 0, 4421, OUTSIDE_M, 1690.5]);
    expect(Array.from(terrariumHeights(terrariumPixels(heights)))).toEqual(Array.from(heights));
  });
});
