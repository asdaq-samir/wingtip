import { describe, expect, it } from "vitest";
import { NO_AIRPLANE, forgetPilot, migratePreferences, usePreferences } from "./preferences";
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

describe("the look", () => {
  it("is the Wingtip look for a new pilot and for one who had the old default, keeping Chart ink", () => {
    expect(usePreferences.getInitialState().brand).toBe("wingtip");
    expect(migratePreferences({ brand: "cockpit" }, 6)).toMatchObject({ brand: "wingtip" });
    expect(migratePreferences({ brand: "ink" }, 6)).toMatchObject({ brand: "ink" });
    expect(migratePreferences({ brand: "windsock" }, 3)).toMatchObject({ brand: "wingtip" });
    expect(migratePreferences({ brand: "cockpit" }, 7)).toMatchObject({ brand: "cockpit" });
  });
});

describe("3D", () => {
  it("is a switch of its own over the shaded 2D chart: a kept 3D is 3D on, flat and shaded the shaded chart", () => {
    expect(usePreferences.getInitialState()).toMatchObject({ threeD: false });
    expect(migratePreferences({ terrain: "3d" }, 7)).toMatchObject({ threeD: true });
    expect(migratePreferences({ terrain: "shaded" }, 7)).not.toHaveProperty("threeD");
    expect(migratePreferences({ terrain: "flat" }, 7)).not.toHaveProperty("threeD");
  });
});

describe("the settings taken out (2026-11-13)", () => {
  it("lets go of a kept sheet edge, ground and own ship's look, so each falls back to the one way it is drawn", () => {
    const kept = migratePreferences({ navBar: "top", terrain: "flat", ownShipLook: "arrow", base: "ifr_low" }, 8);
    expect(kept).not.toHaveProperty("navBar");
    expect(kept).not.toHaveProperty("terrain");
    expect(kept).not.toHaveProperty("ownShipLook");
    expect(kept).toMatchObject({ base: "ifr_low" });
  });
});
