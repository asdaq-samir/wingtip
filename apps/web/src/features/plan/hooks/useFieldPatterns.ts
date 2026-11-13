import { useMemo } from "react";
import type { FitInputs, ProcedureAirport } from "../components/ProceduresRoute";
import { routeOf } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { departurePattern, trafficPattern, type TrafficPattern } from "../../../lib/trafficPattern";
import { runwayNumber } from "../lib/pattern";
import type { PlannedRoute } from "./planAddress";
import type { PlanAnswer, PlanCourse } from "./planTypes";
import { useLoad } from "./useLoad";

/**
 * The route's fields as its Procedures list them (usePlanWorkspace): each
 * one's role, runways and pattern altitude; the airplane's figures each
 * runway's fit is worked from; and the traffic patterns the map draws at
 * them for the runways picked.
 */
export function useFieldPatterns({
  planned,
  briefing,
  course,
  nav,
  fuelGal,
  pickedPatterns,
  pickedTakeoffs,
}: {
  planned: PlannedRoute;
  briefing: PlanAnswer["briefing"];
  course: PlanCourse | null;
  nav: PlanAnswer["nav"];
  /** The trip's fuel, the nav log's (Totals.fuel_gal). */
  fuelGal: number | null;
  pickedPatterns: Map<string, string>;
  pickedTakeoffs: Map<string, string>;
}) {
  // The route's fields for its Procedures, with their runways from the
  // briefing once it is in.
  const briefed = briefing.state === "ready" ? briefing.data.airports : null;
  // Whether they are coming: a briefing asked for or about to be. Half a
  // route (no departure: "Departure → HSKEL → KJAX", the owner's
  // screenshot, 2026-11-13) is planned by nothing and briefed by nothing,
  // nor is a route whose briefing failed, and their fields' runways were
  // the loading outlines for good, three empty chips under KJAX.
  const coming =
    briefing.state === "loading" || (briefing.state === "waiting" && routeOf(planned.dep, planned.dest, planned.stops) !== null);
  const procedureAirports = useMemo<ProcedureAirport[]>(() => {
    // Each field's role from its place in the whole route, a present
    // position's start (Fly Here's "@lat,lon") counted as the departure
    // though it is no field: filtered after, so the destination of a route
    // from where the airplane is stays the Destination (the owner's
    // screenshot: KSTL was listed as a departure).
    const route = [planned.dep, ...planned.stops, planned.dest];
    // A round trip names a field twice: left from as its Departure and
    // landed at as its Destination, a step each in FPL's list (the audit's
    // finding: it was listed once, as "Arrive", with no departure). A stop
    // that is the departure or the destination again is listed once.
    const fields = route
      .map((ident, i) => ({
        ident,
        role: (i === 0 ? "Departure" : i === route.length - 1 ? "Destination" : "Stop") as ProcedureAirport["role"],
      }))
      .filter(
        (f): f is { ident: string; role: ProcedureAirport["role"] } => !!f.ident && !f.ident.includes(",") && !f.ident.startsWith("@"),
      );
    const once = fields.filter(
      (f, i) => fields.findIndex((g) => g.ident === f.ident && (g.role === f.role || g.role === "Stop" || f.role === "Stop")) === i,
    );
    const fieldsOfCourse = course ? [course.departure, ...(course.stops ?? []), course.destination] : [];
    return once.map(({ ident, role }) => ({
      ident,
      role,
      runways: briefed ? (briefed[ident]?.runways ?? []) : coming ? null : [],
      patternAltitudeFt: briefed?.[ident]?.pattern?.altitude_ft ?? null,
      elevationFt: fieldsOfCourse.find((f) => sameField(f.ident, ident))?.elevation_ft ?? null,
    }));
  }, [planned.dep, planned.dest, planned.stops, briefed, coming, course]);
  // The airplane's figures and weights each runway's fit is worked from
  // (features/plan/components/procedures/runwayFit), the Brief's own load (useLoad).
  const fitAircraft = nav?.aircraft ?? null;
  const { result: fitLoad } = useLoad(fitAircraft, fuelGal);
  const takeoffLb = fitLoad?.takeoff.weightLb ?? null,
    landingLb = fitLoad?.landing.weightLb ?? null;
  const runwayFitInputs = useMemo<FitInputs | null>(
    () => (fitAircraft ? { aircraft: fitAircraft, takeoffLb, landingLb } : null),
    [fitAircraft, takeoffLb, landingLb],
  );
  // Their patterns as the map draws them: round the runway landed on, and
  // at the field left from, off its runway and out of the pattern toward
  // the next field (departurePattern) -- a round trip's both.
  const nextField = course ? (course.stops?.find((f) => f.kind !== "fix") ?? course.destination) : null;
  const towardLat = nextField?.lat ?? null,
    towardLon = nextField?.lon ?? null;
  const patterns = useMemo<TrafficPattern[]>(() => {
    const toward = towardLat != null && towardLon != null ? { lat: towardLat, lon: towardLon } : null;
    const draw = (a: ProcedureAirport, end: string | undefined, leaving: boolean) => {
      const runway = end ? a.runways?.find((r) => (r.runway_ends ?? []).some((e) => runwayNumber(e.ident) === end)) : undefined;
      const ident = runway?.runway_ends?.find((e) => runwayNumber(e.ident) === end)?.ident;
      const drawn =
        runway && ident
          ? leaving
            ? departurePattern(a.ident, runway, ident, a.patternAltitudeFt, toward)
            : trafficPattern(a.ident, runway, ident, a.patternAltitudeFt)
          : null;
      return drawn ? [drawn] : [];
    };
    return procedureAirports
      .filter((a, i, all) => all.findIndex((b) => b.ident === a.ident) === i)
      .flatMap((a) => {
        if (a.role !== "Departure") return draw(a, pickedPatterns.get(a.ident), false);
        const roundTrip = procedureAirports.some((b) => b !== a && b.role === "Destination" && b.ident === a.ident);
        return roundTrip
          ? [...draw(a, pickedTakeoffs.get(a.ident), true), ...draw(a, pickedPatterns.get(a.ident), false)]
          : draw(a, pickedPatterns.get(a.ident), true);
      });
  }, [procedureAirports, pickedPatterns, pickedTakeoffs, towardLat, towardLon]);
  return { procedureAirports, fitAircraft, runwayFitInputs, patterns };
}
