import type { AircraftChoice } from "../api/types";
import type { OwnFigureValues } from "../airplane/figureFields";
import type { Minimums } from "../minimums";
import type { Load } from "../weightBalance";

/** What FPL's Routes hold the weather to (routeWeather). */
export type RouteWeather = "personal" | "legal";

/** An airplane's own figures, set by the pilot for its N-number on this
 *  device while signed out (the airplane's profile, features/airplane):
 *  any of them, the type's book the rest; offered to the account at sign-in. */
type TailFigures = OwnFigureValues;

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
