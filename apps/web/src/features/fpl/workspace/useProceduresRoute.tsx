import { useMemo } from "react";
import { ProceduresRoute } from "../routePanelParts";
import { useRouteListProps, type RouteListSlices } from "./useRouteListProps";

/**
 * FPL's list of the route's steps read in flight and in a dry run, made
 * once for the same plan (useMemo), so it is drawn again only when what it
 * shows changes (routePanelParts' memo), the Routes' chips over it in
 * flight. On the ground, none: the route is its timeline (RouteTimeline),
 * edited there, and the nav log's own list (NavLogView draws `route` in
 * its place) is empty.
 */
export function useProceduresRoute(vm: RouteListSlices) {
  const props = useRouteListProps(vm);
  const read = !!vm.flight.flying || !!vm.flight.dryRunning;
  return useMemo(() => (read ? <ProceduresRoute {...props} /> : FOLDED), [read, props]);
}

/** What FPL's list is on the ground: nothing. */
const FOLDED = <></>;
