import type {
  LayerSpecification, LineLayerSpecification, RasterLayerSpecification,
  RasterSourceSpecification, SymbolLayerSpecification,
} from "maplibre-gl";
import type { ChartInfo } from "../../api/types";
import type { AirspaceVolume } from "../overlayTypes";
import { airspaceLabel } from "../airspaceLabel";
import { chartPair, tileTemplate } from "../tiles";
import { COURSE_MAGENTA } from "../chartColors";

/**
 * The map's style (the owner, 2026-11-06: "Like ForeFlight, I want
 * the map to be clear and crisp and the overlay items need to be seen as
 * part of the map and not buggy overlay"): the FAA chart, the airspace,
 * the route and its checkpoints drawn by MapLibre GL in one WebGL map,
 * each in the frame the chart is drawn in, so nothing lags it under a
 * pinch. Plain data here, no map: what GlMap hands
 * MapLibre, and what the tests read.
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

/** The chart enlarged two levels past its own last zoom. */
export const OVERZOOM = 2;
/** A region's level of the chart under it, where the
 *  chart's own tiles are not in yet. */
export const UNDERLAY_ZOOM = 5;

/** A tile address MapLibre can fetch: its requests are made from a
 *  worker or resolved against no page, so a path the planner serves
 *  through the gateway (`/api/planner/...`) is made whole with the page's
 *  origin. Not with `new URL`, which writes `{z}` as `%7Bz%7D`. */
export function absoluteTiles(template: string, origin: string): string {
  return template.startsWith("/") ? `${origin}${template}` : template;
}

/** The day chart's lift (chartPaint). */
export const DAY_CONTRAST = 0.1;
export const DAY_SATURATION = 0.1;

export interface ChartStyle {
  sources: Record<string, RasterSourceSpecification>;
  layers: RasterLayerSpecification[];
  /** The map's furthest zoom, MapLibre's: the chart's own last plus
   *  OVERZOOM. */
  maxZoom: number;
}

/** The chart's ink by day, dimmed at night (half the brightness, a
 *  little more contrast) and brightened in sunlight (a fifth more
 *  contrast and colour). By day a touch more
 *  contrast and colour than the scan (0.1 each), as ForeFlight's chart
 *  reads beside ours (the owner's screenshots, 2026-11-07). */
export function chartPaint(night: boolean, sunlight: boolean): RasterLayerSpecification["paint"] {
  return {
    // Each tile drawn in the frame it comes: a fade on every pan is
    // movement nobody asked for.
    "raster-fade-duration": 0,
    // Smooth, not nearest: past the chart's last zoom the owner chose the
    // smooth enlargement ForeFlight shows over hard blocks (index.css,
    // 2026-10-28), and between whole levels linear sampling keeps the
    // chart's type from shimmering as a pinch passes through them.
    "raster-resampling": "linear",
    "raster-brightness-max": night ? 0.5 : 1,
    "raster-contrast": sunlight ? 0.2 : night ? 0.13 : DAY_CONTRAST,
    "raster-saturation": sunlight ? 0.2 : night ? 0 : DAY_SATURATION,
  };
}

/**
 * The FAA chart: the base chart (the sectional or
 * an IFR enroute chart, per the preferences), the same chart at a
 * region's level under it, and the terminal sheet over it while pinned --
 * the same tile addresses (tiles.ts tileTemplate, with the cycle and the
 * revision), the same zooms, the same two levels of enlargement.
 */
