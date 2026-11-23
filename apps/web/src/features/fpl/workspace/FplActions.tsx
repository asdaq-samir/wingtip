import { Suspense, useRef, type ReactNode } from "react";
import { cn } from "cn";
import { PIN_AT_FOOT, usePinAtFoot } from "../../../components/sheet/pinAtFoot";
import { CardAction as Action } from "../../../components/CardAction";
import { ICON } from "../../../lib/icons";
import { RouteLine } from "../routePanelParts";
import type { PlanSlices } from "../vm/planSlices";
import RouteHead from "./RouteHead";
import { FlightFigures } from "./FlightFoot";
import { routeEditing, routesOut, routeTyped } from "./routeEditing";

/**
 * FPL's actions in flight, one row of four tiles at the top of the flying
 * drawer, as the airport card's are (CardAction; the owner's pick A of the
 * FPL buttons canvas, 2026-11-15, Hr6eKFhyFBLjAAAmEaq8HB): the Brief, the
 * Nav Log, the Profile and the route's ••• "More" (`more`; the owner,
 * 2026-11-17: "move everything to the tab bar with a ... instead of
 * share"). In flight the foot is the
 * figures, large, and Done flying; on the ground the four are the foot's
 * floating bar (FplTabBar). Only once there is a route; VoiceOver hears
 * the Brief's and the Profile's findings in their names.
 */
export function FplActions({ vm, more }: { vm: PlanSlices<"brief" | "flight" | "fpl" | "plan" | "route">; more: ReactNode }) {
  const { routed } = vm.route;
  const { flying } = vm.flight;
  const { course } = vm.plan;
  const { openBrief, openNavLogCard, openProfile, profileReady } = vm.fpl;
  const { altitudeMark, briefMark } = vm.brief;
  // In flight only, at the top of the flight's view, where the route's row
  // is not drawn (SheetParts); on the ground they are the foot's floating
  // bar (FplTabBar).
  if (!routed || !flying) return null;
  return (
    // 56 tall as the airport card's (PlaceActions), eight apart so their
    // 44-point areas meet.
    <div className="grid grid-cols-4 gap-2 pt-2 pb-1 *:min-h-14" data-testid="fpl-actions">
      <Action
        icon={<ICON.brief />}
        label="Brief"
        spoken={briefMark ? `Brief, ${briefMark === "stop" ? "warning" : "caution"}` : undefined}
        onClick={openBrief}
        testId="route-brief"
        data-finding={briefMark ?? undefined}
      />
      <Action icon={<ICON.navLog />} label="Nav Log" onClick={openNavLogCard} disabled={!course} testId="route-navlog" />
      <Action
        icon={<ICON.profile />}
        label="Profile"
        spoken={
          altitudeMark === "caution"
            ? "Profile, your altitude has a caution"
            : altitudeMark === "tight"
              ? "Profile, your altitude is tight"
              : undefined
        }
        onClick={openProfile}
        disabled={!profileReady}
        testId="route-profile"
      />
      {more}
    </div>
  );
}

/** FPL's route row (the page's `route`, PlanWorkspace), a column the
 *  row's width, as the sheet lays the route in a row (MapPage's
 *  routeRowOf), where a grid alone had no width. The route's timeline
 *  (the one layout, decision 0047, where it is read and edited), the
 *  flight's figures under it, which are its pill too (the owner,
 *  2026-11-16: the calculations strip where the action tiles were), and
 *  the suggested routes' chips over it while More's Route Options has
 *  them out (ShareMenu; the owner, 2026-11-17). While the route's field is open (RouteEditor) the figures
 *  go under it and the chips away, as they change the route rather than
 *  edit it. */
