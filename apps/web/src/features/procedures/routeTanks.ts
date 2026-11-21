import { callEngine } from "../../lib/engine/engine";
import { legOf, type NavLogRow } from "../plan";

/** The fuel in the tanks at a point: what is in them, what they hold, and
 *  whether it is under the reserve the flight is held to; and the pilot's
 *  own figure for them leaving there, where set (the address's `tanks`;
 *  none, full). */
export interface TankAt {
  gal: number;
  usable: number;
  low: boolean;
  own: number | null;
}

/**
 * The fuel in the tanks at each point of FPL's route list, by its row
 * ("departure" for the first), at the owner's ask ("next to airport say
 * ... fuel", "I mean fuel in tanks"): the engine's (fuel_in_tanks) -- at
 * the departure the fuel on board at engine start, full unless the pilot
 * set their own on its gauge (`own`, by field: FuelSet, the owner's "can
 * we set the fuel tank by tapping on it?", 2026-11-21), the start, taxi
 * and takeoff allowance and the legs' own burn taken from them after,
 * fuelled again at each field landed at (full, or the pilot's own), as
 * the planner checks each flight (wingtip.route_join.route_totals); under the
 * reserve, low. No tanks known, none.
 */
export function tanksAt(
  rows: NavLogRow[],
  fuel: { usableGal: number; taxiGal: number; reserveGal: number } | null,
  own: Record<string, number> = {},
): Map<string, TankAt> {
  const tanks = new Map<string, TankAt>();
  if (!fuel) return tanks;
  const ownAt = (r: NavLogRow) =>
    r.kind === "departure" || (r.kind === "stop" && r.airport.kind !== "fix") ? own[r.airport.ident] : undefined;
  const walked = callEngine("fuel_in_tanks", {
    points: rows.map((r) => ({
      departure: r.kind === "departure",
      fuel_gal: r.kind === "departure" ? null : (legOf(r)?.fuel_gal ?? null),
      refuel: r.kind === "stop" && r.airport.kind !== "fix",
      fill_gal: ownAt(r) ?? null,
    })),
    usable_gal: fuel.usableGal,
    taxi_gal: fuel.taxiGal,
    reserve_gal: fuel.reserveGal,
  });
  rows.forEach((r, i) => {
    const at = walked[i];
    if (at)
      tanks.set(r.kind === "departure" ? "departure" : r.key, { gal: at.gal, usable: fuel.usableGal, low: at.low, own: ownAt(r) ?? null });
  });
  return tanks;
}
