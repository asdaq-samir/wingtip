import type { AirportPlace } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";

/** A fact's value and the small line under it, where it has one. */
export interface FactWords {
  value: string;
  note: string | null;
}

/**
 * The airport card's Airspace fact: the class at the field's surface, the
 * engine's (surface_airspace: 14 CFR 71; a shelf over the field is not its
 * class), and where it is part-time what it is at other times, as the
 * Chart Supplement says it ("other times CLASS E", AIM 3-2-5a1). A dash
 * where the planner could not read the airspace.
 */
export function airspaceWords(surface: AirportPlace["surface_airspace"]): FactWords {
  if (!surface) return { value: "—", note: null };
  const value = `Class ${surface.class}`;
  if (!surface.part_time) return { value, note: null };
  const other = surface.otherwise ?? "G";
  return { value, note: surface.otherwise_part_time ? `Part-time, ${other} or G other times` : `Part-time, ${other} other times` };
}

/**
 * The airport card's Pattern fact: the field's traffic pattern altitude,
 * feet MSL, as the planner gives it from the engine (pattern_altitude):
 * NASR's TPA where APT_BASE publishes one, its height over the field
 * under it; else AIM 4-3-3a's "1,000 feet above ground level (AGL)" for a
 * propeller-driven airplane over the field's elevation, marked the AIM's,
 * not a published one (the AIM gives no rounding: the foot, as the Runways
 * tab says it). APT_BASE has one TPA; where NASR's remarks give others (a
 * large airplane's, a helicopter's), or the TPA it lacks, the note says
 * so, the remarks in the Runways tab. A dash with no elevation.
 */
export function patternWords(pattern: AirportPlace["pattern"]): FactWords {
  if (pattern?.altitude_ft == null) return { value: "—", note: null };
  const value = feet(pattern.altitude_ft);
  const remarked = (pattern.remarks ?? []).length > 0;
  if (pattern.published) return { value, note: `${feet(pattern.agl_ft)} AGL${remarked ? ", others differ" : ""}` };
  return { value, note: remarked ? "AIM; FAA remarks differ" : "AIM, none published" };
}
