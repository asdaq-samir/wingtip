/**
 * The plan's core: what every part of the planner shares and nothing of a
 * screen -- the plan kept in the address (planAddress), its queries
 * (usePlan), the nav log's rows and the dry run's legs, the figures and
 * the words they are written in (format), the sheet's state (usePanelView)
 * and the pattern, radio and wind the cards read. The features of the
 * planner (fpl, the composer, over the airport card, the nav log, the
 * Brief, procedures, the route box and the rest) stand on it and reach it
 * through this file only; it reaches none of them.
 */

export { ShareMenu } from "./ShareMenuLazy";
export { default as DirectStrip } from "./components/DirectStrip";
export { default as FirstFlight } from "./components/FirstFlight";
export { default as FplStrip } from "./components/FplStrip";
export type { PointAltitude } from "./components/PointAltitudeDialog";
export type { ProceduresAt } from "./components/ProceduresRoute";
export { default as ProfileCard } from "./components/ProfileCard";
export { RecentRoutesPage } from "./components/RecentRoutes";
export { default as TripFigures } from "./components/TripFigures";
export type { BriefingPart } from "./components/briefing/sections";
export { loadFlightChart } from "./components/loadFlightChart";
export { clearanceAt } from "./components/navlog/altitude/clearance";
export { dryRunFlown } from "./components/navlog/dryRun";
export { figuresLine, nextLanding } from "./figures";
export { legsWithoutWind, windsOutOfDate } from "./format";
export { panelNow, riseToSee } from "./hooks/panelNow";
export {
  type PlannedRoute,
  approximateOf,
  departureRunways,
  directKeys,
  landingRunways,
  namesRoute,
  procsWithoutDirect,
  suggestedStopAt,
} from "./hooks/planAddress";
export type { PlanAnswer, PlanCourse } from "./hooks/planTypes";
export { type AirplaneRow, useAirplaneHits } from "./hooks/useAirplaneHits";
export { useCopilotPublish } from "./hooks/useCopilotPublish";
export { useDryRun } from "./hooks/useDryRun";
export { useFieldPatterns } from "./hooks/useFieldPatterns";
export { useFlightToSave } from "./hooks/useFlightToSave";
export { useFlyingMode } from "./hooks/useFlyingMode";
export { useLegSheet } from "./hooks/useLegSheet";
export { useMapActions } from "./hooks/useMapActions";
export { type PanelList, type PanelView, useAddressCards, usePanelView } from "./hooks/usePanelView";
export { type PlanParams, navlogQuery, usePlan } from "./hooks/usePlan";
export { usePlanSetters } from "./hooks/usePlanSetters";
export { drawnOnly, useProcedurePicks } from "./hooks/useProcedurePicks";
export { useRouteEdits } from "./hooks/useRouteEdits";
export { useRouteLine } from "./hooks/useRouteLine";
export { useRouteListEdit } from "./hooks/useRouteListEdit";
export { useRouteTidy } from "./hooks/useRouteTidy";
export { useRouteWays } from "./hooks/useRouteWays";
export { useRunwayPicks } from "./hooks/useRunwayPicks";
export { nearOf, useSearchResults } from "./hooks/useSearchResults";
export { useSuggestedStops, withStopsAfter } from "./hooks/useSuggestedStops";
export { placeName } from "./lib/radio";
export { holdsOf, holdsParam } from "./lib/routeHolds";
export { sameStops } from "./lib/routeWays";
export { readQuery } from "./lib/searchFilters";
export { useStopsAlong } from "./lib/stopsAlong";
export { useTabSearch } from "./lib/tabSearch";
export { useWindPicks } from "./lib/windPicks";
export { useKeepOffline } from "./map/keepStatus";
export { DRY_RUN, usePastFlight } from "./map/pastFlight";
export { useTrueHeightView } from "./map/terrain/heightStretch";
export { useTerrainView } from "./map/terrain/useTerrainView";
export { RouteBox } from "./routeBoxChunk";
export { BootMap, RouteMap } from "./routeMapChunk";

/** AssignedLesson, on a chunk of its own, as its importer loads it. */
export const loadAssignedLesson = () => import("./components/AssignedLesson");

/** FixCard, on a chunk of its own, as its importer loads it. */
export const loadFixCard = () => import("./components/FixCard");

/** NearestCard, on a chunk of its own, as its importer loads it. */
export const loadNearestCard = () => import("./components/NearestCard");

/** RouteLegCard, on a chunk of its own, as its importer loads it. */
export const loadRouteLegCard = () => import("./components/RouteLegCard");

/** MiniProfile, on a chunk of its own, as its importer loads it. */
export const loadMiniProfile = () => import("./components/navlog/MiniProfile");

/** The nav log's profile chart, on a chunk of its own (the Studio draws with it too). */
export const loadProfileChart = () => import("./components/navlog/ProfileChart");

/** SearchResultsPage, on a chunk of its own, as its importer loads it. */
export const loadSearchResultsPage = () => import("./components/search/SearchResultsPage");

/** A replayed track's layers, on a chunk of its own (the Studio draws with them too). */
export const loadReplayLayers = () => import("./map/layers/ReplayTrackGl");

/** The one 3D view, on a chunk of its own as the planner's map loads it (the Studio draws with it too). */
export const loadTerrainGl = () => import("./map/terrain/TerrainGl");
