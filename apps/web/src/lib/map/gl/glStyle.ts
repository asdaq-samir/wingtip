import type { RasterLayerSpecification, RasterSourceSpecification } from "maplibre-gl";
import type { ChartInfo } from "../../api/types";
import type { AirspaceVolume } from "../sources/overlayTypes";
import { chartPair, tileTemplate } from "../sources/tiles";
import { CHART, CHART_PAINT } from "../../tokens";
import { chartBrightness, chartContrast, NIGHT_DIM } from "../chartLook";
import { OVERLAY_SOURCES } from "../../generated/overlayLayers";

/**
 * The map's style (the owner, 2026-11-06: "Like ForeFlight, I want
 * the map to be clear and crisp and the overlay items need to be seen as
 * part of the map and not buggy overlay"): the FAA chart, the airspace,
 * the route and its checkpoints drawn by MapLibre GL in one WebGL map,
 * each in the frame the chart is drawn in, so nothing lags it under a
 * pinch. Plain data here, no map: what GlMap hands
 * MapLibre, and what the tests read. The overlay tiles' layers are
 * design/map-style.json's (lib/generated/overlayLayers, glOverlays).
 */

/** MapLibre's zoom from the app's. The app counts its levels as the
 *  chart's tiles do, the world 256 px across at zoom 0 (their {z});
 *  MapLibre's world is 512 px across at zoom 0, so the same view is a
 *  level lower there. Every zoom this app names (AIRSPACE_FROM, ownShip's
 *  OPEN_ZOOM, a chart layer's min_zoom) is in the app's levels, and goes
 *  through this. A raster source's own minzoom and maxzoom are the tiles'
 *  {z}, which need none. */
export const glZoom = (appZoom: number) => appZoom - 1;
/** The app's level from MapLibre's zoom. */
export const appZoomOf = (glZoomLevel: number) => glZoomLevel + 1;

/** The chart enlarged two levels past its own last zoom, with no imagery (closeZoom). */
const OVERZOOM = 2;
/** A region's level of the chart under it, where the
 *  chart's own tiles are not in yet. */
const UNDERLAY_ZOOM = 5;

/** A tile address MapLibre can fetch: its requests are made from a
 *  worker or resolved against no page, so a path the planner serves
 *  through the gateway (`/api/planner/...`) is made whole with the page's
 *  origin. Not with `new URL`, which writes `{z}` as `%7Bz%7D`. */
export function absoluteTiles(template: string, origin: string): string {
  return template.startsWith("/") ? `${origin}${template}` : template;
}

export interface ChartStyle {
  sources: Record<string, RasterSourceSpecification>;
  layers: RasterLayerSpecification[];
  /** The map's furthest zoom without imagery, MapLibre's: the chart's
   *  own last plus OVERZOOM (closeZoom's CLOSE_MAX_ZOOM with it). */
  maxZoom: number;
}

/** The chart's ink by day, dimmed at night (half the brightness, a
 *  little more contrast) and brightened in sunlight (a fifth more contrast
 *  and colour, and never dimmed). By day a touch more contrast and colour
 *  than the scan, as ForeFlight's chart reads beside ours (the owner's
 *  screenshots, 2026-11-07): the figures are design/tokens.json's
 *  chart-paint group (CHART_PAINT), the phones' the same. `dim` is the Map card's Dimmer, how
 *  far the tiles are dimmed (the night's half unless given), and
 *  `contrast` its Contrast, an offset on the look's own (lib/map/chartLook). */
export function chartPaint(
  night: boolean,
  sunlight: boolean,
  dim = night ? NIGHT_DIM : 0,
  contrast = 0,
): RasterLayerSpecification["paint"] {
  return {
    // Each tile drawn in the frame it comes: a fade on every pan is
    // movement nobody asked for.
    "raster-fade-duration": 0,
    // Smooth, not nearest: past the chart's last zoom the owner chose the
    // smooth enlargement ForeFlight shows over hard blocks (index.css,
    // 2026-10-28), and between whole levels linear sampling keeps the
    // chart's type from shimmering as a pinch passes through them.
    "raster-resampling": "linear",
    "raster-brightness-max": chartBrightness(dim, sunlight, night),
    "raster-contrast": chartContrast(
      sunlight ? CHART_PAINT.sunlightContrast : night ? CHART_PAINT.nightContrast : CHART_PAINT.dayContrast,
      contrast,
    ),
    "raster-saturation": sunlight ? CHART_PAINT.sunlightSaturation : night ? CHART_PAINT.nightSaturation : CHART_PAINT.daySaturation,
  };
}

/** What each of the chart's layers is: the base chart, the same chart at
 *  a region's level under it, and the terminal sheet over it. */
export type ChartRole = "chart" | "chart-under" | "chart-terminal";

/** A chart layer's and its source's id: its role and the kind of tiles it
 *  draws ("chart:sec", "chart-under:sec", "chart-terminal:tac"), so the
 *  last base chart picked can stay on the map, hidden, beside the new one
 *  (ChartGl), its tiles kept for a switch back, where with one id for
 *  every base the old chart had to go before the new could be added. */
const chartId = (role: ChartRole, kind: string) => `${role}:${kind}`;

