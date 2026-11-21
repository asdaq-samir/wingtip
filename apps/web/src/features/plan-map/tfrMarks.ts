import type { Tfr } from "../../lib/api/types";
import { CHART } from "../../lib/tokens";
import { instantOf } from "../../lib/format";

// A temporary flight restriction's ink on the map, and whether it is in
// force (features/plan-map/layers/TfrGl draws them; TfrCard is its card).

/** The FAA's own TFR red, as tfr.faa.gov and every EFB draw one. */
export const TFR_RED = CHART.tfr;

/** Whether a TFR is in force now: one with no times is taken as so, and
 *  a time that does not read is no bound, as the engine's gonogo_tfr_when
 *  takes it. Date.parse's NaN made every comparison false, so a TFR whose
 *  time did not read was drawn as not in force, the unsafe side. */
export function inForce(tfr: Tfr, now: number): boolean {
  const from = instantOf(tfr.effective) ?? -Infinity;
  const to = instantOf(tfr.expires) ?? Infinity;
  return from <= now && now <= to;
}
