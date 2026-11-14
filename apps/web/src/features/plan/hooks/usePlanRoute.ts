import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useWindPicks } from "../lib/windPicks";
import { altitudesOf, altitudesParam, departureOf, groundOf, identOf, nameOwnPoints, routeOf, stopsOf } from "../../../lib/identSchema";
import { useEngineWhen } from "../../../lib/engine/useEngineReady";
import { usePreferences } from "../../../lib/preferences";
import { addressParams, useAddress } from "../../../lib/address";
import { usePlanHistory } from "../../../hooks/use-plan-history";
import { holdsOf, holdsParam } from "../lib/routeHolds";
import { picksOf } from "../../../lib/flightLink";
import { proceduresOf, proceduresParam, sameField } from "../../../lib/procedures";
import { airportQuery, procedureQuery } from "../../../lib/queryClient";
import type { PlanParams } from "./usePlan";
import { departureRunways, landingRunways, namesRoute, type PlannedRoute } from "./planAddress";
import { drawnOnly } from "./useProcedurePicks";
import { useRouteEdits } from "./useRouteEdits";
import type { PlanCourse } from "./planTypes";

/**
 * The route as the address has it (usePlanWorkspace): its points, the
 * plan's choices made on it -- the altitude, the departure time, the
 * procedures, runways, crossings, holds and times on the ground -- and
 * the edits that change it, each a change of the address. Everything the
 * plan is asked with but the airplane (`planInputs`), which
 * usePlanAnswer adds.
 */
