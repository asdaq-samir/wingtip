import { bearing, threeFigures } from "../../lib/format";
import { magneticOf } from "../../lib/magnetic";
import type { StripFigure } from "../../components/FigureStrip";

/**
 * The airplane's track as the strip's fourth figure, in place of the fuel
 * (the owner, 2026-11-21: "replace Fuel with Track"), as a flight app shows
 * "TRK": the direction the GPS says it is moving over the ground, in whole
 * degrees MAGNETIC, three figures, north 360 ("274°", "004°"; FAA Order
 * JO 7110.65, 2-4-17 for 360), since a pilot flies and ATC assigns headings
 * by the compass. The GPS gives a true course (the W3C Geolocation API's
 * `coords.heading`, degrees clockwise from true north, section 9.2; a dry
 * run's, the plan's track), so the magnetic variation at the fix, the
 * engine's WMM (`magnetic_variation`), is taken off it ("east is least",
 * FAA-H-8083-25C ch. 16) through lib/magnetic's magneticOf.
 *
 * A dash where there is no figure to give: no fix (a plan with no
 * position), no course in it (a GPS gives none while stationary), or the
 * airplane not at flying speed, `moving` the engine's `underway` -- a
 * course over the ground at a walk is noise.
 */
export function trackFigure(
  fix: { lat: number; lon: number; headingDeg: number | null } | null,
  moving: boolean,
  variationEastDeg: (lat: number, lon: number) => number,
): StripFigure {
  const base = { name: "Track", testId: "strip-track" };
  if (!fix || !moving || fix.headingDeg == null || !Number.isFinite(fix.headingDeg))
    return { ...base, value: "—", said: "Track: none from this position" };
  const magnetic = magneticOf(fix.headingDeg, variationEastDeg(fix.lat, fix.lon));
  return { ...base, value: bearing(magnetic), said: `Track, magnetic, ${threeFigures(magnetic).split("").join(" ")} degrees` };
}
