import type { RouteProfile } from "../../../../../lib/api/types";
import { callEngine } from "../../../../../lib/engine/engine";

/** A route point along the side view, for the clearance's words. */
export interface AlongPoint {
  ident: string;
  along_nm: number;
}

/** The side view's ground against `altitude_ft`, the engine's
 *  (profile_clearance): red under 500 ft of it or above, 14 CFR
 *  91.119(c)'s least height, yellow within 1,000 ft, 91.119(b)'s -- where the route
 *  first meets it, and the words a screen reader says. Null with no ground
 *  sampled. The planner's side view samples the ground along the route's
 *  line and the DOF's obstacles within a mile of it (wingtip.profile). */
export function clearanceAt(profile: RouteProfile | undefined, altitude_ft: number, points: AlongPoint[] = []) {
  if (!profile || profile.terrain.length === 0) return null;
  return callEngine("profile_clearance", {
    altitude_ft,
    along_nm: profile.terrain.map((t) => t.along_nm),
    ground_ft: profile.terrain.map((t) => t.ground_ft),
    obstacles: profile.obstacles ?? [],
    points,
  });
}

/** The room over the highest ground, or how far under it. */
export const clearanceWords = (ft: number, altFt: (n: number) => string) => (ft >= 0 ? `${altFt(ft)} ft` : `${altFt(-ft)} ft under`);
/** Where the route first meets ground at or over the altitude. */
export const strikeWords = (nm: number | null) => (nm === null ? "None" : `${Math.round(nm)} nm`);
