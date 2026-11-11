import { fromChunk } from "../../lib/fromChunk";

// The map, with MapLibre (its own chunk, ~1 MB and a 0.5 MB worker) and its layers, on a chunk
// of its own: the panel and its search draw without waiting on a script
// only the map needs. That wait was the page's first paint and its Largest
// Contentful Paint (the search's placeholder, 4.3 s under Lighthouse's
// phone settings, issue #87). main.tsx asks for the chunk at once, beside
// the first script, so the map is not a round trip behind the panel.
export const { Part: RouteMap, prefetch: prefetchRouteMap } = fromChunk(
  () => import("./components/RouteMap"),
  (m) => m.default,
);
/** The map alone, drawn while a route named in the address waits for the
 *  engine to read it (MapPage's Suspense), from the same chunk: the
 *  planner's map takes it up as it comes. */
export const { Part: BootMap } = fromChunk(
  () => import("./components/RouteMap"),
  (m) => m.BootMap,
);
