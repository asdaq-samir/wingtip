import type { ReactNode } from "react";
import type { AltitudeSegment, NavLogAltitude } from "../../lib/api/types";
import { feet } from "../../lib/format";
import { altFt, bearing } from "../plan";

/** One step: its name, the reason in a line under it, and its figure at
 *  the end, as a list's row has them (ListRow); how it was reached folds
 *  under it. */
export interface Step {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  value?: string;
  body: ReactNode;
}

/** The halves of the direction of flight (14 CFR 91.159(a), 91.179(b)), north written 360 as every
 *  course is (lib/format's bearing): 0.4° read "360° is eastbound (0° through 179°)" (CODE-15). */
export const EASTBOUND = "eastbound (360° through 179°)";
export const WESTBOUND = "westbound (180° through 359°)";

/** A course as the rule sorts it: cut to the whole degree, not rounded,
 *  as the planner sorts the exact course (the engine's is_eastbound) --
 *  a course of 179.6° rounded read "180° is eastbound" -- north as 360,
 *  as every bearing is written (lib/format's bearing). */
export const ruleCourse = (course: number) => bearing(Math.floor(course));

/** The airplane as its profile names it, "Cessna 172", and its own
 *  name where the profile gives no type: never put in capitals, which
 *  turned a profile's "c172" into a shout in the middle of a sentence. */
const airplaneName = (nav: NavLogAltitude) => nav.aircraft?.type ?? nav.aircraft?.name ?? "airplane";

/** The route's ceiling as the band has it, "none" where nothing caps it. */
export const ceilingValue = (s: NavLogAltitude["altitude_selection"]) => (s.band_ceiling_ft !== null ? feet(s.band_ceiling_ft) : "none");

/** Legs whose own magnetic course is in the other half of the rule
 *  from the route's, and so round to the other set of altitudes. */
export const otherHalfOf = (s: NavLogAltitude["altitude_selection"]): AltitudeSegment[] =>
  s.segments.filter((seg) => seg.eastbound !== null && seg.eastbound !== undefined && seg.eastbound !== s.eastbound);

/** The airplane's service ceiling, said after `lead`; nothing with no airplane. */
export function ceilingWords(nav: NavLogAltitude, lead: string): string | null {
  // A service ceiling is a density altitude: the forecast temperatures
  // bring it down on a warm day and lift it on a cold one.
  // With no airplane there is none: the band is the rules' and the
  // airspace's alone.
  const bookCeiling = nav.aircraft?.service_ceiling_ft ?? null;
  const ceilingToday = nav.altitude_selection.service_ceiling_ft;
  return bookCeiling == null
    ? null
    : ceilingToday != null && Math.abs(ceilingToday - bookCeiling) >= 100
      ? `${lead} ${airplaneName(nav)}'s service ceiling, ${altFt(bookCeiling)} ft density altitude, which is ${altFt(
          ceilingToday,
        )} ft in the forecast temperatures`
      : `${lead} ${airplaneName(nav)}'s service ceiling of ${altFt(bookCeiling)} ft`;
}

/** The steps of an IFR choice: the floor, the ceiling and the rule, in
 *  the planner's wingtip.ifr words. */
