import { callEngine, engineLoaded } from "../../engine/engine";
import type { Fix } from "./ownShip";

/*
 * Own ship's still-air glide at the picked airplane's own glide ratio
 * (its POH's Section 3, aircraftChoice's glideRatioOf), no glide under
 * 500 ft over the ground or slower than 40 kt, and a field in reach where
 * the airplane arrives over it at its pattern height (AC 90-66C's 1,000
 * ft). With no ratio -- no airplane, or none in its profile -- no glide
 * at all, never a stock airplane's. The rules and their sources are the
 * shared engine's (engine/crates/route/src/motion/glide.rs), the
 * debrief's airborne speed with them, asked through lib/engine.
 */

/** How far own ship glides in still air from its GPS altitude over
 *  `groundFt` -- the nearest field's elevation, as near as the page
 *  knows the ground -- at `glideRatio`, in nm; null on the ground, with
 *  no altitude or with no glide ratio. */
export function glideRangeNm(fix: Fix | null, groundFt: number | null | undefined, glideRatio: number | null): number | null {
  if (!fix) return null;
  return callEngine("glide_range", {
    altitude_ft: fix.altitudeFt,
    speed_kt: fix.speedKt,
    ground_ft: groundFt ?? null,
    glide_ratio: glideRatio,
  });
}

/** Whether own ship can glide, in still air at `glideRatio`, to `field` and arrive over it
 *  at pattern height -- from its GPS altitude over that field's own
 *  elevation, not the nearest one's: a field on higher ground is nearer
 *  the airplane's height. False where either height is not known. */
export function reachesField(
  fix: Fix | null,
  field: { distance_nm: number; elevation_ft?: number | null },
  glideRatio: number | null,
): boolean {
  if (!fix) return false;
  return callEngine("glide_reaches", {
    glide_ratio: glideRatio,
    altitude_ft: fix.altitudeFt,
    speed_kt: fix.speedKt,
    distance_nm: field.distance_nm,
    elevation_ft: field.elevation_ft ?? null,
  });
}

/** Own ship moving at flying speed: in the air, or about to be. Not yet
 *  known, so not underway, until the engine is in: the flying mode, the
 *  own-ship mark and the Ready to Fly prompt ask it on the page's first
 *  draw, which no longer waits for the engine, and with location on and a
 *  fix in hand that threw ("Part of the app didn't load", the owner's
 *  phone, 2026-11-11). The next fix, a second later, asks again. */
export function underway(fix: Fix | null): boolean {
  if (!engineLoaded()) return false;
  return callEngine("underway", { speed_kt: fix?.speedKt ?? null });
}
