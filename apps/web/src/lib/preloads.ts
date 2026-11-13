import { preconnect, preload } from "react-dom";
import barlow400 from "@fontsource/barlow/files/barlow-latin-400-normal.woff2?url";
import barlow500 from "@fontsource/barlow/files/barlow-latin-500-normal.woff2?url";
import barlow600 from "@fontsource/barlow/files/barlow-latin-600-normal.woff2?url";
import barlow700 from "@fontsource/barlow/files/barlow-latin-700-normal.woff2?url";
import interUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import type { ChartInfo } from "./api/types";
import type { MapOverlay } from "./preferences";
import { GOOGLE, USGS_URL } from "./map/sources/imagery";

/** A font file as the stylesheet's @font-face and the map's style ask for
 *  it: anonymous CORS, so the preload is the request they reuse. */
const font = (href: string) => preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });

/**
 * What the first load will ask for, asked for while the entry script is
 * still running, with React DOM's resource hints (preload, preconnect),
 * which put each <link> in the head once however often they are called:
 *
 * - the app's face, Barlow's four weights (main.tsx's stylesheet), found
 *   otherwise only once the stylesheet is parsed and a word laid out;
 * - the map's own face, Inter, which MapLibre's style (GlMapShell) asks
 *   for only once the map's chunk has run;
 * - a connection to where the chart's tiles come from, the CDN where the
 *   charts are published (the last chart answer kept in this browser
 *   names it; lib/queryClient chartQuery), the first tiles' handshake
 *   done before the map asks;
 * - and to the overlay's server where the pilot keeps one over the chart
 *   (the USGS's imagery, Google's tiles).
 *
 * The planner's API is this page's own origin (lib/api/client's baseUrl),
 * already connected, so it needs no hint; its first answers, the chart and
 * the route, are asked for at once by main.tsx.
 */
export function preloadFirstLoad(chart: ChartInfo | undefined, overlay: MapOverlay): void {
  for (const href of [barlow400, barlow500, barlow600, barlow700, interUrl]) font(href);
  preconnectTiles(chart);
  if (overlay === "usgs") preconnect(new URL(USGS_URL).origin, { crossOrigin: "anonymous" });
  else if (overlay.startsWith("google")) preconnect(GOOGLE, { crossOrigin: "anonymous" });
}

/** A connection to the chart's tile CDN, where the charts are published
 *  there (none where the planner serves them, the page's own origin). */
export function preconnectTiles(chart: ChartInfo | undefined): void {
  const base = chart?.chart_tiles_base;
  if (!base) return;
  try {
    preconnect(new URL(base, window.location.href).origin, { crossOrigin: "anonymous" });
  } catch {
    /* not a URL: the map's own request says so */
  }
}