export function ifrSteps(nav: NavLogAltitude): Step[] {
  const s = nav.altitude_selection;
  const otherHalf = otherHalfOf(s);
  const ceilingToday = s.service_ceiling_ft;
  const bookCeiling = nav.aircraft?.service_ceiling_ft ?? null;
  // The highest obstacle a leg's IFR floor rests on, and whether any leg
  // is over a mountainous area (14 CFR Part 95).
  const highest = s.segments.reduce<AltitudeSegment | null>(
    (top, seg) => (seg.highest_ft != null && (top === null || (seg.highest_ft ?? 0) > (top.highest_ft ?? 0)) ? seg : top),
    null,
  );
  // The airways flown, each with its published altitudes, once: a V100
  // flown over three segments of the same MEA is one line.
  const airways = s.segments
    .flatMap((seg) => (seg.airway ? [seg.airway] : []))
    .filter((a, i, all) => all.findIndex((b) => b.id === a.id && b.mea_ft === a.mea_ft && b.maa_ft === a.maa_ft) === i);
  // Under IFR the ceiling is the airplane's service ceiling, or an
  // airway's MAA under it (wingtip.altitude's band): no cloud.
  const ifrCeilingReason =
    s.band_ceiling_ft == null
      ? null
      : s.band_ceiling_ft === (ceilingToday ?? bookCeiling)
        ? "The airplane's service ceiling"
        : airways.some((a) => a.maa_ft === s.band_ceiling_ft)
          ? "The airway's MAA"
          : null;
  return [
    {
      key: "floor",
      title: "Minimum IFR altitude",
      // 14 CFR 91.177(a): an airway's MEA, else 1,000 ft (2,000 in the
      // mountains) over the highest obstacle within 4 nm of the course.
      detail: airways.length > 0 ? "The airway's MEA, or obstacles within 4 nm" : "Obstacles within 4 nm, with margin",
      value: feet(s.floor_ft),
      body: (
        <>
          1,000 ft above the highest obstacle within 4 nm of the course, 2,000 ft over a mountainous area the FAA designates (14 CFR
          91.177(a)(2), Part 95){s.mountainous ? ", as part of this route is" : ""}, rounded up to the next 100 ft: the ground from USGS
          heights, and the FAA&apos;s obstacle file.
          {highest &&
            ` The highest, ${altFt(highest.highest_ft ?? 0)} ft, is ${highest.highest_is_obstacle ? "a charted obstacle" : "the ground"} from ${highest.from_nm} to ${highest.to_nm} nm.`}{" "}
          Worked out leg by leg, so a leg over lower ground may fly lower.
          {airways.length > 0
            ? airways
                .map(
                  (a) =>
                    ` Along ${a.id} from ${a.from} the published MEA, ${altFt(a.mea_ft ?? a.gnss_mea_ft ?? 0)} ft${
                      a.mea_ft == null ? " (GNSS)" : ""
                    }, is the floor instead (91.177(a)(1))${
                      a.moca_ft != null ? `; its MOCA, ${altFt(a.moca_ft)} ft, is legal within 22 nm of the VOR, not planned` : ""
                    }${a.maa_ft != null ? `; nothing above its MAA, ${altFt(a.maa_ft)} ft` : ""}.`,
                )
                .join("")
            : " Off an airway the route is planned direct: on one, its published MEA governs (91.177(a)(1))."}
        </>
      ),
    },
    {
      key: "ceiling",
      title: "Ceiling",
      detail: ifrCeilingReason,
      value: ceilingValue(s),
      body: (
        <>
          {ceilingWords(nav, "The") ? `${ceilingWords(nav, "The")}. ` : ""}
          Under IFR no cloud or Class A caps it: the clearance takes the flight into each.
        </>
      ),
    },
    {
      key: "rule",
      title: `${s.eastbound ? "Eastbound: odd" : "Westbound: even"} thousands (14 CFR 91.179)`,
      body: (
        <>
          {`A magnetic course of ${ruleCourse(s.course_magnetic_deg)} is ${s.eastbound ? EASTBOUND : WESTBOUND}. `}
          ATC assigns the altitude in controlled airspace (91.179(a)), by this same direction of flight (FAA Order JO 7110.65, 4-5-2); in
          uncontrolled airspace it is the rule (91.179(b)).{" "}
          {s.candidates_ft.length > 0
            ? `Legal for the whole route: ${s.candidates_ft.map((a) => altFt(a)).join(", ")} ft`
            : "No one altitude is legal for the whole route"}
          {otherHalf.length > 0 &&
            `. ${otherHalf.length === 1 ? "One leg flies" : `${otherHalf.length} legs fly`} a magnetic course in the other half and ${otherHalf.length === 1 ? "is" : "are"} rounded to its altitudes`}
          .
        </>
      ),
    },
  ];
}
