import type {
  ExpressionSpecification,
  LayerSpecification,
  LineLayerSpecification,
  RasterLayerSpecification,
  RasterSourceSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { ChartInfo } from "../../api/types";
import type { AirspaceVolume } from "../sources/overlayTypes";
import { chartPair, tileTemplate } from "../sources/tiles";
import { COURSE_MAGENTA, ROUTE_GREEN, ROUTE_GREEN_NIGHT } from "../marks/chartColors";
import { CHART } from "../../tokens";

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

/** The day chart's lift (chartPaint). */
export const DAY_CONTRAST = 0.1;
export const DAY_SATURATION = 0.1;

export interface ChartStyle {
  sources: Record<string, RasterSourceSpecification>;
  layers: RasterLayerSpecification[];
  /** The map's furthest zoom without imagery, MapLibre's: the chart's
   *  own last plus OVERZOOM (closeZoom's CLOSE_MAX_ZOOM with it). */
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
  if (underlay < baseLayer.max_zoom) {
    sources["chart-under"] = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: underlay, maxzoom: underlay };
    layers.push({ id: "chart-under", type: "raster", source: "chart-under", minzoom: glZoom(underlay), paint });
  }
  sources.chart = { type: "raster", tiles: tiles(baseLayer.kind), tileSize: 256, minzoom: baseLayer.min_zoom, maxzoom: baseLayer.max_zoom };
  layers.push({ id: "chart", type: "raster", source: "chart", paint });
  if (overlay && pinned) {
    sources["chart-terminal"] = {
      type: "raster",
      tiles: tiles(overlay.kind),
      tileSize: 256,
      minzoom: overlay.min_zoom,
      maxzoom: overlay.max_zoom,
    };
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
 * (the owner's screenshots, 2026-11-07). `band` is how strong the
 * translucent band along the inside of the line is (airspaceLayers).
 */
export const AIRSPACE_INK: Record<AirspaceClass, { colour: string; dash?: number[]; opacity: number; width: number; band: number }> = {
  B: { colour: CHART.airspaceBlue, opacity: 1, width: 4, band: 0.3 },
  C: { colour: CHART.airspaceMagenta, opacity: 1, width: 4, band: 0.3 },
  // A dash of 10 px and a gap of 5, in MapLibre's units, the line's own
  // width.
  D: { colour: CHART.airspaceBlue, dash: [10 / 3.5, 5 / 3.5], opacity: 1, width: 3.5, band: 0.22 },
  E: { colour: CHART.airspaceMagenta, dash: [10 / 3, 5 / 3], opacity: 0.45, width: 3, band: 0 },
};

/** From which zoom each class is drawn, in the app's levels:
 *  B from 6, C from 7, D (and E) and every label from 8. */
const AIRSPACE_FROM: Record<AirspaceClass, number> = { B: 6, C: 7, D: 8, E: 8 };
export const AIRSPACE_LABELS_FROM = 8;

/** A height in the tab's words: the surface "SFC", else its feet MSL
 *  whole, "2300", as ForeFlight writes them. */
const feet = (ft: number) => String(Math.round(ft));

/** A volume's altitudes on one line, in its tab on the ring as ForeFlight
 *  writes them (the owner's screenshot over Madison, 2026-11-08): the
 *  class, then the floor and the ceiling in feet MSL with an en dash,
 *  "C: 2300–4900", "B: SFC–10000", "D: SFC–2500"; the surface "SFC". A
 *  ceiling the airspace stops under (UPPER_DESC TNI, "up to but not
 *  including", which the sectional prints as a minus before the figure:
 *  Chart User's Guide, Airspace) is "<3000": a Class D under a Class B
 *  shelf. The figures are the FAA's, as the tiles and the planner carry
 *  them; only the wording is the map's. */
export function airspaceText(
  volume: Pick<AirspaceVolume, "airspace_class" | "floor_ft" | "floor_sfc" | "ceiling_ft" | "ceiling_excluded">,
): string | null {
  if (volume.ceiling_ft == null) return null;
  const floor = volume.floor_sfc ? "SFC" : feet(volume.floor_ft);
  return `${volume.airspace_class}: ${floor}–${volume.ceiling_excluded ? "<" : ""}${feet(volume.ceiling_ft)}`;
}

export const AIRSPACE_LINE_LAYERS = (["D", "C", "B"] as const).map((c) => `airspace-${c}`);

/** The dark tab an airspace's altitudes sit in (icon-text-fit stretches
 *  it to the text), bordered in its class's ink: its id by class, for
 *  the layer that draws it. */
export const airspaceTab = (cls: string) => `airspace|tab|${cls}`;

/** The cycle's overlay tiles' source (glOverlays, lib/map/sources/overlayTiles),
 *  in the map's first style. */
export const OVERLAY_SOURCE = "faa-overlays";

/** A figure of a tile's feature as airspaceText writes it: whole feet. */
const feetOf = (field: string) => ["to-string", ["round", ["get", field]]];
/** airspaceText as an expression on the overlay tiles' `airspace` and
 *  `airspace_labels` fields (wingtip.vector_tiles): "C: 2300–4900",
 *  "B: SFC–10000", "D: SFC–<3000" -- the floor SFC where it is the
 *  surface (0 ft, as the planner's floor_sfc), the ceiling with "<"
 *  where it is "up to but not including" it (UPPER_DESC TNI). */
const FLOOR = ["case", ["==", ["coalesce", ["get", "floor_ft"], 0], 0], "SFC", feetOf("floor_ft")];
const TOP = ["concat", ["case", ["==", ["get", "ceiling_excluded"], true], "<", ""], feetOf("ceiling_ft")];
const AIRSPACE_TILE_LABEL = ["concat", ["get", "class"], ": ", FLOOR, "–", TOP];

/** A width by zoom, MapLibre's levels from the app's. */
const byZoom = (stops: [appZoom: number, px: number][]) =>
  ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, px]) => [glZoom(z), px])] as never;
