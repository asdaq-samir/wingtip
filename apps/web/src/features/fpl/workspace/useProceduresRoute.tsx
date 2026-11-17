import { useMemo } from "react";
import { MAX_STOPS } from "../../../lib/identSchema";
import { ProceduresRoute } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import { routeEditing } from "./routeEditing";

/**
 * FPL's list of the route's steps, made once for the same plan (useMemo),
 * so it is drawn again only when what it shows changes (routePanelParts'
 * memo): the departure and arrival with their runways and procedures, and
 * the stops between. In the one layout (decision 0046) it is the route
 * open to edit, its points moved, changed and added to; read in flight and
 * a dry run, the Routes' chips over it in flight, where the route's row is
 * not drawn; and folded, none: the folded route is its line alone.
 */
export function useProceduresRoute(
  vm: PlanSlices<"route" | "plan" | "cards" | "picks" | "stops" | "routeList" | "leg" | "brief" | "flight">,
) {
  const { crossings, depart, directParam, ground, holds, insertStopAfter, planned, removeStop, routePoints, setPointAltitude, hasPoints } =
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
  const { dryRunning, flying } = vm.flight;
  const read = !!flying || !!dryRunning;
  // Open to edit with points to list: half a route lists its fields too.
  const editing = routeEditing(vm) && hasPoints;
  const shown = read || editing;
  return useMemo(
    () =>
      shown ? (
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
          // The Routes' chips over the list in flight alone: on the ground
          // they are the folded route's (FplRoute).
          routeLine={flying ? routeLine : null}
          edit={editing ? listEdit : undefined}
        />
      ) : (
        // Folded: nothing under the route's line, not the nav log's own
        // list either (NavLogView draws `route` in its place).
        FOLDED
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
      shown,
      flying,
      editing,
    ],
  );
}

/** What FPL's list is while the route is folded: nothing. */
const FOLDED = <></>;
