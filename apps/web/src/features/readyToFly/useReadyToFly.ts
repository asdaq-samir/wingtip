import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Briefing } from "../../lib/api/types";
import { useBriefPlan } from "../../lib/briefPlan";
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import {
  corridorTiles,
  keep,
  keepKey,
  keepingAvailable,
  keptAlready,
  keptZooms,
  useKeepJob,
  useKeptCharts,
} from "../../lib/map/route/keepRoute";
import { useDataCycles } from "../../lib/map/sources/layerAges";
import { chartPair, kindCycle, tileDensity } from "../../lib/map/sources/tiles";
import { requestAirplanePick } from "../../lib/pickAirplane";
import { usePreferences } from "../../lib/preferences";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { useAddressKey } from "../../lib/address";
import { keepForAir, useKeptForAir } from "../keptForAir";
import { notamRankingQuery } from "../notamRanking";
import { readyInput } from "./readyFacts";
import { useDevice } from "./useDevice";

export type ReadyAnswer = EngineAnswer<"ready_to_fly">;
type ReadyFix = NonNullable<ReadyAnswer["items"][number]["fix"]>;

/** The newest briefing the plan's query (usePlan, ["briefing", dep, dest,
 *  ...]) holds for this route, and when it came: read from the cache, so
 *  Ready to fly neither asks the planner again nor needs the plan's props. */
function latestBriefing(client: QueryClient, dep: string, dest: string): { data: Briefing; atMs: number } | null {
  let best: { data: Briefing; atMs: number } | null = null;
  for (const q of client.getQueryCache().findAll({ queryKey: ["briefing", dep, dest] })) {
    const data = q.state.data as Briefing | undefined;
    if (data && (!best || q.state.dataUpdatedAt > best.atMs)) best = { data, atMs: q.state.dataUpdatedAt };
  }
  return best;
}

function useBriefingOf(dep: string, dest: string) {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  // The cache's own version: the newest answer's time for the route.
  const at = useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => latestBriefing(client, dep, dest)?.atMs ?? 0,
  );
  return useMemo(() => (at ? latestBriefing(client, dep, dest) : null), [client, dep, dest, at]);
}

/**
 * Ready to fly, the Brief's first row (the one hook of the feature): the
 * facts the web holds -- the plan, the route's kept chart tiles, the FAA
 * data's cycles, the briefing and NOTAMs' times, the battery and location
 * where the browser tells them -- asked of the engine's `ready_to_fly`,
 * and each of its fixes done in place: the route's charts kept
 * (keepRoute, as Keep for the Air does), the route's answers with them
 * (Keep for the Air, features/keptForAir), the briefing and the NOTAMs
 * asked again, the existing airplane picker opened, the browser's
 * location question asked. The answer is the engine's; nothing is judged
 * here.
 */
export function useReadyToFly() {
  const plan = useBriefPlan();
  const nowMs = useMinuteClock();
  const client = useQueryClient();
  const base = usePreferences((s) => s.base);
  const course = plan.flight?.course ?? null;
  const layer = course ? chartPair(course.chart_layers, base).base : null;
  const job = useKeepJob();
  const tiles = useMemo(
    () => (course && layer ? corridorTiles(course.course_line as [number, number][], keptZooms(layer)).length : 0),
    [course, layer],
  );
  const cycles = useDataCycles();
  const briefing = useBriefingOf(plan.dep, plan.dest);
  const alternate = useAddressKey("alternate")[0] || null;
  const notams = useQuery({ ...notamRankingQuery(plan), enabled: false });
  const device = useDevice();
  const kept = useKeptForAir(course, alternate, keepingAvailable());
  const [fixing, setFixing] = useState<ReadyFix | null>(null);

  const key = course && layer ? keepKey(course, layer.kind) : null;
  // Read through the kept store, so a keep remembered draws this again.
  const keptBefore = useKeptCharts(() => (key ? keptAlready(key) : false));
  const chart = useMemo(() => {
    if (!course || !layer || !key) return null;
    const kept = keptBefore || (job.status === "kept" && job.key === key && job.progress.failed < job.progress.total);
    return {
      kept,
      canKeep: keepingAvailable(),
      cycle: kindCycle(course, layer.kind).cycle,
      tiles,
      dense: tileDensity(course, layer.kind) === "@2x",
    };
  }, [course, layer, key, keptBefore, job, tiles]);

  const answer: ReadyAnswer | null = useMemo(() => {
    try {
      return callEngine(
        "ready_to_fly",
        readyInput({
          nowMs,
          dep: plan.dep,
          dest: plan.dest,
          routed: plan.routed,
          airplane: plan.aircraft,
          altitudeFt: plan.altitudeFt,
          chart,
          cycles,
          briefing,
          alternate,
          notamsAtMs: notams.dataUpdatedAt || null,
          kept,
          device,
        }),
      );
    } catch {
      return null;
    }
  }, [nowMs, plan, chart, cycles, briefing, alternate, notams.dataUpdatedAt, kept, device]);

  const keeping = job.status === "keeping";
  /** The fixes the web can do in place; the rest are drawn as words. */
  const fixes: Partial<Record<ReadyFix, () => Promise<unknown> | void>> = {
    pick_airplane: requestAirplanePick,
    download_charts: () => (course && layer ? keep(course, layer) : undefined),
    // Keep for the Air: the route's answers and its charts in one go.
    keep_for_air: () => (course && layer ? keepForAir(course, layer, alternate) : undefined),
    refresh_weather: () => client.refetchQueries({ queryKey: ["briefing", plan.dep, plan.dest] }),
    fetch_notams: () => notams.refetch(),
    allow_location: device.askLocation,
  };
  const run = (fix: ReadyFix) => {
    const go = fixes[fix];
    if (!go) return;
    setFixing(fix);
    void Promise.resolve(go()).finally(() => setFixing(null));
  };
  return {
    answer,
    canFix: (fix: ReadyFix | null | undefined): fix is ReadyFix => !!fix && !!fixes[fix],
    run,
    busy: (fix: ReadyFix | null | undefined) =>
      !!fix && (fixing === fix || ((fix === "download_charts" || fix === "keep_for_air") && keeping)),
  };
}