export function chartStyle(chart: ChartInfo, base: string, pinned: boolean, origin: string, paint = chartPaint(false, false)): ChartStyle | null {
  const { base: baseLayer, overlay } = chartPair(chart.chart_layers, base);
  if (!baseLayer) return null;
  const sources: Record<string, RasterSourceSpecification> = {};
  const layers: RasterLayerSpecification[] = [];
  const tiles = (kind: string) => [absoluteTiles(tileTemplate(chart, kind), origin)];
  const underlay = Math.max(baseLayer.min_zoom, UNDERLAY_ZOOM);
  if (underlay < baseLayer.max_zoom) {
    sources["chart-under"] = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: underlay, maxzoom: underlay };
    layers.push({ id: "chart-under", type: "raster", source: "chart-under", minzoom: glZoom(underlay), paint });
  }
  sources.chart = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: baseLayer.min_zoom, maxzoom: baseLayer.max_zoom };
  layers.push({ id: "chart", type: "raster", source: "chart", paint });
  if (overlay && pinned) {
    sources["chart-terminal"] = { type: "raster", tiles: tiles(overlay.kind), tileSize: 256, minzoom: overlay.min_zoom, maxzoom: overlay.max_zoom };
    layers.push({ id: "chart-terminal", type: "raster", source: "chart-terminal", minzoom: glZoom(overlay.min_zoom), paint });
  }
  return { sources, layers, maxZoom: glZoom(baseLayer.max_zoom + OVERZOOM) };
}

/** Class E has an ink for when the map draws it: the tiles carry it
 *  (wingtip.vector_tiles), the map draws B, C and D only. */
type AirspaceClass = AirspaceVolume["airspace_class"] | "E";

/**
 * The airspace's inks: the FAA's
 * sectional symbology (Aeronautical Chart User's Guide, VFR Terms and
 * Symbols, Airspace) -- Class B solid blue, Class C solid magenta, Class
 * D dashed blue, Class E (surface) dashed magenta, drawn here faded -- in
 * ForeFlight's brighter blue and magenta, and bolder (B and C 4 px, D
 * 3.5), so they stand off the chart's own printed ring as ForeFlight's do
 * (the owner's screenshots, 2026-11-07).
 */
export const AIRSPACE_INK: Record<AirspaceClass, { colour: string; dash?: number[]; opacity: number; width: number; label: string }> = {
  B: { colour: "#2f8cff", opacity: 1, width: 4, label: "#1f5fae" },
  C: { colour: "#e02ad8", opacity: 1, width: 4, label: "#8a1f87" },
  // A dash of 10 px and a gap of 5, in MapLibre's units, the line's own
  // width.
  D: { colour: "#2f8cff", dash: [10 / 3.5, 5 / 3.5], opacity: 1, width: 3.5, label: "#1f5fae" },
  E: { colour: "#e02ad8", dash: [10 / 3, 5 / 3], opacity: 0.45, width: 3, label: "#8a1f87" },
};

/** From which zoom each class is drawn, in the app's levels:
 *  B from 6, C from 7, D (and E) and every label from 8. */
export const AIRSPACE_FROM: Record<AirspaceClass, number> = { B: 6, C: 7, D: 8, E: 8 };
export const AIRSPACE_LABELS_FROM = 8;

/** A volume's altitudes on one line, in its tab on the ring as ForeFlight
 *  writes them: the class, then the ceiling over the floor in the
 *  sectional's hundreds of feet MSL (airspaceLabel; Chart User's Guide,
 *  Airspace), "C: 48–SFC", "B: 100–30"; a Class D its ceiling, "D: 25"
 *  ("-25" where it stops under a Class B). */
export function airspaceText(volume: AirspaceVolume): string | null {
  const label = airspaceLabel(volume);
  if (!label) return null;
  return `${volume.airspace_class}: ${label.kind === "shelf" ? `${label.top}–${label.floor}` : label.ceiling}`;
}

export const AIRSPACE_LINE_LAYERS = (["D", "C", "B"] as const).map(c => `airspace-${c}`);

/** The dark tab an airspace's altitudes sit in (icon-text-fit stretches
 *  it to the text): its id, for the layer that draws it. */
export const AIRSPACE_TAB = "airspace|tab";

/** The cycle's overlay tiles' source (glOverlays, lib/map/overlayTiles),
 *  in the map's first style. */
export const OVERLAY_SOURCE = "faa-overlays";

/** A figure of a tile's feature in the sectional's hundreds of feet, as
 *  airspaceLabel's hundreds: 3,600 is "36". */
