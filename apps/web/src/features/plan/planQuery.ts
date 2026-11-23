import { experimental_streamedQuery as streamedQuery } from "@tanstack/react-query";
import { ApiError, api, isUnknownPlace, plannerUnreachable } from "../../lib/api/client";
import { inBatches, ended } from "../../lib/api/streams";
import { retryDelay } from "../../lib/queryRetry";
import type { AircraftChoice, AltitudeChoice, Briefing, Detour, NavLogMessage } from "../../lib/api/types";
import type { FlightRules } from "../../lib/preferences";
import { ownOf } from "../../lib/airplane/figures";

/** No plan has a legal altitude: the planner's headline (where along the
 *  route), its reasons, and what to do (app.planning.no_altitude). */
export interface Unflyable {
  title: string;
  /** All of it in a few words, for the one line under the route. */
  brief: string;
  reasons: string[];
  advice: string | null;
  /** The ways round high ground, best first. */
  detours: Detour[];
}

export interface PlanParams {
  dep: string;
  dest: string;
  /** The airports landed at on the way, in order ([] flown straight). */
  stops: string[];
  /** The pilot's own cruise altitude, or "" for the planner's plan. */
  altitudeFt: string;
  /** `altitudeFt` was picked on the altitude wheel: each leg flown at its
   *  nearest legal altitude, as the wheel's figures were (AltitudeProfile). */
  altitudeNearest?: boolean;
  altitudeChoice: AltitudeChoice;
  /** The departure time as an ISO instant, or "" for about now. */
  depart: string;
  aircraft: AircraftChoice;
  /** Load pressed again for the same route: a fresh nav log, fresh winds. */
  load: number;
  /** Points' own altitudes, as the address has them ("VPBNG:4500,KMSN:1900"):
   *  a waypoint's flown to it, an airport's its pattern (RouteBox). */
  altitudes?: string;
  /** Those whose change begins there, Start At ("VPBNG"); the rest Cross At. */
  altitudeStarts?: string;
  /** The procedures picked at the route's fields ("KDLH:I09:ANDOE,
   *  KORD:BENKY6:BYLAW"): a leg flown by them is the longer by their path,
   *  and a flight landing by an approach comes down to its first fix's
   *  altitude. */
  procedures?: string;
  /** The runway each departure is left from ("KSTL:30R"), its transition flown. */
  runways?: string;
  /** The runway each field is landed on ("KUGN:5"): with no approach
   *  there, the leg in is flown by its traffic pattern. */
  patterns?: string;
  /** Altitudes given to cross the procedures' fixes at ("BXCMB:3000"),
   *  each in place of the chart's there. */
  crossings?: string;
  /** Minutes on the ground at the stops ("KJVL:45"); one not named, 30. */
  ground?: string;
  /** The pilot's holds ("VPBNG:270:R:1M:2T", features/plan/routeHolds). */
  holds?: string;
  /** The fuel set in the tanks leaving a field ("KOSH:30,KJVL:0",
   *  identSchema's tanksOf); one not named, full. */
  tanks?: string;
  /** Checkpoints between the route's points, as the map shows them (the
   *  settings' Waypoints); without, the nav log runs point to point. */
  checkpoints?: boolean;
  settling?: boolean; // Procedures still being drawn: the nav log waits, asked once (WEB-14).
  /** A local flight's time aloft, in minutes (one airport to itself). */
  localMin?: number;
  /** The flight rules it is planned under: IFR's minimum altitudes,
   *  thousands and reserve, or VFR's (the default). */
  rules?: FlightRules;
  /** Under IFR, the alternate filed (its fuel in the totals). */
  alternate?: string;
}

/** Where the route's briefing stands -- one value, read by the map's
 *  airport chips and the drawer alike. It used to be three (the data,
 *  the error, whether it was loading), which each reader combined its
 *  own way: after a failed five-minute refresh the map greyed the two
 *  airports out as unavailable while the drawer showed the same METARs
 *  as current with nothing to say the refresh had failed. Now both show
 *  the last briefing, with when it was fetched and that a refresh
 *  failed. "waiting" is a briefing with no course yet to ask about --
 *  it read "Loading…" for ever when the course failed. */
export type BriefingState =
  | { state: "waiting" }
  | { state: "loading" }
  | { state: "ready"; data: Briefing; fetchedAt: number; refreshError: string | null }
  | { state: "failed"; detail: string };

