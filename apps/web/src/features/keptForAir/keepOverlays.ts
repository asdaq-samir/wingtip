import type { QueryClient } from "@tanstack/react-query";
import type { OverlayTiles } from "../../lib/api/types";
import { overlayTilesQuery } from "../../lib/queryClient";

/**
 * The map's FAA overlays -- airspace, airports, navaids, fixes, runways --
 * kept for the air. They are one PMTiles archive a cycle, read in byte
 * ranges (lib/map/sources/overlayTiles), and the Cache API keeps no
 * partial answer (206), so with no connection the layers went, and with
 * them tapping a field and its weather halo (the offline audit's gap 4).
 *
 * Kept here whole, one plain download of the archive, into the cache the
 * service worker answers its ranges from (vite.config.ts,
 * overlay-archive: Workbox's own range-requests plugin, which cuts each
 * range asked out of the whole answer kept). The archive covers the
 * country at every zoom, about 120 MB a cycle, so it is fetched only
 * where the browser has room for it twice over; kept once a cycle, as its
 * name changes with the cycle.
 */

/** The worker's cache for the archive (vite.config.ts). */
const OVERLAY_CACHE = "overlay-archive";

/** The archive's address, as the map asks for it (overlayTiles' own). */
const overlayArchivePath = (tiles: Pick<OverlayTiles, "name">) => `/api/planner/overlay-tiles/${tiles.name}.pmtiles`;

/** Whether the browser has room for `bytes` and as much again: storage
 *  the browser may take back under pressure is not filled to the top. */
async function roomFor(bytes: number): Promise<boolean> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return quota === undefined || usage === undefined || quota - usage > 2 * bytes;
  } catch {
    return true;
  }
}

/** What became of the archive: kept now or before, or why not. */
export type OverlaysKept = "kept" | "already" | "no-room" | "failed";

/** Keeps the cycle's overlay archive, read to its end so the worker's
 *  cache holds it whole; the page keeps none of it in memory. */
export async function keepOverlayArchive(client: QueryClient, signal?: AbortSignal): Promise<OverlaysKept> {
  try {
    if (typeof caches === "undefined") return "failed";
    const tiles = await client.fetchQuery(overlayTilesQuery);
    const path = overlayArchivePath(tiles);
    const cache = await caches.open(OVERLAY_CACHE);
    if (await cache.match(path)) return "already";
    if (!(await roomFor(tiles.bytes))) return "no-room";
    const res = await fetch(path, { signal, priority: "low" });
    if (res.status !== 200 || !res.body) return "failed";
    // Read through and let go: the worker keeps its own copy as it passes.
    const reader = res.body.getReader();
    while (!(await reader.read()).done) {
      /* each chunk dropped */
    }
    return "kept";
  } catch {
    return "failed";
  }
}
