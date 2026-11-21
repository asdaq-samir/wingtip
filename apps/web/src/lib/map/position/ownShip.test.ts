// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { M_PER_FT } from "../../geo";
import { altitudeFtOf, locateOnOpen, useOwnShip } from "./ownShip";

/**
 * Who turned own ship on: the page as the map opens (locateOnOpen), or
 * the pilot. Ready to fly's prompt asks only at the pilot's own start,
 * so an open on the ground does not put a dialog over the map.
 */
describe("own ship's start", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "geolocation", { value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() }, configurable: true });
    Object.defineProperty(navigator, "permissions", { value: { query: vi.fn(async () => ({ state: "granted" })) }, configurable: true });
    useOwnShip.getState().setEnabled(false);
  });
  afterEach(() => useOwnShip.getState().setEnabled(false));

  test("turned on as the map opens is the page's", async () => {
    await locateOnOpen();
    expect(useOwnShip.getState()).toMatchObject({ enabled: true, byPage: true });
  });

  test("turned on as the map opens on a route already drawn, the map stays on the route", async () => {
    useOwnShip.setState({ routeDrawn: true, follow: false });
    const was = useOwnShip.getState().recentred;
    await locateOnOpen();
    expect(useOwnShip.getState()).toMatchObject({ enabled: true, follow: false, recentred: was });
    useOwnShip.setState({ routeDrawn: false });
  });

  test("turned on as the map opens with no route, the map goes to the position", async () => {
    const was = useOwnShip.getState().recentred;
    await locateOnOpen();
    expect(useOwnShip.getState()).toMatchObject({ follow: true, recentred: was + 1 });
  });

  test("turned on by the pilot is the pilot's", () => {
    useOwnShip.getState().setEnabled(true);
    expect(useOwnShip.getState()).toMatchObject({ enabled: true, byPage: false });
  });
});

describe("the fix's altitude", () => {
  test("is a height only with its accuracy, as the W3C Geolocation API ties the two", () => {
    expect(altitudeFtOf({ altitude: 300, altitudeAccuracy: 10 })).toBeCloseTo(300 / M_PER_FT, 9);
    // A desktop's Wi-Fi fix: no height at all, or a 0 with no accuracy to it.
    expect(altitudeFtOf({ altitude: null, altitudeAccuracy: null })).toBeNull();
    expect(altitudeFtOf({ altitude: 0, altitudeAccuracy: null })).toBeNull();
    expect(altitudeFtOf({ altitude: 0, altitudeAccuracy: 0 })).toBeNull();
    expect(altitudeFtOf({ altitude: 0, altitudeAccuracy: -1 })).toBeNull();
    expect(altitudeFtOf({ altitude: Number.NaN, altitudeAccuracy: 5 })).toBeNull();
  });

  test("keeps a real height of nought, and one below the ellipsoid", () => {
    expect(altitudeFtOf({ altitude: 0, altitudeAccuracy: 8 })).toBe(0);
    expect(altitudeFtOf({ altitude: -10, altitudeAccuracy: 8 })).toBeCloseTo(-10 / M_PER_FT, 9);
  });
});
