import { create } from "zustand";
import { api } from "../../lib/api/client";
import { keptStore } from "../../lib/storage";

/**
 * The states whose plates are kept (statePlates), what each holds and what
 * runs: read on the first load by the map's keep (useStatePlatesFresh),
 * where the fetching and deleting are asked for only when one is due.
 */

/** A state kept, or being kept: how far it has come and its bytes. */
export interface KeptState {
  id: string;
  name: string;
  cycle: string;
  /** When the next cycle takes over, ISO, 0901Z on its date. */
  nextAt: string;
  charts: number;
  done: number;
  failed: number;
  bytes: number;
}

const KEPT_STATES_KEY = "wingtip.state-plates";
export const keptStatesStore = () => keptStore<KeptState[]>(KEPT_STATES_KEY, []);

/** The states being fetched now, by id, and those whose list could not be
 *  had, the words said on their row. */
export const useStateDownloads = create<{ running: string[]; problems: Record<string, string> }>(() => ({ running: [], problems: {} }));

/** Whether a kept state's cycle has been replaced at `nowMs`: its next
 *  cycle's 0901Z, as the planner gave it, has come. */
export const replaced = (kept: KeptState, nowMs: number) => Date.parse(kept.nextAt) <= nowMs;

/** Whether a kept state's fetch stopped short of its every chart. */
export const unfinished = (kept: KeptState) => kept.done < kept.charts;

/** The states the planner offers, with their cycle. */
export const statesQuery = { queryKey: ["plateStates"], queryFn: api.plateStates, staleTime: 10 * 60_000 };
