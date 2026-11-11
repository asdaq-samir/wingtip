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
