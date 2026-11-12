import type { ExpressionSpecification } from "maplibre-gl";
import { glZoom } from "./glStyle";

/**
 * Close in, past the FAA chart's own detail (the owner, 2026-11-12, at
 * KDEN: the sectional enlarged past its last zoom is a blur): the chart
 * fades out over one level from its own last zoom and the satellite
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
 *  asked for (or billed) further out. */
export const imageryFrom = (tileMaxZoom: number) => glZoom(tileMaxZoom) - 0.5;
