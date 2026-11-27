import type { PlanSlices } from "../vm/planSlices";

/**
 * Whether FPL's route's field is open (RouteEditor) over its timeline
 * (decision 0047): on the ground, with no whole route yet -- a new plan,
 * half a route -- or a route being typed in, till its Done. The timeline
 * itself is where the route is edited, whatever this says. In flight and
 * in a dry run it is read, never edited.
 */
export function routeEditing(vm: PlanSlices<"flight" | "routeList">): boolean {
  if (vm.flight.flying || vm.flight.dryRunning) return false;
  return !vm.routeList.routeFolded;
}

/** Whether the route's field (RouteEditor) is open: the route open to
 *  edit and the field asked for (usePlanRouteList's `boxOpen`). A new plan
 *  and half a route have it folded till their box's toggle asks for it. */
export function routeBoxOpen(vm: PlanSlices<"flight" | "routeList">): boolean {
  return routeEditing(vm) && vm.routeList.boxOpen;
}

/** Whether the box's toggle has turned the grouped box into the route's
 *  field (TypeRouteButton), on an empty, half or whole route alike: drawn
 *  then in the timeline's own place (RouteHead), not under the page, so
 *  the box stays where it was (the owner, 2026-11-22: "Route box moves
 *  down when toggled"; 2026-11-23: "the same area"). Which way the field
 *  was opened is the view model's (usePlanRouteList's `typedInPlace`), so
 *  this reads only what it is handed. */
export function routeTyped(vm: PlanSlices<"flight" | "routeList">): boolean {
  return routeEditing(vm) && vm.routeList.routeOpen && vm.routeList.typedInPlace;
}

/**
 * Whether the flight's figures are put away: the route's field open
 * under the page (its own under it), or no whole route yet. The grouped
 * box turned into the field by its toggle does not put them away (the
 * owner, 2026-11-22: "Route box still shows figures full size"); before
 * the route is whole there are no figures on either face (the owner's
 * iPhone, 2026-11-23, an empty route's field showed Dest, Dist, ETE, Trk
 * and GPS under it).
 */
export function figuresAway(vm: PlanSlices<"flight" | "route" | "routeList">): boolean {
  return routeEditing(vm) && !(routeTyped(vm) && vm.route.wholeRoute);
}

/** Whether FPL offers its suggested routes (the tab bar's Routes): there
 *  are ways to suggest, on the ground, not in a dry run, and the flight's
 *  figures out (figuresAway), whose strip Routes swaps for the ways'
 *  chips. So the route box its toggle turned from the grouped box offers
 *  them as the folded route does, the figures under both (the owner's
 *  iPhone, 2026-11-23: Routes greyed under the route box, "Not able to
 *  slide the routes"); a field opened to type a route in, whose figures
 *  are put away, does not -- the ways change the route rather than edit
 *  it -- and a dry run flies the route as it is, its ways no more than
 *  clutter on its map. */
export function routesOffered(vm: PlanSlices<"flight" | "route" | "routeList">): boolean {
  return !!vm.routeList.routeLine && !vm.flight.flying && !vm.flight.dryRunning && !figuresAway(vm);
}

/** Whether the suggested routes are out: their pills over the route
 *  (FplRoute) and their ways on the map (PlanMap), one switch for both. */
export function routesOut(vm: PlanSlices<"flight" | "route" | "routeList">): boolean {
  return vm.routeList.routesShown && routesOffered(vm);
}

type Ways = PlanSlices<"routeList">["routeList"]["wayLines"];
/** No suggested routes' ways on the map: one array, so the map is not handed a new one each render. */
const NO_WAYS: Ways = [];

/** The suggested routes' ways the map draws beside the course (PlanMap):
 *  all of them while they are out (routesOut), none otherwise -- not the
 *  route as typed's, nor a way picked, which the course itself is. */
export function waysOnMap(vm: PlanSlices<"flight" | "route" | "routeList">): Ways {
  return routesOut(vm) ? vm.routeList.wayLines : NO_WAYS;
}
