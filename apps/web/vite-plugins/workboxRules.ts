import type { VitePWAOptions } from "vite-plugin-pwa";

type RuntimeCaching = NonNullable<NonNullable<VitePWAOptions["workbox"]>["runtimeCaching"]>[number];

/**
 * Workbox's runtime rules for the air that vite.config.ts's service worker
 * takes in, and the plugin marking an answer the cache gave. Each is
 * copied into the generated worker as text, so each function uses nothing
 * from outside itself.
 */

// An answer the service worker gives from its cache rather than the
// network, marked so the page can say so (lib/fromCache): the header
// carries when the network gave it, the response's own Date, which the
// planner and the gateway send on every answer. Only on the NetworkFirst
// caches (vite.config.ts), where the cache answers only when the network has not --
// the steady ones answer from the cache every time, by design. Written
// out whole inside the function: Workbox copies it into the generated
// worker as text, so it can use nothing from this file.
export const markFromCache = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response | null }) => {
    if (!cachedResponse) return null;
    const headers = new Headers(cachedResponse.headers);
    headers.set("X-From-Cache", cachedResponse.headers.get("date") ?? "");
    return new Response(cachedResponse.body, { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
  },
};

export const OVERLAY_ARCHIVE: RuntimeCaching = {
  // The map's FAA overlays (lib/map/sources/overlayTiles), one
  // PMTiles archive a cycle read in byte ranges. Keep for the Air
  // downloads it whole (features/keptForAir/keepOverlays), and
  // that one plain answer is kept here; every range the map asks
  // is then cut from it by Workbox's range-requests plugin, with
  // no connection. A range answered by the network (206) is never
  // kept: the Cache API holds no partial answer. Named for its
  // cycle, so two at most.
  urlPattern: ({ url }) => url.pathname.startsWith("/api/planner/overlay-tiles/") && url.pathname.endsWith(".pmtiles"),
  handler: "CacheFirst",
  options: {
    cacheName: "overlay-archive",
    rangeRequests: true,
    expiration: { maxEntries: 2, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [200] },
  },
};

export const RADAR_FRAMES: RuntimeCaching = {
  // The radar loop's pictures (WeatherLoopGl), straight from the
  // Iowa Environmental Mesonet: each address names its five-minute
  // mosaic, so what is kept is that picture for good, cache first.
  // Keep for the Air fetches the newest over the route
  // (features/keptForAir/keepFlightPath); kept a day, older
  // weather being no use in the air.
  urlPattern: ({ url }) => url.hostname === "mesonet.agron.iastate.edu" && url.pathname.includes("/tile.py/"),
  handler: "CacheFirst",
  options: {
    cacheName: "radar-frames",
    expiration: { maxEntries: 1500, maxAgeSeconds: 24 * 3600, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [200] },
  },
};

export const IN_FLIGHT_READS: RuntimeCaching = {
  // The same in flight (the page's X-Wingtip-Flying, lib/api/client):
  // four seconds for the network, not fifteen, before the last
  // answer -- a phone at one bar often leaves a request hanging
  // rather than failing it, and the pilot waited out the fifteen
  // for what was kept. On the ground the fifteen stay, for a
  // nav log the planner is still working out.
  urlPattern: ({ url, request }) =>
    request.method === "GET" &&
    request.headers.get("x-wingtip-flying") === "1" &&
    url.pathname.startsWith("/api/planner/") &&
    !url.pathname.includes("/chart-tile/"),
  handler: "NetworkFirst",
  options: {
    cacheName: "planner-api",
    networkTimeoutSeconds: 4,
    expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
    cacheableResponse: { statuses: [0, 200] },
    plugins: [markFromCache],
  },
};

// As a chart tile of a newer edition is kept, the tiles of every older
// edition of its kind go: the 56-day cycle's 20,000 tiles were held to
// their 60 days, past the next cycle's start, and filled the cache a new
// route's tiles wanted (the offline audit of 2026-11-21; owner recs, item
// 48). Only older ones: a page still on a kept chart answer of the last
// cycle asking its tiles never sends the new ones away. Once a kind and
// edition in the worker's life, so a run of tiles reads the cache's keys
// once. Each tile's kind and edition from its address, the planner's
// (/api/planner/chart-tile/<kind>/{z}/{x}/{y}.png?c=<cycle>&r=<revision>) or
// the CDN's (<base>/<cycle>/<kind>/{z}/{x}/{y}.png?r=<revision>), lib/map/
// sources/tiles' tileTemplate; the edition as a text that sorts, the
// cycle's MM-DD-YYYY turned year first and the revision padded. Written
// out whole inside the function: Workbox copies it into the worker as text.
export const dropOlderEditions = {
  cacheDidUpdate: async ({ cacheName, request }: { cacheName: string; request: Request }) => {
    const editionOf = (address: string) => {
      const url = new URL(address);
      const parts = url.pathname.split("/");
      const at = parts.indexOf("chart-tile");
      const kind = at >= 0 ? parts[at + 1] : parts[parts.length - 4];
      const cycle = at >= 0 ? url.searchParams.get("c") : parts[parts.length - 5];
      const day = /^(\d{2})-(\d{2})-(\d{4})$/.exec(cycle ?? "");
      if (!kind || !day) return null;
      return { kind, edition: `${day[3]}-${day[1]}-${day[2]}|${(url.searchParams.get("r") ?? "0").padStart(6, "0")}` };
    };
    const now = editionOf(request.url);
    if (!now) return;
    const seen = ((globalThis as unknown as { __chartEditions?: Record<string, string> }).__chartEditions ??= {});
    if ((seen[now.kind] ?? "") >= now.edition) return;
    seen[now.kind] = now.edition;
    const cache = await caches.open(cacheName);
    for (const key of await cache.keys()) {
      const kept = editionOf(key.url);
      if (kept && kept.kind === now.kind && kept.edition < now.edition) await cache.delete(key);
    }
  },
};

export const CHART_TILES: RuntimeCaching = {
  // The chart tiles, served by the planner (…/chart-tile/…) or from the
  // CDN (…/tiles/<cycle>/…): cache first, they are the same for the whole
  // 56-day cycle. The planner's 204, no sheet there (the sea, Canada round
  // the country), is kept as a drawn tile is: left out, every view by a
  // coast or a border asked the network for each of its empty tiles
  // again. An opaque answer (status 0) is never kept: the tiles are the
  // planner's own or the CDN's with CORS, and an opaque error kept here
  // would stand for the chart for 60 days. A tile neither kept nor to be
  // had offline is said on the map (lib/map/gl/useChartMissed).
  urlPattern: ({ url }) => url.pathname.includes("/chart-tile/") || url.pathname.includes("/tiles/"),
  handler: "CacheFirst",
  options: {
    cacheName: "chart-tiles",
    expiration: { maxEntries: 20000, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true },
    cacheableResponse: { statuses: [200, 204] },
    plugins: [dropOlderEditions],
  },
};
