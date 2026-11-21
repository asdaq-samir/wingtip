import { describe, expect, it } from "vitest";
import { NO_AIRPLANE, forgetPilot, keptPreferences, usePreferences } from "./preferences";
import { NO_MINIMUMS } from "./minimums";

describe("forgetPilot", () => {
  it("takes out what was the pilot's own, and leaves how the map is drawn", () => {
    const field = { ident: "C81", name: "Campbell" };
    const airplane = { hex: "a3c858", registration: "N3429J" } as never;
    usePreferences.setState({
      base: "ifr_low",
      traffic: true,
      minimums: { ...NO_MINIMUMS, ceilingFt: 3000 } as never,
      loads: { c172: {} as never },
      aircraft: { profile: "pa28", label: "N123 · PA28" } as never,
      homeAirport: field,
      favoriteAirports: [field],
      recentAirports: [field],
      recentRoutes: [{ dep: "C81", dest: "KDLH" } as never],
      recentAircraft: [airplane],
      favoriteAircraft: [airplane],
      myAircraft: airplane,
      aircraftAlerts: [{ hex: "a3c858" } as never],
    });
    forgetPilot();
    const after = usePreferences.getState();
    expect(after).toMatchObject({
      minimums: NO_MINIMUMS,
      loads: {},
      aircraft: NO_AIRPLANE,
      homeAirport: null,
      favoriteAirports: [],
      recentAirports: [],
      recentRoutes: [],
      recentAircraft: [],
      favoriteAircraft: [],
      myAircraft: null,
      aircraftAlerts: [],
    });
    expect([after.base, after.traffic]).toEqual(["ifr_low", true]);
  });
});

describe("a new pilot's preferences", () => {
  it("start at the Wingtip look, the 2D chart, the airplane as own ship and the Map card's four layers", () => {
    expect(usePreferences.getInitialState()).toMatchObject({
      brand: "wingtip",
      threeD: false,
      ownShipLook: "single",
      aeronautical: true,
      weather: true,
      traffic: false,
      privateMilitary: false,
      waypoints: false,
      largerMapLabels: false,
    });
    expect(keptPreferences({ ...usePreferences.getInitialState(), ownShipLook: "jet" })).toMatchObject({ ownShipLook: "jet" });
    // Larger Map Labels is kept, as every other Map card choice is.
    expect(keptPreferences({ ...usePreferences.getInitialState(), largerMapLabels: true })).toMatchObject({ largerMapLabels: true });
  });
});

describe("what is kept", () => {
  it("writes the map's overlay and its strength with the rest, and no functions", () => {
    const kept = keptPreferences({ ...usePreferences.getState(), overlay: "usgs", overlayStrength: "full" }) as Record<string, unknown>;
    expect(kept).toMatchObject({ overlay: "usgs", overlayStrength: "full", base: expect.any(String) });
    expect(Object.values(kept).some((v) => typeof v === "function")).toBe(false);
  });
});
