import { Suspense, useRef } from "react";
import { SearchNear } from "../../../lib/useAirportSearch";
import { coverCard, useSheetCards } from "../../../lib/sheetCards";
// The route's field, on a chunk of its own, asked for beside the first
// script (main.tsx) so it is in hand at the box's toggle's first tap.
import { RouteBox } from "../../route";
import type { PlanSlices } from "../vm/planSlices";
import { FlightFigures } from "./FlightFoot";
import { TypeRouteButton } from "../../procedures/lazy";
import { FuelPill } from "./FuelPill";
import { useFieldRoom } from "./useFieldRoom";
import { coursePoints } from "../../../lib/course";
import { sameField } from "../../../lib/procedures";

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
  vm: PlanSlices<"brief" | "cards" | "flight" | "leg" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
  /** Drawn in the timeline's own place (RouteHead), the box where the grouped box was. */
  inPlace?: boolean;
}) {
  const { directParam, hasPoints, planned, routed, setPointAltitude, setRoute, wholeRoute } = vm.route;
  const { course, directToPoint, s } = vm.plan;
  const { selectPlace } = vm.cards;
  const { openProcedures, routeProcedures, setProceduresShown, typeProcedures } = vm.picks;
  const { fuelStops, hideFuelStop, keepFuelStops, noFuelStop } = vm.stops;
  const { selectPointAt } = vm.leg;
  const { panel, setPanel } = vm.view;
  const { addAt, addingChange, addingStop, clearRoute, foldRoute, routeOpen, setEditorFocused, waypointStops } = vm.routeList;
  const { altitudeAt, searchNear } = vm.brief;
  // A stop asked for from a card (the profile's no-legal-altitude problem,
  // its Add a Stop): asked of the field once the card has gone. Under it the
  // sheet is inert (SheetParts, while a card is up), and the field's focus
  // as it was asked went nowhere (plans.spec, "no legal altitude").
  const covered = useSheetCards((c) => !!coverCard(c.stack));
  // The toggle back to the timeline, in the box's bottom right where it
  // was on the timeline's face (TypeRouteButton): what is typed is read as
  // the field is left, the tap's own blur, so the route folds with it in
  // (the plan's Undo as ever); the focus kept on the toggle there. On an
  // empty, half or whole route opened by it. The box draws it right under
  // itself, before its red message (RouteBox's foot), so the message and
  // its Remove are never under it.
  const toggleRow = routeOpen && (
    // At the box's bottom right, where it is on the timeline's face, in the
    // row of room the wrapped box keeps under its last line (RouteBox's
    // pb-11), never over a pill (z-10 over the box), its 44-point area whole.
    // As far in from the right as on the rows' face (TIMELINE_END), the
    // fuel stops' pill before it 8 apart as there, so a whole route's
    // pair sits in one place on both faces (FuelPill).
    // The row itself takes no tap: the box's last line under it is the
    // field's, a tap there putting the caret at the route's end (the r6
    // audit's M8); only its two controls take theirs.
    <div className="pointer-events-none relative z-10 -mt-11 flex h-11 items-center justify-end gap-2 pr-4 *:pointer-events-auto">
      {wholeRoute && !vm.flight.flying && !vm.flight.dryRunning && <FuelPill vm={vm} />}
      <TypeRouteButton
        pressed
        onToggle={() => {
          foldRoute();
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="route-type-open"]')?.focus());
        }}
      />
    </div>
  );
  // Too long for the room above FPL's foot bar, its pills scroll in the box.
  const field = useRef<HTMLDivElement>(null);
  useFieldRoom(field, inPlace);
  return (
    <div
      ref={field}
      // In the timeline's own place (RouteHead), none of its own room round
      // it; else its room under its last row --box-foot (index.css), which
      // the sheet's end room measures the gap past.
      className={inPlace ? "flex flex-col" : "flex flex-col px-4 pb-(--box-foot)"}
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
              // A pill's Procedures, the same way: the timeline's sheet, of
              // the kind the route flies there.
              onOpenProcedures={(ident, kind) => {
                if (inPlace) foldRoute();
                setProceduresShown({ ident, kind });
              }}
              // A pill's Show on Map: the map brought to the point and ringed,
              // as a nav log row's tap does (the map's picked point), the
              // sheet down to half where it hid the map.
              onShowOnMap={(ident) => {
                const at = course ? coursePoints(course).find((p) => sameField(p.ident, ident)) : undefined;
                if (!at) return;
                if (panel === "full") setPanel("half");
                selectPointAt(at.lat, at.lon);
              }}
              shortFlights={noFuelStop}
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
              foot={toggleRow}
            />
          </SearchNear.Provider>
        </Suspense>
      </div>
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
