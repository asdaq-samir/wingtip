import { Suspense } from "react";
import { placeName } from "../../lib/radio";
import { SearchNear } from "../../../../lib/useAirportSearch";
import { coverCard, useSheetCards } from "../../../../lib/sheetCards";
import { RouteLine, RouteEnds, RouteSplit } from "../../routePanelParts";
// The search, on a chunk of its own: the first screen draws it.
import { RouteBox } from "../../routeBoxChunk";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * The route under FPL's first row (PlanWorkspace's `route`), one row in
 * each of the three ways the pilot shows it (RouteEdit): the box of pills,
 * the line split in three, or the cards' ends. The airplane's strip with
 * the route's buttons is not here but the first row's bar over it, the
 * same in all three (FplBar; the owner, 2026-11-14: "The route box just
 * become a single row under it and same with other fpl layouts, they just
 * go under the n-number strip with buttons and the toggle").
 */
export default function RouteHead({ vm }: { vm: PlanWorkspaceModel }) {
  const { directParam, planned, routeEdit, routePoints, setPointAltitude, setRoute, wholeRoute } = vm.route;
  const { course, directToPoint, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { openProcedures, routeProcedures, typeProcedures } = vm.picks;
  const { fuelStops, hideFuelStop, keepFuelStops } = vm.stops;
  const { addAt, addingChange, addingStop, routeFolded, routeLine, routeOpen, setRouteOpen, typeStopAt, waypointStops } = vm.routeList;
  const { airspaceOf, altitudeAt, metarColour, searchNear } = vm.brief;
  // A stop asked for from a card (the profile's no-legal-altitude problem,
  // its Add a Stop): asked of the box once the card has gone. Under it the
  // sheet's head is inert (SheetParts, while a card is up), and the box's
  // focus as it was asked went nowhere (plans.spec, "no legal altitude").
  const covered = useSheetCards((c) => !!coverCard(c.stack));
  return routeFolded ? (
    <div className="flex min-w-0 flex-1 flex-col" data-testid="route-folded">
      {routeEdit === "plan" ? (
        // Route Cards, the owner's pick of the canvas's option 3
        // (2026-11-05): until the route is whole its departure and
        // destination as two cards; once it is, the Routes row in a white
        // box of its own (the owner's pick B, "show the controls and
        // routes grouped", the controls now the bar over it), the cards
        // following in the plan (ProceduresRoute).
        !wholeRoute ? (
          <Suspense fallback={<div className="h-[7.75rem]" />}>
            <RouteEnds
              dep={planned.dep}
              dest={planned.dest}
              onDep={(dep) => setRoute({ dep, stops: planned.stops, dest: planned.dest })}
              onDest={(dest) => setRoute({ dep: planned.dep, stops: planned.stops, dest })}
            />
          </Suspense>
        ) : (
          routeLine && (
            <div className="mb-1 w-full rounded-2xl bg-card ring-1 ring-black/5 dark:ring-white/10" data-testid="route-group">
              <Suspense fallback={<div className="h-11" />}>
                <RouteLine line={routeLine} grouped />
              </Suspense>
            </div>
          )
        )
      ) : (
        // Route Line, the owner's pick L1 of the canvas (2026-11-05): the
        // route split in three, each end its own tap, the stops between
        // them the box's.
        <Suspense fallback={<div className="h-[3.25rem] rounded-full bg-card" />}>
          <RouteSplit
            dep={planned.dep}
            dest={planned.dest}
            stops={planned.stops}
            depName={wholeRoute && course ? placeName(course.departure.name, course.departure.ident) : null}
            destName={wholeRoute && course ? placeName(course.destination.name, course.destination.ident) : null}
            onDep={(dep) => setRoute({ dep, stops: planned.stops, dest: planned.dest })}
            onDest={(dest) => setRoute({ dep: planned.dep, stops: planned.stops, dest })}
            onStops={() => (planned.stops.length ? setRouteOpen(true) : typeStopAt(routePoints.length - 1))}
          />
        </Suspense>
      )}
    </div>
  ) : (
    <div className="min-w-0 flex-1">
      {/* Its room while its code comes: the box's own line. */}
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
            adding={!!addingStop && !covered}
            onAddingChange={addingChange}
            via={addingStop === "via" ? s.unflyable?.detours : undefined}
            procedures={routeProcedures}
            onProcedures={openProcedures}
            fuelStops={fuelStops}
            onKeepFuelStops={keepFuelStops}
            onHideFuelStop={hideFuelStop}
            // An airport's pill tapped: its card over the route, as a tap on
            // it on the chart opens it, at the pilot's ask; closed, the route.
            onOpenAirport={selectPlace}
            directTo={directParam}
            onDirectTo={directToPoint}
            unknownPoint={s.unknownPlace}
            addAt={addAt}
            // Opened from its folded line: Done folds it again.
            onDone={routeEdit !== "box" && routeOpen ? () => setRouteOpen(false) : undefined}
          />
        </SearchNear.Provider>
      </Suspense>
    </div>
  );
}
