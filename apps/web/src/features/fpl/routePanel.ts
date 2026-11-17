/**
 * The route's own panel -- the airplane's and the time's chips, the nav
 * log and the briefing's tabs, Save and Print, the kneeboard -- in a
 * chunk of its own (PlanWorkspace), at the pilot's ask for a faster app:
 * the planner opens on the search and the chart, which needs none of it,
 * and the first load carried all of it. Fetched as soon as the page is
 * idle, so it is in hand before a route is. The route's box, the search
 * itself, is on a chunk of its own (routeBoxChunk), as the first screen
 * draws it.
 */
export { NavLogView } from "../navlog/lazy";
export { ProceduresRoute } from "../procedures/lazy";
export { RouteLine } from "../procedures/lazy";
export { FlightBriefingView, BriefingNotices, ReviewAskItem, ReviewAskSheet, SaveFlightButton } from "../brief/lazy";
export { RouteEnds } from "../procedures/lazy";
export { RouteSplit } from "../plan/lazy";
export { Kneeboard } from "../navlog/lazy";
export { FlightInputs } from "../navlog/lazy";
export { AltitudeGroup } from "../navlog/lazy";
export { AltitudeProfile } from "../navlog/lazy";
export { RouteProblem } from "../plan/lazy";
export { LocalDuration } from "../plan/lazy";
export { BriefCard } from "../brief/lazy";
export { AirspaceCard } from "../place/lazy";
export { FlightCard } from "../traffic/lazy";
export { PastFlightCard } from "../flying/lazy";
export { PlaceCard } from "../place/lazy";
export { StopsCard } from "../stops/lazy";
export { DryRunControls, DryRunFigures } from "../flying/lazy";
export { FlyingHead } from "../flying/lazy";
