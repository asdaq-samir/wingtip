import type { AircraftChoice } from "../api/types";
import { NO_MINIMUMS } from "../minimums";
import type { Slice } from "./slice";
import type { AirplaneSlice } from "./airplaneTypes";

/** The stock Cessna 172 as a pilot picks it, and as the demo flight
 *  picks it on purpose (lib/demoFlight). Never a default: nothing falls
 *  back to it (the owner, 2026-11-09: "Nothing assumes a Cessna 172"). */
export const STOCK_C172: AircraftChoice = { profile: "c172", label: "C172 · Cessna 172" };

/** No airplane picked: no profile at all, so the planner plans with none
 *  -- the route's own figures, its course, miles, legs, checkpoints,
 *  weather, airspace and ground, none of which an airplane changes -- and
 *  every figure that needs one (times, fuel, speeds, glide, tops of climb
 *  and descent, weight and balance) is left out, not guessed (the owner,
 *  2026-11-08; the FPL audit's A14). */
export const NO_AIRPLANE: AircraftChoice = { profile: "", label: "", none: true };

/** Whether an airplane has been picked: its figures can be shown. */
export const airplaneChosen = (aircraft: AircraftChoice): boolean => !aircraft.none;

/** The stock C172 as the default kept it, not one a pilot picked. */
export function isStockDefault(a: AircraftChoice | undefined): boolean {
  return (
    !a ||
    (a.profile === STOCK_C172.profile &&
      a.label === STOCK_C172.label &&
      !a.tail &&
      a.aircraftId === undefined &&
      a.cruiseTasKt === undefined)
  );
}

export const AIRPLANE_KEPT = ["aircraft", "tailFigures", "loads", "minimums", "routeWeather"] as const;

export const airplaneSlice: Slice<AirplaneSlice> = (set) => ({
  aircraft: NO_AIRPLANE,
  tailFigures: {},
  loads: {},
  minimums: NO_MINIMUMS,
  routeWeather: "personal",
  setAircraft: (aircraft) => set({ aircraft }),
  setTailFigures: (tail, figures) => set((s) => ({ tailFigures: { ...s.tailFigures, [tail.toUpperCase()]: figures } })),
  setLoad: (aircraft, load) => set((s) => ({ loads: { ...s.loads, [aircraft]: load } })),
  setMinimum: (key, value) => set((s) => ({ minimums: { ...s.minimums, [key]: value } })),
  setRouteWeather: (routeWeather) => set({ routeWeather }),
});
