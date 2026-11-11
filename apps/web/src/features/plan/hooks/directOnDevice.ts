import { useCallback } from "react";
import { create } from "zustand";
import type { Course, Leg, NavLogAltitude, NavLogMessage, Totals } from "../../../lib/api/types";
import { callEngine, type EngineInput } from "../../../lib/engine/engine";
import { positionIdent } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { clearProblem, noConnection, raiseProblem } from "../../../lib/problems";

/**
 * A Direct To worked out on the device, for when the planner cannot be
 * asked -- in the air, most of a flight. The planner re-plans a Direct To
 * as a new route from the present position (planAddress's directToPatch),
 * and with no connection its course and nav log never came: the old
 * magenta line stayed under a "Direct to X" strip, a route half changed
 * (the offline audit's gap 3).
 *
 * Here the direct leg, from where the airplane is to the point, is the
 * engine's navlog_leg -- the great-circle true course and distance
 * (FAA-H-8083-25C ch. 16), the wind triangle, magnetic heading, ground
 * speed, time and fuel (PHAK ch. 16) -- flown at the altitude, in the
 * wind and with the airplane of the planned leg into that point; the
 * planned legs after it are kept as they were, and the totals are the
 * engine's navlog_totals over them all. Nothing is worked out where a
 * piece is missing: no route changed then, rather than half of one.
 */

/** What the plan has when the Direct To is pressed. */
export interface PlanNow {
  course: Course | null;
  legs: readonly Leg[];
  nav: NavLogAltitude | null;
  totals: Totals | null;
}

/** A route worked out on the device: the course and the nav log's lines,
 *  as the planner would have sent them, for the route from `dep` to `dest`. */
export interface DeviceRoute {
  dep: string;
  dest: string;
  course: Course;
  messages: NavLogMessage[];
}

/** The last Direct To worked out on the device: usePlan shows it while
 *  the planner has no answer of its own for that route. */
const useDeviceDirect = create<{ made: DeviceRoute | null }>(() => ({ made: null }));

/** Flat squared degrees, the longitude shrunk by the latitude's cosine:
 *  which point of the line is the target's, an index, never a figure. */
function apart(a: readonly [number, number], b: { lat: number; lon: number }): number {
  return (a[0] - b.lat) ** 2 + ((a[1] - b.lon) * Math.cos((b.lat * Math.PI) / 180)) ** 2;
}

/** The engine's leg from `start` to `end` in a planned leg's air. */
function legBetween(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  air: Leg | null,
  profile: NavLogAltitude["aircraft"] | null,
  altitudeFt: number,
) {
  return callEngine("navlog_leg", {
    start,
    end,
    altitude_ft: altitudeFt,
    // The planner's profile as it sent it: the engine reads the same file's figures.
    profile: (profile ?? null) as EngineInput<"navlog_leg">["profile"],
    wind: air?.wind ?? null,
    oat_c: air?.oat_c ?? null,
    variation_deg: callEngine("magnetic_variation", { lat: start.lat, lon: start.lon, date: new Date().toISOString().slice(0, 10) }),
  });
}

/**
 * The route direct from `fix` to the route's point `ident`, then on as
 * planned; null where it cannot be worked out here -- no course or legs
 * yet, a point not on them, or the engine refusing the figures.
 */
