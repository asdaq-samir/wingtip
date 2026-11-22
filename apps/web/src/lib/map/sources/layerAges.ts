import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { DataCycle, Traffic } from "../../api/types";
import { ago } from "../../format";
import { useMinuteClock } from "../../useMinuteClock";
import { onThisDay } from "../../dataCycles";

/** How long ago `at` (ms) was, in a few words: "just now" under a
 *  minute, "4m ago", "2h 5m ago" (lib/format ago); null for no time. */
export function ageWords(at: number | null, now: number): string | null {
  return at == null || Number.isNaN(at) ? null : ago(now - at);
}

/** What the Status page says under a source that has stopped coming in
 *  past its usual cadence (the planner's feed watch, a source's `stale`):
 *  "Not updating: last updated 3h ago", for a pilot to tell a feed that
 *  went quiet from a sky with nothing in it. */
export function staleWords(fetchedAt: string | null | undefined, now: number): string {
  const age = ageWords(fetchedAt ? Date.parse(fetchedAt) : null, now);
  return age ? `Not updating: last updated ${age}` : "Not updating";
}

/** The newest traffic answer the map holds: when its airplanes were
 *  where it gives them (its time, less its own `age_s`). */
export function trafficAt(answers: { data: Traffic | undefined; updatedAt: number }[]): number | null {
  const newest = answers.filter((a) => a.data && a.updatedAt > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return newest ? newest.updatedAt - (newest.data!.age_s ?? 0) * 1000 : null;
}

/** The planner's ages of what the map and the plan rest on
 *  (/api/map/ages), asked again each minute while something shows them:
 *  one query for the map's settings, the Status page and the Brief. */
export const mapAgesQuery = {
  queryKey: ["mapAges"],
  queryFn: () => api.mapAges(),
  refetchInterval: 60_000,
  staleTime: 30_000,
  meta: { silent: true },
} as const;

/** How long the editions' answer is good for where only they are read:
 *  the FAA's data sets change by the 28-day cycle, not by the minute. */
const CYCLES_FRESH_MS = 60 * 60_000;

/** Each FAA data set the planner uses and whether its edition is in its
 *  cycle on this device's day (lib/dataCycles' onThisDay, the engine's
 *  data_cycle), so an answer kept through a flight with no signal still
 *  turns out of date on the day it does; the words are lib/dataCycles'.
 *  Not asked again each minute by itself, as the ages are: Ready to Fly's
 *  prompt reads it under the map for the whole visit, and with the ages'
 *  own minute it asked the planner once a minute for editions that change
 *  once a month. Where the ages are shown too (the map's settings, the
 *  Status page) they poll for both. */
export function useDataCycles(): DataCycle[] {
  const now = useMinuteClock();
  const cycles = useQuery({ ...mapAgesQuery, refetchInterval: false, staleTime: CYCLES_FRESH_MS }).data?.data_cycles;
  // Judged once a day is enough, but the minute's clock is the one the
  // page already keeps; the engine answers in microseconds.
  return cycles?.length ? onThisDay(cycles, now) : [];
}

/**
 * When the data under each of the map's weather layers is from, for the
 * map's settings: the METARs its airports' flight categories come from
 * and the TFRs, as the planner fetched them (/api/map/ages), and the
 * traffic, as the map last heard it. Asked again each minute while the
 * settings are open, and said again each minute.
 */
export function useLayerAges(): { metars: string | null; tfrs: string | null; traffic: string | null } {
  const now = useMinuteClock();
  const { data } = useQuery(mapAgesQuery);
  const client = useQueryClient();
  const traffic = trafficAt(
    client
      .getQueryCache()
      .findAll({ queryKey: ["traffic"] })
      .map((q) => ({ data: q.state.data as Traffic | undefined, updatedAt: q.state.dataUpdatedAt })),
  );
  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);
  return { metars: ageWords(ms(data?.metars_at), now), tfrs: ageWords(ms(data?.tfrs_at), now), traffic: ageWords(traffic, now) };
}
