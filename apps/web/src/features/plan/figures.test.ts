import { describe, expect, it } from "vitest";
import type { Totals } from "../../lib/api/types";
import { figuresLine, shortFlights, tripFigures } from "./figures";
import { nameOwnPoints } from "../../lib/identSchema";

const totals = { distance_nm: 323.6, ete_min: 165, fuel_gal: 23.4, fuel_required_gal: 30.1, hops: [] } as unknown as Totals;
const input = { totals, local: false, destination: "KLAS" };

describe("the strip's distance", () => {
  it("writes the distance in whole miles, as the route's chips do", () => {
    expect(tripFigures(input)[1]!.value).toBe("324");
    const long = tripFigures({ ...input, totals: { ...totals, distance_nm: 1334.1 } as unknown as Totals });
    expect(long[1]!.value).toBe("1,334");
  });

  it("writes the distance in statute miles at the pilot's tap", () => {
    // 1,334.1 nm at 1,852 / 1,609.344 statute miles each is 1,535.3 sm.
    const sm = tripFigures({ ...input, totals: { ...totals, distance_nm: 1334.1 } as unknown as Totals, statute: true });
    expect([sm[1]!.value, sm[1]!.unit]).toEqual(["1,535", "sm"]);
    expect(sm[1]!.said).toMatch(/statute miles$/);
  });
});

describe("tripFigures", () => {
  it("writes a time en route under an hour in minutes alone", () => {
    const short = { ...input, totals: { ...totals, ete_min: 15 } as Totals };
    expect(tripFigures(short)[2]!.value).toBe("15m");
    expect(tripFigures(input)[2]!.value).toBe("2h 45m");
  });

  it("names a local flight's figures To, Aloft and Fuel", () => {
    expect(tripFigures({ ...input, local: true }).map((f) => f.name)).toEqual(["To", "Aloft", "Fuel"]);
  });

  it("says the next landing, and the distance, time and fuel required to it", () => {
    const hop = { ...totals, distance_nm: 41.2, ete_min: 25, fuel_required_gal: 9.4, hops: [] };
    const stops = { ...input, totals: { ...totals, hops: [{ departure: "C81", destination: "KJVL", totals: hop }] } as unknown as Totals };
    expect(tripFigures(stops).map((f) => f.value)).toEqual(["KJVL", "41", "25m", "9.4"]);
    expect(tripFigures(input).map((f) => f.value)).toEqual(["KLAS", "324", "2h 45m", "30.1"]);
  });

  it("says each figure in full words to a screen reader", () => {
    const said = [
      "To KLAS",
      "Distance, three hundred twenty-three point six nautical miles",
      "Time en route, two hours forty-five minutes",
      "Fuel required, thirty point one gallons",
    ];
    expect(tripFigures(input).map((f) => f.said)).toEqual(said);
  });

  it("says the arrival's clock time in the time en route's place when asked", () => {
    const figures = tripFigures({ ...input, depart: "2026-01-01T14:22:00Z", arrival: true });
    expect(figures[2]!.name).toBe("ETA");
    expect(figures[2]!.value).toMatch(/^\d\d:\d\d$/);
  });

  it("says the destination and the whole route's distance and time when asked, the fuel still the next landing's", () => {
    const hop = { ...totals, distance_nm: 41.2, ete_min: 25, fuel_required_gal: 9.4, hops: [] };
    const stops = {
      ...input,
      toDestination: true,
      totals: { ...totals, hops: [{ departure: "C81", destination: "KJVL", totals: hop }] } as unknown as Totals,
    };
    expect(tripFigures(stops).map((f) => f.value)).toEqual(["KLAS", "324", "2h 45m", "9.4"]);
  });

  it("keeps all four names, as dashes, with no totals yet, so the strip holds its place", () => {
    const figures = tripFigures({ totals: null, local: false, destination: "" });
    expect(figures.map((f) => f.name)).toEqual(["To", "Dist", "ETE", "Fuel"]);
    expect(figures.every((f) => f.value === "—")).toBe(true);
  });

  it("marks an estimate's time and fuel with ≈, the distance in whole miles as every summary's", () => {
    const book = { distanceNm: 100.2, cruiseTasKt: 100, fuelBurnGph: 10, taxiFuelGal: 1.4 };
    const est = { totals: null, local: false, destination: "KDLH", estimate: book };
    const [, dist, ete, fuel] = tripFigures(est);
    expect(dist!.value).toBe("100");
    expect(ete!.value.startsWith("≈")).toBe(true);
    // The trip's 10.0 gal, the profile's 1.4 to start and taxi, and the 45
    // minutes' reserve's 7.5, the most the rules ask: 18.9, exact.
    expect(fuel!.value).toBe("≈18.9");
    // A profile with no start and taxi allowance: none assumed, 17.5.
    const bare = tripFigures({ ...est, estimate: { ...book, taxiFuelGal: null } });
    expect(bare[3]!.value).toBe("≈17.5");
  });

  it("writes an estimate's time as the nav log's own, its minutes rounded first", () => {
    // 199.33 nm at 100 kt is 119.6 minutes: two hours, where the minutes
    // rounded on their own read "1h 60m".
    const est = { totals: null, local: false, destination: "KDLH", estimate: { distanceNm: 199.33, cruiseTasKt: 100, fuelBurnGph: 10 } };
    expect(tripFigures(est)[2]!.value).toBe("≈2h");
  });

  it("says why the Nav Log's line has no time or fuel with no airplane, not two dashes (UI audit C4)", () => {
    const none = { ...input, totals: { ...totals, ete_min: null, fuel_required_gal: null } as unknown as Totals };
    expect(figuresLine(none, true)).toBe("324 nm · no airplane picked");
    expect(figuresLine(none, false)).toBe("324 nm · — · —");
    expect(figuresLine(input, true)).toBe("324 nm · 2h 45m · 30.1 gal");
  });
});

