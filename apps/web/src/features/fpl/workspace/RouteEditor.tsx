import { Suspense } from "react";
import { SearchNear } from "../../../lib/useAirportSearch";
import { usePlanUndo } from "../../../lib/planUndo";
import { coverCard, useSheetCards } from "../../../lib/sheetCards";
// The route's field, on a chunk of its own, asked for beside the first
// script (main.tsx) so it is in hand at the first Type or Paste a Route.
import { RouteBox } from "../../route";
import type { PlanSlices } from "../vm/planSlices";
import { FlightFigures } from "./FlightFoot";

/**
 * FPL's route's field, open under its timeline (RouteHead) once asked for
 * (routeBoxOpen; decision 0047): the timeline's Type or Paste a Route
 * before the route is whole, the keyboard button at Add a Stop's end after. The route's
 * field to type or paste a whole route in, read by the engine's route_read
 * as it always was (RouteBox); and once the route is whole its figures
 * under it, changing as it is edited, till Done.
 */
export default function RouteEditor({
  vm,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
}) {
  const { directParam, hasPoints, planned, routed, setPointAltitude, setRoute, wholeRoute } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { openProcedures, routeProcedures, typeProcedures } = vm.picks;
  const { fuelStops, hideFuelStop, keepFuelStops } = vm.stops;
  const { addAt, addingChange, addingStop, clearRoute, setEditorFocused, waypointStops } = vm.routeList;
  const { airspaceOf, altitudeAt, metarColour, searchNear } = vm.brief;
  // A stop asked for from a card (the profile's no-legal-altitude problem,
  // its Add a Stop): asked of the field once the card has gone. Under it the
  // sheet is inert (SheetParts, while a card is up), and the field's focus
  // as it was asked went nowhere (plans.spec, "no legal altitude").
  const covered = useSheetCards((c) => !!coverCard(c.stack));
  // The empty box's Undo while the plan's last step took the route away
  // (a clear, or its last point removed), gone once a new one is started:
  // the plan's one Undo (lib/planUndo), as every edit's toast has.
  const routeUndo = usePlanUndo((u) => (u.undoName === "Route" ? u.undo : null));
  return (
    <div
      className="flex flex-col px-4 pb-2"
      data-testid="route-editor"
      // Typed in, a route made whole stays open (usePlanRouteList).
      onFocus={() => setEditorFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setEditorFocused(false);
      }}
    >
      {/* The route's field: a whole route typed or pasted, its points as
          pills; its room while its code comes, the box's own line. */}
      <div className="pt-2">
        <Suspense fallback={<div className="h-10 rounded-(--radius-banner) bg-card" />}>
          <SearchNear.Provider value={searchNear}>
            <RouteBox
              dep={planned.dep}
              stops={planned.stops}
              dest={planned.dest}
              waypoints={waypointStops}
              airspaceOf={airspaceOf}
              metarColourOf={metarColour}
              altitudeAt={altitudeAt}
              onAltitudeChange={setPointAltitude}
              onChange={setRoute}
              onTypedProcedures={typeProcedures}
              adding={addingStop && !covered}
              onAddingChange={addingChange}
              procedures={routeProcedures}
              onProcedures={openProcedures}
              fuelStops={fuelStops}
              onKeepFuelStops={keepFuelStops}
              onHideFuelStop={hideFuelStop}
              // An airport's pill tapped: its card over the route, as a tap
              // on it on the chart opens it; closed, the route.
              onOpenAirport={selectPlace}
              directTo={directParam}
              onDirectTo={directToPoint}
              unknownPoint={s.unknownPlace}
              addAt={addAt}
              // Half a route cleared by the box's ✕ (the owner, 2026-11-18);
              // a route planned, by FPL's ✕.
              onClear={hasPoints && !routed ? clearRoute : undefined}
              onUndo={!hasPoints && routeUndo ? routeUndo : undefined}
            />
          </SearchNear.Provider>
        </Suspense>
      </div>
      {/* The figures under the cards while they are edited, so each change
          is read as it is made (the canvas's "Tap the route to expand"). */}
      {wholeRoute && (
        // 4 in from the head's 12, at iOS's 16, as the folded route's (FplActions).
        <div className="px-1 pt-3" data-testid="route-editor-figures">
          <FlightFigures vm={vm} grow={false} />
        </div>
      )}
    </div>
  );
}
