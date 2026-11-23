import { Suspense } from "react";
import { SearchNear } from "../../../lib/useAirportSearch";
import { coverCard, useSheetCards } from "../../../lib/sheetCards";
// The route's field, on a chunk of its own, asked for beside the first
// script (main.tsx) so it is in hand at the box's toggle's first tap.
import { RouteBox } from "../../route";
import type { PlanSlices } from "../vm/planSlices";
import { FlightFigures } from "./FlightFoot";
import { TypeRouteButton } from "../../procedures/lazy";
import { keptTimelineHeight } from "./routeEditing";
import { FuelPill } from "./FuelPill";

/**
 * FPL's route's field, the box's other face once its toggle asks for it
 * (routeBoxOpen; decision 0047), in the box's own place (inPlace), or under
 * the card while a stop is typed. The route's
 * field to type or paste a whole route in, read by the engine's route_read
 * as it always was (RouteBox); and once the route is whole its figures
 * under it, changing as it is edited, till Done.
 */
export default function RouteEditor({
  vm,
  inPlace = false,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
  /** Drawn in the timeline's own place (RouteHead), the box where the grouped box was. */
  inPlace?: boolean;
}) {
  const { directParam, hasPoints, planned, routed, setPointAltitude, setRoute, wholeRoute } = vm.route;
  const { directToPoint, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { openProcedures, routeProcedures, typeProcedures } = vm.picks;
  const { fuelStops, hideFuelStop, keepFuelStops } = vm.stops;
  const { addAt, addingChange, addingStop, clearRoute, foldRoute, routeOpen, setEditorFocused, waypointStops } = vm.routeList;
  const { airspaceOf, altitudeAt, metarColour, searchNear } = vm.brief;
  // A stop asked for from a card (the profile's no-legal-altitude problem,
  // its Add a Stop): asked of the field once the card has gone. Under it the
  // sheet is inert (SheetParts, while a card is up), and the field's focus
  // as it was asked went nowhere (plans.spec, "no legal altitude").
  const covered = useSheetCards((c) => !!coverCard(c.stack));
  return (
    <div
      // In the timeline's own place (RouteHead), none of its own room round it.
      className={inPlace ? "flex flex-col" : "flex flex-col px-4 pb-2"}
      data-testid="route-editor"
      // Typed in, a route made whole stays open (usePlanRouteList).
      onFocus={() => setEditorFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setEditorFocused(false);
      }}
    >
      {/* The route's field: a whole route typed or pasted, its points as
          pills; its room while its code comes, the box's own line. */}
      <div className={inPlace ? undefined : "pt-2"}>
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
              // The Procedures' sheets are the timeline's (RouteSheets): from
              // the field the toggle opened, a procedure's pill turns the
              // box back to it, its sheet opening over it, where the tap did
              // nothing (procedures-approach.spec).
              onProcedures={
                inPlace
                  ? (p) => {
                      foldRoute();
                      openProcedures(p);
                    }
                  : openProcedures
              }
              fuelStops={fuelStops}
              onKeepFuelStops={keepFuelStops}
              onHideFuelStop={hideFuelStop}
              // An airport's pill tapped: its card over the route, as a tap
              // on it on the chart opens it; closed, the route.
              onOpenAirport={selectPlace}
              directTo={directParam}
              onDirectTo={directToPoint}
              unknownPoint={s.unknownPlace}
              unreachable={s.unreachable}
              addAt={addAt}
              // Half a route cleared by the box's ✕ (the owner, 2026-11-18);
              // a route planned, by FPL's ✕.
              onClear={hasPoints && !routed ? clearRoute : undefined}
              // Turned from the grouped box by its toggle: its size and shape, the route wrapped in it.
              wrapped={inPlace}
              height={inPlace ? keptTimelineHeight() : undefined}
            />
          </SearchNear.Provider>
        </Suspense>
      </div>
      {/* The toggle back to the timeline, in the box's bottom right where it
          was on the timeline's face (TypeRouteButton): what is typed is
          read as the field is left, the tap's own blur, so the route
          folds with it in (the plan's Undo as ever); the focus kept on the
          toggle there. On an empty, half or whole route opened by it. */}
      {routeOpen && (
        // At the box's bottom right, where it is on the timeline's face, over
        // the box's last line (z-10), its 44-point area whole.
        // As far in from the right as on the rows' face (TIMELINE_END), the
        // fuel stops' pill before it 8 apart as there, so a whole route's
        // pair sits in one place on both faces (FuelPill).
        <div className="relative z-10 -mt-11 flex h-11 items-center justify-end gap-2 pr-4">
          {wholeRoute && !vm.flight.flying && !vm.flight.dryRunning && <FuelPill vm={vm} />}
          <TypeRouteButton
            pressed
            onToggle={() => {
              foldRoute();
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="route-type-open"]')?.focus());
            }}
          />
        </div>
      )}
      {/* The figures under the cards while they are edited, so each change
          is read as it is made (the canvas's "Tap the route to expand"). */}
      {wholeRoute && !inPlace && (
        // 4 in from the head's 12, at iOS's 16, as the folded route's (FplActions).
        <div className="px-1 pt-3" data-testid="route-editor-figures">
          <FlightFigures vm={vm} grow={false} />
        </div>
      )}
    </div>
  );
}
