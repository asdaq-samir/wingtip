import { callEngine } from "../../../lib/engine/engine";
import { legOf, type NavLogRow } from "../components/navlog/rows";

/** The fuel in the tanks at a point: what is in them, what they hold, and
 *  whether it is under the reserve the flight is held to. */
export interface TankAt {
  gal: number;
  usable: number;
  low: boolean;
}

/**
 * The fuel in the tanks at each point of FPL's route list, by its row
 * ("departure" for the first), at the owner's ask ("next to airport say
 * ... fuel", "I mean fuel in tanks"): the engine's (fuel_in_tanks) -- full
 * at the departure, the start, taxi and takeoff allowance and the legs'
 * own burn taken from them after, filled again at each field landed at,
 * as the planner checks each flight (app.planning.route_totals); under
 * the reserve, low. No tanks known, none.
 */
export function tanksAt(rows: NavLogRow[], fuel: { usableGal: number; taxiGal: number; reserveGal: number } | null): Map<string, TankAt> {
  const tanks = new Map<string, TankAt>();
  if (!fuel) return tanks;
  const walked = callEngine("fuel_in_tanks", {
    points: rows.map((r) => ({
      departure: r.kind === "departure",
      fuel_gal: r.kind === "departure" ? null : (legOf(r)?.fuel_gal ?? null),
      refuel: r.kind === "stop" && r.airport.kind !== "fix",
    })),
    usable_gal: fuel.usableGal,
    taxi_gal: fuel.taxiGal,
    reserve_gal: fuel.reserveGal,
  });
  rows.forEach((r, i) => {
    const at = walked[i];
    if (at) tanks.set(r.kind === "departure" ? "departure" : r.key, { gal: at.gal, usable: fuel.usableGal, low: at.low });
  });
  return tanks;
}
