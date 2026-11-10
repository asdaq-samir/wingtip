// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { locateOnOpen, useOwnShip } from "./ownShip";

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

  test("turned on by the pilot is the pilot's", () => {
    useOwnShip.getState().setEnabled(true);
    expect(useOwnShip.getState()).toMatchObject({ enabled: true, byPage: false });
  });
});
