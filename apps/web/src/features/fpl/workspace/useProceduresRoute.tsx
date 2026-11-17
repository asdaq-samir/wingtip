import { useMemo } from "react";
import { MAX_STOPS } from "../../../lib/identSchema";
import { ProceduresRoute } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";

/**
 * FPL's list of the route's steps, made once for the same plan (useMemo),
 * so it is drawn again only when what it shows changes (routePanelParts'
 * memo): the departure and arrival with their runways and procedures, and
 * the stops between.
 */
export function useProceduresRoute(vm: PlanSlices<"route" | "plan" | "cards" | "picks" | "stops" | "routeList" | "leg" | "brief">) {
  const { crossings, depart, directParam, ground, holds, insertStopAfter, planned, removeStop, routeEdit, routePoints, setPointAltitude } =
    vm.route;
  const { changeDepart, directToPoint, setGround, setHold } = vm.plan;
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
  return useMemo(
    () => (
      <>
        <ProceduresRoute
          airports={procedureAirports}
          rows={routeRows}
          depart={depart}
          weather={metarColour}
          picked={pickedPatterns}
          onPick={pickPattern}
          onPreselect={preselectPattern}
          takeoffs={pickedTakeoffs}
          onTakeoff={setTakeoff}
          onPreselectTakeoff={preselectTakeoff}
          autoPicked={autoPicked}
          fit={runwayFitInputs}
          procedures={pickedProcedures}
          inRoute={routeProcedures}
          onProcedures={pickProcedures}
          onPreview={previewProcedure}
          at={proceduresAt}
          onAt={setProceduresShown}
          crossings={crossings}
          onFix={showFix}
          onDepart={changeDepart}
          ground={ground}
          onGround={setGround}
          pointAltitude={altitudeAt}
          onPointAltitude={setPointAltitude}
          directTo={directParam}
          onDirectTo={directToPoint}
          onInfo={selectPlace}
          onRemove={removeStop}
          onCreateFix={insertStopAfter}
          holds={holds}
          onHoldSet={setHold}
          askHold={holdAsk}
          routePoints={routePoints}
          stopsFull={planned.stops.length >= MAX_STOPS}
          fuel={tankFigures}
          onCharts={() => {
            if (planned.dest) {
              setApproachesOf(planned.dest);
              selectPlace(planned.dest);
            }
          }}
          chartsDisabled={!planned.dest || noApproaches}
          // In Route Cards the Routes row is in the head's box under the
          // bar (the route slot, below), not over the list.
          routeLine={routeEdit === "plan" ? null : routeLine}
          // The list changes the route too where the box is folded away once
          // the route is whole (RouteEdit, both of the owner's picks).
          // Not with the box as it was, whose pills do it.
          edit={routeEdit !== "box" && planned.dep && planned.dest ? listEdit : undefined}
        />
      </>
    ),
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
      planned.dep,
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
      listEdit,
      routeEdit,
    ],
  );
}
