import { describe, expect, it } from "vitest";
import type { RouteChip, RouteOptions } from "../../../lib/api/types";
import { wayCards } from "./useRouteLine";

const chip = (key: string, stops: string[], crosses: number[] = []) =>
  ({ key, label: key === "none" ? "None" : `Via ${stops.join(" ")}`, stops, fuel: [], crosses }) as unknown as RouteChip;
const option = (stops: string[], air: number, nm: number, gal: number, warning: string | null = null) => ({
  stops,
  warning,
  air_min: air,
  ground_min: stops.length * 30,
  distance_nm: nm,
  fuel_gal: gal,
  path: [],
});
const ways = {
  chips: [],
  hazards: [{ kind: "sigmet" }, { kind: "tfr" }, { kind: "fuel" }],
  options: [option(["KJVL"], 60, 140, 14, "Crosses a restricted area"), option(["KMSN"], 74, 152.4, 15)],
  own: null,
  current_along: { bands: [{ min: 74 }] },
} as unknown as RouteOptions;

describe("the route line's cards", () => {
  const figures = { routeWays: ways, lineKey: "none", minutes: 74, ground: 0, typedNm: 152, typedGal: 15 };

  it("gives each way its time on the route's clock, its miles and its fuel, and the engine's warning", () => {
    const cards = wayCards({ ...figures, chips: [chip("none", []), chip("fast", ["KJVL"], [0])] });
    expect(cards).toEqual([
      { key: "none", label: "As typed", warning: null, time: "1h 14m", nm: 152, gal: 15 },
      { key: "fast", label: "Via KJVL", warning: "Crosses a restricted area", time: "1h 30m", nm: 140, gal: 14 },
    ]);
  });

  it("leaves out a way no different from the route as typed, and then has none to offer", () => {
    const same = [chip("none", []), { ...chip("land", ["KMSN"]) }] as RouteChip[];
    const typedThere = { ...figures, ground: 30 };
    expect(wayCards({ ...typedThere, chips: same })).toBeNull();
    expect(wayCards({ ...typedThere, chips: same, lineKey: "land" })).toHaveLength(2);
  });
});