/** The band along the inside of a boundary, as ForeFlight draws the
 *  sectional's own vignette (the pale strip inside Madison's Class C
 *  line, the owner's screenshot, 2026-11-08): a few pixels at a
 *  region's zoom, wider as the map comes in. */
const BAND_STOPS: [number, number][] = [
  [7, 3],
  [9, 6],
  [11, 10],
  [13, 16],
];
const BAND_WIDTH = byZoom(BAND_STOPS);
/** The band's middle off the boundary, inwards: half the band and a
 *  little over half the line, so its edge meets the line's. A positive
 *  offset is to the right of a line's way; a vector tile's outer ring
 *  runs clockwise on the screen and its holes anticlockwise (the Mapbox
 *  Vector Tile spec 2.1, 4.3.4.4, which tippecanoe writes), so the right
 *  is always the inside, round a ring and round a hole alike. */
const BAND_OFFSET = byZoom(BAND_STOPS.map(([z, w]) => [z, w / 2 + 1.5]));

/** Each class's band and line, a line layer each drawn from that class's
 *  zoom, and the labels: white bold type in a dark tab bordered in the
 *  class's ink, kept off each other and off the route's marks by
 *  MapLibre's own collision. From the overlay tiles: the rings their
 *  `airspace` layer's polygons; the labels one a shelf, on its ring and
 *  turned along it, from `airspace_labels` (the charts job's
 *  airspace_label_features), or where an older archive has not got that
 *  layer, along every ring at the spacing as before. Class E is in the
 *  tiles but not drawn. */
