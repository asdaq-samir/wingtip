import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PlateStateSet } from "../../lib/api/types";
import { keepingAvailable } from "../../lib/map/route/keepRoute";
import { useKeptValue } from "../../lib/storage";
import { deleteState, keepState, keptStatesStore, useStateDownloads, type KeptState } from "./statePlates";
import { statesQuery } from "./keptStates";

/** Settings → Plates' view model: the states offered with their cycle and
 *  size, those kept and how far each has come, and the asks that keep,
 *  update and delete one. The page draws it. */
export function useStatePlates() {
  const client = useQueryClient();
  const states = useQuery({ ...statesQuery, meta: { silent: true } });
  const kept = useKeptValue(keptStatesStore());
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
  return useKeptValue(keptStatesStore()).length;
}
