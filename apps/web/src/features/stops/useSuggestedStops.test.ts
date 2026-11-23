// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FuelStopSuggestion, Totals } from "../../lib/api/types";
import { useSuggestedStops, withFuelStops } from "./useSuggestedStops";

// The owner's trip of 2026-11-20 (N654FL, 36 gal usable): from a present
// position near Chicago to Las Vegas and back to KPWK, the planner's
// suggestions as the live stack answered them, a flight of each leg.
const POS = "@42.1,-87.9";
const stopAt = (ident: string) => ({ ident }) as FuelStopSuggestion["stops"][number];
const flight = (departure: string, destination: string, idents: string[]) =>
  ({ departure, destination, usable_gal: 36, reason: "fuel", stops: idents.map(stopAt), choices: [] }) as unknown as FuelStopSuggestion;
const totalsOf = (departures: string[], fuelStops: FuelStopSuggestion[]) =>
  ({
    hops: departures.map((departure) => ({ departure, destination: "", totals: { usable_fuel_gal: 36 } })),
    fuel_stops: fuelStops,
  }) as unknown as Totals;

describe("Add Fuel Stops", () => {
  it("puts in every flight's suggested stops, each after its own flight's departure", () => {
    // KLAS to KPWK's stop was never offered: the tanks read 21 gal short there.
    const suggested = [flight(POS, "KLAS", ["KDSM", "KCBK", "KAIB"]), flight("KLAS", "KPWK", ["KSYF"])];
    expect(withFuelStops(POS, ["KLAS"], suggested)).toEqual({
      stops: ["KDSM", "KCBK", "KAIB", "KLAS", "KSYF"],
      added: ["KDSM", "KCBK", "KAIB", "KSYF"],
    });
    // A field already in the route is not put in again, and none to add is none.
    expect(withFuelStops(POS, ["KDSM", "KLAS"], [flight("KDSM", "KLAS", ["KDSM"])])).toBeNull();
  });

  it("puts in the stops the planner checked in one step, and offers none once they are in", () => {
    // The planner planned the route with them in and put in KPMV and KCWI
    // too (wingtip.fuel_rounds): one tap sets them all, and nothing more.
    const setStops = vi.fn();
    let planned = { dep: POS, stops: ["KLAS"], dest: "KPWK" };
    let totals = totalsOf([POS, "KLAS"], [flight(POS, "KLAS", ["KDSM", "KPMV", "KCBK", "KAIB"]), flight("KLAS", "KPWK", ["KSYF", "KCWI"])]);
    const hook = renderHook(() => useSuggestedStops({ totals, local: false, planned, setStops }));
    act(() => hook.result.current.fuelToAdd!.add());
    expect(setStops).toHaveBeenCalledTimes(1);
    expect(setStops).toHaveBeenLastCalledWith(
      ["KDSM", "KPMV", "KCBK", "KAIB", "KLAS", "KSYF", "KCWI"],
      ["KDSM", "KPMV", "KCBK", "KAIB", "KSYF", "KCWI"],
    );
    planned = { ...planned, stops: ["KDSM", "KPMV", "KCBK", "KAIB", "KLAS", "KSYF", "KCWI"] };
    totals = totalsOf([POS, ...planned.stops], []);
    hook.rerender();
    expect(setStops).toHaveBeenCalledTimes(1);
    expect(hook.result.current.fuelToAdd).toBeNull();
  });

  it("holds each flight's gauges to its own reserve, as the planner gave it", () => {
    // A night flight's 45 minutes then a day flight's 30 (14 CFR 91.151(a)):
    // each flight's reserve_gal, in order, for the engine (fuel_in_tanks).
    const totals = {
      hops: [
        { departure: POS, destination: "KLAS", totals: { usable_fuel_gal: 36, taxi_gal: 1.4, reserve_gal: 7.5 } },
        { departure: "KLAS", destination: "KPWK", totals: { usable_fuel_gal: 36, taxi_gal: 1.4, reserve_gal: 5 } },
      ],
      fuel_stops: [],
    } as unknown as Totals;
    const hook = renderHook(() =>
      useSuggestedStops({ totals, local: false, planned: { dep: POS, stops: ["KLAS"], dest: "KPWK" }, setStops: vi.fn() }),
    );
    expect(hook.result.current.tankFigures).toEqual({ usableGal: 36, taxiGal: 1.4, reservesGal: [7.5, 5], alternateGal: null });
  });

  it("names the flights short with no stop offered, and why", () => {
    const totals = {
      ...totalsOf([POS], []),
      no_fuel_stop: [{ departure: "KLAS", destination: "KPWK", on_board: true }],
    } as unknown as Totals;
    const hook = renderHook(() =>
      useSuggestedStops({ totals, local: false, planned: { dep: POS, stops: ["KLAS"], dest: "KPWK" }, setStops: vi.fn() }),
    );
    expect(hook.result.current.noFuelStop).toEqual([{ name: "KLAS → KPWK", onBoard: true, departure: "KLAS", destination: "KPWK" }]);
  });

  it("keeps a suggestion on the flight it was drawn on, by the point's place, where the route leaves a field twice", () => {
    const setStops = vi.fn();
    const hook = renderHook(() =>
      useSuggestedStops({ totals: null, local: false, planned: { dep: "C81", stops: ["KLAS", "C81"], dest: "KBUF" }, setStops }),
    );
    // C81 at its second place (2): the flight on to KBUF, not the first.
    hook.result.current.keepFuelStops(2, ["KKNB"]);
    expect(setStops).toHaveBeenCalledWith(["KLAS", "C81", "KKNB"], ["KKNB"]);
  });
});
