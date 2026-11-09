/**
 * The Brief's NOTAMs that matter, for the flight on screen: the engine's
 * ranking (the planner's notams_ranked: in force while the flight is
 * there, the runway in use, the altitude flown, the airspace on the
 * route) with a line on each from the assistant (POST
 * /api/planner/words/notams/ranked), the top three apart from the rest.
 * Asked once for a route, its time, its altitude and its runways, and
 * kept ten minutes, as the Brief's words are.
 */
import { useQuery } from "@tanstack/react-query";
import { postJson } from "../../lib/api/words";
import type { RankedNotam, RankedNotams } from "../../lib/api/types";
import { routeKeyOf, useBriefPlan } from "../../lib/briefPlan";
import { patternsOf } from "../../lib/trafficPattern";

const KEPT_MS = 10 * 60_000;

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
  return {
    queryKey: ["notams", "ranked", routeKeyOf(plan), plan.eteMin, plan.altitudeFt, runways],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      postJson<RankedNotams>(
        "/api/planner/words/notams/ranked",
        {
          dep: plan.dep,
          dest: plan.dest,
          stops: plan.stops,
          depart: plan.depart || null,
          ete_min: plan.eteMin,
          altitude_ft: plan.altitudeFt,
          runways,
        },
        signal,
      ),
    enabled: plan.routed && !!plan.dep && !!plan.dest,
    staleTime: KEPT_MS,
    meta: { silent: true },
  };
}

export function useNotamRanking() {
  const plan = useBriefPlan();
  const query = useQuery(notamRankingQuery(plan));
  return { shown: plan.routed, ...splitRanking(query.data), answer: query.data, error: query.error, pending: !query.data && !query.error };
}