/** Where the runways left from are in a plan's key (planKeyOf). */
export const PLAN_KEY_RUNWAYS = 14;
/** Where the fuel set in the tanks is in a plan's key (planKeyOf). */
export const PLAN_KEY_TANKS = 19;

/** Everything the nav log is computed from. */
export function planKeyOf({
  dep,
  dest,
  stops,
  altitudeFt,
  altitudeChoice,
  depart,
  aircraft,
  load,
  altitudes = "",
  checkpoints = false,
  rules = "vfr",
  alternate = "",
  procedures = "",
  runways = "",
  crossings = "",
  ground = "",
  holds = "",
  altitudeNearest = false,
  patterns = "",
  altitudeStarts = "",
  tanks = "",
}: PlanParams) {
  return [
    dep,
    dest,
    stops.join(","),
    altitudeFt,
    altitudeChoice,
    depart,
    load,
    altitudeStarts ? `${altitudes}|${altitudeStarts}` : altitudes,
    checkpoints,
    aircraft.profile,
    // Every figure of its own, a new one planned again (lib/airplane).
    JSON.stringify(ownOf(aircraft)),
    rules,
    rules === "ifr" ? alternate : "",
    procedures,
    runways,
    crossings,
    ground,
    holds,
    altitudeNearest,
    // Before the landing runways, which stay the key's last (usePlan's holdKey).
    tanks,
    patterns,
  ];
}

/** A plan's nav log, with its checkpoints or point to point: the page's
 *  own (usePlan), and Fly Here's, asked for at the tap before the page
 *  has drawn the route (PlanWorkspace). */
export function navlogQuery(plan: PlanParams, checkpointsToo: boolean, ahead = false) {
  const {
    dep,
    dest,
    stops,
    altitudeFt,
    altitudeChoice,
    depart,
    aircraft,
    altitudes = "",
    rules = "vfr",
    alternate = "",
    procedures = "",
    runways = "",
    crossings = "",
    ground = "",
    holds = "",
    altitudeNearest = false,
    patterns = "",
  } = plan;
  const planKey = planKeyOf(plan);
  return {
    // The same key as the checkpoints' with them off, so the route as
    // entered and a plan with Waypoints off are one answer.
    // Asked for ahead of the pilot (`ahead`), a key of its own: a pilot's
    // own ask is never the low-priority one already on its way.
    queryKey: [ahead ? "navlog-ahead" : "navlog", ...planKey.slice(0, 8), checkpointsToo, ...planKey.slice(9)],
    // In batches (inBatches): one render for the lines that come together.
    queryFn: streamedQuery({
      streamFn: ({ signal }: { signal: AbortSignal }) =>
        inBatches(
          ended(
            api.navlog(
              dep,
              dest,
              altitudeFt || undefined,
              aircraft,
              altitudeChoice,
              depart || undefined,
              signal,
              stops,
              altitudes,
              checkpointsToo,
              rules,
              alternate,
              procedures,
              crossings,
              ground,
              holds,
              altitudeNearest,
              runways,
              patterns,
              ahead,
              plan.altitudeStarts,
              plan.tanks,
            ),
            "nav log",
          ),
        ),
      reducer: (lines: NavLogMessage[], batch: NavLogMessage[]) => [...lines, ...batch],
      initialValue: [] as NavLogMessage[],
    }),
    staleTime: Infinity,
    // Not asked again once its lines have begun: a retry would plan the
    // whole route again behind the lines drawn. But a 5xx is an answer
    // before the first line (the stream's own failures come as a 200's
    // last line, lib/api/streams), so it is asked again, as every other
    // query is (lib/queryRetry): a planner that dropped its connections
    // for a second left the nav log at "The planner did not answer" for
    // good, FPL without legs and Dry Run dimmed until Try Again (the
    // gateway's 502s at 10:08:30 in run 45152106014, its desktop emergency
    // spec's retry held two minutes).
    // The planner not reached (its restart's 502s, the gateway's 404 for
    // paths it has not read yet) too; asked again after by the client's
    // refetchWhileUnreachable, so the route plans once it is back.
    retry: (failures: number, error: unknown) =>
      failures < 3 && error instanceof ApiError && (error.status >= 500 || plannerUnreachable(error)),
    retryDelay,
    // No legal altitude is the page's to say, with what can be done about
    // it (PlanWorkspace): not the query client's plain toast.
    // Nor a point the planner does not know, the route box's (courseQuery).
    meta: { silent: (error: unknown) => (error instanceof ApiError && error.advice !== null) || isUnknownPlace(error) },
  };
}