export function airspaceLayers(font: string[], labelPoints = true): LayerSpecification[] {
  const from = { source: OVERLAY_SOURCE, "source-layer": "airspace" };
  const lines: LineLayerSpecification[] = (["D", "C", "B"] as const).flatMap((c) => {
    const ink = AIRSPACE_INK[c];
    const common = { type: "line" as const, ...from, minzoom: glZoom(AIRSPACE_FROM[c]), filter: ["==", ["get", "class"], c] as never };
    return [
      {
        id: `airspace-${c}-band`,
        ...common,
        layout: { "line-join": "round" },
        paint: { "line-color": ink.colour, "line-opacity": ink.band, "line-width": BAND_WIDTH, "line-offset": BAND_OFFSET },
      },
      {
        id: `airspace-${c}`,
        ...common,
        layout: { "line-join": "round", "line-cap": ink.dash ? "butt" : "round" },
        paint: {
          "line-color": ink.colour,
          "line-width": ink.width,
          "line-opacity": ink.opacity,
          ...(ink.dash ? { "line-dasharray": ink.dash } : {}),
        },
      },
    ];
  });
  const tab = {
    "text-field": AIRSPACE_TILE_LABEL as never,
    "text-font": font,
    "text-size": byZoom([
      [8, 11],
      [12, 13],
    ]),
    "icon-image": ["concat", "airspace|tab|", ["get", "class"]] as never,
    "icon-text-fit": "both" as const,
    "icon-text-fit-padding": [2, 6, 2, 6] as [number, number, number, number],
    "text-padding": 4,
    // Never on another tab or an airport's mark (the marks' layers are
    // above and place first); where tabs compete the nearer class wins
    // (B, C, D).
    "text-allow-overlap": false,
    "icon-allow-overlap": false,
    "symbol-sort-key": ["match", ["get", "class"], "B", 0, "C", 1, 2] as never,
  };
  const labels: SymbolLayerSpecification = labelPoints
    ? {
        id: "airspace-labels",
        type: "symbol",
        source: OVERLAY_SOURCE,
        "source-layer": "airspace_labels",
        minzoom: glZoom(AIRSPACE_LABELS_FROM),
        filter: ["in", ["get", "class"], ["literal", ["B", "C", "D"]]],
        layout: {
          ...tab,
          // Along the ring where it sits: the tiles' turn, upright already;
          // the map never turns (GlMapShell), so the chart's north is the
          // screen's.
          "text-rotate": ["get", "angle"],
          "icon-rotate": ["get", "angle"],
          "text-rotation-alignment": "map",
          "icon-rotation-alignment": "map",
        },
        paint: { "text-color": CHART.casing },
      }
    : {
        id: "airspace-labels",
        type: "symbol",
        ...from,
        minzoom: glZoom(AIRSPACE_LABELS_FROM),
        filter: ["all", ["in", ["get", "class"], ["literal", ["B", "C", "D"]]], ["has", "ceiling_ft"]],
        layout: {
          ...tab,
          "symbol-placement": "line",
          "symbol-spacing": 320,
          "text-rotation-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "text-keep-upright": true,
          "text-max-angle": 30,
        },
        paint: { "text-color": CHART.casing },
      };
  return [...lines, labels];
}

/** The special-use areas' inks, as ForeFlight draws them over the
 *  sectional (the owner's screenshot over Lake Michigan, 2026-11-08):
 *  restricted, prohibited, warning and danger areas orange-brown, MOAs
 *  and alert areas magenta, the Class C's. The sectional prints all of
 *  them as a line with a hatched band inside (Chart User's Guide, VFR
 *  Terms and Symbols, Airspace: prohibited, restricted and warning areas
 *  blue, MOAs and alert areas magenta); the owner's pick is ForeFlight's
 *  colours. By the FAA's TYPE_CODE (wingtip.sua TYPES). */
export const SUA_INK = { restricted: CHART.specialUse, moa: AIRSPACE_INK.C.colour } as const;
const SUA_RESTRICTED = ["P", "R", "W", "D"];
const SUA_MOA = ["MOA", "A"];
/** The hatch picture of each ink (glOverlays' SUA_PICTURES). */
export const suaHatch = (ink: keyof typeof SUA_INK) => `sua|hatch|${ink}`;
/** From the app's zoom 7, a few states across, as Class C. */
const SUA_FROM = 7;
export const SUA_LAYERS = ["sua-band", "sua-line", "sua-labels"];

/** The special-use areas from the tiles' `special_use` layer: each
 *  boundary a solid line with a hatched band of short diagonal ticks
 *  along its inside (a line pattern, which MapLibre scales with the
 *  band's width), where two areas share an edge both drawn, each band
 *  on its own side. A restricted area is drawn over a MOA it lies in
 *  (line-sort-key), as R-6903 over the Minnow MOA in ForeFlight's: the
 *  MOA's line would cover the edges they share. */
export function specialUseLayers(): LineLayerSpecification[] {
  const from = { source: OVERLAY_SOURCE, "source-layer": "special_use", minzoom: glZoom(SUA_FROM) };
  const restricted = ["in", ["get", "type"], ["literal", SUA_RESTRICTED]];
  const filter = ["in", ["get", "type"], ["literal", [...SUA_RESTRICTED, ...SUA_MOA]]] as never;
  const order = ["case", restricted, 1, 0] as never;
  return [
    {
      id: "sua-band",
      type: "line",
      ...from,
      filter,
      layout: { "line-join": "round", "line-sort-key": order },
      paint: {
        "line-pattern": ["case", restricted, suaHatch("restricted"), suaHatch("moa")] as never,
        "line-width": BAND_WIDTH,
        "line-offset": BAND_OFFSET,
      },
    },
    {
      id: "sua-line",
      type: "line",
      ...from,
      filter,
      layout: { "line-join": "round", "line-cap": "round", "line-sort-key": order },
      paint: {
        "line-color": ["case", restricted, SUA_INK.restricted, SUA_INK.moa] as never,
        "line-width": byZoom([
          [7, 2],
          [10, 3],
        ]),
      },
    },
  ];
}

