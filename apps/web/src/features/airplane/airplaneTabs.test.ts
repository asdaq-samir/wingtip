import { describe, expect, it } from "vitest";
import { airplaneTabs } from "./airplaneTabs";

/** A registered airplane on the ground, opened by its N-number from the search. */
const GROUND = { hex: "a89c1e", tail: "N654FL", flyable: true, figures: false, picked: null };

describe("the one airplane card's tabs (the owner's design, 2026-11-26)", () => {
  it("are Flights, Info and Figures for an N-number it can fly, opened on Info from the search", () => {
    expect(airplaneTabs(GROUND)).toEqual({ tabs: ["flights", "info", "figures"], tab: "info" });
  });

  it("open on Info, in the air too, as the airport's card does, and on Figures where asked for", () => {
    expect(airplaneTabs(GROUND).tab).toBe("info");
    expect(airplaneTabs({ ...GROUND, figures: true }).tab).toBe("figures");
  });

  it("keep the pilot's pick, while it is offered", () => {
    expect(airplaneTabs({ ...GROUND, picked: "info" }).tab).toBe("info");
    expect(airplaneTabs({ ...GROUND, picked: "flights" }).tab).toBe("flights");
    expect(airplaneTabs({ ...GROUND, flyable: false, picked: "figures" }).tab).toBe("info");
  });

  it("are Flights alone for traffic the FAA's registry does not hold, in the air or not", () => {
    expect(airplaneTabs({ ...GROUND, tail: null, flyable: false })).toEqual({ tabs: ["flights"], tab: "flights" });
  });

  it("keep Flights with no ICAO address, for its N-number's word that it has none", () => {
    expect(airplaneTabs({ ...GROUND, hex: null }).tabs).toEqual(["flights", "info", "figures"]);
  });

  it("open on Info for an N-number the registry does not hold nor the pilot flies, Figures not offered", () => {
    expect(airplaneTabs({ ...GROUND, hex: null, flyable: false, figures: true })).toEqual({ tabs: ["flights", "info"], tab: "info" });
  });
});
