import { useCallback, useEffect, useMemo, useState, useEffectEvent } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  altitudesOf,
  altitudesParam,
  departureOf,
  groundOf,
  identOf,
  nameOwnPoints,
  positionIdent,
  routeOf,
  stopsOf,
} from "../../../lib/identSchema";
import { cruiseTasOf, shortName, taxiFuelOf } from "../../../lib/aircraftChoice";
import { clockTime, flightLevel } from "../../../lib/format";
import { useMinuteClock } from "../../../lib/useMinuteClock";
import { useEngineWhen } from "../../../lib/engine/useEngineReady";
import { legsWithoutWind, windsOutOfDate } from "../format";
import { placeName } from "../lib/radio";
import { bestStopIndex, distanceNm, type LatLon } from "../../../lib/geo";
import { placeOf, useAirportIndex } from "../../../lib/airportIndex";
import { useKeepOffline } from "../map/keepStatus";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { usePanelView, type PanelList } from "./usePanelView";
import { usePreferences } from "../../../lib/preferences";
import { useProgressToast } from "../../../lib/useProgressToast";
import { patched, useSearchParamsNow } from "../../../lib/useSearchParamsNow";
import { usePlanHistory } from "../../../hooks/use-plan-history";
import { usePanelDragging } from "../../../lib/mapChrome";
import { holdsOf, holdsParam } from "../lib/routeHolds";
import { picksOf } from "../../../lib/flightLink";
import { proceduresOf, proceduresParam, sameField } from "../../../lib/procedures";
import { checkpointsQuery, courseQuery, nearestQuery, procedureQuery, queryClient } from "../../../lib/queryClient";
import type { PointAltitude } from "../components/PointAltitudeDialog";
import { loadFlightChart } from "../components/loadFlightChart";
import { useDryRun } from "./useDryRun";
import { useFlyingMode } from "./useFlyingMode";
import { useCopilotPublish } from "./useCopilotPublish";
import { nextLanding } from "../figures";
import { useRouteEdits } from "./useRouteEdits";
import { useSuggestedStops, withStopsAfter } from "./useSuggestedStops";
import { navlogQuery, usePlan } from "./usePlan";
import { useVerdict } from "../../../lib/verdict";
import { mayUse, useEntitlement } from "../../../lib/subscription";
import type { WorkspaceProps } from "../../shell";
import { prefetchPilotPanel } from "../routePanelParts";
import { panelNow } from "./panelNow";
import { altitudeChoiceOf, departureRunways, landingRunways, LOCAL_MINUTES, namesRoute, routeWas, suggestedStopAt } from "./planAddress";
import { briefMarkOf, marksOf, progressWords, tightLegWords } from "./planWords";
import { drawnOnly, useProcedurePicks } from "./useProcedurePicks";
import { useAircraftPick } from "./useAircraftPick";
import { useRouteWays } from "./useRouteWays";
import { useRunwayPicks } from "./useRunwayPicks";
import { usePlanSetters } from "./usePlanSetters";
import { usePlaceCards } from "./usePlaceCards";
import { useRouteTidy } from "./useRouteTidy";
import { useFieldPatterns } from "./useFieldPatterns";
import { useMapPins } from "./useMapPins";
import { useFlyHere } from "./useFlyHere";
import { useMapActions } from "./useMapActions";
import { usePlanAhead } from "./usePlanAhead";
import { useRouteListEdit } from "./useRouteListEdit";
import { useFplCards } from "./useFplCards";
import { useSearchPanel } from "./useSearchPanel";
import { useLegSheet } from "./useLegSheet";
import { useFieldColours } from "./useFieldColours";
import { useRouteLine } from "./useRouteLine";
import { useFlightToSave } from "./useFlightToSave";

/**
 * The planner's view model (PlanWorkspace, MVVM): the plan read from the
 * address, the queries, the picks and every handler that changes them,
 * and what the screen works out from them. The view draws from it.
 *
 * Composed of a hook per concern, each in its own file beside this one:
 * the airplane (useAircraftPick), the Routes' ways and their line
 * (useRouteWays, useRouteLine), the runways and procedures picked
 * (useRunwayPicks, useProcedurePicks, useFieldPatterns), the address's
 * one-change settings (usePlanSetters), the cards over the tabs and over
 * FPL (usePlaceCards, useFplCards), the map's pins and actions
 * (useMapPins, useMapActions), Fly Here (useFlyHere), the route's list
 * edited in place (useRouteListEdit), the search bars (useSearchPanel),
 * the point and leg picked (useLegSheet), the fields' colours
 * (useFieldColours), the plans read ahead (usePlanAhead) and the flight
 * to save (useFlightToSave). Their order here is the order their effects
 * run in, as it was when they were one hook.
 */
