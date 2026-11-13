/**
 * The Brief's NOTAMs that matter, for the flight on screen: the engine's
 * ranking (the planner's notams_ranked: in force while the flight is
 * there, the runway in use, the altitude flown, the airspace on the
 * route) with the engine's reasons as each one's line (engineRanking),
 * the top three apart from the rest.
 * Asked once for a route, its time, its altitude and its runways, and
 * kept ten minutes, as the Brief's words are.
 */
import { useQuery } from "@tanstack/react-query";
import { data, planner } from "../../lib/api/client";
import { keptStore } from "../../lib/storage";
import { routeKeyOf, useBriefPlan } from "../../lib/briefPlan";
import { patternsOf } from "../../lib/trafficPattern";
import { engineRanking, type EngineRanked, type RankedNotam, type RankedNotams } from "./engineRanking";

const KEPT_MS = 10 * 60_000;

/** The last ranking the planner gave, for its route, kept on this device:
 *  the ranking is a POST, which the service worker cannot keep as it keeps
 *  the planner's other answers, and a pilot in the air with no signal still
 *  has the NOTAMs that matter, with their age (lib/kept). One route's, the
 *  one flown; public FAA data, so signing out leaves it. */
type KeptRanking = { route: string; at: number; answer: RankedNotams };
const keptRanking = () => keptStore<KeptRanking | null>("wingtip.kept.notams", null);

/** The ranking kept for `route`, if that is the route it was kept for. */
function keptNotams(route: string): KeptRanking | undefined {
  const kept = keptRanking().getState().value;
  return kept?.route === route ? kept : undefined;
}

/** The runway ends the pilot's plan picked, by field ({"KOSH": "36"}):
 *  the takeoff's and the pattern's from the address's picks
 *  (lib/flightLink picksOf), the pattern's where both name a field. */
export function runwaysOfPicks(picks: string | undefined): Record<string, string> {
  const params = new URLSearchParams(picks ?? "");
  return Object.fromEntries([...patternsOf(params.get("takeoff")), ...patternsOf(params.get("pattern"))]);
}

/** The ranking split as the section shows it: the top ones said first,
 *  the rest folded under them. */
export function splitRanking(answer: RankedNotams | undefined): { top: RankedNotam[]; rest: RankedNotam[] } {
  const notams = answer?.notams ?? [];
  return { top: notams.filter((n) => n.top), rest: notams.filter((n) => !n.top) };
}

/** The ranked NOTAMs' query for the plan on screen: the Brief's section
 *  asks it, and Ready to fly (features/readyToFly) reads when it was
 *  fetched and asks it again as its fix. */
export function notamRankingQuery(plan: ReturnType<typeof useBriefPlan.getState>) {
  const runways = runwaysOfPicks(plan.flight?.picks);
  const route = routeKeyOf(plan);
  return {
    queryKey: ["notams", "ranked", route, plan.eteMin, plan.altitudeFt, runways],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const ask = {
        dep: plan.dep,
        dest: plan.dest,
        stops: plan.stops,
        depart: plan.depart || null,
        ete_min: plan.eteMin,
        altitude_ft: plan.altitudeFt,
        runways,
      };
      const answer = engineRanking(await planner.POST("/api/notams/ranked", { body: ask, signal }).then(data<EngineRanked>));
      keptRanking().setState({ value: { route, at: Date.now(), answer } });
      return answer;
    },
    // The kept ranking first, with when it came, so the section draws it at
    // once and with no signal; asked again behind it once it is stale.
    initialData: () => keptNotams(route)?.answer,
    initialDataUpdatedAt: () => keptNotams(route)?.at,
    enabled: plan.routed && !!plan.dep && !!plan.dest,
    staleTime: KEPT_MS,
    meta: { silent: true },
  };
}

export function useNotamRanking() {
  const plan = useBriefPlan();
  const query = useQuery(notamRankingQuery(plan));
  return {
    shown: plan.routed,
    ...splitRanking(query.data),
    answer: query.data,
    error: query.error,
    pending: !query.data && !query.error,
    /** When the ranking shown came, and whether asking again failed:
     *  for its age where it is a kept one (KeptAge). */
    fetchedAt: query.dataUpdatedAt || null,
    failed: query.isError,
  };
}
