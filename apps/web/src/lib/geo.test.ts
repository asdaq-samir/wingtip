import { describe, expect, it } from "vitest";
import geodesic from "./fixtures/geodesic.json";
import {
  deg,
  flatBearingDeg,
  flatDeg,
  flatDeg2,
  flatNm,
  lonBounds,
  lonNear,
  lonScale,
  M_PER_DEG,
  normalizeDeg,
  rad,
  geoLoaded,
  unwrapLine,
} from "./geo";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const { bearingDeg, bestStopIndex, destination, distanceNm, legsNm } = await geoLoaded;

describe("geo", () => {
  it("turns degrees to radians and back", () => {
    expect(rad(180)).toBe(Math.PI);
    expect(rad(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(deg(Math.PI)).toBe(180);
    expect(deg(rad(323.6))).toBeCloseTo(323.6, 10);
  });

  const campbell = { lat: 42.3246, lon: -88.0741 };
  const duluth = { lat: 46.8421, lon: -92.1936 };

  it("measures C81 to KDLH as the planner does, to within a mile", () => {
    // The planner's own course: 323.6 nm (the nav log's distance).
    expect(distanceNm(campbell, duluth)).toBeGreaterThan(322);
    expect(distanceNm(campbell, duluth)).toBeLessThan(325);
  });

  it("bears north-west from C81 to KDLH, and the other way back", () => {
    expect(bearingDeg(campbell, duluth)).toBeGreaterThan(320);
    expect(bearingDeg(campbell, duluth)).toBeLessThan(335);
    expect(bearingDeg(duluth, campbell)).toBeGreaterThan(135);
    expect(bearingDeg(duluth, campbell)).toBeLessThan(150);
  });

  it("answers the shared cases, the engine's WGS-84 geodesic every app asks", () => {
    for (const c of geodesic.distance) expect(distanceNm({ lat: c.lat1, lon: c.lon1 }, { lat: c.lat2, lon: c.lon2 })).toBeCloseTo(c.nm, 9);
    for (const c of geodesic.bearing) expect(bearingDeg({ lat: c.lat1, lon: c.lon1 }, { lat: c.lat2, lon: c.lon2 })).toBeCloseTo(c.deg, 9);
    for (const c of geodesic.destination) {
      const to = destination({ lat: c.lat, lon: c.lon }, c.bearing_deg, c.nm);
      expect(to.lat).toBeCloseTo(c.to.lat, 9);
      expect(to.lon).toBeCloseTo(c.to.lon, 9);
    }
  });

  it("measures a trail's legs at once, each as one leg alone", () => {
    const madison = { lat: 43.1399, lon: -89.3375 };
    const legs = legsNm([campbell, madison, duluth]);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toBeCloseTo(distanceNm(campbell, madison), 9);
    expect(legs[1]).toBeCloseTo(distanceNm(madison, duluth), 9);
    expect(legsNm([campbell])).toEqual([]);
  });

  it("is zero to itself", () => {
    expect(distanceNm(duluth, duluth)).toBe(0);
  });

  it("puts a stop where it bends the route least", () => {
    const madison = { lat: 43.1399, lon: -89.3375 };
    const minneapolis = { lat: 44.8848, lon: -93.2223 };
    // Straight: the only place is between the two ends.
    expect(bestStopIndex([campbell, duluth], madison)).toBe(0);
    // With Minneapolis a stop already, Madison goes before it, not after.
    expect(bestStopIndex([campbell, minneapolis, duluth], madison)).toBe(0);
    // And a stop near Duluth goes after it.
    expect(bestStopIndex([campbell, minneapolis, duluth], { lat: 46.5, lon: -92.5 })).toBe(1);
  });
});

describe("a direction brought into 0 up to 360", () => {
  it("wraps either way round the compass and leaves a good one alone", () => {
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-720)).toBeCloseTo(0);
    expect(normalizeDeg(275)).toBe(275);
  });
});

describe("the flat sums", () => {
  it("shrinks a degree of longitude by the parallel's cosine", () => {
    expect(lonScale(0)).toBe(1);
    expect(lonScale(60)).toBeCloseTo(0.5, 12);
    expect(M_PER_DEG).toBe(111_320);
  });

  it("measures a degree north as 60 nm, and one east at 60 degrees north as half that", () => {
    expect(flatNm(1, 0, 42)).toBe(60);
    expect(flatNm(0, 1, 60)).toBeCloseTo(30, 9);
    expect(flatDeg(3, 4, 0)).toBe(5);
    expect(flatDeg2(3, 4, 0)).toBe(25);
  });

  it("is near the engine's geodesic over a few miles, as an order needs", () => {
    const a = { lat: 42.3246, lon: -88.0741 },
      b = { lat: 42.4, lon: -88.0 };
    const nm = flatNm(b.lat - a.lat, b.lon - a.lon, a.lat);
    expect(Math.abs(nm - distanceNm(a, b)) / distanceNm(a, b)).toBeLessThan(0.01);
  });

  it("bears a flat offset round the compass", () => {
    expect(flatBearingDeg(1, 0)).toBe(0);
    expect(flatBearingDeg(0, 1)).toBe(90);
    expect(flatBearingDeg(-1, 0)).toBe(180);
    expect(flatBearingDeg(0, -1)).toBe(270);
  });
});

describe("a line across the antimeridian", () => {
  // Adak (176.6 W) to Shemya (174.1 E): the short way, west past -180.
  it("writes each longitude near the one before", () => {
    expect(lonNear(174.1136, -176.646)).toBeCloseTo(-185.8864, 9);
    expect(lonNear(-88.07, -92.19)).toBeCloseTo(-88.07, 9);
    const line = unwrapLine([
      [51.878, -176.646],
      [52.3, 179.5],
      [52.7123, 174.1136],
    ]);
    expect(line.map(([, lon]) => lon)).toEqual([-176.646, expect.closeTo(-180.5, 9), expect.closeTo(-185.8864, 9)]);
  });

  it("boxes the route, not the world", () => {
    const [west, east] = lonBounds([-176.646, 174.1136]);
    expect(east - west).toBeCloseTo(9.24, 2);
    expect(lonBounds([-88.07, -92.19])).toEqual([-92.19, -88.07]);
  });
});
