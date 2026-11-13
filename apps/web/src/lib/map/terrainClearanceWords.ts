import { create } from "zustand";
import { callEngine } from "../engine/engine";
import { feet } from "../format";

/**
 * What the 3D map's colours near a route are (ClearanceGl), for the
 * map's clearance key (ClearanceKey), in the dry run's own words beside
 * its pilot's view (DryRunPanel): the engine's corridor
 * (`floor_corridor_nm`) and amber band (`terrain_view_bands`), and that
 * it is a view of the plan, not terrain clearance -- no TAWS, and nothing
 * of 14 CFR 91.119 or 91.177, which the plan's altitudes answer. Here,
 * not beside ClearanceGl, so the key carries none of the 3D code.
 */
export function clearanceFigures(): { corridorNm: number; amberFt: number } {
  const corridorNm = callEngine("floor_corridor_nm", {});
  const bands = callEngine("terrain_view_bands", { altitude_ft: 0 });
  return { corridorNm, amberFt: bands.warning_from_ft - bands.caution_from_ft };
}

/** The same in a sentence, the key's popover's. */
export function clearanceWords(): string {
  const { corridorNm, amberFt } = clearanceFigures();
  return `Within ${corridorNm} nm of a route, ground within ${feet(amberFt)} below its planned altitude is amber, at or above it red. A view of the plan, not terrain clearance.`;
}

/** Whether the route's clearance colours are on the map now: ClearanceGl
 *  says so while it draws them (3D, a route in the air), for the key. */
export const useClearanceDrawn = create<{ drawn: boolean }>(() => ({ drawn: false }));