describe("shortFlights", () => {
  it("names every flight of the route the tanks do not hold the fuel for, a later stop's too", () => {
    const hop = (margin: number) => ({ ...totals, fuel_margin_gal: margin, hops: [] });
    const route = {
      ...totals,
      hops: [
        { departure: "C81", destination: "KMSN", totals: hop(12) },
        { departure: "KMSN", destination: "KDLH", totals: hop(-3.5) },
      ],
    } as unknown as Totals;
    expect(shortFlights(route)).toEqual([{ name: "KMSN → KDLH", shortGal: 3.5 }]);
    // And the fuel figure red for it, though the next landing's flight is not short.
    expect(tripFigures({ ...input, totals: route })[3]!.alert).toBe(true);
    expect(shortFlights({ ...totals, fuel_margin_gal: 4 } as Totals)).toEqual([]);
  });
  it("names a pilot's own point by its name, not the engine's raw ident (CODE-13)", () => {
    const hop = (margin: number) => ({ ...totals, fuel_margin_gal: margin, hops: [] });
    const route = { ...totals, hops: [{ departure: "C81", destination: "VPBNG/090/30", totals: hop(-2) }] } as unknown as Totals;
    nameOwnPoints(["C81", "VPBNG/090/30", "KDLH"]);
    expect(shortFlights(route)).toEqual([{ name: "C81 → POS1", shortGal: 2 }]);
  });

  it("says the same figures from where a dry run is: the hop it is on, what is left to it, and the fuel required less what is burnt", () => {
    const hop = (to: string, required: number) => ({
      departure: "C81",
      destination: to,
      totals: { ...totals, distance_nm: 60, ete_min: 36, fuel_required_gal: required, hops: [] },
    });
    const stops = { ...input, totals: { ...totals, hops: [hop("KJVL", 9.4), hop("KLAS", 12)] } as unknown as Totals };
    const flown = { hop: 1, now: 1_000, next: { nm: 30, min: 18, at: 2_080 }, last: { nm: 30, min: 18, at: 2_080 }, burntGal: 2.5 };
    expect(tripFigures({ ...stops, flown }).map((f) => f.value)).toEqual(["KLAS", "30", "18m", "9.5"]);
    expect(tripFigures({ ...stops, flown, arrival: true })[2]!.value).toMatch(/^\d\d:\d\d$/);
    // At its start, the plan's own.
    const start = { hop: 0, now: 1_000, next: { nm: 60, min: 36, at: 3_160 }, last: { nm: 120, min: 72, at: 5_320 }, burntGal: 0 };
    expect(tripFigures({ ...stops, flown: start }).map((f) => f.value)).toEqual(["KJVL", "60", "36m", "9.4"]);
  });
});
