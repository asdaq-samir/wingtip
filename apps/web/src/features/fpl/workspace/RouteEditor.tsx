import { Suspense, useEffectEvent, useLayoutEffect, useRef } from "react";
import { SearchNear } from "../../../lib/useAirportSearch";
import { coverCard, useSheetCards } from "../../../lib/sheetCards";
import { useIsMobile } from "../../../hooks/use-mobile";
import { RouteEnds } from "../routePanelParts";
// The route's field, on a chunk of its own: the first screen draws it.
import { RouteBox } from "../../route";
import type { PlanSlices } from "../vm/planSlices";
import { FlightFigures } from "./FlightFoot";

/**
 * FPL's route open to edit, under its airport cards (the nav log's route
 * list, ProceduresRoute, over it in the page), the one layout's expanded
 * face (the owner, 2026-11-17, decision 0046): with no route its two ends'
 * cards to fill (RouteEnds); the route's field to type or
 * paste a whole route in, read by the engine's route_read as it always was
 * (RouteBox), where a stop asked for from the list (Add a Stop) is typed
 * in; and once the route is whole its figures under all of it, changing
 * as it is edited. Opened from the folded line with more than the sheet
 * shows, the sheet goes all the way up (makeRoom), and Done takes it back.
 */
export default function RouteEditor({
  vm,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "picks" | "plan" | "route" | "routeList" | "stops">;
}) {
  const { directParam, hasPoints, planned, setPointAltitude, setRoute, wholeRoute } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { openProcedures, routeProcedures, typeProcedures } = vm.picks;
  const { fuelStops, hideFuelStop, keepFuelStops } = vm.stops;
  const { addAt, addingChange, addingStop, makeRoom, setEditorFocused, waypointStops } = vm.routeList;
  const { airspaceOf, altitudeAt, metarColour, searchNear } = vm.brief;
  // A stop asked for from a card (the profile's no-legal-altitude problem,
  // its Add a Stop): asked of the field once the card has gone. Under it the
  // sheet is inert (SheetParts, while a card is up), and the field's focus
  // as it was asked went nowhere (plans.spec, "no legal altitude").
  const covered = useSheetCards((c) => !!coverCard(c.stack));
  // Opened on a phone's sheet with its end under the sheet's edge (the
  // floating bar's top, or the screen's foot): raised all the way up, once,
  // as it opens.
  const onPhone = useIsMobile();
  const end = useRef<HTMLDivElement>(null);
  const fit = useEffectEvent(() => {
    const el = end.current;
    if (!onPhone || !wholeRoute || !el) return;
    const foot = document.querySelector<HTMLElement>('[data-testid="panel-foot"]');
    const edge = foot && foot.getClientRects().length ? foot.getBoundingClientRect().top : window.innerHeight;
    if (el.getBoundingClientRect().bottom > edge) makeRoom();
  });
  useLayoutEffect(() => fit(), []);
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
      {/* Half a route lists its fields over the field (the list above), and
          the field says the end it lacks. */}
      {!hasPoints && (
        <Suspense fallback={<div className="h-[7.75rem]" />}>
          <RouteEnds
            dep={planned.dep}
            dest={planned.dest}
            onDep={(dep) => setRoute({ dep, stops: planned.stops, dest: planned.dest })}
            onDest={(dest) => setRoute({ dep: planned.dep, stops: planned.stops, dest })}
          />
        </Suspense>
      )}
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
              adding={!!addingStop && !covered}
              onAddingChange={addingChange}
              via={addingStop === "via" ? s.unflyable?.detours : undefined}
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
            />
          </SearchNear.Provider>
        </Suspense>
      </div>
      {/* The figures under the cards while they are edited, so each change
          is read as it is made (the canvas's "Tap the route to expand"). */}
      {wholeRoute && (
        <div className="pt-3" data-testid="route-editor-figures">
          <FlightFigures vm={vm} grow={false} />
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
