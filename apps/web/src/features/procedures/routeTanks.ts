import { callEngine } from "../../lib/engine/engine";
import { legOf, type NavLogRow } from "../plan";

/** The fuel in the tanks at a point: what is in them, what they hold, and
 *  whether it is under the reserve the flight it is on is held to; and the pilot's
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
 * set their own in the address (`own`, by field: its `tanks`; the gauge
 * no longer sets it, the owner, 2026-11-25), the start, taxi
 * and takeoff allowance and the legs' own burn taken from them after,
 * fuelled again at each field landed at (full, or the pilot's own), as
 * the planner checks each flight (wingtip.route_join.route_totals); under the
 * reserve of the flight it is on (each flight's own, `reservesGal`: day,
 * night or IFR by its own times and rules), the destination's with the
 * fuel on to an IFR alternate too (`alternateGal`), and the departure's
 * where what is on board is under its start, taxi and reserve: low. No tanks known, none.
 */
export function tanksAt(
  rows: NavLogRow[],
  fuel: { usableGal: number; taxiGal: number; reservesGal: (number | null)[]; alternateGal?: number | null } | null,
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
    reserves_gal: fuel.reservesGal,
    alternate_gal: fuel.alternateGal ?? null,
  });
  rows.forEach((r, i) => {
    const at = walked[i];
    if (at)
      tanks.set(r.kind === "departure" ? "departure" : r.key, { gal: at.gal, usable: fuel.usableGal, low: at.low, own: ownAt(r) ?? null });
  });
  return tanks;
}