export function FplRoute({
  vm,
}: {
  vm: PlanSlices<"brief" | "cards" | "flight" | "leg" | "picks" | "plan" | "route" | "routeList" | "stops" | "view">;
}) {
  const { panelOpen } = vm.view;
  const { dryRunning, flying } = vm.flight;
  const { routeLine } = vm.routeList;
  // The route's field open under the page puts the pinned figures away (its
  // own under it); the grouped box turned into the field by its toggle does
  // not: the figures stay pinned and follow the sheet alone, thin above the
  // pill whatever the box shows or the keyboard does (the owner,
  // 2026-11-22: "Route box still shows figures full size").
  const editing = routeEditing(vm) && !routeTyped(vm);
  const routesShown = routesOut(vm);
  // The figures are FPL's pill too, one copy at every size: held on the
  // foot's edge at the pill, and as the sheet goes down they stop there
  // while the route slides on under them (usePinAtFoot), drawn there as
  // the pill (PINNED). On the ground: in flight and in a dry run the foot
  // holds their own figures. Open to edit they are under the cards, and
  // the route folds as the sheet comes down to the pill (usePlanRouteList).
  const ground = !flying && !dryRunning;
  const figures = useRef<HTMLDivElement>(null);
  usePinAtFoot(figures, SHEET_FOOT, { on: ground && !editing, held: ground && !panelOpen });
  return (
    // The figures alone are the side panel's pill (SheetHead's DESK_PILL).
    <div className="flex w-full min-w-0 flex-1 flex-col" data-pill-row="">
      {/* The suggested routes' pills just above the stops, out while the
          More's Route Options is on (ShareMenu; the owner, 2026-11-17:
          "Which shows route pills just above the stops"), where they were a
          section under the figures. */}
      {routesShown && routeLine && (
        <section aria-label="Suggested routes" className="pb-2" data-testid="route-group">
          <Suspense fallback={<div className="h-11" />}>
            <RouteLine line={routeLine} grouped />
          </Suspense>
        </section>
      )}
      <RouteHead vm={vm} />
      {/* The figures 4 in from the head's 12, so their words are iOS's 16
          from the sheet's side as the pinned pill's are (PINNED's px-4),
          where the first figure flush with the head's edge read "Dest" at
          12 (the iOS audit's margin, a local flight). */}
      <div className={cn("pt-2 pb-1", editing && "hidden")} data-pill-keeps="">
        <div ref={figures} data-pin-foot="" className={cn(PIN_AT_FOOT, "px-1", PINNED)}>
          {/* One thin line at half and all the way up, full size as the
              pill (the owner, 2026-11-22: "Maybe just make the figures
              strip very thin when fpl is half or full?"): one strip that
              changes size, eased, never two copies. */}
          {!editing && <FlightFigures vm={vm} grow={false} thin={ground} />}
        </div>
      </div>
    </div>
  );
}

/** FPL's foot, held at the sheet's visible edge, the pill's figures on it. */
const SHEET_FOOT = '[data-testid="panel-foot"]';

/** The figures held at the foot (data-pinned) drawn as the pill: in sight
 *  where the rest of the head is not (sheet/insets' RISEN_FACE at the
 *  pill), a Direct to's strip over them kept out of sight there in its
 *  room, so nothing moves; the foot's 16-point sides where the head's 12
 *  laid them 8 points wider (the owner, 2026-11-16: "is it changing size
 *  at the end? And do you see a small gap below/above the strip?"); over
 *  everything in the head (the airplane's bar's glass capsules stack above
 *  the figures' row); and on the sheet's solid colour from just under the
 *  grabber to the screen's foot, where the figures' own box let the
 *  route's white box show a line above and below them; its top raised as
 *  the figures are scaled up from their foot while the sheet moves
 *  (usePinAtFoot's --pin-s, over --pin-h, their laid-out height). */
const PINNED =
  "relative data-pinned:visible data-pill:[&_[data-pill-hides]]:invisible data-pinned:z-30 data-pinned:-mx-3 data-pinned:px-4 data-pinned:bg-(--sheet) data-pinned:after:absolute data-pinned:after:inset-x-0 data-pinned:after:-top-1.5 data-pinned:after:-bottom-10 data-pinned:after:-z-10 data-pinned:after:bg-(--sheet) data-pinned:after:translate-y-[calc((1-var(--pin-s,1))*var(--pin-h,0px))]";
