import type { Leg } from "../../lib/api/types";

/** The leg's true airspeed, in its own air (the engine's
 *  wingtip_flight::performance): it varies with the altitude and the forecast
 *  temperature, so each leg has its own. A dash from a planner that did
 *  not say. */
export function tas(leg: Leg): string {
  return leg.tas_kt == null ? "—" : String(Math.round(leg.tas_kt));
}
