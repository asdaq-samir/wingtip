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
export { default as FplStrip } from "./components/FplStrip";
export type { EditedPoint, PointAltitude } from "./components/PointAltitudeDialog";
export { default as ProfileCard } from "./components/ProfileCard";
export { RecentRoutesPage } from "./components/RecentRoutes";
export type { RouteParts, RouteProcedure } from "./components/RouteBox";
export { default as TripFigures } from "./components/TripFigures";
export type { BriefingPart } from "./components/briefing/sections";
export { loadFlightChart } from "./components/loadFlightChart";
export { clearanceAt } from "./components/navlog/altitude/clearance";
export { type DryRun, type Flown, dryRunAt, dryRunFlown, dryRunOf, runNmAt } from "./components/navlog/dryRun";
export { type CourseLine, dryRunNext, gpsAhead } from "./components/navlog/flyingTo";
export { GoToTab, LEGS, type PanelTab, useTabAsk } from "./components/navlog/panelTab";
export {
  type NavLogRow,
  type RouteEnds,
  groundMinAt,
  isLegPoint,
  legOf,
  navLogRows,
  rowPoint,
  savedCheckpoints,
} from "./components/navlog/rows";
export { figuresLine, nextLanding } from "./figures";
export {
  PLAN_NAME,
  type ReportedWind,
  altFt,
  ceilingAndVisibility,
  clockTime,
  etaAt,
  feet,
  legsWithoutWind,
  one,
  reportedWind,
  windLine,
  windOnRunway,
  windText,
  windsOutOfDate,
} from "./format";
export { briefingLegs } from "./hooks/briefingLegs";
export { panelNow, riseToSee } from "./hooks/panelNow";
export {
  NO_AUTO,
  type PlannedRoute,
  approximateOf,
  autoOf,
  departureRunways,
  directKeys,
  landingRunways,
  namesRoute,
  procsWithoutDirect,
  routeBeforeDirect,
  suggestedStopAt,
} from "./hooks/planAddress";
export type { PlanAnswer, PlanCourse } from "./hooks/planTypes";
export type { Landing, ProcedureAirport, ProcedureKind } from "./hooks/procedureTypes";
export { type AirplaneRow, useAirplaneHits } from "./hooks/useAirplaneHits";
export { useLegSheet } from "./hooks/useLegSheet";
export { useLoad } from "./hooks/useLoad";
export { useMapActions } from "./hooks/useMapActions";
export { type PanelList, type PanelView, useAddressCards, usePanelView } from "./hooks/usePanelView";
export { type BriefingState, type PlanParams, navlogQuery, usePlan } from "./hooks/usePlan";
export { usePlanSetters } from "./hooks/usePlanSetters";
export { useRouteEdits } from "./hooks/useRouteEdits";
export { useRouteLine } from "./hooks/useRouteLine";
export { useRouteListEdit } from "./hooks/useRouteListEdit";
export { useRouteTidy } from "./hooks/useRouteTidy";
export { useRouteWays } from "./hooks/useRouteWays";
export { nearOf, useSearchResults } from "./hooks/useSearchResults";
export { useSuggestedStops, withStopsAfter } from "./hooks/useSuggestedStops";
export type { SuaWhen, TfrWhen } from "./lib/passTimes";
export {
  type RunwayEnd,
  type RunwayPicks,
  type WindPick,
  compassWord,
  entryFor,
  exitFor,
  patternSideDeg,
  runwayNumber,
  windPick,
} from "./lib/pattern";
export { type RadioCall, type RadioPhase, callSign, fieldPhases, placeName } from "./lib/radio";
export { type Hold, holdWords, holdsOf, holdsParam, lengthCode, lengthOfCode, lengthWords } from "./lib/routeHolds";
export { sameStops } from "./lib/routeWays";
export { readQuery } from "./lib/searchFilters";
export { useStopsAlong } from "./lib/stopsAlong";
export { useTabSearch } from "./lib/tabSearch";
export { useWindPicks } from "./lib/windPicks";
export { useKeepOffline } from "./map/keepStatus";
export {
  DRY_RUN,
  REPLAY_SPEEDS,
  clearPastFlight,
  pausePastFlight,
  playPastFlight,
  positionAt,
  stopPastFlight,
  usePastFlight,
} from "./map/pastFlight";
export { useTrueHeightView } from "./map/terrain/heightStretch";
export { setPilotView, usePilotView } from "./map/terrain/pilotView";
export { useTerrainView } from "./map/terrain/useTerrainView";
export { RouteBox } from "./routeBoxChunk";
export { BootMap, RouteMap } from "./routeMapChunk";

/** NearestCard, on a chunk of its own, as its importer loads it. */
export const loadNearestCard = () => import("./components/NearestCard");

/** PastFlightChart, on a chunk of its own, as its importer loads it. */
export const loadPastFlightChart = () => import("./components/PastFlightChart");

/** PointAltitudeDialog, on a chunk of its own, as its importer loads it. */
export const loadPointAltitudeDialog = () => import("./components/PointAltitudeDialog");

/** RouteLegCard, on a chunk of its own, as its importer loads it. */
export const loadRouteLegCard = () => import("./components/RouteLegCard");

/** EnvelopeChart, on a chunk of its own, as its importer loads it. */
export const loadEnvelopeChart = () => import("./components/briefing/EnvelopeChart");

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
