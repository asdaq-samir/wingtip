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

export type { BriefingPart } from "./components/briefing/sections";
export { type DryRun, type Flown, dryRunAt, dryRunFlown, dryRunOf, dryRunRow, runNmAt } from "./components/navlog/dryRun";
export { type CourseLine, dryRunNext, gpsAhead, useFlyingTo } from "./components/navlog/flyingTo";
export { GoToTab, LEGS, type PanelTab, useTabAsk } from "./components/navlog/panelTab";
export {
  type NavLogRow,
  type RouteEnds,
  type RouteLeg,
  firstFlown,
  flownNmOf,
  groundMinAt,
  isLegPoint,
  legOf,
  navLogRows,
  phaseOf,
  procedureOf,
  routeLegs,
  rowPoint,
  savedCheckpoints,
} from "./components/navlog/rows";
export { figuresLine, nextLanding, shortFlights, tripFigures } from "./figures";
export {
  PLAN_NAME,
  type ReportedWind,
  altFt,
  bearing,
  ceilingAndVisibility,
  clockTime,
  cruiseByAltitude,
  describeFuel,
  describeSteps,
  describeTime,
  economicalWords,
  etaAt,
  feet,
  feetBelowClouds,
  legsWithoutWind,
  one,
  plannedWords,
  reportedWind,
  runwayWind,
  surfaceName,
  windAloft,
  windLine,
  windOnRunway,
  windText,
  windsOutOfDate,
} from "./format";
export { briefingLegs } from "./hooks/briefingLegs";
export { panelNow, riseToSee } from "./hooks/panelNow";
export {
  NO_AUTO,
  NO_DIRECT,
  type PlannedRoute,
  type SuggestedStop,
  approximateOf,
  autoOf,
  departureRunways,
  directKeys,
  landingRunways,
  namesRoute,
  procsWithoutDirect,
  renamed,
  routeBeforeDirect,
  suggestedStopAt,
} from "./hooks/planAddress";
export type { PlanAnswer, PlanCourse } from "./hooks/planTypes";
export type { Landing, ProcedureAirport, ProcedureKind } from "./hooks/procedureTypes";
export { type AirplaneRow, useAirplaneHits } from "./hooks/useAirplaneHits";
export { type Description, descriptionKey } from "./hooks/useCheckpointNotes";
export { useLoad } from "./hooks/useLoad";
export { type PanelList, type PanelView, useAddressCards, usePanelView } from "./hooks/usePanelView";
export { type BriefingState, type PlanParams, type Unflyable, navlogQuery, usePlan } from "./hooks/usePlan";
export { usePlanSetters } from "./hooks/usePlanSetters";
export { type Browsing, type FuelCard, useRouteWays } from "./hooks/useRouteWays";
export { FIELD_LIST_KEYS, fieldListParams, fieldListsOf, prunedFieldLists } from "./lib/fieldLists";
export type { SuaWhen, TfrWhen } from "./lib/passTimes";
export {
  type RunwayEnd,
  type RunwayPicks,
  type WindPick,
  compassWord,
  entryFor,
  exitFor,
  patternSideDeg,
  pickedEnd,
  runwayFlown,
  runwayInUse,
  runwayNumber,
  windPick,
} from "./lib/pattern";
export { type RadioCall, type RadioPhase, callSign, fieldPhases, placeName } from "./lib/radio";
export { type Hold, holdWords, holdsOf, holdsParam, lengthCode, lengthOfCode, lengthWords } from "./lib/routeHolds";
export { gridScale, sameStops, wayTime } from "./lib/routeWays";
export { runwayCrosswindKt } from "./lib/wind";
export { useWindPicks } from "./lib/windPicks";
export {
  DRY_RUN,
  REPLAY_SPEEDS,
  type ReplayPoint,
  clearPastFlight,
  pausePastFlight,
  playPastFlight,
  positionAt,
  stepPastFlight,
  stopPastFlight,
  usePastFlight,
} from "./map/pastFlight";
