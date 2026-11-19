import type { NavLogAltitude, AltitudeSegment } from "../../lib/api/types";
import { feet } from "../../lib/format";
import { altFt, feetBelowClouds } from "../plan";
import { andList } from "../../lib/listWords";
import { ceilingValue, ceilingWords, EASTBOUND, otherHalfOf, ruleCourse, WESTBOUND, type Step } from "./altitudeSteps";

/** What sets the whole route's VFR ceiling, the lower of two
 *  (wingtip.altitude's band_ceiling): the clouds (14 CFR 91.155's distance
 *  under the lowest forecast near a leg) or the airplane. Class B is none:
 *  the route is planned through it with its clearance (91.131(a)(1)). */
function ceilingReason(s: NavLogAltitude["altitude_selection"]): string | null {
  if (s.band_ceiling_ft == null) return null;
  if (s.cloud_ceiling_ft != null && s.cloud_ceiling_ft === s.band_ceiling_ft) return `Under the clouds near ${s.cloud_station}`;
  return "The airplane's service ceiling";
}

/** Consecutive segments under the same ceiling, for "the ceiling leg by
 *  leg": [{from_nm, to_nm, band_ceiling_ft}]. */
function ceilingRuns(segments: AltitudeSegment[]): AltitudeSegment[] {
  const runs: AltitudeSegment[] = [];
  for (const s of segments) {
    const last = runs[runs.length - 1];
    if (last && last.band_ceiling_ft === s.band_ceiling_ft) last.to_nm = s.to_nm;
    else runs.push({ ...s });
  }
  return runs;
}

/** The steps of a VFR choice: the floor, the ceiling (the lower of the
 *  clouds and the airplane) and the rule. */
export function vfrSteps(nav: NavLogAltitude): Step[] {
  const s = nav.altitude_selection;
  const ceilingParts: string[] = [];
  // The clouds, 14 CFR 91.155's distance below the lowest ceiling the
  // TAFs near the legs forecast for the flight, the engine's: 500 ft, or
  // 1,000 ft where that is at 10,000 ft or above.
  // Where the clouds leave no altitude, the band leaves them out, and a
  // sentence of its own under the ceiling says so.
  if (s.cloud_base_ft != null && s.cloud_ceiling_ft != null && s.cloud_clearance_kept) {
    ceilingParts.push(
      `${altFt(feetBelowClouds(s.cloud_ceiling_ft))} ft under the clouds forecast at ${altFt(
        s.cloud_base_ft,
      )} ft near ${s.cloud_station} (14 CFR 91.155)`,
    );
  } else if (!s.weather_unavailable.includes("ceiling_visibility")) {
    ceilingParts.push("no ceiling forecast near the legs");
  }
  const ceilingPart = ceilingWords(nav, "the");
  if (ceilingPart) ceilingParts.push(ceilingPart);
  const runs = ceilingRuns(s.segments);
  const runsText =
    runs.length > 1
      ? runs
          .map((r, i) => {
            const why =
              r.cloud_ceiling_ft != null && r.cloud_ceiling_ft === r.band_ceiling_ft
                ? `the clouds near ${r.cloud_station}`
                : "the service ceiling";
            const where =
              i === 0
                ? `for the first ${r.to_nm} nm`
                : i === runs.length - 1
                  ? "the rest of the way"
                  : `from ${r.from_nm} to ${r.to_nm} nm`;
            return `${r.band_ceiling_ft === null ? "none" : feet(r.band_ceiling_ft)} (${why}) ${where}`;
          })
          .join(", then ")
      : null;
  const otherHalf = otherHalfOf(s);
  const highestLegal = Math.max(...s.segments.flatMap((seg) => seg.candidates_ft), ...s.candidates_ft);
  const cloudsLeaveNone = !s.cloud_clearance_kept && s.cloud_base_ft != null;
  return [
    {
      key: "floor",
      title: "Floor",
      detail: "Terrain and obstacles, with margin",
      value: feet(s.floor_ft),
      body: (
        <>
          {/* As the planner keeps it (wingtip.terrain): the owner's 1,000 ft over the ground, and 14 CFR 91.119(b) and
              (c) over obstacles, towns being the Census Bureau's urban areas and places (wingtip.congested). */}
          The highest ground along the course plus 1,000 ft, or the tallest charted obstacle within 5 nm of it plus 1,000 ft over or within
          2,000 ft of a town (14 CFR 91.119(b)) and 500 ft elsewhere (91.119(c)), whichever is higher, rounded up to the next 100 ft. Worked
          out leg by leg as well, so a leg over lower ground may fly lower.
        </>
      ),
    },
    {
      key: "ceiling",
      title: "Ceiling",
      detail: (
        <>
          {ceilingReason(s)}
          {cloudsLeaveNone && (
            <span className="block text-destructive">
              Under the clouds near {s.cloud_station}, no VFR altitude on{" "}
              {s.segments.some((seg) => seg.cloud_clearance_kept) ? "some legs" : "the route"}
            </span>
          )}
        </>
      ),
      value: ceilingValue(s),
      body: (
        <>
          The lowest of {andList(ceilingParts)}.{runsText && ` Leg by leg: ${runsText}. A shelf or a cloud caps only the legs under it.`}
          {cloudsLeaveNone && (
            <span className="text-destructive">
              {" "}
              No altitude keeps {altFt(feetBelowClouds(s.cloud_ceiling_ft))} ft below the clouds forecast at {altFt(s.cloud_base_ft!)} ft
              near {s.cloud_station} on {s.segments.some((seg) => seg.cloud_clearance_kept) ? "some legs" : "the route"}: VFR is not
              possible there as forecast, and the altitudes there leave the clouds out.
            </span>
          )}
        </>
      ),
    },
    {
      key: "rule",
      title: `${s.eastbound ? "Eastbound: odd" : "Westbound: even"} thousands plus 500 ft (14 CFR 91.159)`,
      body: (
        <>
          {`A magnetic course of ${ruleCourse(s.course_magnetic_deg)} is `}
          {s.eastbound ? EASTBOUND : WESTBOUND}
          {s.hemispheric_rule_from_ft != null && s.hemispheric_rule_from_ft >= s.floor_ft
            ? `. The rule applies above ${altFt(s.hemispheric_rule_from_ft)} ft, 3,000 ft over the lowest ground; below that every 500 ft is legal too. `
            : ". "}
          {s.candidates_ft.length > 0
            ? `Legal for the whole route: ${s.candidates_ft.map((a) => altFt(a)).join(", ")} ft`
            : "No one altitude is legal for the whole route"}
          {otherHalf.length > 0 &&
            `. ${otherHalf.length === 1 ? "One leg flies" : `${otherHalf.length} legs fly`} a magnetic course in the other half (${otherHalf
              .map((seg) => `${ruleCourse(seg.course_magnetic_deg ?? 0)} from ${seg.from_nm} nm`)
              .join(", ")}) and ${otherHalf.length === 1 ? "is" : "are"} rounded to its altitudes`}
          {Number.isFinite(highestLegal) && highestLegal > (s.candidates_ft[s.candidates_ft.length - 1] ?? -Infinity)
            ? `; leg by leg, up to ${altFt(highestLegal)} ft.`
            : "."}
        </>
      ),
    },
  ];
}