export function directOnDevice(
  plan: PlanNow,
  ident: string,
  fix: { lat: number; lon: number; altitudeFt?: number | null },
): DeviceRoute | null {
  const { course, legs, nav, totals } = plan;
  if (!course || !legs.length) return null;
  const points = [...(course.stops ?? []), course.destination];
  const at = points.findIndex((p) => sameField(p.ident, ident));
  const into = legs.findIndex((leg) => sameField(leg.to, ident));
  if (at < 0 || into < 0) return null;
  const target = points[at]!;
  const air = legs[into]!;
  const dep = positionIdent(fix);
  try {
    const direct: Leg = {
      ...legBetween(fix, target, air, nav?.aircraft ?? null, air.altitude_ft),
      from: dep,
      to: air.to,
      // Landed at as planned: its time on the ground kept.
      ground_min: air.ground_min ?? null,
    } as Leg;
    const flown = [direct, ...legs.slice(into + 1)];
    const summed = callEngine("navlog_totals", { legs: flown as EngineInput<"navlog_totals">["legs"] });
    // The course's own distance and bearing, departure to destination, as
    // the planner's are: the engine's great circle, no airplane needed.
    const whole = legBetween(fix, course.destination, null, null, air.altitude_ft);
    const line = course.course_line as [number, number][];
    let from = 0;
    line.forEach((p, i) => {
      if (apart(p, target) < apart(line[from]!, target)) from = i;
    });
    const departure = { ident: dep, name: "Present position", lat: fix.lat, lon: fix.lon, kind: "fix" as const };
    const messages: NavLogMessage[] = [
      ...(nav ? [{ type: "altitude" as const, ...nav }] : []),
      ...flown.map((leg) => ({ type: "leg" as const, ...leg })),
      {
        type: "done" as const,
        totals: {
          distance_nm: summed.distance_nm,
          ete_min: summed.ete_min,
          fuel_gal: summed.fuel_gal,
          unflyable_legs: summed.unflyable_legs,
          legs_without_wind: summed.legs_without_wind,
          rules: totals?.rules,
        } as Totals,
      },
    ] as NavLogMessage[];
    return {
      dep,
      dest: course.destination.ident,
      course: {
        ...course,
        departure,
        stops: (course.stops ?? []).slice(at),
        course_line: [[fix.lat, fix.lon], ...line.slice(from)],
        distance_nm: whole.distance_nm,
        bearing_deg: whole.true_course_deg ?? course.bearing_deg,
      },
      messages,
    };
  } catch {
    return null;
  }
}

/** What is said where a Direct To could not be flown without the planner. */
const NOT_CHANGED = "Not changed: no connection";
const NOT_CHANGED_ID = "direct-not-changed";

/**
 * Readies a Direct To as it is pressed (usePlanSetters): the route worked
 * out here, kept for usePlan to show while the planner has none of its
 * own; and with no connection and nothing worked out -- a point off the
 * route, no position, no legs yet -- false, the route left as it was and
 * "Not changed: no connection" said beside the map's buttons
 * (lib/problems), until the phone is back.
 */
export function useDirectReady(plan: PlanNow) {
  const { course, legs, nav, totals } = plan;
  return useCallback(
    (ident: string, fix: { lat: number; lon: number; altitudeFt?: number | null } | null) => {
      const made = fix ? directOnDevice({ course, legs, nav, totals }, ident, fix) : null;
      useDeviceDirect.setState({ made });
      if (made || globalThis.navigator?.onLine !== false) {
        clearProblem(NOT_CHANGED_ID);
        return true;
      }
      raiseProblem({ id: NOT_CHANGED_ID, title: NOT_CHANGED });
      globalThis.addEventListener?.("online", () => clearProblem(NOT_CHANGED_ID), { once: true });
      return false;
    },
    [course, legs, nav, totals],
  );
}

/** A query's flags, as far as the planner not answering goes. */
interface Asked {
  isError: boolean;
  error?: unknown;
  fetchStatus: "fetching" | "paused" | "idle";
}
const silent = (q: Asked) => q.isError || noConnection(q) || globalThis.navigator?.onLine === false;
const hasLegs = (m: readonly NavLogMessage[] | undefined) => !!m?.some((line) => line.type === "leg");

/**
 * The Direct To worked out here for the route from `dep`, shown while the
 * planner has no answer of its own for it -- no connection, or it failed
 * (usePlan): its course in the planner's course's place, its nav log's
 * lines in the stream's; the planner's answer, once it comes, wins.
 */
export function useDirectHere(
  dep: string,
  course: Asked & { data?: Course; isPlaceholderData: boolean; isLoading: boolean },
  navlog: Asked & { data?: NavLogMessage[] },
  asEntered: { data?: NavLogMessage[] },
) {
  const made = useDeviceDirect((d) => (d.made?.dep === dep ? d.made : null));
  const courseHere = !!made && (!course.data || course.isPlaceholderData) && silent(course);
  const logHere = !!made && !hasLegs(navlog.data) && !hasLegs(asEntered.data) && silent(navlog);
  return {
    courseData: courseHere ? made.course : course.data,
    courseLoading: courseHere ? false : course.isLoading,
    messages: logHere ? made.messages : null,
    onDevice: courseHere || logHere,
  };
}
