import type { ExpressionSpecification, LayerSpecification, LineLayerSpecification } from "maplibre-gl";
import { lonNear, lonScale, unwrapLine } from "../../geo";
import { CHART } from "../../tokens";
import { DIM_BY_COLOUR } from "./mapDim";

/** The route and its checkpoints as GL data and layers (the chart's style is glStyle). */

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
  // Each longitude near the one before: across the antimeridian the course
  // is drawn the short way (unwrapLine), not once round the whole map.
  line = unwrapLine(line);
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
  const kx = lonScale(p.lat);
  for (let i = Math.floor(after); i < line.length - 1; i++) {
    const [la, lo] = line[i]!,
      [lb, ob] = line[i + 1]!;
    // The point's longitude near the vertex's, the line being unwrapped.
    const lon = lonNear(p.lon, lo);
    const dy = lb - la,
      dx = (ob - lo) * kx;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((lon - lo) * kx * dx + (p.lat - la) * dy) / len2));
    const d = Math.hypot((lon - lo) * kx - t * dx, p.lat - la - t * dy);
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

/** The green casing in each look (CHART.routeGreen, as ForeFlight cases its
 *  course), a shade deeper at night so it does not glare off the dimmed
 *  chart. Never see-through of its own: at night the Dimmer takes it
 *  down with the chart (mapDim, by colour), where its 0.9 at night was
 *  dimmed a second time (the round-4 themes audit). */
export function routeCasingPaint(night: boolean): Record<string, unknown> {
  return { "line-color": night ? CHART.routeGreenNight : CHART.routeGreen, "line-opacity": 1, "line-width": CASING_WIDTH };
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
 *  selected leg's outer edge and green casing (selectedLegFilter). At night
 *  each is dimmed with the chart by its colour, not its opacity
 *  (DIM_BY_COLOUR): the course stays solid, the most visible line on the
 *  dimmed chart, and no brighter than the chart's own inks. The edges'
 *  opacities are their weight in each look, not a dim. */
export function routeLayers(courseColour = CHART.course): LayerSpecification[] {
  const round = { "line-join": "round", "line-cap": "round" } as const;
  const metadata = DIM_BY_COLOUR;
  const outer: LineLayerSpecification = {
    id: "route-outer",
    type: "line",
    metadata,
    source: ROUTE_SOURCE,
    layout: round,
    filter: selectedLegFilter(null),
    paint: routeOuterPaint(false, false) as LineLayerSpecification["paint"],
  };
  const edge: LineLayerSpecification = {
    id: "route-edge",
    type: "line",
    metadata,
    source: ROUTE_SOURCE,
    layout: round,
    filter: WHOLE_ROUTE,
    paint: routeEdgePaint(false, false) as LineLayerSpecification["paint"],
  };
  const casing: LineLayerSpecification = {
    id: "route-casing",
    type: "line",
    metadata,
    source: ROUTE_SOURCE,
    layout: round,
    filter: selectedLegFilter(null),
    paint: routeCasingPaint(false) as LineLayerSpecification["paint"],
  };
  const core: LineLayerSpecification = {
    id: "route-core",
    type: "line",
    metadata,
    source: ROUTE_SOURCE,
    layout: round,
    filter: WHOLE_ROUTE,
    paint: { "line-color": courseColour, "line-width": CORE_WIDTH as never },
  };
  return [outer, edge, casing, core];
}
