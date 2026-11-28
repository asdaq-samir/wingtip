/**
 * What other features draw of the route's fields and points only inside their own lazily loaded
 * chunks (the route panel, the map, the search's pages). Nothing on the
 * first load imports this file: the bundler keeps every module an imported
 * entry re-exports in the importer's chunk, so these parts reached from
 * index.ts would load with the page (.dependency-cruiser.cjs, index-not-lazy).
 */

export { default as ProceduresRoute, RouteLine } from "./ProceduresRoute";
export { default as TimelineRoute, type TimelinePoint } from "./TimelineRoute";
export { TypeRouteButton } from "./TimelineRows";
export { FuelStopsChip, NoFuelStopNote } from "./TimelineStopRows";
export type { ProceduresRouteProps } from "./routeProps";
export { visitAt, visitRow } from "./visits";
// A point's mark as the timeline draws it, for the connector's live view
// (its own page, claude-view.html).
export { TimelineMark } from "./TimelineMark";
export { prefetchProcedureMenu } from "./procedureMenuChunk";