interface RoutePoint {
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

/** The course as a line (its edge and core: routeLayers), and with it each
 *  leg's own piece of it (`part: "leg"`, its nav-log key), which the green
 *  casing is drawn along when that leg is the one selected. */
export function routeFeature(
  line: [number, number][],
  legs: { key: string; from: { lat: number; lon: number }; to: { lat: number; lon: number } }[] = [],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const lonLat = (pts: [number, number][]) => pts.map(([lat, lon]) => [lon, lat]);
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
    { type: "Feature", properties: { part: "route" }, geometry: { type: "LineString", coordinates: lonLat(line) } },
  ];
  let from = 0;
  for (const leg of legs) {
    const piece = legPiece(line, leg.from, leg.to, from);
    if (!piece) continue;
    from = piece.end;
    features.push({
      type: "Feature",
      properties: { part: "leg", leg: leg.key },
      geometry: { type: "LineString", coordinates: lonLat(piece.points) },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Where along a polyline a point lies: the segment index plus the fraction
 *  of it, nearest from `after` on (a flat lat/lon fit is enough for
 *  matching a leg's end to the vertices the course was drawn through). */
function along(line: [number, number][], p: { lat: number; lon: number }, after: number): number {
  let best = after,
    bestD = Infinity;
  const kx = Math.cos((p.lat * Math.PI) / 180);
  for (let i = Math.floor(after); i < line.length - 1; i++) {
    const [la, lo] = line[i]!,
      [lb, ob] = line[i + 1]!;
    const dy = lb - la,
      dx = (ob - lo) * kx;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.lon - lo) * kx * dx + (p.lat - la) * dy) / len2));
    const d = Math.hypot((p.lon - lo) * kx - t * dx, p.lat - la - t * dy);
    if (d < bestD - 1e-12 && i + t >= after) {
      bestD = d;
      best = i + t;
    }
  }
  return best;
}

/** The course between a leg's two ends, and where it ended along the line. */
export function legPiece(
  line: [number, number][],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  after = 0,
): { points: [number, number][]; end: number } | null {
  if (line.length < 2) return null;
  const a = along(line, from, after),
    b = along(line, to, a);
  const at = (pos: number): [number, number] => {
    const i = Math.min(Math.floor(pos), line.length - 2),
      t = pos - i;
    const [la, lo] = line[i]!,
      [lb, ob] = line[i + 1]!;
    return [la + (lb - la) * t, lo + (ob - lo) * t];
  };
  const points: [number, number][] = [at(a)];
  for (let i = Math.floor(a) + 1; i < line.length && i < b; i++) points.push(line[i]!);
  points.push(at(b));
  return b > a ? { points, end: b } : null;
}

export function pointFeatures(points: RoutePoint[]): GeoJSON.FeatureCollection<GeoJSON.Point, Omit<RoutePoint, "lat" | "lon">> {
  return {
    type: "FeatureCollection",
    features: points.map(({ lat, lon, ...props }) => ({
      type: "Feature",
      properties: props,
      geometry: { type: "Point", coordinates: [lon, lat] },
    })),
  };
}

/** The course's width by zoom, in GL levels: thin over the whole-country
 *  view, full where a pilot reads a leg. The green casing is wider by the
 *  same steps so a band of it shows either side of the magenta, and the
 *  dark edge wider again, a hairline round the green. */
const widthByZoom = (stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()];
// The green a band of 2.5 to 3.5 either side, as wide as ForeFlight's
// reads at a phone's width; the edge a point round it.
const CORE_WIDTH = widthByZoom([
  [3, 2],
  [6, 3],
  [10, 4.5],
  [14, 5.5],
]);
const CASING_WIDTH = widthByZoom([
  [3, 5],
  [6, 8],
  [10, 10.5],
  [14, 12.5],
]);
const EDGE_WIDTH = widthByZoom([
  [3, 6.5],
  [6, 10],
  [10, 12.5],
  [14, 14.5],
]);
const EDGE_WIDTH_SUN = widthByZoom([
  [3, 7.5],
  [6, 11.5],
  [10, 14],
  [14, 16],
]);
// With no green, the edge a point round the magenta (a little more in sunlight).
const THIN_EDGE_WIDTH = widthByZoom([
  [3, 3.5],
  [6, 5],
  [10, 6.5],
  [14, 7.5],
]);
const THIN_EDGE_WIDTH_SUN = widthByZoom([
  [3, 4],
  [6, 5.5],
  [10, 7],
  [14, 8],
]);

/** The filter that draws the green casing and the outer edge framing it
 *  only along the leg whose Route Leg sheet is open (ForeFlight shows the
 *  green outline of the course only when it is selected, the owner,
 *  2026-11-09), none while no leg is. */
export function selectedLegFilter(leg: string | null): ExpressionSpecification {
  return ["all", ["==", ["get", "part"], "leg"], ["==", ["get", "leg"], leg ?? ""]] as ExpressionSpecification;
}
const WHOLE_ROUTE = ["==", ["get", "part"], "route"] as ExpressionSpecification;

/** The green casing in each look (ROUTE_GREEN, as ForeFlight cases its
 *  course): full by day and in sunlight, a shade deeper at night so it
 *  does not glare off the dimmed chart. */
export function routeCasingPaint(night: boolean): Record<string, unknown> {
  return { "line-color": night ? ROUTE_GREEN_NIGHT : ROUTE_GREEN, "line-opacity": night ? 0.9 : 1, "line-width": CASING_WIDTH };
}

/** The dark edge round the green of a selected leg so it keeps its
 *  contrast against the sectional in each look: a soft rim by day, a
 *  stronger and wider one in sunlight, and at night a faint light one. */
export function routeOuterPaint(night: boolean, sunlight: boolean): Record<string, unknown> {
  if (night) return { "line-color": CHART.casing, "line-opacity": 0.35, "line-width": EDGE_WIDTH };
  if (sunlight) return { "line-color": CHART.routeEdge, "line-opacity": 0.95, "line-width": EDGE_WIDTH_SUN };
  return { "line-color": CHART.routeEdge, "line-opacity": 0.6, "line-width": EDGE_WIDTH };
}

/** The thin edge round the magenta alone, the whole course, selected or
 *  not: dark by day and in sunlight (the lifted chart's pastels wash a
 *  bare magenta out), a faint light one at night. No green. */
export function routeEdgePaint(night: boolean, sunlight: boolean): Record<string, unknown> {
  if (night) return { "line-color": CHART.casing, "line-opacity": 0.35, "line-width": THIN_EDGE_WIDTH };
  if (sunlight) return { "line-color": CHART.routeEdge, "line-opacity": 0.9, "line-width": THIN_EDGE_WIDTH_SUN };
  return { "line-color": CHART.routeEdge, "line-opacity": 0.55, "line-width": THIN_EDGE_WIDTH };
}

/** The course line: the magenta core with a thin edge, and under them the
 *  selected leg's outer edge and green casing (selectedLegFilter). */
export function routeLayers(courseColour = COURSE_MAGENTA): LayerSpecification[] {
  const round = { "line-join": "round", "line-cap": "round" } as const;
  const outer: LineLayerSpecification = {
    id: "route-outer",
    type: "line",
    source: ROUTE_SOURCE,
    layout: round,
    filter: selectedLegFilter(null),
    paint: routeOuterPaint(false, false) as LineLayerSpecification["paint"],
  };
  const edge: LineLayerSpecification = {
    id: "route-edge",
    type: "line",
    source: ROUTE_SOURCE,
    layout: round,
    filter: WHOLE_ROUTE,
    paint: routeEdgePaint(false, false) as LineLayerSpecification["paint"],
  };
  const casing: LineLayerSpecification = {
    id: "route-casing",
    type: "line",
    source: ROUTE_SOURCE,
    layout: round,
    filter: selectedLegFilter(null),
    paint: routeCasingPaint(false) as LineLayerSpecification["paint"],
  };
  const core: LineLayerSpecification = {
    id: "route-core",
    type: "line",
    source: ROUTE_SOURCE,
    layout: round,
    filter: WHOLE_ROUTE,
    paint: { "line-color": courseColour, "line-width": CORE_WIDTH as never },
  };
  return [outer, edge, casing, core];
}
