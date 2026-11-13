import { useCallback, useMemo } from "react";
import { altitudesOf } from "../../../lib/identSchema";
import { cruiseTasOf, shortName, taxiFuelOf } from "../../../lib/aircraftChoice";
import { clockTime, flightLevel } from "../../../lib/format";
import { useMinuteClock } from "../../../lib/useMinuteClock";
import { legsWithoutWind, windsOutOfDate } from "../format";
import { placeName } from "../lib/radio";
import { distanceNm } from "../../../lib/geo";
import { placeOf, useAirportIndex } from "../../../lib/airportIndex";
import { useProgressToast } from "../../../lib/useProgressToast";
import { useVerdict } from "../../../lib/verdict";
import type { PointAltitude } from "../components/PointAltitudeDialog";
import { briefMarkOf, marksOf, progressWords, tightLegWords } from "./planWords";
import { useFieldColours } from "./useFieldColours";
import { useFlightToSave } from "./useFlightToSave";
import type { PlanRoute } from "./usePlanRoute";
import type { PlanAnswerModel } from "./usePlanAnswer";
import type { PlanFpl } from "./usePlanFpl";

/**
 * What the screen says of the plan (usePlanWorkspace): its progress, its
 * figures before the nav log's, its head line, its tabs' and buttons'
 * marks, what a point's altitude is, what planning again would bring in
 * fresh, the route's fields' colours (useFieldColours), and the flight to
 * save and file (useFlightToSave).
 */
