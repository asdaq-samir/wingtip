import type { FigureKey } from "./figures";
import { andList } from "../listWords";

/**
 * How each airplane figure is named, asked for and bounded on screen. The
 * bounds are the ones the record and the planner take (the gateway's
 * OwnFigures and AircraftRequest, the planner's PlanQuery): a figure out of
 * them is said, not sent. Words only; the figures themselves are the
 * engine's (lib/airplane/figures).
 */
interface FigureWords {
  label: string;
  unit: string;
  /** The question asked where it is missing, of the N-number given. */
  ask: (tail: string) => string;
  min: number;
  max: number;
  /** The lowest bound itself not allowed: more than it (a glide ratio
   *  over 1, a weight over 0). */
  minExcluded?: boolean;
}

export const FIGURE_WORDS: Record<FigureKey, FigureWords> = {
  cruise_tas_kt: { label: "Cruise speed (TAS)", unit: "kt", ask: (t) => `How fast does ${t} cruise (true airspeed)?`, min: 30, max: 400 },
  fuel_burn_gph: { label: "Fuel burn", unit: "gal/h", ask: (t) => `How much fuel does ${t} burn in cruise?`, min: 1, max: 100 },
  cruise_power_pct: { label: "At power", unit: "%", ask: (t) => `At what power does ${t} cruise?`, min: 40, max: 100 },
  usable_fuel_gal: { label: "Usable fuel", unit: "gal", ask: (t) => `How much usable fuel does ${t} hold?`, min: 5, max: 500 },
  climb_tas_kt: { label: "Climb speed (TAS)", unit: "kt", ask: (t) => `How fast does ${t} climb (true airspeed)?`, min: 30, max: 300 },
  climb_fuel_burn_gph: {
    label: "Climb fuel burn",
    unit: "gal/h",
    ask: (t) => `How much fuel does ${t} burn in the climb?`,
    min: 1,
    max: 150,
  },
  climb_rate_fpm: {
    label: "Climb rate at sea level",
    unit: "fpm",
    ask: (t) => `How fast does ${t} climb at sea level?`,
    min: 0,
    max: 5000,
    minExcluded: true,
  },
  // A descent's speed as its handbook gives it, indicated (the engine
  // flies it as a true airspeed at the descent's altitude).
  descent_ias_kt: {
    label: "Descent speed (IAS)",
    unit: "kt",
    ask: (t) => `How fast does ${t} descend (indicated airspeed, as its handbook gives it)?`,
    min: 30,
    max: 300,
  },
  descent_fuel_burn_gph: {
    label: "Descent fuel burn",
    unit: "gal/h",
    ask: (t) => `How much fuel does ${t} burn in the descent?`,
    min: 1,
    max: 150,
  },
  service_ceiling_ft: { label: "Service ceiling", unit: "ft", ask: (t) => `What is ${t}'s service ceiling?`, min: 1000, max: 30000 },
  taxi_fuel_gal: {
    label: "Start and taxi fuel",
    unit: "gal",
    ask: (t) => `How much fuel does ${t} use to start and taxi?`,
    min: 0,
    max: 50,
  },
  glide_ratio: { label: "Glide ratio", unit: ": 1", ask: (t) => `What is ${t}'s glide ratio?`, min: 1, max: 80, minExcluded: true },
  empty_weight_lb: { label: "Empty weight", unit: "lb", ask: (t) => `What is ${t}'s empty weight?`, min: 0, max: 20000, minExcluded: true },
  empty_moment_lb_in: {
    label: "Empty moment",
    unit: "lb-in",
    ask: (t) => `What is ${t}'s empty moment?`,
    min: 0,
    max: 10_000_000,
    minExcluded: true,
  },
};

/** A figure typed, within its bounds; else what is wrong with it. The
 *  field (React Aria's NumberField) has read the text in the pilot's
 *  locale, so "12,5" on a comma-decimal phone is 12.5 here, where a
 *  hand-parse of the text took it for 125. */
export function readFigure(key: FigureKey, n: number | null): { value: number } | { problem: string } {
  const words = FIGURE_WORDS[key];
  if (n == null || !Number.isFinite(n)) return { problem: `Type the ${words.label.toLowerCase()} as a number.` };
  const low = words.minExcluded ? n <= words.min : n < words.min;
  if (low || n > words.max) {
    const unit = words.unit.startsWith(":") ? "" : ` ${words.unit}`;
    const range = `${words.minExcluded ? "more than" : "from"} ${words.min.toLocaleString("en-US")} to ${words.max.toLocaleString("en-US")}`;
    return { problem: `The ${words.label.toLowerCase()} is ${range}${unit}.` };
  }
  return { value: n };
}

/** The tables a figure needs, as a pilot names them (the engine's
 *  airplane_needs: loading, takeoff, landing). */
export function tablesWords(tables: readonly string[]): string {
  const names = tables.map((t) => (t === "loading" ? "loading envelope" : `${t} chart`));
  return andList(names);
}
