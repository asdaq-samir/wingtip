import { describe, expect, it } from "vitest";
import { airplaneTabs } from "./airplaneTabs";

/** A registered airplane on the ground, opened by its N-number from the search. */
const GROUND = {
  hex: "a89c1e",
  tail: "N654FL",
  history: true,
  flyable: true,
  figures: false,
  fromTraffic: false,
  airborne: false,
  picked: null,
};

describe("the one airplane card's tabs (the owner's design, 2026-11-26)", () => {
  it("are Flight, Flights, Info and Figures for an N-number it can fly, opened on Info from the search", () => {
    expect(airplaneTabs(GROUND)).toEqual({ tabs: ["flight", "flights", "info", "figures"], tab: "info" });
  });

  it("open on Flight from traffic or while it flies, and on Figures where they were asked for", () => {
    expect(airplaneTabs({ ...GROUND, fromTraffic: true }).tab).toBe("flight");
    expect(airplaneTabs({ ...GROUND, airborne: true }).tab).toBe("flight");
    expect(airplaneTabs({ ...GROUND, airborne: true, figures: true }).tab).toBe("figures");
  });

  it("keep the pilot's pick, while it is offered", () => {
    expect(airplaneTabs({ ...GROUND, airborne: true, picked: "info" }).tab).toBe("info");
    expect(airplaneTabs({ ...GROUND, flyable: false, picked: "figures" }).tab).toBe("info");
  });

  it("are Flight and Flights alone for traffic the FAA's registry does not hold", () => {
    expect(airplaneTabs({ ...GROUND, tail: null, flyable: false, fromTraffic: true })).toEqual({
      tabs: ["flight", "flights"],
      tab: "flight",
    });
  });

  it("leave out Flight with no ICAO address, and Flights where its history is not offered", () => {
    expect(airplaneTabs({ ...GROUND, hex: null, history: false }).tabs).toEqual(["info", "figures"]);
    expect(airplaneTabs({ ...GROUND, hex: null }).tabs).toEqual(["flights", "info", "figures"]);
  });

  it("are Info alone for an N-number the registry does not hold nor the pilot flies", () => {
    expect(airplaneTabs({ ...GROUND, hex: null, history: false, flyable: false, figures: true })).toEqual({ tabs: ["info"], tab: "info" });
  });
});
