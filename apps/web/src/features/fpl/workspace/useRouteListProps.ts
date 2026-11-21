import { useMemo } from "react";
import { MAX_STOPS } from "../../../lib/identSchema";
import type { PlanSlices } from "../vm/planSlices";

export type RouteListSlices = PlanSlices<"route" | "plan" | "cards" | "picks" | "stops" | "routeList" | "leg" | "brief" | "flight">;

/**
 * What the route's fields and points are drawn from, for FPL's timeline
 * on the ground (RouteTimeline, where the route is edited; the owner,
 * 2026-11-17) and the route read in flight and a dry run (ProceduresRoute):
 * the departure and arrival with their runways and procedures, the stops
 * between, and the sheets they open. `edit`, the route changed in place
 * (useRouteListEdit), on the ground alone.
 */
export function useRouteListProps(vm: RouteListSlices) {
  const { crossings, depart, directParam, ground, holds, insertStopAfter, planned, removeStop, routePoints, setPointAltitude, tanks } =
    vm.route;
  const { changeDepart, directToPoint, setGround, setHold, setTanks } = vm.plan;
  const { selectPlace, setApproachesOf } = vm.cards;
  const {
    autoPicked,
    noApproaches,
    pickPattern,
    pickProcedures,
    pickedPatterns,
    pickedProcedures,
    pickedTakeoffs,
    preselectPattern,
    preselectTakeoff,
    previewProcedure,
    procedureAirports,
    proceduresAt,
    routeProcedures,
    runwayFitInputs,
    setProceduresShown,
    setTakeoff,
    showFix,
  } = vm.picks;
  const { tankFigures } = vm.stops;
  const { holdAsk, listEdit, routeLine } = vm.routeList;
  const { routeRows } = vm.leg;
  const { altitudeAt, metarColour } = vm.brief;
  const { dryRunning, flying } = vm.flight;
  const read = !!flying || !!dryRunning;
  return useMemo(
    () => ({
      airports: procedureAirports,
      rows: routeRows,
      depart,
      weather: metarColour,
      picked: pickedPatterns,
      onPick: pickPattern,
      onPreselect: preselectPattern,
      takeoffs: pickedTakeoffs,
      onTakeoff: setTakeoff,
      onPreselectTakeoff: preselectTakeoff,
      autoPicked,
      fit: runwayFitInputs,
      procedures: pickedProcedures,
      inRoute: routeProcedures,
      onProcedures: pickProcedures,
      onPreview: previewProcedure,
      at: proceduresAt,
      onAt: setProceduresShown,
      crossings,
      onFix: showFix,
      onDepart: changeDepart,
      ground,
      onGround: setGround,
      pointAltitude: altitudeAt,
      onPointAltitude: setPointAltitude,
      directTo: directParam,
      onDirectTo: directToPoint,
      onInfo: selectPlace,
      onRemove: removeStop,
      onCreateFix: insertStopAfter,
      holds,
      onHoldSet: setHold,
      askHold: holdAsk,
      routePoints,
      stopsFull: planned.stops.length >= MAX_STOPS,
      fuel: tankFigures,
      // The gauges set where the list edits the route, on the ground.
      tanks,
      onTanks: read ? undefined : setTanks,
      onCharts: () => {
        if (planned.dest) {
          setApproachesOf(planned.dest);
          selectPlace(planned.dest);
        }
      },
      chartsDisabled: !planned.dest || noApproaches,
      // The Routes' chips over the list in flight alone: on the ground
      // they are under the timeline's figures (FplRoute).
      routeLine: flying ? routeLine : null,
      edit: read ? undefined : listEdit,
    }),
    [
      routeLine,
      procedureAirports,
      routeRows,
      depart,
      metarColour,
      pickedPatterns,
      pickPattern,
      preselectPattern,
      pickedTakeoffs,
      setTakeoff,
      preselectTakeoff,
      autoPicked,
      runwayFitInputs,
      pickedProcedures,
      routeProcedures,
      pickProcedures,
      crossings,
      showFix,
      ground,
      setGround,
      previewProcedure,
      proceduresAt,
      setProceduresShown,
      planned.dest,
      setApproachesOf,
      selectPlace,
      noApproaches,
      changeDepart,
      altitudeAt,
      setPointAltitude,
      directParam,
      directToPoint,
      removeStop,
      insertStopAfter,
      holds,
      setHold,
      holdAsk,
      routePoints,
      planned.stops.length,
      tankFigures,
      tanks,
      setTanks,
      listEdit,
      flying,
      read,
    ],
  );
}