/** The role of a chart layer's or source's id (chartId), null for any
 *  other id: what the tests and the first tile's watch read. */
export function chartRole(id: string | undefined): ChartRole | null {
  const role = id?.split(":")[0];
  return role === "chart" || role === "chart-under" || role === "chart-terminal" ? role : null;
}

/** A chart style's source or layer in the given role, if it has one. */
export function chartSource(style: ChartStyle, role: ChartRole): RasterSourceSpecification | undefined {
  return Object.entries(style.sources).find(([id]) => chartRole(id) === role)?.[1];
}

/**
 * The FAA chart: the base chart (the sectional or
 * an IFR enroute chart, per the preferences), the same chart at a
 * region's level under it, and the terminal sheet over it while pinned --
 * the same tile addresses (tiles.ts tileTemplate, with the cycle and the
 * revision), the same zooms, the same two levels of enlargement. Each id
 * is chartId's, by its role and its tiles' kind.
 */
export function chartStyle(
  chart: ChartInfo,
  base: string,
  pinned: boolean,
  origin: string,
  paint = chartPaint(false, false),
): ChartStyle | null {
  const { base: baseLayer, overlay } = chartPair(chart.chart_layers, base);
  if (!baseLayer) return null;
  const sources: Record<string, RasterSourceSpecification> = {};
  const layers: RasterLayerSpecification[] = [];
  const tiles = (kind: string) => [absoluteTiles(tileTemplate(chart, kind), origin)];
  const underlay = Math.max(baseLayer.min_zoom, UNDERLAY_ZOOM);
  const under = chartId("chart-under", baseLayer.kind);
  const main = chartId("chart", baseLayer.kind);
  if (underlay < baseLayer.max_zoom) {
    sources[under] = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: underlay, maxzoom: underlay };
    layers.push({ id: under, type: "raster", source: under, minzoom: glZoom(underlay), paint });
  }
  sources[main] = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: baseLayer.min_zoom, maxzoom: baseLayer.max_zoom };
  layers.push({ id: main, type: "raster", source: main, paint });
  if (overlay && pinned) {
    const terminal = chartId("chart-terminal", overlay.kind);
    sources[terminal] = { type: "raster", tiles: tiles(overlay.kind), tileSize: 256, minzoom: overlay.min_zoom, maxzoom: overlay.max_zoom };
    layers.push({ id: terminal, type: "raster", source: terminal, minzoom: glZoom(overlay.min_zoom), paint });
  }
  return { sources, layers, maxZoom: glZoom(baseLayer.max_zoom + OVERZOOM) };
}

/** A chart style's layers as ChartGl adds them, shown or hidden, and as a new map's first style holds the chart
 *  (makeMap): one spec, so the map's first tree claims those layers as they are. */
export const chartLayersAs = (spec: ChartStyle, visibility: "visible" | "none"): RasterLayerSpecification[] =>
  spec.layers.map((l) => ({ ...l, layout: { visibility } }));

/** Class E has an ink for when the map draws it: the tiles carry it
 *  (wingtip.vector_tiles), the 2D map draws B, C and D only. */
type AirspaceClass = AirspaceVolume["airspace_class"] | "E";

/**
 * The airspace's inks, the FAA's sectional symbology (Aeronautical Chart
 * User's Guide, VFR Terms and Symbols, Airspace) in ForeFlight's brighter
 * blue and magenta: Class B and D blue, C and E magenta. The rings' widths,
 * dashes and bands are design/map-style.json's; these are the colours the
 * 3D view's volumes and the tabs' pictures wear with them.
 */
export const AIRSPACE_INK: Record<AirspaceClass, { colour: string }> = {
  B: { colour: CHART.airspaceBlue },
  C: { colour: CHART.airspaceMagenta },
  D: { colour: CHART.airspaceBlue },
  E: { colour: CHART.airspaceMagenta },
};

/** The ring layers a tap on the airspace is looked for in (AirspaceGl). */
export const AIRSPACE_LINE_LAYERS = (["D", "C", "B"] as const).map((c) => `airspace-${c}`);

/** The dark tab an airspace's altitudes sit in (icon-text-fit stretches
 *  it to the text), bordered in its class's ink: its id by class, for
 *  the picture the airspace-labels layer asks for. */
export const airspaceTab = (cls: string) => `airspace|tab|${cls}`;

/** The cycle's overlay tiles' source (glOverlays, lib/map/sources/overlayTiles),
 *  in the map's first style. */
export const OVERLAY_SOURCE = OVERLAY_SOURCES.overlays;

/** The special-use areas' inks, as ForeFlight draws them over the
 *  sectional (the owner's screenshot over Lake Michigan, 2026-11-08):
 *  restricted, prohibited, warning and danger areas orange-brown, MOAs
 *  and alert areas magenta, the Class C's (design/map-style.json's
 *  sua-line, by the FAA's TYPE_CODE). */
export const SUA_INK = { restricted: CHART.specialUse, moa: AIRSPACE_INK.C.colour } as const;
/** The hatch picture of each ink (glOverlayPictures' SUA_PICTURES). */
export const suaHatch = (ink: keyof typeof SUA_INK) => `sua|hatch|${ink}`;
