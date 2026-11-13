import type { ExpressionSpecification } from "maplibre-gl";
import { create } from "zustand";
import { glZoom } from "./glStyle";

/**
 * Close in, past the FAA chart's own detail (the owner, 2026-11-12, at
 * KDEN: the sectional enlarged past its last zoom is a blur): the chart
 * fades out over one level from its own last zoom and the aerial
 * imagery under it shows the runways and taxiways as they are, the app's
 * airports, route, airspace and marks still on top. Each chart's own
 * last zoom (wingtip.config: the sectional's 12, a TAC's 13, IFR low's
 * 11) is where its tiles stop having more to show. Plain data: zoom
 * expressions MapLibre evaluates itself, frame by frame under a pinch.
 */

/** How far in the map goes over the imagery, MapLibre's zoom: about a
 *  metre a pixel, an airport's taxiways and ramps in sight. */
export const CLOSE_MAX_ZOOM = 17;

/** The chart's opacity: whole to its own last zoom (`tileMaxZoom`, its
 *  tiles' {z}), gone one level past it. */
export function chartFade(tileMaxZoom: number): ExpressionSpecification {
  const from = glZoom(tileMaxZoom);
  return ["interpolate", ["linear"], ["zoom"], from, 1, from + 1, 0];
}

/** The imagery's opacity under the chart: in over the half level before
 *  the chart starts to fade, so the chart never fades over nothing. */
export function imageryFade(tileMaxZoom: number): ExpressionSpecification {
  const from = glZoom(tileMaxZoom);
  return ["interpolate", ["linear"], ["zoom"], from - 0.5, 0, from, 1];
}

/** Where the imagery's layer starts, MapLibre's zoom: no tile of it is
 *  asked for further out. */
export const imageryFrom = (tileMaxZoom: number) => glZoom(tileMaxZoom) - 0.5;

/** Whose imagery is under the chart close in: the USGS's, public domain,
 *  by default; Google's only where the pilot picked Google's overlay in
 *  the Map menu (useCloseImagery). */
export type CloseImagery = "usgs" | "google";

/** The imagery drawn close in now, none (null) while there is none. */
export const useCloseImageryDrawn = create<{ drawn: CloseImagery | null }>(() => ({ drawn: null }));

/** Whether what is drawn close in now may go out of the app, as Studio's
 *  videos do: the USGS's imagery is a public-domain work (17 U.S.C. 105),
 *  or none is drawn; Google's Map Tiles API terms forbid exporting its
 *  content outside the service, so Google's may not. */
export const imageryForExport = (): boolean => useCloseImageryDrawn.getState().drawn !== "google";