export function usePlanWorkspace({ panel, setPanel }: Pick<WorkspaceProps, "panel" | "setPanel">) {
  "use no memo"; // Left to its own memos, as it always was: compiled, it put 18 KB on the first load.
  useEffect(() => {
    const later = window.setTimeout(prefetchPilotPanel, 2000);
    return () => window.clearTimeout(later);
  }, []);
  // The panel out at all: the nav log is in sight, and a checkpoint
  // picked on the map opens its section.
  const panelOpen = panel !== "peek";
  // The panel's size as of now, for what a tap does with it: read when
  // tapped, not a dependency, so a turn of the sheet does not make every
  // handler new and with them the route's list, the nav log and the
  // briefing drawn again -- 37 ms of the nav log alone at a quarter of a
  // laptop's speed, at the turn's first frame (profiled on the phone
  // project, half to the pill, 2026-10-27: the owner's "the non smooth map
  // and sheet").
  useEffect(() => {
    panelNow.current = panel;
  }, [panel]);
  const [searchParams, setSearchParams] = useSearchParamsNow();
  // A route in the address is read by the engine, so waited for behind
  // MapPage's boot map; with none (a fresh open) the page draws at once.
  const engine = useEngineWhen(namesRoute(searchParams));
  // How the route is changed once it has a destination (RouteEdit): its
  // box folded to a line, or the plan's own rows under the route's name.
  const routeEdit = usePreferences((p) => p.routeEdit);
  // Every change of the plan can be taken back (Undo, Cmd-Z), whichever
  // button made it, in place of asking first.
  usePlanHistory(searchParams, setSearchParams);
  // The route: its two ends, and the airports it lands at on the way --
  // the stops one array while the address has the same, so what is made
  // from them (the map's add-a-stop, the box's waypoints) is too, and the
  // map and the box are not drawn again for nothing at each render.
  const stopsParam = searchParams.get("stops");
  const stops = useMemo(() => stopsOf(stopsParam), [stopsParam]);
  const planned = { dep: departureOf(searchParams.get("dep")), dest: identOf(searchParams.get("dest")), stops };
  // The pilot's own points named POS1 on, in the route's order, before
  // anything draws their names (pointName).
  nameOwnPoints(stops);
  // The route's points as typed, the departure first: what FPL's menus act
  // on (ProceduresRoute's routePoints).
  const routePoints = useMemo(() => [planned.dep, ...stops, planned.dest].filter(Boolean), [planned.dep, stops, planned.dest]);
  const via = planned.stops.join(",");
  const altitudeFt = searchParams.get("altitude_ft") ?? "";
  // The altitude was picked on the wheel (flyAltitude): each leg at its
  // nearest legal altitude, as the wheel's figures were.
  const altitudeNearest = searchParams.get("altitude_nearest") === "1";
  const altitudeChoice = altitudeChoiceOf(searchParams.get("altitude_choice"));
  // The departure time as an ISO instant, or "" for about now. It picks
  // the winds forecast period the planner flies the legs on, gives
  // every checkpoint an ETA, and is what a saved flight is planned for.
  const depart = searchParams.get("depart") ?? "";
  // Class B accepted unless the pilot avoids it (class_b=0), at the owner's
  // pick (2026-10-20): planned through it with the clearance it takes
  // (14 CFR 91.131), said in the altitude's sheet with "Avoid Class B".
  const classBClearance = searchParams.get("class_b") !== "0";
  // The fuel stops the address names (`fuel`), kept as the Routes' cards
  // are browsed (useRouteLine).
  const fuelParam = searchParams.get("fuel");
  // Points' own altitudes (`altitudes`, "VPBNG:4500,KMSN:1900"): a waypoint's
  // reached by it (or begun there, `altitude_starts`), an airport's its pattern.
  const altitudes = altitudesParam(altitudesOf(searchParams.get("altitudes")));
  // A local flight's time aloft, in minutes (`local_min`): an hour unless
  // the address says otherwise.
  const localMin = LOCAL_MINUTES.includes(Number(searchParams.get("local_min"))) ? Number(searchParams.get("local_min")) : 60;
  // Load pressed again for the same route: a fresh nav log, fresh winds.
  const [load, setLoad] = useState(0);
  const showWaypoints = usePreferences((p) => p.waypoints);
  // VFR or IFR, kept from flight to flight (the altitude's popover).
  const flightRules = usePreferences((p) => p.flightRules);
  const setFlightRules = usePreferences((p) => p.setFlightRules);
  // The airplane the nav log is computed for (useAircraftPick).
  const { profiles, aircraft, aircraftValue, aircraftChoices, changeAircraft, pickTail } = useAircraftPick();
  // The procedures picked at the route's fields, drawn (below): a leg
  // flown by them is planned the longer by their path, its time and fuel
  // with it, at the owner's word (the plan said 909 nm where the dry run
  // flew BENKY6's 1053), and a flight landing by an approach is planned
  // down to its first fix, not the pattern.
  // The fields as one string, the stops comma-joined by the template: a
  // method called on the render's `planned` made the React Compiler skip
  // every later memo.
  const routeFields = `${planned.dep},${planned.stops},${planned.dest}`;
  const picksParam = searchParams.get("procs");
  const routePicks = useMemo(
    () => proceduresOf(picksParam).filter((p) => routeFields.split(",").includes(p.ident)),
    [picksParam, routeFields],
  );
  const pickQueries = useMemo(() => routePicks.map(procedureQuery), [routePicks]);
  const drawnPickList = useQueries({ queries: pickQueries, combine: drawnOnly });
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
  const crossParam = searchParams.get("cross");
  const crossings = useMemo(() => altitudesOf(crossParam), [crossParam]);
  const crossingsText = altitudesParam(crossings);
  // Minutes on the ground at the stops (`ground`, "KJVL:45"), set from a
  // stop's Depart step (ProceduresRoute); one not named, 30.
  const groundParamText = searchParams.get("ground");
  const ground = useMemo(() => groundOf(groundParamText), [groundParamText]);
  const groundText = altitudesParam(ground);
  // The pilot's holds (`holds`, features/plan/lib/routeHolds), each flown on the leg leaving
  // its point (plan.with_holds), set from a point's menu in FPL's list.
  const holdsParamText = searchParams.get("holds");
  const holds = useMemo(() => holdsOf(holdsParamText), [holdsParamText]);
  const holdsText = holdsParam(holds);
  // The runway each departure picked is left from ("KSTL:30R"): the
  // departure field's runway picked, a stop's to leave from -- flown by its
  // runway transition for it (wingtip.procedure_paths), where St. Louis's
  // BERYY6 went out by its first, runway 11's, off 30R (the audit of
  // 2026-10-21). A runway picked into the wind as the route comes in asks
  // for the log again, which the planner answers from its cache: the legs
  // are planned without the runways, their paths laid on after
  // (with_procedures).
  const patternText = searchParams.get("pattern"),
    takeoffText = searchParams.get("takeoff");
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
  // FPL's Routes (useRouteWays), asked for before the plan.
  const { browsing, setBrowsing, chosenKey, vfrRoute, routeWays, ownWithFuel } = useRouteWays({
    planned,
    aircraft,
    depart,
    local,
    flightRules,
  });
  const planParams = {
    dep: planned.dep,
    dest: planned.dest,
    stops: planned.stops,
    altitudeFt,
    altitudeNearest,
    altitudeChoice,
    depart,
    aircraft,
    load,
    classBClearance,
    altitudes,
    altitudeStarts: searchParams.get("altitude_starts") ?? "",
    procedures,
    runways: runwaysText,
    patterns: landingsText,
    crossings: crossingsText,
    ground: groundText,
    holds: holdsText,
    localMin,
    rules: flightRules,
    // Under IFR, the alternate filed in the Weather tab (AlternateSection).
    alternate: searchParams.get("alternate") ?? "",
    // Checkpoints as the map shows them: the settings' Waypoints off, the
    // nav log runs from point to point, at the pilot's ask.
    checkpoints: showWaypoints,
  };
  const s = usePlan(planParams);
  // The route's own time and miles: its nav log's once it is planned,
  // the grid's and the course's before (its weather strip's minutes).
  const gridOwnMin = (routeWays?.current_along?.bands ?? []).reduce((sum, b) => sum + b.min, 0);
  const ownMinutes = s.totals?.ete_min ?? (gridOwnMin || null);
  const ownNm = s.totals?.distance_nm ?? s.course?.distance_nm ?? null;
  const ownGal = s.totals?.fuel_gal ?? null;
  // And its minutes on the ground at the fields it lands at (`ground`,
  // else the owner's 30), as the ways count theirs: the nav log's totals
  // are air time alone, and Your Route read shorter than a way through
  // the same stop (the audit of 2026-10-24).
  const ownGround = (s.course?.stops ?? [])
    .filter((stop) => stop.kind !== "fix")
    .reduce((sum, stop) => sum + (ground[stop.ident] ?? 30), 0);
  // The runways picked at the route's fields (useRunwayPicks).
  const { pickedPatterns, patternFocus, autoPicked, pickPattern, preselectPattern, pickedTakeoffs, setTakeoff, preselectTakeoff } =
    useRunwayPicks({ searchParams, setSearchParams });
  // The address's one-change settings (usePlanSetters), a Direct To worked out on the device offline.
  const setters = usePlanSetters(setSearchParams, s);
  const { changeLocalMin, setGround, directToPoint, setHold, directToChartPoint, changeDepart, changeAltitudeChoice } = setters;
  const { selected } = s;
  // The course with each stop's time on the ground, so every row built
  // from it (navLogRows) is timed from when the airplane leaves again.
  const course = useMemo(() => (s.course ? { ...s.course, ground } : null), [s.course, ground]);
  // Keep Charts Offline, the setting: each route loaded keeps its charts.
  useKeepOffline(course);

  // The route the selected point was picked on (useLegSheet).
  const routeKey = `${planned.dep}-${planned.dest}-${via}`;

  // The cards over the tabs (usePlaceCards).
  const {
    cards,
    cardOpen,
    briefOpen,
    setBackToView,
    closeCard,
    under,
    setUnder,
    approachesOf,
    setApproachesOf,
    selectPlace,
    closePlace,
    closeFlight,
    selectPlaceOnChart,
    holdPoint,
  } = usePlaceCards({ searchParams, setSearchParams, panel, setPanel });
  const {
    place,
    heldPoint,
    nearOpen,
    aircraftOpen,
    flight,
    past,
    nearFrom,
    setNearFrom,
    selectFlight,
    selectPast,
    list,
    openList,
    closeList,
  } = cards;
  // The route's ends named by their airports' idents, and picks at fields
  // the route no longer has let go (useRouteTidy).
  const { noApproaches } = useRouteTidy({ planned, searchParams, setSearchParams });
  // The route's fields, their runways' fit and their patterns (useFieldPatterns).
  const { procedureAirports, fitAircraft, runwayFitInputs, patterns } = useFieldPatterns({
    planned,
    briefing: s.briefing,
    course,
    nav: s.nav,
    fuelGal: s.totals?.fuel_gal ?? null,
    pickedPatterns,
    pickedTakeoffs,
  });
  // The instrument procedures picked (useProcedurePicks).
  const {
    pickedProcedures,
    procedureFocus,
    pickProcedures,
    typeProcedures,
    routeProcedures,
    openFix,
    setOpenFixAt,
    mapDirects,
    showFix,
    setCrossing,
    directTo,
    flownPatterns,
    filedProcedures,
    proceduresAt,
    setProceduresShown,
    openProcedures,
    previewProcedure,
    mapProcedures,
    procedureCover,
  } = useProcedurePicks({ planned, searchParams, setSearchParams, procedureAirports, crossings, patterns });
  const directParam = searchParams.get("direct");
  // Where the map is brought to (useMapPins).
  const { placePin, depAlone, startPin, fix, nearOrigin, nearestPoints, measuredFrom } = useMapPins({
    place,
    heldPoint,
    nearFrom,
    nearOpen,
    planned,
    course,
  });
  // Fly Here (useFlyHere).
  const { flyHere } = useFlyHere({
    planned,
    place,
    depart,
    aircraft,
    load,
    setLoad,
    setUnder,
    showWaypoints,
    flightRules,
    setPanel,
    setSearchParams,
  });

  // The route's edits, each a change of the address (useRouteEdits).
  const { setRoute, addStop, departFrom, setPointAltitude, setStops, removeStop, insertStopAfter, acceptClassB, avoidClassB, flyAltitude } =
    useRouteEdits({ planned, routePoints, setSearchParams });
  // The stops the planner suggests, and keeping them (useSuggestedStops).
  const { fuelStops, fuelHidden, hideFuelStop, showFuelStops, tankFigures, fuelStopPins, keepFuelStops, addStopField } = useSuggestedStops({
    totals: s.totals,
    local: s.local,
    planned,
    setStops,
  });
  // The suggested stop the airport's card is open on, where it is one: its
  // figures at the card's top, and Add Stop keeps it at its place
  // (PlaceCard's `stop`).
  const suggestedAt = suggestedStopAt(place, fuelStops);
  // The first flight's suggested fuel stops, offered where the route's fuel
  // says it is short (FlightLine), as the route box offers them.
  const firstFuelStop = useMemo(() => {
    const first = fuelStops[0];
    if (!first || !first.stops.length) return null;
    const idents = first.stops.map((stop) => stop.ident);
    return { idents, add: () => keepFuelStops(first.departure, idents) };
  }, [fuelStops, keepFuelStops]);
  // The route through the first flight's suggested stops planned as they
  // are suggested, as Fly Here's is at its tap: Add fuel stop then draws it
  // at once from what is in, where the owner watched four and a half
  // seconds of dashes and "Planning altitudes…" after the tap (the video,
  // 2026-10-22). The same plan the page asks for once they are stops.
  const suggestedFirst = fuelStops[0];
  const nextStops =
    suggestedFirst && !s.local
      ? (withStopsAfter(
          planned.dep,
          planned.stops,
          suggestedFirst.departure,
          suggestedFirst.stops.map((f) => f.ident),
        )?.stops ?? null)
      : null;
  const aheadKey = nextStops
    ? JSON.stringify([nextStops, planParams.altitudeFt, planParams.altitudeChoice, planParams.depart, aircraft.profile, load])
    : "";
  const prefetchAhead = useEffectEvent(() => {
    if (!nextStops) return;
    const ahead = { ...planParams, stops: nextStops };
    void queryClient.prefetchQuery(courseQuery(ahead.dep, ahead.dest, nextStops));
    if (showWaypoints) void queryClient.prefetchQuery(checkpointsQuery(ahead.dep, ahead.dest, nextStops));
    void queryClient.prefetchQuery(navlogQuery(ahead, showWaypoints));
  });
  useEffect(() => prefetchAhead(), [aheadKey]); // keyed on the route and the plan's choices
  // Add Stop open: from its own button, or from no legal altitude's --
  // "via", its Fly via round a Class B, the ways round suggested.
  const [addingStop, setAddingStop] = useState<false | "stop" | "via">(false);
  // The map's cards' and the radio's actions on the route (useMapActions).
  useMapActions({
    course,
    planned,
    aircraft,
    classBAvoided: searchParams.get("class_b") === "0",
    setStops,
    setRoute,
    directToChartPoint,
    acceptClassB,
    flyAltitude,
    typeProcedures,
  });

  // With no route, the panel is Maps' search: the bar in the capsule and
  // at the top of the sheet, Favorites and what was picked before under it,
  // and the airports that answer what is typed; one picked opens its
  // card, with Fly Here, and goes to the top of the recents -- or, asked
  // for from Favorites, becomes Home or a favorite. Half a route (Fly
  // Here with no position to fly from) is a route: its form asks for the
  // other end.
  // A route on screen: one the planner plans, or a local flight -- an
  // airport to itself with no stop (usePlan's `local`).
  const routed = routeOf(planned.dep, planned.dest, planned.stops) !== null || local;
  // The latest Recents and Saved planned ahead (usePlanAhead).
  const planSettled = !routed || s.totals != null || s.unflyable != null;
  usePlanAhead({ planSettled, planned, aircraft, load, showWaypoints, flightRules });
  // FPL's list edited in place (useRouteListEdit).
  const { waypointStops, routeOpen, setRouteOpen, addAt, setAddAt, setNewStopVia, typeStopAt, listEdit } = useRouteListEdit({
    stops: planned.stops,
    course,
    routeEdit,
    routePoints,
    setRoute,
    setAddingStop,
  });
  // The lists in full -- the airports' Favorites and Recents, the routes
  // planned, the airplanes' Favorites and Recents -- the address's (`list`,
  // useAddressCards), kept for their place as its cards are.
  const favoritesOpen = list === "favorites";
  const airportRecentsOpen = list === "recents";
  const routeRecentsOpen = list === "routes";
  const aircraftFavoritesOpen = list === "aircraft-favorites";
  const aircraftRecentsOpen = list === "aircraft-recents";
  // That list put away, where it is the one open: a search field's focus
  // and an Add take the list's place.
  const listAway = (name: PanelList) => {
    if (list === name) closeList();
  };
  // Each route the planner answers kept as FPL's Recents, newest first, at
  // the owner's ask ("Can we have recents under saved ?"): once it is
  // answered, so a route typed wrong is not kept.
  const answered = !!course && course.departure.ident === planned.dep && course.destination.ident === planned.dest;
  const stopsKey = planned.stops.join(",");
  // With what was picked for it, kept as it changes: the route planned
  // again from Recents as it was left.
  const recentPicks = picksOf(searchParams, ["altitudes"]);
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
  // The place up under the one search and what each keeps open over it
  // (usePanelView): the plan, the route's box and its nav log; the search's
  // own page and its results; the traffic.
  const { view, setViewPick, pickView } = usePanelView({
    cards,
    route: `${planned.dep}|${planned.stops.join(",")}|${planned.dest}`,
    hasRoute: routed || !!planned.dep || !!planned.dest || planned.stops.length > 0,
    searchParams,
    setSearchParams,
  });
  // The places opened so far, each kept under the others once it has been
  // (TabKept): back to one, it is as it was left, a list scrolled where it
  // was. Built again from nothing at every switch, a switch to the plan
  // was mostly its pills and pickers being made (50 to 80 ms at a phone's
  // speed, the 23 Oct profile).
  const [opened, setOpened] = useState(() => [view]);
  if (!opened.includes(view)) setOpened([...opened, view]);
  // A field's or a point's card over the place up, its own out of sight.
  const cardUp = !!place || !!heldPoint;
  // A point dropped on the map (AirspaceCard) into the route as the
  // pilot's own point off the nearest fix, at the owner's pick (mock 2 of
  // the canvas's points): where it bends the route least (bestStopIndex),
  // and flown to direct from where the airplane is (directToPoint's way,
  // the route as it was kept for Cancel), or held at (its hold's sheet
  // asked for once the plan has the leg to it). The card put away, all in
  // one change of the address.
  const [holdAsk, setHoldAsk] = useState<string | null>(null);
  const dropIntoRoute = useCallback(
    (ident: string, at: LatLon, then: "add" | "direct" | "hold") => {
      if (!course) return;
      const points = [course.departure, ...(course.stops ?? []), course.destination];
      const index = bestStopIndex(points, at);
      const ship = useOwnShip.getState();
      const fix = ship.enabled ? ship.fix : null;
      setSearchParams(
        (prev) => {
          const stops = stopsOf(prev.get("stops"));
          const withIt = [...stops.slice(0, index), ident, ...stops.slice(index)];
          const away = { place: null, at: null };
          if (then !== "direct") return patched(prev, { ...away, stops: withIt.join(",") });
          return patched(prev, {
            ...away,
            dep: fix ? positionIdent(fix) : undefined,
            stops: [ident, ...stops.slice(index)].join(","),
            direct: ident,
            was: prev.get("was") ?? routeWas(prev),
            // One direct at a time, as directToPoint's.
            procs: proceduresOf(prev.get("procs")).some((p) => p.direct)
              ? proceduresParam(proceduresOf(prev.get("procs")).map((p) => ({ ...p, direct: null }))) || null
              : undefined,
          });
        },
        { replace: true },
      );
      // FPL's list in sight, its new row and the hold's sheet with it.
      setViewPick("plan");
      setPanel("half");
      if (then === "hold") setHoldAsk(`${ident}@${Date.now()}`);
    },
    [course, setSearchParams, setPanel, setViewPick],
  );
  // The cards over FPL, the Stops and the lists in full (useFplCards).
  const {
    briefShown,
    navLogShown,
    profileShown,
    stopsShown,
    briefHere,
    profileHere,
    stopsHere,
    stopsRoute,
    stopsAt,
    stopsScope,
    setStopsScope,
    stopFieldPins,
    savedOpen,
    lessonOpen,
    closeLesson,
    openSaved,
    closeSaved,
    openBrief,
    closeBrief,
    openNavLogCard,
    closeNavLogCard,
    openProfileCard,
    closeProfileCard,
    closeStops,
    findNearby,
    pickStopField,
    showLegs,
    openNearest,
    closeNearest,
  } = useFplCards({
    view,
    routed,
    local: !!s.local,
    planned,
    fix,
    fuelStopPins,
    briefOpen,
    closeCard,
    setViewPick,
    setPanel,
    searchParams,
    setSearchParams,
    setProceduresShown,
  });
  // The search's own page in sight (SearchHome), its Nearest asked for
  // while it is: the list's own question, shared.
  const homeShown = view === "search" && !place && !heldPoint && !nearOpen && !favoritesOpen && !airportRecentsOpen;
  const { data: nearStrip } = useQuery({ ...nearestQuery(nearOrigin?.lat ?? 0, nearOrigin?.lon ?? 0), enabled: homeShown && !!nearOrigin });
  // The search bars (useSearchPanel).
  const {
    query,
    setQuery,
    picking,
    setPicking,
    searchInput,
    search,
    pickPlace,
    askFor,
    addFromPill,
    aircraftTyped,
    pickingMine,
    pickingFavorite,
    aircraftInput,
    nearTyped,
    home,
    favorites,
    setHomeAirport,
    toggleFavoriteAirport,
    moveFavoriteAirport,
  } = useSearchPanel({ view, selectPlace, listAway, searchParams, setSearchParams });

  // The route's close, at the pilot's ask: first it clears the route --
  // the address keeps nothing of it, and its box, the controls and the
  // tabs stay out, empty, for another -- and pressed again, with nothing
  // left to clear, the route is put away for the layer under it, as
  // Maps' directions are: the airport's card it was flown to from (Fly
  // Here), or the search. The panel stays the height it was throughout,
  // at the pilot's ask: all the way up is in the address (`view`), and
  // clearing that with the route lowered it to its pill.
  const hasPoints = !!planned.dep || !!planned.dest || planned.stops.length > 0;
  const clearRoute = useCallback(() => {
    const keeping = (prev: URLSearchParams, place?: string) => {
      const next = new URLSearchParams();
      const height = prev.get("view");
      if (height) next.set("view", height);
      if (place) next.set("place", place);
      return next;
    };
    if (hasPoints) {
      // Cleared: FPL's box empty to type another in.
      setSearchParams((prev) => keeping(prev), { replace: true });
      setViewPick("plan");
      return;
    }
    // The empty box closed: the airport it was flown to from (Fly Here),
    // or the search, on Airport.
    setViewPick("search");
    if (under) setSearchParams((prev) => keeping(prev, under), { replace: true });
    setUnder(null);
  }, [hasPoints, under, setSearchParams, setViewPick, setUnder]);

  // An airplane's card's close goes back to the place it was opened over
  // (usePlaceCards' closeFlight), by the view's own setter.
  useEffect(() => {
    setBackToView(setViewPick);
  }, [setBackToView, setViewPick]);

  // This page binds no keys of its own. Walking the nav log used to be
  // Up and Down on the document, which meant deciding by hand, on every
  // press, whether some other widget wanted them: a guard for inputs
  // and textareas, another for the stock lists and dialogs, and a
  // hole in that guard for section titles, which had to prevent the
  // stock accordion's Up/Down so this walk could have them. A row is a
  // focusable, selectable row (`SelectableRow`): Tab reaches it and
  // Enter or Space selects it, which is the same thing without the
  // arbitration.
  //
  // One floating progress line for the whole page (planWords'
  // progressWords).
  const progress = progressWords(s.navStage, s.stage, s.briefing.state === "loading", s.descriptionProgress);
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
  // places (a waypoint, a pilot's own point): the course's then.
  const index = useAirportIndex(true, routed);
  const straightNm = useMemo(() => {
    if (!routed || !index || !planned.dest) return null;
    const points = [planned.dep, ...planned.stops, `${planned.dest}`].map((p) => placeOf(index, p));
    if (points.some((p) => !p)) return null;
    let nm = 0;
    for (let i = 1; i < points.length; i++) nm += distanceNm(points[i - 1]!, points[i]!);
    return nm;
  }, [routed, index, planned.dep, planned.stops, planned.dest]);
  const estimate = useMemo(
    () =>
      routed && course && course.destination.ident === planned.dest && course.departure.ident === planned.dep
        ? { distanceNm: course.distance_nm, cruiseTasKt, fuelBurnGph, taxiFuelGal }
        : straightNm != null
          ? { distanceNm: straightNm, cruiseTasKt, fuelBurnGph, taxiFuelGal }
          : null,
    [routed, course, planned.dep, planned.dest, cruiseTasKt, fuelBurnGph, taxiFuelGal, straightNm],
  );
  // A toast however far out the panel is, at the pilot's ask, where the
  // flight's line said it with the panel out: that line keeps the
  // figures (FlightLine). A toast takes no tap but its own controls'
  // (index.css), so the route's box under it from the top still does.
  useProgressToast(progress);

  // The flight planning drawer: the nav log as the first section, the
  // briefing's sections under it, the briefing's own actions in the
  // drawer's header.
  // A leg where no 500 ft step fits (planWords' tightLegWords).
  const tightLeg = useMemo(() => tightLegWords(s.nav?.altitude_selection.segments), [s.nav]);

  const landedStops = useMemo(() => (course?.stops ?? []).filter((stop) => stop.kind !== "fix").map((stop) => stop.ident), [course]);
  // The route's ends, for a stop's search (SearchNear).
  const searchNear = course
    ? [course.departure, course.destination].map((end) => `${end.lat.toFixed(3)},${end.lon.toFixed(3)}`).join(";")
    : "";
  // Each tab's mark: the worst of its findings on the Brief's Go / No-Go
  // (lib/verdict), red for something to fix, amber for something to look at.
  const verdict = useVerdict((v) => v.items);
  const marks = useMemo(() => marksOf(verdict), [verdict]);
  // The Brief's own, on its button: the worst of its pages'.
  const briefMark = briefMarkOf(marks);
  const unflyableBrief = s.unflyable?.brief;
  // A tab tapped takes the panel all the way up to show it; the tab up
  // tapped again there takes it back to half, at the pilot's ask.
  // In sight all the way up: half way the panel ends at the tabs, so a
  // checkpoint picked then is brought into view as it comes up.
  const drawerOpen = panel === "full";
  const descriptionsLoading = s.descriptionProgress !== null;
  const landings = useMemo(() => [...new Set([planned.dep, ...landedStops, planned.dest])], [planned.dep, landedStops, planned.dest]);
  // The route's fields' chips' colours (useFieldColours).
  const { metarColour } = useFieldColours({ briefing: s.briefing, planned, waypointStops });
  // Made again only when the plan does, so the nav log and its tabs are
  // drawn again only then (fromRoutePanel's memo), not at each render of
  // the page as the route's answers stream in.
  // Checkpoint descriptions come with the subscription: without it, the
  // wand says so where it is (PaidPrompt), and writes nothing.
  // A flag, not the entitlement, which is a new object at every render:
  // the nav log below is drawn again only when this changes.
  const entitlement = useEntitlement();
  const paywalled = !mayUse(entitlement) && entitlement.kind !== "loading" && entitlement.kind !== "hidden";
  // Not offered here, or not known yet (Claude off by default): no wand (NavLogView).
  const descriptionsHidden = entitlement.kind === "hidden" || entitlement.kind === "loading";
  // The flight flown on paper, from the Profile card (useDryRun).
  const {
    running: dryRunning,
    goMissed,
    ready: dryRunReady,
    start: startDryRun,
    stop: stopDryRun,
    goMissedNow,
  } = useDryRun({ course, selected, legs: s.legs, depart, routed, profileShown });
  // The airplane flying the route (useFlyingMode): its NRST is Nearest's
  // list over Airport, as the microphone's is; its D→ direct to the next
  // landing, as the Stops' Direct To goes (directToPoint).
  const flyNearest = useCallback(() => {
    setViewPick("search");
    openNearest();
  }, [setViewPick, openNearest]);
  const flyDirectTo = nextLanding(s.totals, `${planned.dest}`).to;
  const flyDirect = useMemo(
    () => (flyDirectTo ? { to: flyDirectTo, go: () => directToPoint(flyDirectTo) } : null),
    [flyDirectTo, directToPoint],
  );
  const { flying, done: doneFlying } = useFlyingMode({ routed, setPanel, nearest: flyNearest, direct: flyDirect });
  // The flight handed to the in-flight copilot (features/copilot).
  useCopilotPublish({
    dest: `${planned.dest}`,
    rules: flightRules,
    line: course?.course_line,
    totals: s.totals,
    aircraft: s.nav?.aircraft,
  });
  // The Profile opened, at rest, from the route's Profile button, where the map's Play opened it and flew its
  // dry run at once until the owner took Play off the map (2026-11-02:
  // "I don't want the play button there, just the mic"); the run is the
  // profile's own Dry run button. With a route to draw it for: the side
  // view is drawn only then (sideView).
  const profileReady = routed && !!course && !s.local;
  const openProfile = useCallback(() => {
    setViewPick("plan");
    openProfileCard();
  }, [setViewPick, openProfileCard]);
  // A caution on the pilot's own altitude, or one tight in its band, marked
  // on the Profile button where the caution is said, as the AI brief's mark
  // is on its own (the owner, 2026-11-05: "The red dot can be on profile
  // (like brief) instead of the altitude"); not for a route with no legal
  // altitude, which the altitude's field says in red itself.
  const altitudeMark = !profileReady || s.unflyable || !s.nav ? null : s.nav.cautions?.length ? "caution" : tightLeg ? "tight" : null;
  // The cautions' reasons, each once, for the Profile card's head, where
  // the mark above points (ProfileCard).
  const profileCautions = useMemo(() => [...new Set((s.nav?.cautions ?? []).flatMap((c) => c.reasons))], [s.nav]);
  // The point and the leg picked, and the route in order (useLegSheet).
  const { selectedPoint, selectCandidate, selectPointAt, deselectPoint, routeRows, mapLegs, legAt, setLegAt, openLeg, closeLeg } =
    useLegSheet({ routeKey, course, logSelected: s.logSelected, legs: s.legs, dryRunning, directParam, directToPoint, removeStop });
  // The route's airports' airspace classes, as the course came with them:
  // the pills coloured the moment it is in.
  // Each made again only when what it reads changes, as the box is drawn
  // again only then (fromRoutePanel's memo).
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

  // FPL's route line of the Routes' chips, and their ways on the chart
  // (useRouteLine).
  const { lineKey, routeLine, wayLines, pickWay } = useRouteLine({
    routeWays,
    browsing,
    setBrowsing,
    chosenKey,
    vfrRoute,
    stops: planned.stops,
    fuelParam,
    ownWithFuel,
    ownMinutes,
    ownGround,
    ownNm,
    ownGal,
    setStops,
    flightRules,
  });
  // Its head: the route by name, and its plan under it -- where from and
  // to, the airplane, the altitude, when -- as an airport's card has its
  // name and where it is.
  // Worked out in a memo: the course's and the airplane's fields handed to
  // plain functions in the render counted, to the React Compiler, as the
  // objects handed over, and it gave up the memos before it that read them
  // across the hooks between (altitudeAt, addingChange).
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
  // A checkpoint picked on the chart with the Brief open: the Brief put
  // away for the nav log the pick is shown in.
  const pickPoint = useCallback(
    (lat: number, lon: number) => {
      if (briefShown) closeBrief();
      selectPointAt(lat, lon);
    },
    [briefShown, closeBrief, selectPointAt],
  );

  const unflyable = s.unflyable;

  // Saving the flight, the narrative and Print.
  const addingChange = useCallback(
    (open: boolean) => {
      setAddingStop(open ? "stop" : false);
      if (!open) setAddAt(null);
    },
    [setAddAt],
  );

  // The flight to save and file, and what the Brief and the assistant
  // read of it (useFlightToSave).
  const { fileable, fileFlightPlan, flightToSave } = useFlightToSave({
    s,
    planned,
    routed,
    course,
    aircraft,
    depart,
    altitudes,
    localMin,
    searchParams,
    setSearchParams,
    setRoute,
    flyAltitude,
    changeDepart,
  });
  // Share and everything else the route's row had (ShareMenu).
  // What planning again would bring in fresh, said by the refresh's dot:
  // winds past the forecast's period the legs were flown on, legs flown
  // with none, and the briefing's weather that could not be fetched again.
  const minute = useMinuteClock();
  const stale = [
    windsOutOfDate(s.totals, minute, depart) && "the winds are out of date",
    s.totals && legsWithoutWind(s.totals) && "some legs have no winds",
    (s.briefing.state === "failed" || (s.briefing.state === "ready" && s.briefing.refreshError)) && "the weather could not be fetched",
  ].filter((why): why is string => !!why);

  // The strips and lists drawn under the pill too while the sheet is on
  // the move, so they are there as it comes up: read as one answer with
  // the size, so a move between half and full -- where they are drawn
  // either way -- does not draw the whole workspace again at its start
  // and its end (the drag probe at CPU 4x, 2026-11-04: 100 to 170 ms each,
  // with the map's follow of the sheet waiting behind them).
  const stripsDrawn = usePanelDragging((d) => panel !== "peek" || d.dragging);
  // The route from the side (MiniProfile), a tap the nav log all the way up;
  // there, a picture of the flight, nothing to tap.
  // The dry run's chart's code fetched ahead, a few seconds after a run can
  // be had, so the run's first frame has its chart (loadFlightChart).
  useEffect(() => {
    if (!dryRunReady) return;
    const id = setTimeout(() => void loadFlightChart(), 3000);
    return () => clearTimeout(id);
  }, [dryRunReady]);

  // The route's chips: the airplane, the altitude, the time, Saved,
  // Approaches and Share (`controls`), and with no route the pill's too.
  // Folded from the start, no route yet too, at the owner's ask ("They
  // should not have route box from the start", 2026-11-05): the box only
  // while it is opened from the head, or a stop is typed in. Opened to
  // type a route, it folds by itself once the route is whole -- the
  // destination in -- as the pilot has what they opened it for.
  const wholeRoute = !!planned.dep && !!planned.dest;
  const [wasWhole, setWasWhole] = useState(wholeRoute);
  if (wholeRoute !== wasWhole) {
    setWasWhole(wholeRoute);
    if (wholeRoute && routeOpen) setRouteOpen(false);
  }
  // In the Plan never the box (the owner, 2026-11-05: "completely get rid
  // of the route box for in the plan").
  const routeFolded = routeEdit === "plan" || (routeEdit === "folded" && !routeOpen && !addingStop);

  return {
    panel,
    setPanel,
    acceptClassB,
    addAt,
    addFromPill,
    addStop,
    departFrom,
    addStopField,
    addingChange,
    addingStop,
    aircraft,
    aircraftChoices,
    aircraftFavoritesOpen,
    aircraftInput,
    aircraftOpen,
    aircraftRecentsOpen,
    aircraftTyped,
    aircraftValue,
    airportRecentsOpen,
    airspaceOf,
    altitudeAt,
    altitudeFt,
    altitudeMark,
    altitudeNearest,
    approachesOf,
    askFor,
    autoPicked,
    avoidClassB,
    briefHere,
    briefLine,
    briefMark,
    briefShown,
    cardOpen,
    cardUp,
    changeAircraft,
    changeAltitudeChoice,
    changeDepart,
    changeLocalMin,
    classBClearance,
    clearRoute,
    closeBrief,
    closeCard,
    closeFlight,
    closeLeg,
    closeLesson,
    closeList,
    closeNavLogCard,
    closeNearest,
    closePlace,
    closeProfileCard,
    closeSaved,
    closeStops,
    course,
    crossings,
    depAlone,
    depart,
    descriptionsHidden,
    descriptionsLoading,
    deselectPoint,
    directParam,
    directTo,
    directToPoint,
    doneFlying,
    drawerOpen,
    dropIntoRoute,
    dryRunReady,
    dryRunning,
    estimate,
    favorites,
    favoritesOpen,
    fileFlightPlan,
    fileable,
    filedProcedures,
    findNearby,
    firstFuelStop,
    fitAircraft,
    flight,
    flightRules,
    flightToSave,
    flownPatterns,
    flyAltitude,
    flyHere,
    flying,
    fuelHidden,
    fuelStopPins,
    fuelStops,
    goMissed,
    goMissedNow,
    ground,
    hasPoints,
    heldPoint,
    hideFuelStop,
    holdAsk,
    holdPoint,
    holds,
    home,
    insertStopAfter,
    keepFuelStops,
    landedStops,
    landings,
    lessonOpen,
    lineKey,
    list,
    listAway,
    listEdit,
    legAt,
    local,
    localMin,
    mapDirects,
    mapLegs,
    mapProcedures,
    marks,
    measuredFrom,
    metarColour,
    moveFavoriteAirport,
    navLogShown,
    nearFrom,
    nearOpen,
    nearOrigin,
    nearStrip,
    nearTyped,
    nearestPoints,
    noApproaches,
    openLeg,
    openBrief,
    openFix,
    openList,
    openNavLogCard,
    openNearest,
    openProcedures,
    openProfile,
    openSaved,
    opened,
    panelOpen,
    past,
    patternFocus,
    paywalled,
    pickPattern,
    pickPlace,
    pickPoint,
    pickProcedures,
    pickStopField,
    pickView,
    pickTail,
    pickWay,
    pickedPatterns,
    pickedProcedures,
    pickedTakeoffs,
    picking,
    pickingFavorite,
    pickingMine,
    place,
    placePin,
    planned,
    preselectPattern,
    preselectTakeoff,
    previewProcedure,
    procedureAirports,
    procedureCover,
    procedureFocus,
    proceduresAt,
    profileCautions,
    profileHere,
    profileReady,
    profileShown,
    query,
    removeStop,
    routeEdit,
    routeFolded,
    routeKey,
    routeLine,
    routeOpen,
    routePoints,
    routeProcedures,
    routeRecentsOpen,
    routeRows,
    routed,
    runwayFitInputs,
    s,
    savedOpen,
    search,
    searchInput,
    searchNear,
    selectCandidate,
    selectFlight,
    selectPast,
    selectPlace,
    selectPlaceOnChart,
    selectPointAt,
    selected,
    selectedPoint,
    setAddingStop,
    setApproachesOf,
    setCrossing,
    setFlightRules,
    setGround,
    setHold,
    setHomeAirport,
    setLegAt,
    setLoad,
    setNearFrom,
    setNewStopVia,
    setOpenFixAt,
    setPicking,
    setPointAltitude,
    setProceduresShown,
    setQuery,
    setRoute,
    setRouteOpen,
    setStops,
    setStopsScope,
    setTakeoff,
    showFix,
    showFuelStops,
    showLegs,
    stale,
    startDryRun,
    startPin,
    stopDryRun,
    stopFieldPins,
    stopsAt,
    stopsHere,
    stopsRoute,
    stopsScope,
    stopsShown,
    stripsDrawn,
    suggestedAt,
    view,
    tankFigures,
    tightLeg,
    toggleFavoriteAirport,
    typeProcedures,
    typeStopAt,
    unflyable,
    unflyableBrief,
    wayLines,
    waypointStops,
    wholeRoute,
  };
}

/** The planner's view model, as its view and sub-views read it. */
export type PlanWorkspaceModel = ReturnType<typeof usePlanWorkspace>;
