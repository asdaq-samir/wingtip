import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  askedRunways,
  firstWindPicks,
  holdsOf,
  holdsParam,
  type FirstWindPicks,
  type PlanParams,
  departureRunways,
  landingRunways,
  namesRoute,
  windPickedEnds,
} from "../../plan";
import type { PlannedRoute, PlanCourse } from "../../plan";
import {
  altitudesOf,
  altitudesParam,
  departureOf,
  groundOf,
  identOf,
  nameOwnPoints,
  routeOf,
  stopsOf,
  tanksOf,
} from "../../../lib/identSchema";
import { useEngineWhen } from "../../../lib/engine/useEngineReady";
import { usePreferences } from "../../../lib/preferences";
import { addressParams, useAddress } from "../../../lib/address";
import { usePlanHistory } from "../../../hooks/use-plan-history";
import { picksOf } from "../../../lib/flightLink";
import { flownPicks, proceduresOf, proceduresParam, sameField } from "../../../lib/procedures";
import { procedureQuery } from "../../../lib/queryClient";
import { drawnOnly } from "../../procedures";
import { patternsOf } from "../../../lib/trafficPattern";
import { useRouteEdits } from "../../route";

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
  // The altitude, tanks, pattern and takeoff are read by its rules too
  // (flightLevel, tanksOf, patternsOf), so a link with one waits as well.
  const readsEngine = namesRoute(address) || [address.altitude_ft, address.tanks, address.pattern, address.takeoff].some((v) => v != null);
  const engine = useEngineWhen(readsEngine);
  // Every change of the plan can be taken back (Undo, Cmd-Z), whichever
  // button made it, in place of asking first.
  usePlanHistory(address, setAddress);
  // The route: its two ends, and the airports it lands at on the way --
  // the stops one array while the address has the same, so what is made
  // from them (the map's add-a-stop, the box's waypoints) is too, and the
  // map and the box are not drawn again for nothing at each render.
  const stopsParam = address.stops;
  const stops = useMemo(() => stopsOf(stopsParam), [stopsParam]);
  // One object while its three are the same: the compiled hooks it is
  // handed (the field colours, the flight to save, the map's pins) keep
  // their work keyed on it, which a new object at each render undid.
  const dep = departureOf(address.dep);
  const dest = identOf(address.dest);
  const planned: PlannedRoute = useMemo(() => ({ dep, dest, stops }), [dep, dest, stops]);
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
  const showWaypoints = usePreferences((p) => p.waypoints);
  // VFR or IFR, kept from flight to flight (the altitude's popover). A
  // saved flight opened says its own (the address's `rules`, its picks'),
  // planned with at once and kept as the setting, then taken off.
  const keptRules = usePreferences((p) => p.flightRules);
  const setFlightRules = usePreferences((p) => p.setFlightRules);
  const linkedRules = address.rules;
  const flightRules = linkedRules ?? keptRules;
  useEffect(() => {
    if (!linkedRules) return;
    setFlightRules(linkedRules);
    void setAddress({ rules: null });
  }, [linkedRules, setFlightRules, setAddress]);
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
    // An approach only loaded is not flown (flownPicks): the route goes on
    // to the field as though none were picked, until it is activated.
    () => flownPicks(proceduresOf(picksParam)).filter((p) => routeFields.split(",").includes(p.ident)),
    [picksParam, routeFields],
  );
  const pickQueries = useMemo(() => routePicks.map(procedureQuery), [routePicks]);
  const drawnPickList = useQueries({ queries: pickQueries, combine: drawnOnly });
  // Each picked procedure's drawing in or given up on: only then is the nav
  // log asked for (usePlan's `settling`), once, not again for each as it
  // came. Not the runways into the wind: the planner picks those itself
  // (askedRunways, below), so the nav log no longer waits on the fields'
  // cards and the page's picks, about a second on each new route (the speed
  // audit of 2026-11-21).
  const picksComing = useQueries({ queries: pickQueries, combine: (rs) => rs.some((r) => r.isPending && r.fetchStatus !== "idle") });
  // Those the CIFP has, once drawn, each with the fix ATC sent the airplane
  // direct to where there is one: one string, so the plan's key changes
  // only as a procedure does.
  const procedures = useMemo(
    () =>
      proceduresParam(
        drawnPickList.map((d) => {
          const own = routePicks.find((p) => sameField(p.ident, d.airport) && p.id === d.id);
          // Unsuspended, its missed approach flown on (AIM 5-4-21).
          return { ident: d.airport, id: d.id, transition: d.transition ?? null, direct: own?.direct ?? null, missed: !!own?.missed };
        }),
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
  // The pilot's holds (`holds`, features/plan/routeHolds), each flown on the leg leaving
  // its point (plan.with_holds), set from a point's menu in FPL's list.
  const holdsParamText = address.holds;
  const holds = useMemo(() => holdsOf(holdsParamText), [holdsParamText]);
  // The fuel the pilot set in the tanks leaving a field (`tanks`,
  // "KOSH:30,KJVL:0"), an address's own; one not named, full.
  const tanksParamText = address.tanks;
  const tanks = useMemo(() => tanksOf(tanksParamText), [tanksParamText]);
  // The runway each departure picked is left from ("KSTL:30R"): the
  // departure field's runway picked, a stop's to leave from -- flown by its
  // runway transition for it (wingtip.procedure_paths), where St. Louis's
  // BERYY6 went out by its first, runway 11's, off 30R (the audit of
  // 2026-10-21). A runway the wind turns, or the pilot picks, asks for the
  // log again, which the planner answers from its cache: the legs are
  // planned without the runways, their paths laid on after
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
  // Less those picked into the wind and still as first picked for the
  // route, which the planner picks itself (features/plan/windRunways): the
  // nav log asked at once, and not again as the page's own picks come in.
  const autoText = address.auto;
  const windEnds = useMemo(() => windPickedEnds(autoText, patternText, takeoffText), [autoText, patternText, takeoffText]);
  const [firstWind, setFirstWind] = useState<FirstWindPicks>({ route: "", ends: {} });
  const firstNow = firstWindPicks(firstWind, routeFields, windEnds);
  if (firstNow !== firstWind) setFirstWind(firstNow);
  const firstEnds = firstNow.ends;
  const runwaysText = useMemo(() => {
    const takeoffs = patternsOf(takeoffText);
    const all = departureRunways(patternText, takeoffText, routeFields);
    return askedRunways(all, (ident) => (takeoffs.has(ident) ? "takeoff" : "land"), windEnds, firstEnds);
  }, [patternText, takeoffText, routeFields, windEnds, firstEnds]);
  const landingsText = useMemo(
    () => askedRunways(landingRunways(patternText, routeFields), () => "land", windEnds, firstEnds),
    [patternText, routeFields, windEnds, firstEnds],
  );
  // One field by either of its idents (KOSH, OSH): the engine's same_field.
  const local = !!planned.dep && !!planned.dest && sameField(planned.dep, planned.dest) && planned.stops.length === 0;
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
    altitudes,
    altitudeStarts: address.altitude_starts ?? "",
    procedures,
    runways: runwaysText,
    patterns: landingsText,
    settling: picksComing,
    crossings: altitudesParam(crossings),
    ground: altitudesParam(ground),
    holds: holdsParam(holds),
    tanks: altitudesParam(tanks),
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
    tanks,
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