export function usePlanBrief(route: PlanRoute, answer: PlanAnswerModel, { profileReady }: PlanFpl, waypointStops: Set<string>) {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const { planned, routed, depart, engine, altitudes } = route;
  const { s, course, aircraft, profiles } = answer;
  // One floating progress line for the whole page (planWords'
  // progressWords). A toast however far out the panel is, at the pilot's
  // ask, where the flight's line said it with the panel out: that line
  // keeps the figures (FlightLine). A toast takes no tap but its own
  // controls' (index.css), so the route's box under it from the top still does.
  useProgressToast(progressWords(s.navStage, s.stage, s.briefing.state === "loading"));
  // The flight's figures before the nav log's, at the pilot's ask for them as soon as can be (FlightLine's `estimate`): this
  // route's course distance, the airplane's book cruise speed and burn (its own where set) and its profile's taxi fuel.
  const profile = profiles?.find((p) => p.name === aircraft.profile);
  const cruiseTasKt = cruiseTasOf(aircraft, profiles);
  const fuelBurnGph = aircraft.fuelBurnGph ?? profile?.fuel_burn_gph ?? null;
  const taxiFuelGal = engine ? taxiFuelOf(aircraft, profiles) : null;
  // Before the course comes, at the tap: the great circles between the
  // route's points, placed from the airport index the browser keeps
  // (placeOf) -- the figures at once, where they waited a second or more
  // on the planner's course line (the owner, 2026-10-28: "Why isn't
  // planning instant?"). None where a point is not an airport the index
  // places (a waypoint, a pilot's own point): the course's then. The
  // engine works the great circles out (lib/geo), so none until its .wasm
  // is there (`engine`, usePlanRoute's useEngineWhen), as useAway waits.
  const index = useAirportIndex(true, routed);
  const straightNm = useMemo(() => {
    if (!engine || !routed || !index || !planned.dest) return null;
    const points = [planned.dep, ...planned.stops, `${planned.dest}`].map((p) => placeOf(index, p));
    if (points.some((p) => !p)) return null;
    let nm = 0;
    for (let i = 1; i < points.length; i++) nm += distanceNm(points[i - 1]!, points[i]!);
    return nm;
  }, [engine, routed, index, planned.dep, planned.stops, planned.dest]);
  const estimate = useMemo(
    () =>
      routed && course && course.destination.ident === planned.dest && course.departure.ident === planned.dep
        ? { distanceNm: course.distance_nm, cruiseTasKt, fuelBurnGph, taxiFuelGal }
        : straightNm != null
          ? { distanceNm: straightNm, cruiseTasKt, fuelBurnGph, taxiFuelGal }
          : null,
    [routed, course, planned.dep, planned.dest, cruiseTasKt, fuelBurnGph, taxiFuelGal, straightNm],
  );
  // A leg where no 500 ft step fits (planWords' tightLegWords).
  const tightLeg = useMemo(() => tightLegWords(s.nav?.altitude_selection.segments), [s.nav]);
  const landedStops = useMemo(() => (course?.stops ?? []).filter((stop) => stop.kind !== "fix").map((stop) => stop.ident), [course]);
  // Each tab's mark: the worst of its findings on the Brief's Go / No-Go
  // (lib/verdict), red for something to fix, amber for something to look at.
  const verdict = useVerdict((v) => v.items);
  const marks = useMemo(() => marksOf(verdict), [verdict]);
  const landings = useMemo(() => [...new Set([planned.dep, ...landedStops, planned.dest])], [planned.dep, landedStops, planned.dest]);
  // The route's fields' chips' colours (useFieldColours).
  const { metarColour } = useFieldColours({ briefing: s.briefing, planned, waypointStops });
  // A caution on the pilot's own altitude, or one tight in its band, marked
  // on the Profile button where the caution is said, as the AI brief's mark
  // is on its own (the owner, 2026-11-05: "The red dot can be on profile
  // (like brief) instead of the altitude"); not for a route with no legal
  // altitude, which the altitude's field says in red itself.
  const altitudeMark = !profileReady || s.unflyable || !s.nav ? null : s.nav.cautions?.length ? "caution" : tightLeg ? "tight" : null;
  // The cautions' reasons, each once, for the Profile card's head, where
  // the mark above points (ProfileCard).
  const profileCautions = useMemo(() => [...new Set((s.nav?.cautions ?? []).flatMap((c) => c.reasons))], [s.nav]);
  // The route's airports' airspace classes, as the course came with them:
  // the pills coloured the moment it is in. Each made again only when what
  // it reads changes, as the box is drawn again only then (fromRoutePanel's memo).
  const routeAirport = useCallback(
    (ident: string) => [course?.departure, ...(course?.stops ?? []), course?.destination].find((a) => a?.ident === ident),
    [course],
  );
  const airspaceOf = useCallback((ident: string) => routeAirport(ident)?.airspace_class ?? undefined, [routeAirport]);
  // The altitude at a point, as its menu offers it: the pilot's own, else
  // a waypoint's cruise -- the leg flown to it -- or an airport's pattern.
  const altitudeAt = useCallback(
    (ident: string, waypoint: boolean): PointAltitude => {
      const ownAltitudes = altitudesOf(altitudes);
      const planned = waypoint ? s.legs.find((leg) => leg.to === ident)?.altitude_ft : routeAirport(ident)?.pattern_altitude_ft;
      // A waypoint's own altitude, flown to it, as the planner found it.
      const caution = waypoint ? s.nav?.cautions.find((c) => c.to_ident === ident)?.reasons : undefined;
      return { feet: ownAltitudes[ident] ?? planned ?? null, own: ident in ownAltitudes, caution };
    },
    [altitudes, s.legs, s.nav, routeAirport],
  );
  // Its head: the route by name, and its plan under it -- where from and
  // to, the airplane, the altitude, when -- as an airport's card has its
  // name and where it is. Worked out in a memo: the course's and the
  // airplane's fields handed to plain functions in the render counted, to
  // the React Compiler, as the objects handed over, and it gave up the
  // memos before it that read them across the hooks between.
  const aircraftLabel = aircraft.label;
  const briefLine = useMemo(() => {
    if (!course) return null;
    const cruiseFt = s.legs.length ? Math.max(...s.legs.map((leg) => leg.altitude_ft)) : null;
    const from = placeName(course.departure.name, course.departure.ident);
    return [
      s.local ? from : `${from} to ${placeName(course.destination.name, course.destination.ident)}`,
      shortName(aircraftLabel),
      // Written as the route box writes it (FL-090), the owner's format.
      cruiseFt ? flightLevel(cruiseFt) : null,
      depart ? `leaving ${clockTime(new Date(depart))}` : "leaving now",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [course, s.legs, s.local, aircraftLabel, depart]);
  // The flight to save and file, and what the Brief reads of it
  // (useFlightToSave).
  const saving = useFlightToSave({
    s,
    planned,
    routed,
    course,
    aircraft,
    depart,
    altitudes,
    localMin: route.localMin,
    address: route.address,
    setAddress: route.setAddress,
  });
  // What planning again would bring in fresh, said by the refresh's dot:
  // winds past the forecast's period the legs were flown on, legs flown
  // with none, and the briefing's weather that could not be fetched again.
  const minute = useMinuteClock();
  const stale = [
    windsOutOfDate(s.totals, minute, depart) && "the winds are out of date",
    s.totals && legsWithoutWind(s.totals) && "some legs have no winds",
    (s.briefing.state === "failed" || (s.briefing.state === "ready" && s.briefing.refreshError)) && "the weather could not be fetched",
  ].filter((why): why is string => !!why);
  return {
    ...saving,
    unflyable: s.unflyable,
    unflyableBrief: s.unflyable?.brief,
    estimate,
    tightLeg,
    landedStops,
    landings,
    // The route's ends, for a stop's search (SearchNear).
    searchNear: course ? [course.departure, course.destination].map((end) => `${end.lat.toFixed(3)},${end.lon.toFixed(3)}`).join(";") : "",
    marks,
    // The Brief's own, on its button: the worst of its pages'.
    briefMark: briefMarkOf(marks),
    metarColour,
    altitudeMark,
    profileCautions,
    airspaceOf,
    altitudeAt,
    briefLine,
    stale,
  };
}