export function usePlanRoute() {
  "use no memo"; // As usePlanWorkspace, whose part this is: left to its own memos.
  const [address, setAddress] = useAddress();
  // A route in the address is read by the engine, so waited for behind
  // MapPage's boot map; with none (a fresh open) the page draws at once.
  const engine = useEngineWhen(namesRoute(address));
  // How the route is changed once it has a destination (RouteEdit): its
  // box folded to a line, or the plan's own rows under the route's name.
  const routeEdit = usePreferences((p) => p.routeEdit);
  // Changed from the route's ••• menu (ShowRouteAs).
  const setRouteEdit = usePreferences((p) => p.setRouteEdit);
  // Every change of the plan can be taken back (Undo, Cmd-Z), whichever
  // button made it, in place of asking first.
  usePlanHistory(address, setAddress);
  // The route: its two ends, and the airports it lands at on the way --
  // the stops one array while the address has the same, so what is made
  // from them (the map's add-a-stop, the box's waypoints) is too, and the
  // map and the box are not drawn again for nothing at each render.
  const stopsParam = address.stops;
  const stops = useMemo(() => stopsOf(stopsParam), [stopsParam]);
  const planned: PlannedRoute = { dep: departureOf(address.dep), dest: identOf(address.dest), stops };
  // The pilot's own points named POS1 on, in the route's order, before
  // anything draws their names (pointName).
  nameOwnPoints(stops);
  // The route's points as typed, the departure first: what FPL's menus act
  // on (ProceduresRoute's routePoints).
  const routePoints = useMemo(() => [planned.dep, ...stops, planned.dest].filter(Boolean), [planned.dep, stops, planned.dest]);
  const via = planned.stops.join(",");
  const altitudeFt = address.altitude_ft?.toString() ?? "";
  // The altitude was picked on the wheel (flyAltitude): each leg at its
  // nearest legal altitude, as the wheel's figures were.
  const altitudeNearest = address.altitude_nearest;
  const altitudeChoice = address.altitude_choice;
  // The departure time as an ISO instant, or "" for about now. It picks
  // the winds forecast period the planner flies the legs on, gives
  // every checkpoint an ETA, and is what a saved flight is planned for.
  const depart = address.depart ?? "";
  // Class B accepted unless the pilot avoids it (class_b=0), at the owner's
  // pick (2026-10-20): planned through it with the clearance it takes
  // (14 CFR 91.131), said in the altitude's sheet with "Avoid Class B".
  const classBClearance = address.class_b;
  // The fuel stops the address names (`fuel`), kept as the Routes' cards
  // are browsed (useRouteLine).
  const fuelParam = address.fuel;
  // Points' own altitudes (`altitudes`, "VPBNG:4500,KMSN:1900"): a waypoint's
  // reached by it (or begun there, `altitude_starts`), an airport's its pattern.
  const altitudes = altitudesParam(altitudesOf(address.altitudes));
  // A local flight's time aloft, in minutes (`local_min`): an hour unless
  // the address says otherwise.
  const localMin = address.local_min;
  // Load pressed again for the same route: a fresh nav log, fresh winds.
  const [load, setLoad] = useState(0);
  const showWaypoints = usePreferences((p) => p.aeronautical);
  // VFR or IFR, kept from flight to flight (the altitude's popover).
  const flightRules = usePreferences((p) => p.flightRules);
  const setFlightRules = usePreferences((p) => p.setFlightRules);
  // The procedures picked at the route's fields, drawn (below): a leg
  // flown by them is planned the longer by their path, its time and fuel
  // with it, at the owner's word (the plan said 909 nm where the dry run
  // flew BENKY6's 1053), and a flight landing by an approach is planned
  // down to its first fix, not the pattern.
  // The fields as one string, the stops comma-joined by the template: a
  // method called on the render's `planned` made the React Compiler skip
  // every later memo.
  const routeFields = `${planned.dep},${planned.stops},${planned.dest}`;
  const picksParam = address.procs;
  const routePicks = useMemo(
    () => proceduresOf(picksParam).filter((p) => routeFields.split(",").includes(p.ident)),
    [picksParam, routeFields],
  );
  const pickQueries = useMemo(() => routePicks.map(procedureQuery), [routePicks]);
  const drawnPickList = useQueries({ queries: pickQueries, combine: drawnOnly });
  // Each picked procedure's drawing in or given up on, and no runway into
  // the wind still to be picked (useWindPicks): only then is the nav log
  // asked for (usePlan's `settling`), once, not again for each as it came.
  const picksComing = useQueries({ queries: pickQueries, combine: (rs) => rs.some((r) => r.isPending && r.fetchStatus !== "idle") });
  const windPending = useWindPicks((w) => w.pending);
  // Settled for this route only once a commit has gone by with nothing
  // coming: the route list's wind picks are set in its effects, which run
  // after the render that would otherwise have asked for the nav log
  // without them (the store read here, after them). A route not settled
  // yet -- each new one -- waits that one commit.
  // The route's fields' cards too, whose reports the runways are picked
  // into the wind from: the route list that picks them may be drawn after
  // the plan is first asked for, and the cards are asked for with the
  // route in any case.
  const fieldIdents = routeFields.split(",").filter(Boolean);
  const cardsComing = useQueries({
    queries: fieldIdents.map((ident) => airportQuery(ident)),
    combine: (rs) => rs.some((r) => r.isPending && r.fetchStatus !== "idle"),
  });
  const settlingNow = picksComing || windPending || cardsComing;
  const settledFor = useWindPicks((w) => w.settledFor);
  useEffect(() => {
    useWindPicks.setState({ settledFor: !settlingNow && !useWindPicks.getState().pending ? routeFields : null });
  }, [settlingNow, routeFields]);
  // Those the CIFP has, once drawn, each with the fix ATC sent the airplane
  // direct to where there is one: one string, so the plan's key changes
  // only as a procedure does.
  const procedures = useMemo(
    () =>
      proceduresParam(
        drawnPickList.map((d) => ({
          ident: d.airport,
          id: d.id,
          transition: d.transition ?? null,
          direct: routePicks.find((p) => sameField(p.ident, d.airport) && p.id === d.id)?.direct ?? null,
        })),
      ),
    [drawnPickList, routePicks],
  );
  // The altitudes ATC gave to cross the procedures' fixes at (`cross`,
  // "BXCMB:3000"), set from a fix's card (FixCard): each in place of the
  // chart's for the plan's descent and the dry run's heights.
  const crossParam = address.cross;
  const crossings = useMemo(() => altitudesOf(crossParam), [crossParam]);
  // Minutes on the ground at the stops (`ground`, "KJVL:45"), set from a
  // stop's Depart step (ProceduresRoute); one not named, 30.
  const groundParamText = address.ground;
  const ground = useMemo(() => groundOf(groundParamText), [groundParamText]);
  // The pilot's holds (`holds`, features/plan/lib/routeHolds), each flown on the leg leaving
  // its point (plan.with_holds), set from a point's menu in FPL's list.
  const holdsParamText = address.holds;
  const holds = useMemo(() => holdsOf(holdsParamText), [holdsParamText]);
  // The runway each departure picked is left from ("KSTL:30R"): the
  // departure field's runway picked, a stop's to leave from -- flown by its
  // runway transition for it (wingtip.procedure_paths), where St. Louis's
  // BERYY6 went out by its first, runway 11's, off 30R (the audit of
  // 2026-10-21). A runway picked into the wind as the route comes in asks
  // for the log again, which the planner answers from its cache: the legs
  // are planned without the runways, their paths laid on after
  // (with_procedures).
  const patternText = address.pattern,
    takeoffText = address.takeoff;
  // Every field the airplane leaves is left by its runway (a departure
  // picked there by its transition for it, else along it and out of its
  // pattern), and every one it lands at is landed on its runway by its
  // pattern where no approach is picked (`patterns`): the pattern was drawn
  // round the field and flown straight through its middle (the owner,
  // 2026-10-27: "is it not flying that and landing?"). The departure's own
  // runway is the one in `pattern` (ProceduresRoute's departChips), a
  // round trip's in `takeoff`.
  const runwaysText = useMemo(() => departureRunways(patternText, takeoffText, routeFields), [patternText, takeoffText, routeFields]);
  const landingsText = useMemo(() => landingRunways(patternText, routeFields), [patternText, routeFields]);
  const local = !!planned.dep && planned.dep === planned.dest && planned.stops.length === 0;
  // A route on screen: one the planner plans, or a local flight -- an
  // airport to itself with no stop (usePlan's `local`).
  const routed = routeOf(planned.dep, planned.dest, planned.stops) !== null || local;
  const hasPoints = !!planned.dep || !!planned.dest || planned.stops.length > 0;
  const wholeRoute = !!planned.dep && !!planned.dest;
  // The plan as it is asked for, but the airplane (usePlanAnswer's).
  const planInputs: Omit<PlanParams, "aircraft"> = {
    dep: planned.dep,
    dest: planned.dest,
    stops: planned.stops,
    altitudeFt,
    altitudeNearest,
    altitudeChoice,
    depart,
    load,
    classBClearance,
    altitudes,
    altitudeStarts: address.altitude_starts ?? "",
    procedures,
    runways: runwaysText,
    patterns: landingsText,
    settling: settlingNow || settledFor !== routeFields,
    crossings: altitudesParam(crossings),
    ground: altitudesParam(ground),
    holds: holdsParam(holds),
    localMin,
    rules: flightRules,
    // Under IFR, the alternate filed in the Weather tab (AlternateSection).
    alternate: address.alternate ?? "",
    // Checkpoints as the map shows them: the settings' Waypoints off, the
    // nav log runs from point to point, at the pilot's ask.
    checkpoints: showWaypoints,
  };
  // The route's edits, each a change of the address (useRouteEdits).
  const edits = useRouteEdits({ planned, routePoints, setAddress });
  return {
    address,
    setAddress,
    engine,
    routeEdit,
    setRouteEdit,
    planned,
    routePoints,
    // The route the selected point was picked on (useLegSheet).
    routeKey: `${planned.dep}-${planned.dest}-${via}`,
    local,
    routed,
    hasPoints,
    wholeRoute,
    altitudeFt,
    altitudeNearest,
    depart,
    classBClearance,
    fuelParam,
    altitudes,
    localMin,
    load,
    setLoad,
    showWaypoints,
    flightRules,
    setFlightRules,
    crossings,
    ground,
    holds,
    directParam: address.direct,
    planInputs,
    ...edits,
  };
}

/** The route as the address has it, as the workspace's hooks read it. */
export type PlanRoute = ReturnType<typeof usePlanRoute>;

/**
 * Each route the planner answers kept as FPL's Recents, newest first, at
 * the owner's ask ("Can we have recents under saved ?"): once it is
 * answered, so a route typed wrong is not kept.
 */
export function useRecentRoute({ address, planned }: PlanRoute, course: PlanCourse | null) {
  "use no memo";
  const answered = !!course && course.departure.ident === planned.dep && course.destination.ident === planned.dest;
  const stopsKey = planned.stops.join(",");
  // With what was picked for it, kept as it changes: the route planned
  // again from Recents as it was left.
  const recentPicks = picksOf(addressParams(address), ["altitudes"]);
  useEffect(() => {
    if (!answered) return;
    usePreferences
      .getState()
      .addRecentRoute({
        dep: planned.dep,
        dest: planned.dest,
        stops: stopsKey ? stopsKey.split(",") : [],
        at: Date.now(),
        ...(recentPicks ? { picks: recentPicks } : {}),
      });
  }, [answered, planned.dep, planned.dest, stopsKey, recentPicks]);
}
