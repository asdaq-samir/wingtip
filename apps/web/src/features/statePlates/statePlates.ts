import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "../../lib/api/client";
import type { PlateStateCharts } from "../../lib/api/types";
import { chartKey, keepChart, PLATES_CACHE } from "../../lib/kept/keepChart";
import { keptRecordStore } from "../keptForAir";
import { keptStore } from "../../lib/storage";

/**
 * The FAA's plates kept a state at a time (Settings → Plates), as the
 * phones' Downloads keep the charts' regions and as ForeFlight and Garmin
 * Pilot download plates (the market-gap audit's 3): the planner lists a
 * state's open fields and their charts of the d-TPP cycle in force
 * (wingtip.plate_sets), and each chart is kept as the card's Charts tab
 * shows it (lib/kept/keepChart), in the service worker's "faa-plates"
 * cache. Each kept state names its cycle and when the next takes over
 * (0901Z on its AIRAC date, the engine's data_cycle through the planner);
 * from then it is fetched again for the new cycle and the old one's pages
 * deleted (useStatePlatesFresh). Public data, so it outlives a sign-out.
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
const controllers = new Map<string, AbortController>();

const CONCURRENCY = 4;
/** The record written every this many charts, not each one. */
const WRITE_EVERY = 20;

function put(record: KeptState) {
  const store = keptStatesStore();
  const others = store.getState().value.filter((k) => k.id !== record.id);
  store.setState({ value: [...others, record].sort((a, b) => a.name.localeCompare(b.name)) });
}

const listQuery = (cycle: string, id: string) => ({
  queryKey: ["plateState", cycle, id],
  queryFn: () => api.plateState(cycle, id),
  staleTime: Infinity,
});

/** The key a kept chart's page and list are matched by: its cycle and PDF,
 *  as both addresses carry them ("/2611/00366IL10R.PDF"). */
function chartKeys(list: PlateStateCharts): Set<string> {
  return new Set(list.fields.flatMap((f) => f.charts.map((c) => chartKey(c.url))));
}

/** A cached request's key, by the same two: a page's path names them,
 *  a list's `url` the chart's address. */
function keyOfCached(url: string): string | null {
  const decoded = decodeURIComponent(url);
  const page = /\/faa-chart\/page\/[^/]+\/([^/]+)\/([^/]+)\//.exec(decoded);
  if (page) return `/${page[1]}/${page[2]}`;
  const list = /[?&]url=[^&]*\/([^/&]+)\/([^/&]+\.pdf)/i.exec(decoded);
  return list ? `/${list[1]}/${list[2]}` : null;
}

/** The pages and lists of `gone` deleted from the worker's cache, those
 *  another set still holds left (a region's booklet, the takeoff minimums,
 *  is in each of its states; a kept flight's plates). */
async function forget(gone: Set<string>, keep: Set<string>) {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(PLATES_CACHE);
  for (const request of await cache.keys()) {
    const key = keyOfCached(request.url);
    if (key && gone.has(key) && !keep.has(key)) await cache.delete(request);
  }
}

/** The charts another set holds: the other kept states' and the flight
 *  Keep for the Air last kept (its record's `plates`). */
async function keysOfKept(client: QueryClient, except: string): Promise<Set<string>> {
  const keys = new Set<string>(keptRecordStore().getState().value?.plates ?? []);
  for (const k of keptStatesStore().getState().value) {
    if (k.id === except) continue;
    const list = await client.fetchQuery(listQuery(k.cycle, k.id)).catch(() => null);
    if (list) chartKeys(list).forEach((key) => keys.add(key));
  }
  return keys;
}

/** A state's plates of `cycle` kept, going on from a stop where it was
 *  kept before (a chart kept is had again from the cache at once); where
 *  an older cycle of it was kept, that one's pages deleted once this is. */
export async function keepState(client: QueryClient, id: string, cycle: string): Promise<void> {
  if (controllers.has(id)) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  useStateDownloads.setState((s) => ({ running: [...s.running, id], problems: { ...s.problems, [id]: "" } }));
  const before = keptStatesStore()
    .getState()
    .value.find((k) => k.id === id);
  try {
    const list = await client.fetchQuery(listQuery(cycle, id));
    const jobs = list.fields.flatMap((f) => f.charts.map((chart) => ({ chart, ident: f.ident })));
    const record: KeptState = { id, name: list.name, cycle, nextAt: list.next_at, charts: jobs.length, done: 0, failed: 0, bytes: 0 };
    // The old cycle stays shown until the new one is whole.
    if (!before || before.cycle === cycle) put(record);
    let next = 0;
    const worker = async () => {
      while (next < jobs.length && !controller.signal.aborted) {
        const job = jobs[next++]!;
        try {
          // Awaited first: `+= await` reads the total before the wait, and
          // the other fetches' bytes added meanwhile are lost.
          const got = await keepChart(client, job.chart, job.ident, controller.signal);
          record.bytes += got;
        } catch {
          if (!controller.signal.aborted) record.failed++;
        }
        record.done++;
        if (record.done % WRITE_EVERY === 0 && !controller.signal.aborted && (!before || before.cycle === cycle)) put({ ...record });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (controller.signal.aborted) return;
    put({ ...record });
    if (before && before.cycle !== cycle) {
      const old = await client.fetchQuery(listQuery(before.cycle, id)).catch(() => null);
      if (old) await forget(chartKeys(old), await keysOfKept(client, id));
    }
  } catch {
    // The state's list could not be had: said on its row, a cycle kept
    // before left as it was.
    if (!controller.signal.aborted)
      useStateDownloads.setState((s) => ({
        problems: { ...s.problems, [id]: "The plates couldn't be listed. Try again with a connection." },
      }));
  } finally {
    controllers.delete(id);
    useStateDownloads.setState((s) => ({ running: s.running.filter((r) => r !== id) }));
  }
}

/** A kept state deleted: its fetch stopped, its pages gone from the cache. */
export async function deleteState(client: QueryClient, id: string): Promise<void> {
  controllers.get(id)?.abort();
  const kept = keptStatesStore()
    .getState()
    .value.find((k) => k.id === id);
  keptStatesStore().setState({
    value: keptStatesStore()
      .getState()
      .value.filter((k) => k.id !== id),
  });
  if (!kept) return;
  const list = await client.fetchQuery(listQuery(kept.cycle, id)).catch(() => null);
  if (list) await forget(chartKeys(list), await keysOfKept(client, id));
}

/** Whether a kept state's cycle has been replaced at `nowMs`: its next
 *  cycle's 0901Z, as the planner gave it, has come. */
export const replaced = (kept: KeptState, nowMs: number) => Date.parse(kept.nextAt) <= nowMs;

/** Whether a kept state's fetch stopped short of its every chart. */
export const unfinished = (kept: KeptState) => kept.done < kept.charts;
