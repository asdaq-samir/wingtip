import { useCallback, useEffect } from "react";
import { api } from "../../../lib/api/client";
import type { AircraftChoice } from "../../../lib/api/types";
import { N_NUMBER, shortName } from "../../../lib/aircraftChoice";
import { useAtcRadio, useRadioActions } from "../../../lib/atcRadio";
import { useGeo } from "../../../lib/geo";
import { MAX_STOPS } from "../../../lib/identSchema";
import { usePointActions } from "../../../lib/map/cards/pointActions";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { useEngineReady } from "../../../lib/engine/useEngineReady";
import type { TypedProcedure } from "../../../lib/procedures";
import type { RouteParts } from "../components/RouteBox";
import type { PlannedRoute } from "./planAddress";
import type { PlanCourse } from "./planTypes";
import type { useRouteEdits } from "./useRouteEdits";

type RouteEdits = ReturnType<typeof useRouteEdits>;

/**
 * What the map's cards and the radio do to the route (usePlanWorkspace),
 * registered while the workspace is up: the VOR and fix cards' Add to
 * Route, Direct To and Avoid Class B (lib/map/cards/pointActions), and the
 * radio's calls to us and a clearance read back (lib/atcRadio).
 */
export function useMapActions({
  course,
  planned,
  aircraft,
  classBAvoided,
  setStops,
  setRoute,
  directToChartPoint,
  acceptClassB,
  flyAltitude,
  typeProcedures,
}: {
  course: PlanCourse | null;
  planned: PlannedRoute;
  aircraft: AircraftChoice;
  /** The pilot avoids Class B (`class_b=0`). */
  classBAvoided: boolean;
  setStops: RouteEdits["setStops"];
  setRoute: RouteEdits["setRoute"];
  directToChartPoint: (to: { ident: string }) => void;
  acceptClassB: RouteEdits["acceptClassB"];
  flyAltitude: RouteEdits["flyAltitude"];
  typeProcedures: (typed: TypedProcedure[], route: { dep: string; dest: string }) => Promise<void>;
}) {
  // A field's card or a waypoint's diamond on the chart, put in the
  // stops where it bends the route least (bestStopIndex): landed at, or
  // flown through.
  const geo = useGeo();
  const addStopAt = useCallback(
    (at: { ident: string; lat: number; lon: number }) => {
      // The planner's limit, as the airport card's Add Stop keeps it.
      if (!geo || !course || planned.stops.length >= MAX_STOPS) return;
      const points = [course.departure, ...(course.stops ?? []), course.destination];
      if (points.some((p) => p.ident === at.ident)) return;
      const stops = [...planned.stops];
      stops.splice(geo.bestStopIndex(points, at), 0, at.ident);
      setStops(stops);
    },
    [geo, course, planned.stops, setStops],
  );
  // The map's VOR and fix cards' Add to Route and Direct To, while there
  // is a route (lib/map/cards/pointActions).
  const hasFix = useOwnShip((st) => st.enabled && st.fix !== null);
  useEffect(() => {
    const routed = !!course && planned.stops.length < MAX_STOPS;
    usePointActions.setState({
      addToRoute: routed ? addStopAt : null,
      directTo: routed && hasFix ? directToChartPoint : null,
      avoidClassB: course && !classBAvoided ? () => acceptClassB(false) : null,
      courseLine: course?.course_line ?? null,
    });
    return () => usePointActions.setState({ addToRoute: null, directTo: null, avoidClassB: null, courseLine: null });
  }, [course, planned.stops.length, addStopAt, directToChartPoint, hasFix, classBAvoided, acceptClassB]);
  // The radio's calls to us (lib/atcRadio): ours by the airplane's
  // registration, the one picked or one of the pilot's own; Direct To the
  // place a call said, found near the route, from where the airplane is,
  // and the altitude it gave flown.
  // The label told an N-number by the engine (N_NUMBER), once it is there.
  const engine = useEngineReady();
  const callSign = aircraft.tail ?? (engine && N_NUMBER.test(shortName(aircraft.label)) ? shortName(aircraft.label) : null);
  const nearNow = course
    ? [course.departure, course.destination].map((end) => `${end.lat.toFixed(3)},${end.lon.toFixed(3)}`).join(";")
    : "";
  useEffect(() => useAtcRadio.setState({ tail: callSign, near: nearNow }), [callSign, nearNow]);
  useEffect(() => {
    useRadioActions.setState({
      directTo: async (said) => {
        const ship = useOwnShip.getState();
        if (!ship.enabled || !ship.fix) return "Direct To flies from where the airplane is: turn on Show my position.";
        const near = [nearNow, `${ship.fix.lat.toFixed(3)},${ship.fix.lon.toFixed(3)}`].filter(Boolean).join(";");
        try {
          const found = await api.clearancePlaces({ route: [said], near });
          const ident = found.route?.[0]?.find((p) => p.ident)?.ident;
          if (!ident) return `“${said}” was not found near the route.`;
          directToChartPoint({ ident });
          return null;
        } catch {
          return "The place could not be looked up; check the connection.";
        }
      },
      fly: (ft) => flyAltitude(ft),
      // "Plan a trip to Las Vegas": the place as the search finds it (a
      // field, a town, an address), and the biggest field by it; from the
      // route's departure, else from the field nearest the airplane.
      planTo: async (place) => {
        try {
          const found = (await api.placesSearch(place))[0];
          if (!found) return `“${place}” was not found.`;
          const fields = await api.nearestAirports(found.lat, found.lon);
          const dest = (found.kind === "airport" ? fields[0] : (fields.find((f) => f.kind === "large" || f.kind === "medium") ?? fields[0]))
            ?.ident;
          if (!dest) return `No field was found near ${found.label}.`;
          let dep = planned.dep;
          if (!dep) {
            const ship = useOwnShip.getState();
            if (!ship.enabled || !ship.fix) return "No departure: plan a route from a field first, or turn on Show my position.";
            dep = (await api.nearestAirports(ship.fix.lat, ship.fix.lon))[0]?.ident ?? "";
            if (!dep) return "No field was found near the airplane.";
          }
          if (dep === dest) return `${dest} is the departure.`;
          setRoute({ dep, stops: [], dest });
          return null;
        } catch {
          return "The place could not be looked up; check the connection.";
        }
      },
    });
    return () => useRadioActions.setState({ directTo: null, fly: null, planTo: null });
  }, [nearNow, directToChartPoint, flyAltitude, planned.dep, setRoute]);
  // A clearance heard and read by the pilot (ClearanceCard): its route,
  // its SID and STAR picked as typed ones are, and the altitude it gives.
  const enterClearance = useCallback(
    (parts: RouteParts, typed: TypedProcedure[], altitudeFt: number | null) => {
      setRoute(parts);
      if (typed.length) void typeProcedures(typed, { dep: parts.dep, dest: parts.dest });
      if (altitudeFt) flyAltitude(altitudeFt);
    },
    [setRoute, typeProcedures, flyAltitude],
  );
  const plannedStops = planned.stops;
  useEffect(() => {
    useRadioActions.setState({ route: { dep: planned.dep, stops: plannedStops, dest: planned.dest }, enter: enterClearance });
    return () => useRadioActions.setState({ enter: null });
  }, [planned.dep, plannedStops, planned.dest, enterClearance]);
}
