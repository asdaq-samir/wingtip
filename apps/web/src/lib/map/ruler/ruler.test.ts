import { describe, expect, it } from "vitest";
import { eteMinutes, heldStill, middleCourse, rulerWords, upright } from "./ruler";
import { geoLoaded } from "../../geo";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const geo = await geoLoaded;

const WEST_3 = () => -3;

describe("two fingers held still", () => {
  it("is still while each finger stays within 10 points of where it came down", () => {
    const from = [
      { x: 100, y: 100 },
      { x: 200, y: 300 },
    ];
    expect(
      heldStill(from, [
        { x: 104, y: 97 },
        { x: 200, y: 305 },
      ]),
    ).toBe(true);
    // A pinch: the fingers spread.
    expect(
      heldStill(from, [
        { x: 90, y: 90 },
        { x: 212, y: 310 },
      ]),
    ).toBe(false);
    expect(heldStill(from, [{ x: 100, y: 100 }])).toBe(false);
  });
});

describe("the ruler's course", () => {
  it("is measured at the middle of the line, as with a plotter", () => {
    // Along 45° N: setting out 86.5° from the west end, due east at the
    // middle; 425.47 nm on WGS-84 (pyproj's Geod, the engine's geodesic).
    const { trueDeg, nm } = middleCourse(geo, { lat: 45, lon: -100 }, { lat: 45, lon: -90 });
    expect(trueDeg).toBeCloseTo(90, 0);
    expect(nm).toBeCloseTo(425.5, 0);
  });
});

describe("what the ruler says", () => {
  // A degree of latitude due north: 59.96 nm on WGS-84 at 40 N, said 60.0.
  const south = { lat: 40, lon: -90 },
    north = { lat: 41, lon: -90 };

  it("gives the course each way magnetic, the distance to a tenth and the time at cruise", () => {
    const words = rulerWords(geo, south, north, WEST_3, 100);
    expect(words.toRight).toBe("003°M →");
    expect(words.toLeft).toBe("← 183°M");
    expect(words.figures).toBe("60.0 nm · 36m (100 kt)");
    expect(words.spoken).toBe("Ruler: 60.0 nautical miles, 0 0 3 magnetic one way and 1 8 3 the other, 36 minutes at 100 knots.");
  });

  it("writes north 360, not 000", () => {
    expect(rulerWords(geo, south, north, () => 0, null).toRight).toBe("360°M →");
  });

  it("says true until the variation has loaded, and no time with no airplane's speed", () => {
    const words = rulerWords(geo, south, north, null, null);
    expect(words.toRight).toBe("360°T →");
    expect(words.figures).toBe("60.0 nm");
    expect(words.spoken).not.toMatch(/knots/);
  });

  it("times an hour and more in hours and minutes", () => {
    expect(eteMinutes(85, 100)).toBeCloseTo(51, 0);
    const far = rulerWords(geo, south, { lat: 42.5, lon: -90 }, WEST_3, 100);
    // 2.5 degrees north from 40 N: 149.92 nm on WGS-84.
    expect(far.figures).toBe("149.9 nm · 1h 30m (100 kt)");
    expect(far.spoken).toMatch(/1 hour 30 minutes at 100 knots/);
  });
});

describe("the ruler's words along the line", () => {
  it("are turned upright, the left end first", () => {
    expect(upright({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ angleDeg: 0, flipped: false });
    expect(upright({ x: 100, y: 0 }, { x: 0, y: 0 })).toEqual({ angleDeg: 0, flipped: true });
    expect(upright({ x: 0, y: 0 }, { x: 100, y: 100 }).angleDeg).toBeCloseTo(45);
    const back = upright({ x: 100, y: 100 }, { x: 0, y: 0 });
    expect(back.angleDeg).toBeCloseTo(45);
    expect(back.flipped).toBe(true);
  });
});
