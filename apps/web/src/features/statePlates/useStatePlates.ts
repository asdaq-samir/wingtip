import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api/client";
import type { PlateStateSet } from "../../lib/api/types";
import { keepingAvailable } from "../../lib/map/route/keepRoute";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { deleteState, keepState, keptStatesStore, replaced, unfinished, useStateDownloads, type KeptState } from "./statePlates";

const statesQuery = { queryKey: ["plateStates"], queryFn: api.plateStates, staleTime: 10 * 60_000 };

/** Settings → Plates' view model: the states offered with their cycle and
 *  size, those kept and how far each has come, and the asks that keep,
 *  update and delete one. The page draws it. */
export function useStatePlates() {
  const client = useQueryClient();
  const states = useQuery({ ...statesQuery, meta: { silent: true } });
  const kept = keptStatesStore()((s) => s.value);
  const { running, problems } = useStateDownloads();
  const [asking, setAsking] = useState<PlateStateSet | null>(null);
  const cycle = states.data?.cycle ?? null;
  return {
    states: states.data?.states ?? [],
    cycle,
    nextAt: states.data?.next_at ?? null,
    /** The FAA's index could not be had, or the planner did not answer. */
    failed: states.isError || (states.data != null && states.data.cycle == null),
    loading: states.isPending,
    kept,
    running,
    problems,
    /** No service worker (plain http): nothing can be kept. */
    canKeep: keepingAvailable(),
    asking,
    ask: setAsking,
    keep: (id: string) => {
      setAsking(null);
      if (cycle) void keepState(client, id, cycle);
    },
    retry: (k: KeptState) => void keepState(client, k.id, k.cycle),
    remove: (k: KeptState) => void deleteState(client, k.id),
    isKept: (id: string) => kept.some((k) => k.id === id),
  };
}

/** Settings' Plates row's value: how many states are kept. */
export function useKeptStatesCount() {
  return keptStatesStore()((s) => s.value.length);
}

/**
 * The kept states kept current, mounted with the map: a state whose fetch
 * stopped (the page closed) goes on, and once a kept state's cycle is
 * replaced -- 0901Z on the next AIRAC date, as the planner gave it -- the
 * new cycle is fetched and the old one's pages deleted when it is whole.
 * Asked once a minute, and only with a service worker to keep them in.
 */
export function useStatePlatesFresh() {
  const client = useQueryClient();
  const now = useMinuteClock();
  const kept = keptStatesStore()((s) => s.value);
  useEffect(() => {
    if (!kept.length || !keepingAvailable() || !navigator.onLine) return;
    const running = useStateDownloads.getState().running;
    const due = kept.filter((k) => !running.includes(k.id) && (replaced(k, now) || unfinished(k)));
    if (!due.length) return;
    void (async () => {
      const latest = due.some((k) => replaced(k, now)) ? await client.fetchQuery({ ...statesQuery, staleTime: 0 }).catch(() => null) : null;
      for (const k of due) {
        // The cycle the planner now serves, where it has turned over.
        const cycle = replaced(k, now) && latest?.cycle ? latest.cycle : k.cycle;
        if (cycle !== k.cycle || unfinished(k)) void keepState(client, k.id, cycle);
      }
    })();
  }, [client, now, kept]);
}
