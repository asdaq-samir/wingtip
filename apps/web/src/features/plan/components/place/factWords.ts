import type { AirportPlace } from "../../../../lib/api/types";
import { feet } from "../../../../lib/format";
import { changeNote, classNow, type SurfaceHours } from "./surfaceHoursWords";

/** A fact's value and the small line under it, where it has one. */
export interface FactWords {
  value: string;
  note: string | null;
}

/**
 * The airport card's Airspace fact, short to fit the strip across a phone
 * (the owner, 2026-11-14: "keep the info strip compact enough so pilot
 * doesn't have to scroll"): the class in force at the field's surface now,
 * the engine's (surface_airspace: 14 CFR 71; a shelf over the field is not
 * its class), "D"; where it is part-time, the note its next change today
 * from the engine's surface_hours, "G after 22:00" or "D from 06:00", or
 * "Part-time" where the hours are not known (surfaceHoursWords). A dash where
 * the planner could not read the airspace.
 */
export function airspaceWords(surface: AirportPlace["surface_airspace"], hours: SurfaceHours | null): FactWords {
  if (!surface) return { value: "—", note: null };
  return { value: classNow(surface, hours) ?? surface.class, note: changeNote(surface, hours) };
}

/**
 * The airport card's Pattern fact: the field's traffic pattern altitude,
 * feet MSL, as the planner gives it from the engine (pattern_altitude):
 * NASR APT_BASE's TPA (feet above the field) over its elevation where the
 * FAA publishes one, else AIM 4-3-3a's "1,000 feet above ground level
 * (AGL)" for a propeller-driven airplane over it. No note in the strip
 * (the owner, 2026-11-14: "don't have to mention AIM either"): the Runways
 * tab's Pattern altitude row says which, with NASR's remarks on it. A
 * dash with no elevation.
 */
export function patternWords(pattern: AirportPlace["pattern"]): FactWords {
  return { value: pattern?.altitude_ft == null ? "—" : feet(pattern.altitude_ft), note: null };
}

/** The Distance fact's figure without its compass point, "12 nm": the
 *  strip's room (nmAway writes no tenths past 10 nm). */
export const distanceWords = (words: string | null | undefined) => (words ? words.split(" ").slice(0, 2).join(" ") : "—");
