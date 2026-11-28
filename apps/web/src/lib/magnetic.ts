/**
 * Magnetic variation at a point, from the World Magnetic Model (WMM-2025,
 * NOAA NCEI and the British Geological Survey, valid 2025.0 to 2030.0):
 * the shared engine's (engine/crates/core/src/wmm.rs, through lib/engine), the
 * very code the planner's wingtip.magnetic runs for the nav log's legs and the
 * phones run with no signal, so a course the map's ruler gives and a
 * leg's agree. magnetic.test holds it to the declinations NOAA's
 * calculator gave the planner.
 *
 * Positive east, negative west, the model's own sign: magnetic is true
 * less the variation ("east is least, west is best", FAA-H-8083-25C,
 * chapter 16).
 */
import { callEngine, engineReady } from "./engine/engine";
import { flatNm } from "./geo";

export type Declination = (lat: number, lon: number) => number;

/** The variation on `day` (today by default), its UTC date's, once the
 *  engine has loaded. A date outside the model's five years is held at
 *  its nearest edge, as wingtip.magnetic holds it: variation drifts a
 *  fraction of a degree a year, and the edge of a lapsed model is nearer
 *  the truth than no course. */
export async function loadDeclination(day: Date = new Date()): Promise<Declination> {
  await engineReady;
  const date = day.toISOString().slice(0, 10);
  return (lat: number, lon: number) => callEngine("magnetic_variation", { lat, lon, date });
}

/** How far the airplane goes before the variation under it is asked of
 *  the engine again, nm. The WMM is a smooth field of degree 12 (WMM-2025's
 *  technical report, NOAA NCEI and BGS: its spherical harmonics to n = 12,
 *  so no feature narrower than some 1,700 km), and its one-degree isogonic
 *  lines lie many miles apart (NOAA's WMM-2025 declination chart); its
 *  yearly drift is a fraction of a degree. Over one nm the variation moves
 *  by a small part of the whole degree the strip's track is written in. */
const VARIATION_STEP_NM = 1;

/** The variation (`magnetic_variation`) on the UTC day of `now()`, kept
 *  while the point stays within VARIATION_STEP_NM of the one it was asked
 *  at and the day is the same: the strip's track asks it at every GPS fix,
 *  about once a second, for a figure that changes over miles and years.
 */
export function nearVariation(now: () => Date = () => new Date()): Declination {
  let last: { lat: number; lon: number; date: string; east: number } | null = null;
  return (lat, lon) => {
    const date = now().toISOString().slice(0, 10);
    if (last && last.date === date && flatNm(lat - last.lat, lon - last.lon, lat) < VARIATION_STEP_NM) return last.east;
    const east = callEngine("magnetic_variation", { lat, lon, date });
    last = { lat, lon, date, east };
    return east;
  };
}

/** A true direction as a magnetic one, for a variation east positive:
 *  the engine's magnetic_of ("east is least", FAA-H-8083-25C ch. 16), the
 *  one copy the nav log's legs and the phones turn theirs with. */
export const magneticOf = (trueDeg: number, eastDeg: number) => callEngine("magnetic_of", { true_deg: trueDeg, variation_deg: eastDeg });
