import type { AircraftChoice } from "../api/types";
import type { OwnFigureValues } from "../airplane/figures";
import { NO_MINIMUMS, type Minimums } from "../minimums";
import type { Load } from "../weightBalance";
import type { Slice } from "./slice";

/** What FPL's Routes hold the weather to (routeWeather). */
export type RouteWeather = "personal" | "legal";

/** An airplane's own figures, set by the pilot for its N-number on this
 *  device while signed out (the airplane's profile, features/airplane):
 *  any of them, the type's book the rest; offered to the account at sign-in. */
type TailFigures = OwnFigureValues;

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

/** The airplane flown and the pilot's own limits for it. */
export interface AirplaneSlice {
  aircraft: AircraftChoice;
  /** The figures the pilot set for an N-number (the airplane's profile), by it:
   *  flown on whenever the N-number is, over its type's profile. */
  tailFigures: Record<string, TailFigures>;
  /** Each airplane's load as last set (lib/weightBalance), by its name. */
  loads: Record<string, Load>;
  /** The pilot's personal minimums (lib/minimums), each off until set. */
  minimums: Minimums;
  /** The weather FPL's Routes keep to (lib/routeOptions): the pilot's own
   *  minimums, or 14 CFR 91.155's alone; thunderstorms are kept clear of
   *  either way. The owner's "This can be a setting" (2026-10-23). */
  routeWeather: RouteWeather;
  setAircraft: (aircraft: AircraftChoice) => void;
  setTailFigures: (tail: string, figures: TailFigures) => void;
  setLoad: (aircraft: string, load: Load) => void;
  setMinimum: (key: keyof Minimums, value: number | null) => void;
  setRouteWeather: (weather: RouteWeather) => void;
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
