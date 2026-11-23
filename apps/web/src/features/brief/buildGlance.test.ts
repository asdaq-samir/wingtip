import { expect, test } from "vitest";
import type { Airport, Course, Leg, Totals } from "../../lib/api/types";
import { arrivalMin, navLogRows } from "../plan";
import { buildGlance } from "./buildGlance";

const airport = (ident: string, lat: number, lon: number): Airport =>
  ({ ident, name: `${ident} field`, lat, lon, elevation_ft: 900 }) as Airport;
// C81 to KDEN with the two fuel stops the planner suggested (the HIG audit's
// flight, 2026-11-23): 7 h 21 m in the air and half an hour on the ground at each.
const course = {
  departure: airport("C81", 42.32, -88.07),
  stops: [airport("KGCT", 37.29, -98.9), airport("KIML", 40.51, -101.62)],
  destination: airport("KDEN", 39.86, -104.67),
} as unknown as Course;
const leg = (from: string, to: string, ete: number, ground: number | null): Leg =>
  ({ from, to, distance_nm: ete * 2, ete_min: ete, ground_min: ground, true_course_deg: 270, wind: null }) as unknown as Leg;
const legs = [leg("C81", "KGCT", 175, 30), leg("KGCT", "KIML", 140, 30), leg("KIML", "KDEN", 126, null)];
const totals = { ete_min: 441, ground_min: 60 } as Totals;
const leaving = new Date("2026-11-23T18:39:00Z");

test("the Brief's Arrive is FPL's destination time: the air and the turnarounds at the stops (H1)", () => {
  const glance = buildGlance({
    briefing: null,
    course,
    legs,
    landings: ["C81", "KGCT", "KIML", "KDEN"],
    dep: "C81",
    dest: "KDEN",
    leaving,
    eteMin: totals.ete_min,
    arriveMin: arrivalMin(totals),
    checks: [],
    picks: { pattern: new Map(), takeoff: new Map() },
    ownCallSign: "Cessna 12345",
    items: [],
    leastMarginGal: null,
    loaded: null,
  });
  // FPL's timeline times the destination by the nav log's rows (RouteTimeline's arrivalAt).
  const destination = navLogRows(course, [], legs).at(-1)!;
  expect(destination.minutesFlown).toBe(501);
  expect(glance.arrive?.at).toBe(new Date(leaving.getTime() + destination.minutesFlown! * 60_000).toISOString());
  // 18:39Z + 7 h 21 m in the air + 1 h on the ground: 03:00Z, not 02:00Z.
  expect(glance.arrive?.at).toBe("2026-11-24T03:00:00.000Z");
  // En Route keeps the time in the air alone.
  expect(glance.enroute.eteMin).toBe(441);
});

test("with no stops the arrival is the time in the air, and none without it", () => {
  expect(arrivalMin({ ete_min: 95, ground_min: 0 })).toBe(95);
  expect(arrivalMin({ ete_min: null, ground_min: 30 } as unknown as Totals)).toBeNull();
  expect(arrivalMin(null)).toBeNull();
});
