/**
 * The route's fields and points in FPL's list (ProceduresRoute): the
 * departure and arrival steps with their runways, patterns and procedures,
 * the fixes and holds between, and the approach lesson.
 */

export type { ProceduresAt } from "./ProceduresRoute";
export { useFieldPatterns } from "./useFieldPatterns";
export { drawnOnly, useProcedurePicks } from "./useProcedurePicks";
export { useRunwayPicks } from "./useRunwayPicks";
// The empty route's rows, drawn on the first screen (FPL's new plan).
export { EndRow, TIMELINE_CARD, TypeRouteButton } from "./TimelineRows";

/** AssignedLesson, on a chunk of its own, as its importer loads it. */
export const loadAssignedLesson = () => import("./AssignedLesson");

/** FixCard, on a chunk of its own, as its importer loads it. */
export const loadFixCard = () => import("./FixCard");