const hundredsOf = (field: string) => ["to-string", ["round", ["/", ["get", field], 100]]];
/** airspaceText as an expression on the overlay tiles' `airspace` fields
 *  (wingtip.vector_tiles): "B: 100–30", "C: 48–SFC", "D: -25" -- the
 *  ceiling with a minus where it is "up to but not including" it
 *  (UPPER_DESC TNI), over the floor or SFC where the floor is the surface
 *  (0 ft, as the planner's floor_sfc). */
const TOP = ["concat", ["case", ["==", ["get", "ceiling_excluded"], true], "-", ""], hundredsOf("ceiling_ft")];
const FLOOR = ["case", ["==", ["coalesce", ["get", "floor_ft"], 0], 0], "SFC", hundredsOf("floor_ft")];
export const AIRSPACE_TILE_LABEL = ["concat", ["get", "class"], ": ", ["case", ["==", ["get", "class"], "D"], TOP, ["concat", TOP, "–", FLOOR]]];

/** One line layer a class, drawn from that class's zoom, and the labels
 *  on every line: white bold type in a dark tab, level on the screen,
 *  kept off each other and off the route's marks by MapLibre's own
 *  collision. From the overlay tiles' `airspace` layer, its rings drawn
 *  as lines and its labels written from its fields (AIRSPACE_TILE_LABEL);
 *  Class E is in the tiles but not drawn. */
export function airspaceLayers(font: string[]): LayerSpecification[] {
  const from = { source: OVERLAY_SOURCE, "source-layer": "airspace" };
  const lines: LineLayerSpecification[] = (["D", "C", "B"] as const).map(c => {
    const ink = AIRSPACE_INK[c];
    return {
      id: `airspace-${c}`, type: "line", ...from, minzoom: glZoom(AIRSPACE_FROM[c]),
      filter: ["==", ["get", "class"], c],
      layout: { "line-join": "round", "line-cap": ink.dash ? "butt" : "round" },
      paint: { "line-color": ink.colour, "line-width": ink.width, "line-opacity": ink.opacity, ...(ink.dash ? { "line-dasharray": ink.dash } : {}) },
    };
  });
  const labels: SymbolLayerSpecification = {
    id: "airspace-labels", type: "symbol", ...from, minzoom: glZoom(AIRSPACE_LABELS_FROM),
    filter: ["all", ["in", ["get", "class"], ["literal", ["B", "C", "D"]]], ["has", "ceiling_ft"]],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 320,
      "text-field": AIRSPACE_TILE_LABEL as never,
      "text-font": font,
      "text-size": 11,
      "text-rotation-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
      "icon-image": AIRSPACE_TAB,
      "icon-text-fit": "both",
      "icon-text-fit-padding": [2, 5, 2, 5],
      "text-padding": 4,
    },
    paint: { "text-color": "#ffffff" },
  };
  return [...lines, labels];
}

export interface RoutePoint {
  /** A checkpoint's key ("lat,lon"), or an airport's ident. */
  key: string;
  lat: number;
  lon: number;
  /** A checkpoint's number in the nav log, or an airport's ident. */
  label: string;
  colour: string;
}

export const ROUTE_SOURCE = "route";
export const CHECKPOINT_SOURCE = "checkpoints";

/** The course's line, drawn as a white casing under a magenta core (RouteGl). */
export function routeFeature(line: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map(([lat, lon]) => [lon, lat]) } };
}

export function pointFeatures(points: RoutePoint[]): GeoJSON.FeatureCollection<GeoJSON.Point, Omit<RoutePoint, "lat" | "lon">> {
  return {
    type: "FeatureCollection",
    features: points.map(({ lat, lon, ...props }) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } })),
  };
}

export function routeLayers(courseColour = COURSE_MAGENTA): LayerSpecification[] {
  const casing: LineLayerSpecification = {
    id: "route-casing", type: "line", source: ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": 5.5, "line-opacity": 0.85 },
  };
  const core: LineLayerSpecification = {
    id: "route-core", type: "line", source: ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": courseColour, "line-width": 2.5 },
  };
  return [casing, core];
}
