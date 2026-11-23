import { describe, expect, it } from "vitest";
import type { FuelStopSuggestion } from "../../lib/api/types";
import { fuelStopsAt } from "./fuelStopsAt";

const flight = (departure: string, destination: string, idents: string[]) =>
  ({
    departure,
    destination,
    usable_gal: 36,
    reason: "fuel",
    stops: idents.map((ident) => ({ ident })),
    choices: [],
  }) as unknown as FuelStopSuggestion;
const identsAt = (points: string[], suggested: FuelStopSuggestion[], waypoints = new Set<string>()) =>
  fuelStopsAt(points, waypoints, suggested).map((f) => f?.stops.map((s) => s.ident) ?? null);

describe("the suggested fuel stops in the route box", () => {
  it("draws each flight's after its own departure, in the order flown", () => {
    // The owner's C81 to KLAS to KBUF and home, 36 gal usable, as the live
    // planner answered it (2026-11-23): Kanab and Montrose are the KLAS to
    // KBUF flight's, east of Las Vegas, not the C81 to KLAS flight's.
    const suggested = [
      flight("C81", "KLAS", ["KOQW", "KTNU", "KSWT", "KSYF", "KLIC", "KBDG"]),
      flight("KLAS", "KBUF", ["KKNB", "KMTJ", "KMCK", "KDSM"]),
      flight("KBUF", "C81", ["57D"]),
    ];
    expect(identsAt(["C81", "KLAS", "KBUF", "C81"], suggested)).toEqual([
      ["KOQW", "KTNU", "KSWT", "KSYF", "KLIC", "KBDG"],
      ["KKNB", "KMTJ", "KMCK", "KDSM"],
      ["57D"],
      null,
    ]);
  });

  it("gives a field departed from twice each flight's own", () => {
    // Matched by the departure alone, the second C81 drew nothing.
    const suggested = [flight("C81", "KLAS", ["KSYF"]), flight("KLAS", "C81", ["KAIO"]), flight("C81", "KBUF", ["57D"])];
    expect(identsAt(["C81", "KLAS", "C81", "KBUF"], suggested)).toEqual([["KSYF"], ["KAIO"], ["57D"], null]);
    // A flight with none of its own takes no other flight's.
    expect(identsAt(["C81", "KLAS", "C81", "KBUF"], [flight("C81", "KBUF", ["57D"])])).toEqual([null, null, ["57D"], null]);
  });

  it("reads a flight through its waypoints to its landing", () => {
    // The planner's flights run landing to landing (Route.flights).
    const suggested = [flight("C81", "KLAS", ["KSYF"])];
    expect(identsAt(["C81", "DBQ", "KLAS"], suggested, new Set(["DBQ"]))).toEqual([["KSYF"], null, null]);
  });
});
