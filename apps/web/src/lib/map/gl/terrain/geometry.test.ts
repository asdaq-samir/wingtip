import { describe, expect, it } from "vitest";
import { distanceNm } from "../../../geo";
import { aloftFeatures, aloftPieces, obstacleFeatures, resampleAloft } from "./geometry";

const C81 = { lat: 42.3246, lon: -88.0974, altFt: 869 };
const CRUISE = { lat: 42.6, lon: -88.6, altFt: 4500 };
const KMSN = { lat: 43.1399, lon: -89.3375, altFt: 4500 };

describe("the route aloft", () => {
  it("is cut every half mile, its altitude in proportion along each leg", () => {
    const line = resampleAloft([C81, CRUISE, KMSN]);
    expect(line[0]).toEqual(C81);
    expect(line.at(-1)).toEqual(KMSN);
    for (let i = 1; i < line.length - 1; i++) expect(distanceNm(line[i - 1]!, line[i]!)).toBeCloseTo(0.5, 1);
    // Half way up the climb, half way to its top of climb.
    const climb = line.filter(p => p.altFt < 4500);
    const mid = climb[Math.floor(climb.length / 2)]!;
    expect(mid.altFt).toBeGreaterThan(2000);
    expect(mid.altFt).toBeLessThan(3400);
  });

  it("stands each piece at its altitude over the ground under its middle", () => {
    const pieces = aloftPieces([CRUISE, KMSN], 150);
    const ground = () => 300;
    const band = aloftFeatures(pieces, ground, 30);
    const top = band.features[0]!.properties!;
    // 4,500 ft is 1,371.6 m; less the ground's 300.
    expect(top.top).toBeCloseTo(1071.6, 1);
    expect(top.bottom).toBeCloseTo(1041.6, 1);
    // On a flat map, over the sea; the curtain from the ground.
    const flat = aloftFeatures(pieces, () => null, null).features[0]!.properties!;
    expect(flat).toEqual({ top: expect.closeTo(1371.6, 1), bottom: 0 });
  });

  it("is a band as wide as asked across the line", () => {
    const [piece] = aloftPieces([{ lat: 42, lon: -88, altFt: 3000 }, { lat: 42.01, lon: -88, altFt: 3000 }], 150);
    const [a, , , d] = piece!.ring;
    // Due north: the band's ends 150 m apart east to west.
    expect(distanceNm({ lat: a![1], lon: a![0] }, { lat: d![1], lon: d![0] }) * 1852).toBeCloseTo(150, 0);
  });
});

describe("the obstacles", () => {
  it("stand as tall above their ground as the obstacle file says", () => {
    const [post] = obstacleFeatures([{ lat: 42.1, lon: -88.2, agl_ft: 1000, amsl_ft: 1900, type: "TOWER", lit: true }], 60).features;
    expect(post!.properties).toMatchObject({ height: 304.8, agl: 1000, type: "TOWER" });
  });
});
