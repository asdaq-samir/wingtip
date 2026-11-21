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

  it("reads the plan with the stops in and puts in what it suggests too, till it suggests none", () => {
    // The first plan's KDSM to KCBK, flown on its own at 6,500 ft into the
    // wind, landed 3 gal short; the plan with it in suggests KPMV there.
    const setStops = vi.fn();
    let planned = { dep: POS, stops: ["KLAS"], dest: "KPWK" };
    let totals = totalsOf([POS, "KLAS"], [flight(POS, "KLAS", ["KDSM", "KCBK", "KAIB"]), flight("KLAS", "KPWK", ["KSYF"])]);
    const hook = renderHook(() => useSuggestedStops({ totals, local: false, planned, setStops }));
    act(() => hook.result.current.fuelToAdd!.add());
    expect(setStops).toHaveBeenLastCalledWith(["KDSM", "KCBK", "KAIB", "KLAS", "KSYF"], ["KDSM", "KCBK", "KAIB", "KSYF"]);
    // The route set, its plan not in yet: nothing more is put in.
    planned = { ...planned, stops: ["KDSM", "KCBK", "KAIB", "KLAS", "KSYF"] };
    totals = totalsOf([POS, "KLAS"], []);
    hook.rerender();
    expect(setStops).toHaveBeenCalledTimes(1);
    // Its plan: KDSM to KCBK and KSYF to KPWK still short, a stop each.
    totals = totalsOf([POS, "KDSM", "KCBK", "KAIB", "KLAS", "KSYF"], [flight("KDSM", "KCBK", ["KPMV"]), flight("KSYF", "KPWK", ["KCWI"])]);
    hook.rerender();
    expect(setStops).toHaveBeenLastCalledWith(["KDSM", "KPMV", "KCBK", "KAIB", "KLAS", "KSYF", "KCWI"], ["KPMV", "KCWI"]);
    // That plan's: every flight reaches, so nothing more, and the pill can
    // take them out again.
    planned = { ...planned, stops: ["KDSM", "KPMV", "KCBK", "KAIB", "KLAS", "KSYF", "KCWI"] };
    totals = totalsOf([POS, ...planned.stops], []);
    hook.rerender();
    expect(setStops).toHaveBeenCalledTimes(2);
    expect(hook.result.current.fuelToAdd).toBeNull();
  });
});
