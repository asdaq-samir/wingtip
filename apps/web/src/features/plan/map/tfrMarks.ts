import type { Tfr } from "../../../lib/api/types";
import { CHART } from "../../../lib/tokens";

// A temporary flight restriction's ink on the map, and whether it is in
// force (features/plan/map/layers/TfrGl draws them; TfrCard is its card).

/** The FAA's own TFR red, as tfr.faa.gov and every EFB draw one. */
export const TFR_RED = CHART.tfr;

/** Whether a TFR is in force now: one with no times is taken as so. */
export function inForce(tfr: Tfr, now: number): boolean {
  const from = tfr.effective ? Date.parse(tfr.effective) : -Infinity;
  const to = tfr.expires ? Date.parse(tfr.expires) : Infinity;
  return from <= now && now <= to;
}
