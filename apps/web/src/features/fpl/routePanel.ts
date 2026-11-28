/**
 * The route's own panel -- the airplane's and the time's chips, the nav
 * log and the briefing's tabs, Save and Print, the kneeboard -- in a
 * chunk of its own (PlanWorkspace), at the pilot's ask for a faster app:
 * the planner opens on the search and the chart, which needs none of it,
 * and the first load carried all of it. Fetched as soon as the page is
 * idle, so it is in hand before a route is. The route's box, the search
 * itself, is on a chunk of its own (routeBoxChunk), as the first screen
 * draws it. Only what a route draws as it opens: the cards drawn at a tap
 * (an airport's or an airspace's, placePanel; a flight's, the Stops and
 * the flying parts, cardsPanel) are chunks of their own, and so are the
 * Brief's airport sections, which draw an airport card's rows (this chunk was 507 KB, every card in it).
 */
export { NavLogView } from "../navlog/lazy";
export { ProceduresRoute } from "../procedures/lazy";
export { RouteLine } from "../procedures/lazy";
export { FlightBriefingView, BriefingNotices, ReviewAskItem, ReviewAskSheet, SaveFlightButton } from "../brief/lazy";
export { default as RouteTimeline } from "./workspace/RouteTimeline";
export { default as RouteEditor } from "./workspace/RouteEditor";
export { Kneeboard } from "../navlog/lazy";
export { FlightInputs } from "../navlog/lazy";
export { AltitudeGroup } from "../navlog/lazy";
export { AltitudeProfile } from "../navlog/lazy";
export { RouteProblem } from "../route/lazy";
export { LocalDuration } from "../route/lazy";
export { BriefCard, prefetchAirportSections, prefetchBriefPages } from "../brief/lazy";
export { prefetchNavLogTable } from "../navlog/lazy";
export { prefetchProcedureMenu } from "../procedures/lazy";
